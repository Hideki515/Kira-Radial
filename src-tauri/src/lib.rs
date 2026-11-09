//! Kira Radial — menu radial para Windows.

mod actions;
mod audio;
mod commands;
mod config;
mod foreground;
mod keycapture;
mod menu;
mod orb;
mod perf;
mod positioning;
mod stats;

use menu::{AppState, RADIAL, SETTINGS};
use std::sync::atomic::Ordering;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

pub fn run() {
    let cfg = config::load();

    tauri::Builder::default()
        // Uma segunda execução apenas abre as configurações da instância existente.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| menu::open_settings(app)))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| menu::on_shortcut(app, event.state()))
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new(cfg.clone()))
        .setup(move |app| {
            let handle = app.handle().clone();

            if let Err(e) = menu::apply_hotkey(&handle, &cfg) {
                eprintln!("[kira-radial] {e}");
                *handle.state::<AppState>().hotkey_error.lock().unwrap() = Some(e);
                // Sem atalho o app ainda é usável pela bandeja; abre as configurações para corrigir.
                menu::open_settings(&handle);
            }

            // Mantém o registro do Windows coerente com a configuração.
            if handle.autolaunch().is_enabled().unwrap_or(false) != cfg.behavior.autostart {
                let _ = commands::apply_autostart(&handle, cfg.behavior.autostart);
            }

            // Menu some/aparece instantaneamente (sem o fade do Windows).
            if let Some(w) = app.get_webview_window(RADIAL) {
                if let Ok(h) = w.hwnd() {
                    foreground::disable_transitions(h.0 as isize);
                }
            }

            orb::init(&handle);
            orb::apply(&handle, &cfg);

            build_tray(app)?;
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
                    SETTINGS => {
                        let _ = window.hide();
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::run_action,
            commands::hide_menu,
            commands::set_hotkey_paused,
            commands::list_processes,
            commands::list_audio_outputs,
            commands::hotkey_error,
            commands::orb_clicked,
            commands::orb_reset_position,
            commands::read_orb_image,
            commands::orb_context_menu,
            perf::perf_log,
            keycapture::start_key_capture,
            keycapture::stop_key_capture,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Kira Radial");
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir menu", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Configurações", true, None::<&str>)?;
    let pause = CheckMenuItem::with_id(app, "pause", "Pausar atalho", true, false, None::<&str>)?;
    let orb_toggle = MenuItem::with_id(app, "orb", "Mostrar/esconder ícone", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
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
