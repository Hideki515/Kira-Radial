//! Comandos chamados pelo front (src/shared/ipc.ts).

use crate::actions::{self, Action};
use crate::config::{self, Config};
use crate::foreground;
use crate::menu::{self, AppState};
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;
use crate::lock::LockExt;

/// Idiomas do usuário no Windows, em ordem (para o idioma "Automático" da interface).
#[tauri::command]
pub fn system_languages() -> Vec<String> {
    crate::syslang::languages()
}

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Config {
    state.config()
}

#[tauri::command]
pub fn save_config(app: AppHandle, state: State<'_, AppState>, mut config: Config) -> Result<(), String> {
    config.validate()?;
    let old = state.config();
    // Idioma primeiro: as mensagens a partir daqui (e a bandeja) já saem no novo.
    if crate::i18n::apply(config.behavior.language.as_deref()) {
        crate::relabel_tray();
    }
    // A posição do ícone é do backend (muda ao arrastar); o rascunho das configurações
    // pode estar desatualizado.
    config.launcher.orb.x = old.launcher.orb.x;
    config.launcher.orb.y = old.launcher.orb.y;
    config.launcher.orb.hidden = config::orb_hidden_after_mode_change(old.launcher.mode, config.launcher.mode, old.launcher.orb.hidden);
    config.launcher.orb.docked = old.launcher.orb.docked;
    if old.hotkey.accelerator != config.hotkey.accelerator || old.launcher.mode != config.launcher.mode {
        menu::apply_hotkey(&app, &config)?;
    }
    // Teclas do knob: falha ao registrar não impede salvar (aparece nas Configurações).
    if old.knob != config.knob || old.hotkey.accelerator != config.hotkey.accelerator || old.launcher.mode != config.launcher.mode {
        if let Err(e) = crate::knob::apply(&app, &config) {
            crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("knob: {e}"));
        }
    }
    // Atalhos de fatia: reaplica sempre (dependem de itens, atalho do menu e knob).
    if let Err(e) = crate::hotkeys::apply(&app, &config) {
        crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("atalhos de fatia: {e}"));
    }
    if old.behavior.clipboard_history != config.behavior.clipboard_history {
        crate::clipboard::set_enabled(config.behavior.clipboard_history);
    }
    if old.behavior.autostart != config.behavior.autostart {
        apply_autostart(&app, config.behavior.autostart)?;
    }
    config::save(&config)?;
    crate::icons::prune(&config);
    *state.config.lock_ok() = config.clone();
    crate::orb::apply(&app, &config);
    let _ = app.emit("config:changed", config);
    Ok(())
}

/// Clique no ícone flutuante.
#[tauri::command]
pub fn orb_clicked(app: AppHandle) -> Result<(), String> {
    crate::orb::clicked(&app)
}

/// Imagem própria do ícone como data URL.
#[tauri::command]
pub async fn read_orb_image(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::orb::read_image(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Monitores conectados (para "Quando usar → monitores" dos perfis).
#[tauri::command]
pub fn list_monitors() -> Vec<crate::monitors::MonitorInfo> {
    crate::monitors::list()
}

/// Mostra o número de cada monitor por 2 s.
#[tauri::command]
pub fn identify_monitors() {
    crate::monitors::identify();
}

/// Backups automáticos da configuração (mais recente primeiro).
#[tauri::command]
pub fn list_backups() -> Vec<crate::backup::BackupInfo> {
    crate::backup::list()
}

/// Conteúdo de um backup (só nomes gerados pela Kira).
#[tauri::command]
pub fn read_backup(name: String) -> Result<String, String> {
    crate::backup::read(&name)
}

/// Ícone próprio de fatia (PNG/SVG/ICO/WebP) como data URL.
#[tauri::command]
pub async fn read_icon(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::icons::read(&path)).await.map_err(|e| e.to_string())?
}

/// Extrai o ícone de um programa/atalho e devolve o caminho do PNG salvo.
#[tauri::command]
pub async fn extract_icon(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::icons::extract(&path)).await.map_err(|e| e.to_string())?
}

/// Som próprio (WAV/MP3/OGG) como data URL.
#[tauri::command]
pub async fn read_sound(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::orb::read_sound(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Menu do botão direito no ícone.
#[tauri::command]
pub fn orb_context_menu(app: AppHandle) -> Result<(), String> {
    crate::orb::context_menu(&app)
}

/// Música/vídeo em reprodução (hub "Tocando agora").
#[tauri::command]
pub async fn now_playing() -> Result<Option<crate::nowplaying::NowPlaying>, String> {
    tauri::async_runtime::spawn_blocking(crate::nowplaying::current).await.map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct Volume {
    level: f32,
    muted: bool,
}

/// Volume da saída padrão (arco de volume ao girar a roda no hub/ícone).
#[tauri::command]
pub async fn get_volume() -> Result<Volume, String> {
    let (level, muted) = tauri::async_runtime::spawn_blocking(crate::audio::master_volume).await.map_err(|e| e.to_string())??;
    Ok(Volume { level, muted })
}

/// Prévias do histórico da área de transferência (vazio se desligado).
#[tauri::command]
pub fn clipboard_list() -> Vec<String> {
    crate::clipboard::list()
}

/// Apaga o histórico da área de transferência.
#[tauri::command]
pub fn clipboard_clear() {
    crate::clipboard::clear();
}

/// Arquivos recentes (submenu automático).
#[tauri::command]
pub async fn list_recent_files() -> Result<Vec<crate::recent::RecentFile>, String> {
    tauri::async_runtime::spawn_blocking(crate::recent::list).await.map_err(|e| e.to_string())
}

/// Projetos recentes do VS Code (submenu automático).
#[tauri::command]
pub async fn list_vscode_projects() -> Result<Vec<crate::vscode::VsProject>, String> {
    tauri::async_runtime::spawn_blocking(crate::vscode::list).await.map_err(|e| e.to_string())?
}

/// VPNs do Windows com o estado (submenu automático).
#[tauri::command]
pub async fn list_vpns() -> Result<Vec<crate::vpn::VpnInfo>, String> {
    tauri::async_runtime::spawn_blocking(crate::vpn::list).await.map_err(|e| e.to_string())?
}

/// Wi-Fi e Bluetooth (submenu automático "Rádios").
#[tauri::command]
pub async fn list_radios() -> Result<Vec<crate::radios::RadioInfo>, String> {
    tauri::async_runtime::spawn_blocking(crate::radios::list).await.map_err(|e| e.to_string())
}

/// Estado de voz do Discord (submenus automáticos e página Discord).
#[tauri::command]
pub async fn discord_voice() -> Result<crate::discord::VoiceState, String> {
    tauri::async_runtime::spawn_blocking(crate::discord::voice_state).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn discord_status() -> Result<crate::discord::Status, String> {
    tauri::async_runtime::spawn_blocking(crate::discord::status).await.map_err(|e| e.to_string())?
}

/// Pede a autorização no Discord (o usuário clica em "Autorizar" lá) e guarda as credenciais.
#[tauri::command]
pub async fn discord_connect(client_id: String, client_secret: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || crate::discord::connect(client_id, client_secret)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn discord_disconnect() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(crate::discord::disconnect).await.map_err(|e| e.to_string())?
}

/// A página das Configurações carregou (veja `menu::settings_ready`).
#[tauri::command]
pub fn settings_ready(app: AppHandle) {
    menu::settings_ready(&app);
}

/// Navegadores instalados, com ícone (editor da ação "Abrir site").
#[tauri::command]
pub async fn list_browsers() -> Result<Vec<crate::browsers::Browser>, String> {
    tauri::async_runtime::spawn_blocking(|| crate::browsers::list(true)).await.map_err(|e| e.to_string())
}

/// Perfis de um navegador Chromium (só leitura do "Local State").
#[tauri::command]
pub async fn list_browser_profiles(id: String) -> Result<Vec<crate::browsers::BrowserProfile>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::browsers::profiles(&id)).await.map_err(|e| e.to_string())
}

/// Telas com brilho ajustável (submenu automático "Brilho").
#[tauri::command]
pub async fn list_displays() -> Result<Vec<crate::brightness::Display>, String> {
    tauri::async_runtime::spawn_blocking(crate::brightness::list).await.map_err(|e| e.to_string())
}

/// Planos de energia (submenu automático).
#[tauri::command]
pub async fn list_power_plans() -> Result<Vec<crate::power::PowerPlan>, String> {
    tauri::async_runtime::spawn_blocking(crate::power::list).await.map_err(|e| e.to_string())
}

/// Janelas abertas (submenu automático "Janelas abertas").
#[tauri::command]
pub async fn list_windows() -> Result<Vec<crate::winlist::WindowInfo>, String> {
    tauri::async_runtime::spawn_blocking(crate::winlist::list).await.map_err(|e| e.to_string())
}

/// Esconde/mostra o ícone (fica salvo).
#[tauri::command]
pub fn orb_set_hidden(app: AppHandle, hidden: bool) {
    crate::orb::set_hidden(&app, hidden);
}

/// Volta o ícone flutuante para o canto padrão.
#[tauri::command]
pub fn orb_reset_position(app: AppHandle) {
    crate::orb::reset_position(&app);
}

pub fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let al = app.autolaunch();
    let r = if enabled { al.enable() } else { al.disable() };
    r.map_err(|e| trf!("falha ao configurar inicialização com o Windows: {e}", "couldn't set up starting with Windows: {e}"))
}

/// Site sem navegador próprio: usa o navegador geral (Configurações → Geral). Vale também
/// para os passos de uma sequência. Endereço que o navegador não aceitaria como argumento único
/// (espaço, aspas, muito longo) continua indo pelo padrão do Windows.
fn apply_default_browser(action: &mut Action, cfg: &Config) {
    match action {
        Action::Url { url, browser: b @ None, browser_name, .. } => {
            if crate::browsers::url_ok(url.trim()) {
                *b = cfg.behavior.browser.clone();
                *browser_name = cfg.behavior.browser_name.clone();
            }
        }
        Action::Sequence { steps, .. } => steps.iter_mut().for_each(|s| apply_default_browser(s, cfg)),
        _ => {}
    }
}

/// Executa UMA ação já com o menu escondido: devolve o foco ao app anterior se preciso,
/// espera o atraso dela, trata janela/configurações e arma o preview de print.
fn run_step(app: &AppHandle, action: &Action, prev: isize) -> Result<(), String> {
    if matches!(action, Action::OpenSettings) {
        menu::open_settings(app);
        return Ok(());
    }
    if action.needs_previous_focus() {
        // Teclas vão para a janela em foco: devolve o foco ao app anterior primeiro.
        foreground::restore(prev);
        std::thread::sleep(Duration::from_millis(50));
    }
    // Atraso extra configurado na ação (ex.: apps de print mais lentos).
    std::thread::sleep(action.delay());
    if let Action::Window { cmd } = action {
        return crate::winops::run(*cmd, prev);
    }
    // Ferramenta de print: foto de antes (área de transferência e pastas) e, depois, espera o print.
    let base = if crate::shot::detect::is_capture(action) { crate::shot::baseline(app) } else { None };
    let r = actions::execute(action);
    if let (Ok(()), Some(b)) = (&r, base) {
        crate::shot::arm(app, b);
    }
    r
}

#[tauri::command]
pub async fn run_action(app: AppHandle, mut action: Action) -> Result<(), String> {
    if matches!(action, Action::OpenSettings) {
        menu::open_settings(&app);
        return Ok(());
    }
    if let Action::Sequence { steps, .. } = &action {
        if let Some(e) = actions::sequence_error(steps) {
            return Err(e);
        }
    }
    let is_sequence = matches!(action, Action::Sequence { .. });
    let (close, prev) = {
        let state = tauri::Manager::state::<AppState>(&app);
        let cfg = state.config.lock_ok();
        apply_default_browser(&mut action, &cfg);
        (
            // Sequência sempre fecha o menu (os passos agem nos apps, não no menu).
            is_sequence || (!action.keeps_menu_open() && (cfg.behavior.close_on_action || action.needs_previous_focus())),
            state.prev_hwnd.load(Ordering::SeqCst),
        )
    };
    let radial_hwnd = tauri::Manager::get_webview_window(&app, menu::RADIAL)
        .and_then(|w| w.hwnd().ok())
        .map(|h| h.0 as isize)
        .unwrap_or(0);
    if close {
        menu::hide(&app);
    }
    tauri::async_runtime::spawn_blocking(move || {
        if close {
            // Garante que o menu já sumiu da tela (ex.: atalhos de print não o capturam).
            foreground::wait_hidden(radial_hwnd, 500);
        }
        match &action {
            Action::Sequence { steps, .. } => {
                let pause = action.step_delay();
                for (i, step) in steps.iter().enumerate() {
                    if i > 0 {
                        std::thread::sleep(pause);
                    }
                    // Um passo que falha interrompe o resto (e o aviso diz qual foi).
                    run_step(&app, step, prev).map_err(|e| trf!("passo {} de {}: {e}", "step {} of {}: {e}", i + 1, steps.len()))?;
                }
                Ok(())
            }
            single => run_step(&app, single, prev),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn hide_menu(app: AppHandle) {
    menu::hide(&app);
}

#[tauri::command]
pub fn set_hotkey_paused(app: AppHandle, paused: bool) {
    menu::set_paused(&app, paused);
    crate::knob::set_paused(&app, paused);
    crate::hotkeys::set_paused(&app, paused);
}

/// Erro ao registrar os atalhos de fatia (None = registrados ou nenhum).
#[tauri::command]
pub fn hotkeys_error() -> Option<String> {
    crate::hotkeys::error()
}

/// Erro ao registrar as teclas do knob (None = registradas ou desligado).
#[tauri::command]
pub fn knob_error() -> Option<String> {
    crate::knob::error()
}

#[tauri::command]
pub fn list_processes() -> Vec<String> {
    foreground::visible_window_exes()
}

/// Saídas de áudio ativas (para a ação "trocar saída de áudio").
#[tauri::command]
pub async fn list_audio_outputs() -> Result<Vec<crate::audio::AudioDevice>, String> {
    tauri::async_runtime::spawn_blocking(crate::audio::list_outputs)
        .await
        .map_err(|e| e.to_string())?
}

/// Erro de registro do atalho global, se houver (ex.: combinação já usada por outro app).
#[tauri::command]
pub fn hotkey_error(state: State<'_, AppState>) -> Option<String> {
    state.hotkey_error.lock_ok().clone()
}
