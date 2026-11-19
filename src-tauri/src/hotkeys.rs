//! Atalho global por fatia: um atalho do teclado executa a ação de uma fatia (ou subitem)
//! direto, sem abrir o menu. Vale em qualquer perfil.
//!
//! Mesmo padrão do knob (knob.rs): registra pelo plugin de atalhos sem segurar a trava interna,
//! pausa junto com o atalho do menu (gravador das Configurações) e guarda o erro para a tela.

use crate::actions::{Action, SystemCmd};
use crate::config::Config;
use crate::lock::LockExt;
use crate::menu::{self, AppState};
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Um atalho de fatia: a combinação, a ação e o nome (para mensagens).
#[derive(Clone, Debug)]
pub struct Binding {
    pub accelerator: String,
    pub shortcut: Shortcut,
    pub action: Action,
    pub label: String,
}

#[derive(Default)]
struct Registered {
    bindings: Vec<Binding>,
    /// Atalhos realmente registrados no Windows (vazio na Kira de teste).
    active: Vec<Shortcut>,
    error: Option<String>,
}

static STATE: Mutex<Registered> = Mutex::new(Registered { bindings: Vec::new(), active: Vec::new(), error: None });

/// Comandos que pedem confirmação: não aceitam atalho (desligaria sem perguntar).
fn dangerous(a: &Action) -> bool {
    matches!(a, Action::System { cmd: SystemCmd::Shutdown | SystemCmd::Restart | SystemCmd::SignOut })
}

/// Sem modificador só teclas F (não digitam texto); igual ao front (validate.hotkeyComboOk).
pub fn combo_ok(acc: &str) -> bool {
    let parts: Vec<String> = acc.split('+').map(|p| p.trim().to_ascii_lowercase()).filter(|p| !p.is_empty()).collect();
    let is_mod = |p: &str| matches!(p, "ctrl" | "control" | "alt" | "shift" | "win" | "super" | "meta" | "cmd" | "windows");
    let Some(key) = parts.last() else { return false };
    let f_key = key.strip_prefix('f').and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| (1..=24).contains(&n));
    parts.iter().any(|p| is_mod(p)) || f_key
}

/// Lê os atalhos de todas as fatias e subitens de todos os perfis e confere conflitos:
/// repetidos, iguais ao atalho do menu ou às teclas do knob, ou em ação perigosa.
pub fn collect(cfg: &Config) -> Result<Vec<Binding>, String> {
    let mut out: Vec<Binding> = Vec::new();
    let mut taken: Vec<(Shortcut, String)> = Vec::new();
    if cfg.launcher.mode.wants_hotkey() {
        if let Ok(sc) = menu::to_shortcut(&cfg.hotkey.accelerator) {
            taken.push((sc, "atalho do menu".into()));
        }
    }
    if cfg.knob.enabled {
        for acc in [&cfg.knob.press, &cfg.knob.right, &cfg.knob.left] {
            if let Ok(sc) = menu::to_shortcut(acc) {
                taken.push((sc, "teclas do knob".into()));
            }
        }
    }
    let mut visit = |item: &Value| -> Result<(), String> {
        let Some(acc) = item.get("hotkey").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()) else {
            return Ok(());
        };
        let label = item.get("label").and_then(Value::as_str).unwrap_or("?").to_string();
        if !combo_ok(acc) {
            return Err(format!("\"{label}\": o atalho {acc} precisa de Ctrl, Alt, Shift ou Win (ou ser uma tecla F)"));
        }
        if item.get("dynamic").is_some_and(|d| !d.is_null()) {
            return Err(format!("\"{label}\": submenu automático não aceita atalho global"));
        }
        let Some(action_json) = item.get("action") else {
            return Err(format!("\"{label}\": só fatias com ação aceitam atalho global"));
        };
        let action: Action = serde_json::from_value(action_json.clone()).map_err(|e| format!("\"{label}\": ação inválida ({e})"))?;
        if dangerous(&action) {
            return Err(format!("\"{label}\": desligar, reiniciar e encerrar sessão não aceitam atalho global"));
        }
        let sc = menu::to_shortcut(acc).map_err(|e| format!("\"{label}\": {e}"))?;
        if let Some((_, who)) = taken.iter().find(|(s, _)| *s == sc) {
            return Err(format!("o atalho {acc} de \"{label}\" já é usado por {who}"));
        }
        taken.push((sc, format!("\"{label}\"")));
        out.push(Binding { accelerator: acc.to_string(), shortcut: sc, action, label });
        Ok(())
    };
    for profile in &cfg.profiles {
        for item in &profile.items {
            visit(item)?;
            for child in item.get("children").and_then(Value::as_array).into_iter().flatten() {
                visit(child)?;
            }
        }
    }
    Ok(out)
}

/// Registra os atalhos das fatias (a Kira de teste só guarda a lista, sem registrar no Windows).
pub fn apply(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let gs = app.global_shortcut();
    let old = std::mem::take(&mut STATE.lock_ok().active);
    for sc in old {
        let _ = gs.unregister(sc);
    }
    let result = collect(cfg).and_then(|bindings| {
        let mut active = Vec::new();
        if !crate::qa::ENABLED {
            for b in &bindings {
                if let Err(e) = gs.register(b.shortcut) {
                    for sc in active {
                        let _ = gs.unregister(sc);
                    }
                    return Err(format!("não foi possível registrar {} de \"{}\" (em uso por outro programa?): {e}", b.accelerator, b.label));
                }
                active.push(b.shortcut);
            }
        }
        Ok((bindings, active))
    });
    let mut st = STATE.lock_ok();
    match result {
        Ok((bindings, active)) => {
            *st = Registered { bindings, active, error: None };
            Ok(())
        }
        Err(e) => {
            *st = Registered { bindings: Vec::new(), active: Vec::new(), error: Some(e.clone()) };
            Err(e)
        }
    }
}

pub fn error() -> Option<String> {
    STATE.lock_ok().error.clone()
}

/// Pausa junto com o atalho do menu (o gravador das Configurações precisa receber as teclas).
pub fn set_paused(app: &AppHandle, paused: bool) {
    let gs = app.global_shortcut();
    let keys = STATE.lock_ok().active.clone();
    let mut failed = None;
    for sc in keys {
        if paused {
            let _ = gs.unregister(sc);
        } else if !gs.is_registered(sc) {
            if let Err(e) = gs.register(sc) {
                failed = Some(format!("o atalho {sc} de uma fatia não voltou a funcionar: {e}"));
            }
        }
    }
    if let Some(e) = failed {
        crate::perf::log_level(crate::perf::Level::Warn, "rust", &e);
        STATE.lock_ok().error = Some(e);
    }
}

/// Tecla global recebida: se for de uma fatia, executa e devolve true.
pub fn on_shortcut(app: &AppHandle, sc: &Shortcut, event: ShortcutState) -> bool {
    let binding = STATE.lock_ok().bindings.iter().find(|b| b.shortcut == *sc).cloned();
    let Some(b) = binding else { return false };
    if event == ShortcutState::Pressed {
        run(app, b);
    }
    true
}

/// Executa a ação da fatia no app em foco agora (é para ele que vão as teclas, colar etc.).
fn run(app: &AppHandle, b: Binding) {
    let state = app.state::<AppState>();
    if state.paused.load(Ordering::SeqCst) {
        return;
    }
    // Janelas da própria Kira (menu, ícone, Configurações) não são o alvo.
    let settings = app.get_webview_window(menu::SETTINGS).and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize).unwrap_or(0);
    let fg = crate::foreground::current_app(&[menu::radial_hwnd(app), crate::orb::hwnd(app), settings]);
    if fg.hwnd != 0 {
        state.prev_hwnd.store(fg.hwnd, Ordering::SeqCst);
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = crate::commands::run_action(app, b.action).await {
            crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("atalho {} (\"{}\"): {e}", b.accelerator, b.label));
        }
    });
}

/// Kira de teste: executa o atalho de uma fatia sem o teclado do Windows.
#[cfg(feature = "qa")]
#[tauri::command]
pub async fn qa_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    let sc = menu::to_shortcut(&accelerator)?;
    let b = STATE.lock_ok().bindings.iter().find(|b| b.shortcut == sc).cloned().ok_or("nenhuma fatia com esse atalho")?;
    crate::commands::run_action(app, b.action).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cfg(items: Value) -> Config {
        let mut v = serde_json::to_value(Config::default_config()).unwrap();
        v["profiles"][0]["items"] = items;
        v["hotkey"]["accelerator"] = json!("Ctrl+Alt+Q");
        v["launcher"]["mode"] = json!("hotkey");
        serde_json::from_value(v).unwrap()
    }
    fn item(label: &str, hotkey: &str, action: Value) -> Value {
        json!({"id": label, "label": label, "icon": "x", "hotkey": hotkey, "action": action})
    }
    const OPEN: fn() -> Value = || json!({"type": "openSettings"});

    #[test]
    fn coleta_fatias_e_subitens_de_todos_os_perfis() {
        let c = cfg(json!([
            item("A", "Ctrl+Alt+1", OPEN()),
            {"id": "B", "label": "B", "icon": "x", "children": [item("B1", "Ctrl+Alt+2", json!({"type": "media", "cmd": "mute"}))]},
            {"id": "C", "label": "C", "icon": "x", "action": OPEN()}
        ]));
        let b = collect(&c).unwrap();
        assert_eq!(b.iter().map(|x| x.label.as_str()).collect::<Vec<_>>(), ["A", "B1"]);
    }

    #[test]
    fn conflitos_e_acoes_proibidas() {
        let dup = cfg(json!([item("A", "Ctrl+Alt+1", OPEN()), item("B", "ctrl+alt+1", OPEN()), item("C", "", OPEN())]));
        assert!(collect(&dup).unwrap_err().contains("\"A\""));
        let menu_key = cfg(json!([item("A", "Ctrl+Alt+Q", OPEN()), item("B", "", OPEN()), item("C", "", OPEN())]));
        assert!(collect(&menu_key).unwrap_err().contains("atalho do menu"));
        let off = cfg(json!([item("A", "Ctrl+Alt+P", json!({"type": "system", "cmd": "shutdown"})), item("B", "", OPEN()), item("C", "", OPEN())]));
        assert!(collect(&off).unwrap_err().contains("desligar"));
        let no_action = cfg(json!([{"id": "A", "label": "A", "icon": "x", "hotkey": "Ctrl+Alt+1", "children": []}, item("B", "", OPEN()), item("C", "", OPEN())]));
        assert!(collect(&no_action).unwrap_err().contains("só fatias com ação"));
    }

    #[test]
    fn modificador_obrigatorio_exceto_teclas_f_e_submenu_automatico_recusado() {
        assert!(combo_ok("Ctrl+Alt+1") && combo_ok("F13") && combo_ok("Shift+F9"));
        assert!(!combo_ok("A") && !combo_ok("") && !combo_ok("F25"));
        let plain = cfg(json!([item("A", "A", OPEN()), item("B", "", OPEN()), item("C", "", OPEN())]));
        assert!(collect(&plain).unwrap_err().contains("precisa de Ctrl"));
        let dynamic = cfg(json!([{"id": "D", "label": "D", "icon": "x", "hotkey": "Ctrl+Alt+3", "dynamic": "radios", "action": OPEN()}, item("B", "", OPEN()), item("C", "", OPEN())]));
        assert!(collect(&dynamic).unwrap_err().contains("submenu automático"));
    }

    #[test]
    fn teclas_do_knob_ligado_tambem_conflitam() {
        let mut c = cfg(json!([item("A", "F13", OPEN()), item("B", "", OPEN()), item("C", "", OPEN())]));
        assert!(collect(&c).is_ok());
        c.knob.enabled = true;
        assert!(collect(&c).unwrap_err().contains("knob"));
    }
}
