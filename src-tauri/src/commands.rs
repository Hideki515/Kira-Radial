//! Comandos chamados pelo front (src/shared/ipc.ts).

use crate::actions::{self, Action};
use crate::config::{self, Config};
use crate::foreground;
use crate::menu::{self, AppState};
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Config {
    state.config()
}

#[tauri::command]
pub fn save_config(app: AppHandle, state: State<'_, AppState>, mut config: Config) -> Result<(), String> {
    config.validate()?;
    let old = state.config();
    // A posição do ícone é do backend (muda ao arrastar); o rascunho das configurações
    // pode estar desatualizado.
    config.launcher.orb.x = old.launcher.orb.x;
    config.launcher.orb.y = old.launcher.orb.y;
    config.launcher.orb.hidden = old.launcher.orb.hidden;
    config.launcher.orb.docked = old.launcher.orb.docked;
    if old.hotkey.accelerator != config.hotkey.accelerator || old.launcher.mode != config.launcher.mode {
        menu::apply_hotkey(&app, &config)?;
    }
    if old.behavior.clipboard_history != config.behavior.clipboard_history {
        crate::clipboard::set_enabled(config.behavior.clipboard_history);
    }
    if old.behavior.autostart != config.behavior.autostart {
        apply_autostart(&app, config.behavior.autostart)?;
    }
    config::save(&config)?;
    *state.config.lock().unwrap() = config.clone();
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

/// Wi-Fi e Bluetooth (submenu automático "Rádios").
#[tauri::command]
pub async fn list_radios() -> Result<Vec<crate::radios::RadioInfo>, String> {
    tauri::async_runtime::spawn_blocking(crate::radios::list).await.map_err(|e| e.to_string())
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
    r.map_err(|e| format!("falha ao configurar inicialização com o Windows: {e}"))
}

#[tauri::command]
pub async fn run_action(app: AppHandle, action: Action) -> Result<(), String> {
    if matches!(action, Action::OpenSettings) {
        menu::open_settings(&app);
        return Ok(());
    }
    let (close, prev) = {
        let state = tauri::Manager::state::<AppState>(&app);
        let cfg = state.config.lock().unwrap();
        (
            !action.keeps_menu_open() && (cfg.behavior.close_on_action || action.needs_previous_focus()),
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
    let needs_focus = action.needs_previous_focus();
    tauri::async_runtime::spawn_blocking(move || {
        if close {
            // Garante que o menu já sumiu da tela (ex.: atalhos de print não o capturam).
            foreground::wait_hidden(radial_hwnd, 500);
        }
        if needs_focus {
            // Teclas vão para a janela em foco: devolve o foco ao app anterior primeiro.
            foreground::restore(prev);
            std::thread::sleep(Duration::from_millis(50));
        }
        // Atraso extra configurado na ação (ex.: apps de print mais lentos).
        std::thread::sleep(action.delay());
        if let Action::Window { cmd } = &action {
            return crate::winops::run(*cmd, prev);
        }
        actions::execute(&action)
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
    state.hotkey_error.lock().unwrap().clone()
}
