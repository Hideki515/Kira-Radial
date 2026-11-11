//! Testes do executor de ações (separados do mod.rs para facilitar a leitura).

mod geral_tests {
    use crate::actions::system::privilege_result;
    use crate::actions::*;

    #[test]
    fn privilegio_nao_concedido_vira_erro_legivel() {
        assert!(privilege_result(0).is_ok());
        let e = privilege_result(1300).unwrap_err();
        assert!(e.contains("sem permissão"));
    }

    #[test]
    fn midia_mantem_menu_aberto() {
        let media: Action = serde_json::from_str(r#"{"type":"media","cmd":"volup"}"#).unwrap();
        let keys: Action = serde_json::from_str(r#"{"type":"keys","combo":"Win+D"}"#).unwrap();
        assert!(media.keeps_menu_open());
        assert!(!media.needs_previous_focus());
        assert!(!keys.keeps_menu_open());
    }

    #[test]
    fn desserializa_formato_do_front() {
        let a: Action = serde_json::from_str(r#"{"type":"keys","combo":"Win+D"}"#).unwrap();
        assert!(matches!(a, Action::Keys { .. }) && a.needs_previous_focus());
        let a: Action = serde_json::from_str(r#"{"type":"keys","combo":"Ctrl+Shift+S","delayMs":250}"#).unwrap();
        assert_eq!(a.delay(), Duration::from_millis(250));
        let a: Action = serde_json::from_str(r#"{"type":"keys","combo":"A","delayMs":999999}"#).unwrap();
        assert_eq!(a.delay(), Duration::from_secs(10));
        let a: Action = serde_json::from_str(r#"{"type":"media","cmd":"playpause"}"#).unwrap();
        assert!(matches!(a, Action::Media { cmd: MediaCmd::PlayPause }));
        let a: Action = serde_json::from_str(r#"{"type":"system","cmd":"signout"}"#).unwrap();
        assert!(matches!(a, Action::System { cmd: SystemCmd::SignOut }));
        let a: Action = serde_json::from_str(r#"{"type":"openSettings"}"#).unwrap();
        assert!(matches!(a, Action::OpenSettings));
        let a: Action = serde_json::from_str(r#"{"type":"launch","path":"calc.exe"}"#).unwrap();
        assert!(matches!(a, Action::Launch { admin: false, .. }));
        let a: Action = serde_json::from_str(r#"{"type":"audioOutput","mode":"cycle"}"#).unwrap();
        assert!(matches!(a, Action::AudioOutput { mode: AudioMode::Cycle, device_id: None, .. }) && !a.needs_previous_focus());
        let a: Action =
            serde_json::from_str(r#"{"type":"audioOutput","mode":"set","deviceId":"{0.0.0}.{x}","deviceName":"Headset"}"#).unwrap();
        match a {
            Action::AudioOutput { mode: AudioMode::Set, device_id, device_name } => {
                assert_eq!(device_id.as_deref(), Some("{0.0.0}.{x}"));
                assert_eq!(device_name.as_deref(), Some("Headset"));
            }
            _ => panic!("esperava audioOutput"),
        }
    }

    #[test]
    fn todas_as_acoes_do_padrao_desserializam() {
        let v: serde_json::Value = serde_json::from_str(crate::config::DEFAULT_JSON).unwrap();
        let mut n = 0;
        fn walk(items: &serde_json::Value, n: &mut usize) {
            for it in items.as_array().unwrap() {
                if let Some(a) = it.get("action") {
                    serde_json::from_value::<Action>(a.clone()).unwrap();
                    *n += 1;
                }
                if let Some(c) = it.get("children") {
                    walk(c, n);
                }
            }
        }
        walk(&v["profiles"][0]["items"], &mut n);
        assert!(n > 10);
    }

    #[test]
    fn expande_variaveis() {
        let home = std::env::var("USERPROFILE").unwrap();
        assert_eq!(expand_env("%USERPROFILE%\\Downloads"), format!("{home}\\Downloads"));
        assert_eq!(expand_env("C:\\sem\\var"), "C:\\sem\\var");
    }
}

/// QA (v0.4.0): o JSON gerado pelo front para as ações de janela desserializa no Rust.
mod window_qa_tests {
    use crate::actions::Action;
    use crate::winops::WindowCmd;

    #[test]
    fn focus_window_do_front_ignora_titulo_extra() {
        let a: Action = serde_json::from_str(r#"{"type":"focusWindow","hwnd":4589012,"title":"Doc - Word"}"#).unwrap();
        assert!(matches!(a, Action::FocusWindow { hwnd: 4589012 }));
        assert!(!a.keeps_menu_open() && !a.needs_previous_focus());
    }

    #[test]
    fn window_aceita_todos_os_comandos_do_front() {
        for c in ["topmost", "nextMonitor", "snapLeft", "snapRight", "maximize", "minimize", "minimizeAll"] {
            let a: Action = serde_json::from_str(&format!(r#"{{"type":"window","cmd":"{c}"}}"#)).unwrap();
            assert!(matches!(a, Action::Window { .. }), "{c}");
            assert!(!a.keeps_menu_open());
        }
        assert!(serde_json::from_str::<Action>(r#"{"type":"window","cmd":"snapUp"}"#).is_err());
        let _ = WindowCmd::MinimizeAll;
    }
}

/// QA (v0.5.0): o JSON gerado pelo front para as ações da Fase 2 desserializa no Rust
/// (só serde — nenhuma ação é executada).
mod fase2_qa_tests {
    use crate::actions::{Action, BrightnessMode};

    #[test]
    fn acoes_da_fase2_do_front_desserializam() {
        let a: Action = serde_json::from_str(
            r#"{"type":"powerPlan","guid":"381b4222-f694-41f0-9685-ff5bb260df2e","name":"Equilibrado"}"#,
        )
        .unwrap();
        assert!(matches!(a, Action::PowerPlan { .. }));
        assert!(!a.needs_previous_focus() && !a.keeps_menu_open());

        let a: Action = serde_json::from_str(r#"{"type":"paste","index":3,"preview":"olá"}"#).unwrap();
        assert!(matches!(a, Action::Paste { index: 3 }));
        assert!(a.needs_previous_focus());

        let a: Action = serde_json::from_str(r#"{"type":"brightness","mode":"set","value":40,"target":"all"}"#).unwrap();
        assert!(matches!(a, Action::Brightness { mode: BrightnessMode::Set, value: Some(40), .. }));
        for m in ["up", "down"] {
            let a: Action = serde_json::from_str(&format!(r#"{{"type":"brightness","mode":"{m}"}}"#)).unwrap();
            assert!(matches!(a, Action::Brightness { value: None, target: None, .. }), "{m}");
        }
        assert!(serde_json::from_str::<Action>(r#"{"type":"brightness","mode":"max"}"#).is_err());

        for k in ["wifi", "bluetooth"] {
            for m in ["toggle", "on", "off"] {
                let a: Action = serde_json::from_str(&format!(r#"{{"type":"radio","kind":"{k}","mode":"{m}"}}"#)).unwrap();
                assert!(matches!(a, Action::Radio { .. }), "{k}/{m}");
            }
        }
    }
}

mod url_browser_tests {
    use crate::actions::Action;

    #[test]
    fn site_com_navegador_desserializa_e_antigo_continua_valido() {
        let a: Action = serde_json::from_str(r#"{"type":"url","url":"https://a.b"}"#).unwrap();
        assert!(matches!(a, Action::Url { browser: None, private: false, profile: None, .. }));
        let a: Action = serde_json::from_str(
            r#"{"type":"url","url":"https://a.b","browser":"Google Chrome","browserName":"Google Chrome","private":true,"profile":"Profile 1"}"#,
        )
        .unwrap();
        match a {
            Action::Url { browser, browser_name, private, profile, .. } => {
                assert_eq!(browser.as_deref(), Some("Google Chrome"));
                assert_eq!(browser_name.as_deref(), Some("Google Chrome"));
                assert!(private);
                assert_eq!(profile.as_deref(), Some("Profile 1"));
            }
            _ => panic!(),
        }
    }

    #[test]
    fn url_invalida_falha_antes_de_abrir_qualquer_navegador() {
        let a: Action = serde_json::from_str(r#"{"type":"url","url":"javascript:alert(1)","browser":"Google Chrome"}"#).unwrap();
        assert!(crate::actions::execute(&a).is_err());
    }
}

mod brightness_target_tests {
    use crate::actions::Action;

    #[test]
    fn brilho_com_tela_desserializa_e_antigo_continua_valido() {
        let a: Action = serde_json::from_str(r#"{"type":"brightness","mode":"up","target":"mon:\\\\?\\DISPLAY#AOC2402#x","targetName":"Monitor 2"}"#).unwrap();
        match a {
            Action::Brightness { target, target_name, .. } => {
                assert_eq!(target.as_deref(), Some(r"mon:\\?\DISPLAY#AOC2402#x"));
                assert_eq!(target_name.as_deref(), Some("Monitor 2"));
            }
            _ => panic!(),
        }
        let a: Action = serde_json::from_str(r#"{"type":"brightness","mode":"set","value":40,"target":"ddc:0"}"#).unwrap();
        assert!(matches!(a, Action::Brightness { target_name: None, .. }));
    }
}
