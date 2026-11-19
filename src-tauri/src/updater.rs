//! Atualização automática: procura versão nova no repositório público de releases
//! (latest.json assinado), avisa nas Configurações/bandeja e só instala com um clique.
//!
//! - Procura 30 s depois de iniciar e a cada 24 h (se "Procurar atualizações" estiver ligado).
//! - A assinatura é conferida pelo plugin com a chave pública do tauri.conf.json.
//! - A Kira de teste nunca procura nem instala (só o comando qa_fake_update simula um aviso).

use crate::lock::LockExt;
use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
    /// Última busca (segundos desde 1970); None = ainda não procurou.
    pub checked_at: Option<u64>,
    pub error: Option<String>,
}

static LAST: Mutex<Option<UpdateInfo>> = Mutex::new(None);
#[cfg(not(feature = "qa"))]
static PENDING: Mutex<Option<tauri_plugin_updater::Update>> = Mutex::new(None);

const FIRST_CHECK: Duration = Duration::from_secs(30);
const INTERVAL: Duration = Duration::from_secs(24 * 3600);

fn now_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn store(app: &AppHandle, info: UpdateInfo) -> UpdateInfo {
    let was = LAST.lock_ok().replace(info.clone());
    // Versão nova encontrada (ou outra mais nova): avisa a bandeja e as Configurações.
    let newly = info.available && was.as_ref().and_then(|w| w.version.clone()) != info.version;
    if newly {
        if let Some(tray) = app.tray_by_id("main") {
            let _ = tray.set_tooltip(Some(trf!("Kira Radial — versão {} disponível", "Kira Radial — version {} available", info.version.clone().unwrap_or_default())));
        }
    }
    let _ = app.emit("update:status", info.clone());
    info
}

/// Procura agora (comando e busca periódica).
#[cfg(not(feature = "qa"))]
pub async fn check(app: &AppHandle) -> UpdateInfo {
    use tauri_plugin_updater::UpdaterExt;
    let current = app.package_info().version.to_string();
    let base = UpdateInfo { current, checked_at: Some(now_secs()), ..Default::default() };
    let result = match app.updater() {
        Ok(u) => u.check().await.map_err(|e| e.to_string()),
        Err(e) => Err(e.to_string()),
    };
    let info = match result {
        Ok(Some(update)) => {
            let info = UpdateInfo { available: true, version: Some(update.version.clone()), notes: update.body.clone(), ..base };
            *PENDING.lock_ok() = Some(update);
            info
        }
        Ok(None) => {
            *PENDING.lock_ok() = None;
            base
        }
        Err(e) => {
            crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("atualização: {e}"));
            UpdateInfo { error: Some(trf!("não foi possível procurar atualizações: {e}", "couldn't check for updates: {e}")), ..base }
        }
    };
    store(app, info)
}

#[cfg(feature = "qa")]
pub async fn check(app: &AppHandle) -> UpdateInfo {
    // Kira de teste: nunca procura de verdade; devolve o último estado (ou o simulado).
    let current = app.package_info().version.to_string();
    LAST.lock_ok().clone().unwrap_or(UpdateInfo { current, checked_at: Some(now_secs()), ..Default::default() })
}

/// Busca periódica numa thread que dorme entre as buscas (custo parado ≈ zero).
pub fn spawn_periodic(app: AppHandle) {
    if crate::qa::ENABLED {
        return;
    }
    let _ = std::thread::Builder::new().name("updater".into()).spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            let enabled = app.state::<crate::menu::AppState>().config().behavior.check_updates;
            if enabled {
                tauri::async_runtime::block_on(check(&app));
            }
            std::thread::sleep(INTERVAL);
        }
    });
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> UpdateInfo {
    check(&app).await
}

/// Último resultado (sem procurar de novo).
#[tauri::command]
pub fn update_status(app: AppHandle) -> UpdateInfo {
    LAST.lock_ok().clone().unwrap_or(UpdateInfo { current: app.package_info().version.to_string(), ..Default::default() })
}

/// Baixa, confere a assinatura, instala (instalador em modo passivo) e reabre a Kira.
#[cfg(not(feature = "qa"))]
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let update = PENDING.lock_ok().take().ok_or(tr!("nenhuma atualização pendente: procure de novo", "no pending update: check again"))?;
    crate::perf::log("rust", &format!("instalando a versão {}", update.version));
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| trf!("falha ao instalar a atualização: {e}", "couldn't install the update: {e}"))?;
    app.restart();
}

#[cfg(feature = "qa")]
#[tauri::command]
pub async fn update_install(_app: AppHandle) -> Result<(), String> {
    Err(tr!("a Kira de teste não instala atualizações", "the test Kira doesn't install updates").into())
}

/// Kira de teste: simula "há versão nova" para testar o aviso sem baixar nada.
#[cfg(feature = "qa")]
#[tauri::command]
pub fn qa_fake_update(app: AppHandle, version: String, notes: String) -> UpdateInfo {
    let info = UpdateInfo {
        current: app.package_info().version.to_string(),
        available: true,
        version: Some(version),
        notes: Some(notes),
        checked_at: Some(now_secs()),
        error: None,
    };
    store(&app, info)
}
