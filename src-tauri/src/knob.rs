//! Controle dedicado (ex.: o knob de um teclado macro): três teclas globais que o teclado
//! envia ao girar para a direita, para a esquerda e ao apertar (de preferência F13–F15,
//! que nenhum teclado comum tem). O próprio teclado guarda essa configuração; aqui só
//! registramos as teclas e decidimos o que cada uma faz conforme o menu está aberto ou não.

use crate::config::{ClosedTurn, Knob};
use crate::lock::LockExt;
use crate::menu::{self, AppState, RADIAL};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Input {
    Press,
    Right,
    Left,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effect {
    /// Abre o menu (como o atalho).
    Show,
    /// Menu aberto: passa a seleção (+1 / −1).
    Step(i32),
    /// Menu aberto: executa a fatia escolhida (ou abre o submenu / volta).
    Select,
    /// Menu fechado, giro configurado como volume.
    Volume(bool),
    Nothing,
}

/// O que cada movimento faz (função pura).
pub fn decide(input: Input, menu_visible: bool, closed_turn: ClosedTurn) -> Effect {
    match (input, menu_visible) {
        (Input::Press, false) => Effect::Show,
        (Input::Press, true) => Effect::Select,
        (Input::Right, true) => Effect::Step(1),
        (Input::Left, true) => Effect::Step(-1),
        (dir, false) => match closed_turn {
            ClosedTurn::Volume => Effect::Volume(dir == Input::Right),
            ClosedTurn::Ignore => Effect::Nothing,
        },
    }
}

/// Teclas registradas agora (para desregistrar e reconhecer).
#[derive(Default)]
struct Registered {
    keys: Vec<(Shortcut, Input)>,
    error: Option<String>,
}

static REGISTERED: Mutex<Registered> = Mutex::new(Registered { keys: Vec::new(), error: None });

/// Converte as três teclas configuradas. Repetidas ou iguais ao atalho do menu = erro.
pub fn shortcuts(k: &Knob, menu_hotkey: Option<&str>) -> Result<Vec<(Shortcut, Input)>, String> {
    let mut out: Vec<(Shortcut, Input)> = Vec::new();
    let menu_sc = menu_hotkey.and_then(|h| menu::to_shortcut(h).ok());
    for (acc, input, name) in [(&k.press, Input::Press, "apertar"), (&k.right, Input::Right, "girar para a direita"), (&k.left, Input::Left, "girar para a esquerda")] {
        let sc = menu::to_shortcut(acc).map_err(|e| format!("tecla de \"{name}\": {e}"))?;
        if out.iter().any(|(o, _)| *o == sc) {
            return Err(format!("a tecla {acc} foi usada em mais de um movimento do knob"));
        }
        if menu_sc == Some(sc) {
            return Err(format!("a tecla {acc} já é o atalho do menu"));
        }
        out.push((sc, input));
    }
    Ok(out)
}

/// Liga/desliga as teclas do knob conforme a config. A Kira de teste nunca registra teclas
/// globais (usa o comando qa_knob).
pub fn apply(app: &AppHandle, cfg: &crate::config::Config) -> Result<(), String> {
    let gs = app.global_shortcut();
    let mut reg = REGISTERED.lock_ok();
    for (sc, _) in reg.keys.drain(..) {
        let _ = gs.unregister(sc);
    }
    reg.error = None;
    if !cfg.knob.enabled || crate::qa::ENABLED {
        return Ok(());
    }
    let menu_hotkey = cfg.launcher.mode.wants_hotkey().then_some(cfg.hotkey.accelerator.as_str());
    let wanted = match shortcuts(&cfg.knob, menu_hotkey) {
        Ok(w) => w,
        Err(e) => {
            reg.error = Some(e.clone());
            return Err(e);
        }
    };
    for (sc, input) in wanted {
        if let Err(e) = gs.register(sc) {
            let msg = format!("não foi possível registrar a tecla do knob {sc} (em uso por outro programa?): {e}");
            reg.error = Some(msg.clone());
            for (old, _) in reg.keys.drain(..) {
                let _ = gs.unregister(old);
            }
            return Err(msg);
        }
        reg.keys.push((sc, input));
    }
    Ok(())
}

/// Erro do último registro (mostrado nas Configurações).
pub fn error() -> Option<String> {
    REGISTERED.lock_ok().error.clone()
}

/// Pausa junto com o atalho do menu (ex.: enquanto as Configurações gravam uma tecla,
/// para o "Detectar" receber as teclas do knob).
pub fn set_paused(app: &AppHandle, paused: bool) {
    let gs = app.global_shortcut();
    for (sc, _) in REGISTERED.lock_ok().keys.iter() {
        if paused {
            let _ = gs.unregister(*sc);
        } else if !gs.is_registered(*sc) {
            let _ = gs.register(*sc);
        }
    }
}

/// Tecla global recebida: se for do knob, trata e devolve true.
pub fn on_shortcut(app: &AppHandle, sc: &Shortcut, event: ShortcutState) -> bool {
    let input = REGISTERED.lock_ok().keys.iter().find(|(k, _)| k == sc).map(|(_, i)| *i);
    let Some(input) = input else { return false };
    // Só o "apertar" conta; segurar a tecla não repete (o Windows reenvia Pressed).
    if event == ShortcutState::Pressed {
        handle(app, input);
    }
    true
}

/// Executa um movimento do knob (também usado pelo comando qa_knob da Kira de teste).
pub fn handle(app: &AppHandle, input: Input) {
    let state = app.state::<AppState>();
    if state.paused.load(Ordering::SeqCst) {
        return;
    }
    let closed_turn = state.config.lock_ok().knob.closed_turn;
    let visible = state.visible.load(Ordering::SeqCst);
    let r = match decide(input, visible, closed_turn) {
        Effect::Show => menu::show(app),
        Effect::Step(d) => app.emit_to(RADIAL, "knob:step", d).map_err(|e| e.to_string()),
        Effect::Select => app.emit_to(RADIAL, "knob:press", ()).map_err(|e| e.to_string()),
        Effect::Volume(up) => crate::actions::keys::send_vks(&[if up { 0xAF } else { 0xAE }]),
        Effect::Nothing => Ok(()),
    };
    if let Err(e) = r {
        crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("knob: {e}"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn knob(press: &str, right: &str, left: &str) -> Knob {
        Knob { enabled: true, press: press.into(), right: right.into(), left: left.into(), closed_turn: ClosedTurn::Ignore }
    }

    #[test]
    fn fechado_apertar_abre_e_girar_depende_da_opcao() {
        assert_eq!(decide(Input::Press, false, ClosedTurn::Ignore), Effect::Show);
        assert_eq!(decide(Input::Right, false, ClosedTurn::Ignore), Effect::Nothing);
        assert_eq!(decide(Input::Right, false, ClosedTurn::Volume), Effect::Volume(true));
        assert_eq!(decide(Input::Left, false, ClosedTurn::Volume), Effect::Volume(false));
    }

    #[test]
    fn aberto_girar_passa_e_apertar_escolhe() {
        for t in [ClosedTurn::Ignore, ClosedTurn::Volume] {
            assert_eq!(decide(Input::Right, true, t), Effect::Step(1));
            assert_eq!(decide(Input::Left, true, t), Effect::Step(-1));
            assert_eq!(decide(Input::Press, true, t), Effect::Select);
        }
    }

    #[test]
    fn teclas_validas_repetidas_ou_iguais_ao_atalho() {
        let ok = shortcuts(&knob("F13", "F14", "F15"), Some("Ctrl+Alt+Q")).unwrap();
        assert_eq!(ok.iter().map(|(_, i)| *i).collect::<Vec<_>>(), [Input::Press, Input::Right, Input::Left]);
        assert!(shortcuts(&knob("Ctrl+Alt+Shift+F10", "F24", "Ctrl+Alt+Shift+F12"), None).is_ok());
        assert!(shortcuts(&knob("F13", "F14", "F13"), None).unwrap_err().contains("mais de um"));
        assert!(shortcuts(&knob("Ctrl+Alt+Q", "F14", "F15"), Some("Ctrl+Alt+Q")).unwrap_err().contains("atalho do menu"));
        assert!(shortcuts(&knob("", "F14", "F15"), None).unwrap_err().contains("apertar"));
    }
}
