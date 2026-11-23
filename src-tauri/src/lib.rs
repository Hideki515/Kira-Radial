//! Kira Radial — menu radial para Windows.

#[macro_use]
mod i18n;
mod actions;
mod audio;
mod backup;
mod clipboard;
mod brightness;
mod browsers;
mod webvis;
mod commands;
mod config;
mod discord;
mod foreground;
mod hotkeys;
mod icons;
mod keycapture;
mod knob;
mod lock;
mod menu;
mod monitors;
mod nowplaying;
mod orb;
mod perf;
mod positioning;
mod qa;
mod radios;
mod schedule;
mod shot;
mod sqlite;
mod recent;
mod power;
mod stats;
mod syslang;
mod updater;
mod vpn;
mod vscode;
mod winlist;
mod winops;

use menu::{AppState, RADIAL, SETTINGS};
use std::sync::atomic::Ordering;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use crate::lock::LockExt;

/// Comandos do app. Na Kira de teste (feature `qa`) entram também os de automação;
/// no build normal eles nem são compilados.
#[cfg(not(feature = "qa"))]
macro_rules! handlers {
    ($($cmd:path),* $(,)?) => { tauri::generate_handler![$($cmd),*] };
}
#[cfg(feature = "qa")]
macro_rules! handlers {
    ($($cmd:path),* $(,)?) => {
        tauri::generate_handler![$($cmd,)* qa::commands::qa_show_menu, qa::commands::qa_open_settings, qa::commands::qa_close_settings, qa::commands::qa_state, qa::commands::qa_knob, shot::qa_fake_shot, hotkeys::qa_hotkey, updater::qa_fake_update, keycapture::qa_key_capture]
    };
}

pub fn run() {
    perf::install_panic_hook();
    let cfg = config::load();
    i18n::apply(cfg.behavior.language.as_deref());

    tauri::Builder::default()
        // Uma segunda execução apenas abre as configurações da instância existente.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| menu::open_settings(app)))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Atalhos de fatia e teclas do knob têm tratamento próprio; o resto é o do menu.
                    if !hotkeys::on_shortcut(app, shortcut, event.state()) && !knob::on_shortcut(app, shortcut, event.state()) {
                        menu::on_shortcut(app, event.state());
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::new(cfg.clone()))
        .setup(move |app| {
            let handle = app.handle().clone();
            perf::log(
                "rust",
                &format!("Kira {} iniciada{}", handle.package_info().version, if qa::ENABLED { " (Kira de teste)" } else { "" }),
            );

            // As Configurações param de desenhar quando a página avisa que carregou
            // (comando settings_ready) — mexer no WebView2 durante o carregamento é ignorado
            // ou trava a página. O menu fica de fora: fechado ele não monta nada.

            // Kira de teste: não disputa o atalho global com a instância do usuário.
            if qa::ENABLED {
            } else if let Err(e) = menu::apply_hotkey(&handle, &cfg) {
                eprintln!("[kira-radial] {e}");
                *handle.state::<AppState>().hotkey_error.lock_ok() = Some(e);
                // Sem atalho o app ainda é usável pela bandeja; abre as configurações para corrigir.
                menu::open_settings(&handle);
            }
            // Depois do atalho do menu (as teclas do knob não podem repetir o atalho).
            if let Err(e) = knob::apply(&handle, &cfg) {
                perf::log_level(perf::Level::Warn, "rust", &format!("knob: {e}"));
            }
            if let Err(e) = hotkeys::apply(&handle, &cfg) {
                perf::log_level(perf::Level::Warn, "rust", &format!("atalhos de fatia: {e}"));
            }

            // Mantém o registro do Windows coerente com a configuração.
            if !qa::ENABLED && handle.autolaunch().is_enabled().unwrap_or(false) != cfg.behavior.autostart {
                let _ = commands::apply_autostart(&handle, cfg.behavior.autostart);
            }

            // Menu some/aparece instantaneamente (sem o fade do Windows).
            if let Some(w) = app.get_webview_window(RADIAL) {
                if let Ok(h) = w.hwnd() {
                    foreground::disable_transitions(h.0 as isize);
                }
            }

            clipboard::set_enabled(cfg.behavior.clipboard_history);
            orb::init(&handle);
            orb::apply(&handle, &cfg);
            orb::spawn_fullscreen_watch(handle.clone());

            if !qa::ENABLED {
                build_tray(app)?;
            }
            updater::spawn_periodic(handle.clone());
            stats::spawn(handle);
            Ok(())
        })
        // Itens do menu de contexto do ícone (o da bandeja tem handler próprio).
        .on_menu_event(|app, event| match event.id().as_ref() {
            orb::MENU_SETTINGS => menu::open_settings(app),
            orb::MENU_HIDE => orb::set_hidden(app, true),
            _ => {}
        })
        .on_window_event(|window, event| {
            if let (orb::ORB, WindowEvent::Moved(p)) = (window.label(), event) {
                orb::on_moved(window.app_handle(), p.x, p.y);
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Fechar apenas esconde; o app continua na bandeja.
                api.prevent_close();
                match window.label() {
                    RADIAL => menu::hide(window.app_handle()),
                    SETTINGS => menu::close_settings(window.app_handle()),
                    _ => {}
                }
            }
        })
        .invoke_handler(handlers!(
            commands::get_config,
            commands::system_languages,
            commands::save_config,
            commands::run_action,
            commands::hide_menu,
            commands::set_hotkey_paused,
            commands::list_processes,
            commands::list_audio_outputs,
            commands::hotkey_error,
            commands::orb_clicked,
            commands::orb_reset_position,
            commands::orb_set_hidden,
            commands::list_windows,
            commands::now_playing,
            commands::list_power_plans,
            commands::list_displays,
            commands::list_browsers,
            commands::settings_ready,
            perf::perf_open_sample,
            commands::list_browser_profiles,
            commands::list_radios,
            commands::discord_voice,
            commands::discord_status,
            commands::discord_connect,
            commands::discord_disconnect,
            commands::knob_error,
            commands::hotkeys_error,
            updater::update_check,
            updater::update_status,
            updater::update_install,
            shot::shot_current,
            shot::shot_copy,
            shot::shot_save,
            shot::shot_open_folder,
            shot::shot_edit,
            shot::shot_dismiss,
            shot::shot_pin,
            shot::shot_pin_image,
            shot::shot_unpin,
            commands::list_recent_files,
            commands::list_vscode_projects,
            commands::list_vpns,
            commands::clipboard_list,
            commands::clipboard_clear,
            commands::get_volume,
            commands::read_orb_image,
            commands::read_sound,
            commands::read_icon,
            commands::extract_icon,
            commands::list_backups,
            commands::list_monitors,
            commands::identify_monitors,
            commands::read_backup,
            commands::orb_context_menu,
            perf::perf_log,
            perf::read_log,
            perf::clear_log,
            perf::open_data_dir,
            perf::diagnostics,
            perf::write_report,
            keycapture::start_key_capture,
            keycapture::stop_key_capture,
        ))
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Kira Radial");
}

/// Itens da bandeja (para trocar os textos quando o idioma muda).
struct TrayItems {
    open: MenuItem<tauri::Wry>,
    settings: MenuItem<tauri::Wry>,
    pause: CheckMenuItem<tauri::Wry>,
    orb: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}
static TRAY_ITEMS: std::sync::OnceLock<TrayItems> = std::sync::OnceLock::new();

fn tray_texts() -> [&'static str; 5] {
    [
        tr!("Abrir menu", "Open menu"),
        tr!("Configurações", "Settings"),
        tr!("Pausar atalho", "Pause shortcut"),
        tr!("Mostrar/esconder ícone", "Show/hide icon"),
        tr!("Sair", "Quit"),
    ]
}

/// Reescreve os textos da bandeja no idioma atual (depois de salvar com outro idioma).
pub fn relabel_tray() {
    if let Some(t) = TRAY_ITEMS.get() {
        let [open, settings, pause, orb, quit] = tray_texts();
        let _ = t.open.set_text(open);
        let _ = t.settings.set_text(settings);
        let _ = t.pause.set_text(pause);
        let _ = t.orb.set_text(orb);
        let _ = t.quit.set_text(quit);
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let [t_open, t_settings, t_pause, t_orb, t_quit] = tray_texts();
    let open = MenuItem::with_id(app, "open", t_open, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", t_settings, true, None::<&str>)?;
    let pause = CheckMenuItem::with_id(app, "pause", t_pause, true, false, None::<&str>)?;
    let orb_toggle = MenuItem::with_id(app, "orb", t_orb, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", t_quit, true, None::<&str>)?;
    let _ = TRAY_ITEMS.set(TrayItems { open: open.clone(), settings: settings.clone(), pause: pause.clone(), orb: orb_toggle.clone(), quit: quit.clone() });
    let sep = PredefinedMenuItem::separator(app)?;
    let tray_menu = Menu::with_items(app, &[&open, &settings, &pause, &orb_toggle, &sep, &quit])?;

    let pause_item = pause.clone();
    TrayIconBuilder::with_id("main")
        .icon(app.default_window_icon().cloned().expect("ícone do app ausente"))
        .tooltip("Kira Radial")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => {
                let _ = menu::show(app);
            }
            "settings" => menu::open_settings(app),
            "pause" => {
                let paused = !app.state::<AppState>().paused.load(Ordering::SeqCst);
                menu::set_paused(app, paused);
                let _ = pause_item.set_checked(paused);
            }
            "orb" => orb::toggle_hidden(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Clique esquerdo no ícone abre as configurações.
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                menu::open_settings(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
