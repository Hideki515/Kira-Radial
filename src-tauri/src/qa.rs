//! "Kira de teste": variante isolada para o QA, ligada pela feature de compilação `qa`.
//!
//! Com `--features qa` (e `--config tauri.qa.conf.json`, que troca o identifier):
//! - pasta de dados própria (`%APPDATA%\Kira-Radial-QA`): a config do usuário nunca é tocada;
//! - não registra o atalho global, não liga o "iniciar com o Windows" e não cria ícone na bandeja;
//! - todas as janelas abrem FORA da área visível e nunca pegam o foco;
//! - comandos de automação `qa_*` (só existem nesta variante; o build normal não os contém).

use tauri::{PhysicalPosition, WebviewWindow};

/// Esta é a Kira de teste?
pub const ENABLED: bool = cfg!(feature = "qa");

/// Coordenada fora de qualquer monitor (as janelas existem, mas não aparecem na tela).
pub const OFFSCREEN: i32 = -10_000;

/// Nome da pasta de dados em %APPDATA%.
pub fn data_dir_name() -> &'static str {
    if ENABLED {
        "Kira-Radial-QA"
    } else {
        "Kira-Radial"
    }
}

/// Na Kira de teste, empurra a janela para fora da tela. No app normal não faz nada.
pub fn keep_offscreen(w: &WebviewWindow) {
    if ENABLED {
        let _ = w.set_position(PhysicalPosition::new(OFFSCREEN, OFFSCREEN));
    }
}

#[cfg(feature = "qa")]
pub mod commands {
    use crate::menu::{self, AppState};
    use serde::Serialize;
    use std::sync::atomic::Ordering;
    use tauri::{AppHandle, Manager};

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct QaState {
        pub qa: bool,
        pub version: String,
        pub data_dir: String,
        pub menu_visible: bool,
        pub hotkey_registered: bool,
    }

    /// Abre o menu (fora da tela, sem foco). `from_orb` simula a abertura pelo ícone.
    #[tauri::command]
    pub fn qa_show_menu(app: AppHandle, from_orb: bool) -> Result<(), String> {
        if from_orb {
            crate::orb::clicked(&app)
        } else {
            menu::show(&app)
        }
    }

    #[tauri::command]
    pub fn qa_open_settings(app: AppHandle) {
        menu::open_settings(&app);
    }

    #[tauri::command]
    pub fn qa_state(app: AppHandle) -> QaState {
        let state = app.state::<AppState>();
        let hotkey_registered = state.shortcut.lock().unwrap().is_some();
        QaState {
            qa: true,
            version: app.package_info().version.to_string(),
            data_dir: crate::config::config_dir().to_string_lossy().into_owned(),
            menu_visible: state.visible.load(Ordering::SeqCst),
            hotkey_registered,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pasta_de_dados_isolada_so_na_variante_qa() {
        let expected = if cfg!(feature = "qa") { "Kira-Radial-QA" } else { "Kira-Radial" };
        assert_eq!(data_dir_name(), expected);
        assert!(crate::config::config_dir().ends_with(expected));
    }

    #[test]
    fn posicao_fora_da_tela_nao_cabe_em_monitor_real() {
        let (mons, _) = crate::positioning::monitors();
        let inside = mons.iter().any(|m| OFFSCREEN >= m.left && OFFSCREEN < m.right && OFFSCREEN >= m.top && OFFSCREEN < m.bottom);
        assert!(!inside);
    }
}
