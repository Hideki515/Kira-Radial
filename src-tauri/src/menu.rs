//! Mostrar/esconder a janela do menu e reagir ao atalho global.

use crate::config::{Config, HotkeyMode, OpenAt};
use crate::{foreground, positioning};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const RADIAL: &str = "radial";
pub const SETTINGS: &str = "settings";

pub struct AppState {
    pub config: Mutex<Config>,
    /// Janela ativa antes de o menu abrir (para devolver o foco).
    pub prev_hwnd: AtomicIsize,
    pub visible: AtomicBool,
    pub paused: AtomicBool,
    /// Ícone escondido automaticamente porque há um app em tela cheia (jogo, vídeo, apresentação).
    pub orb_fullscreen: AtomicBool,
    pub shortcut: Mutex<Option<Shortcut>>,
    /// Erro do último registro do atalho (exibido na tela de configurações).
    pub hotkey_error: Mutex<Option<String>>,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        Self {
            config: Mutex::new(config),
            prev_hwnd: AtomicIsize::new(0),
            visible: AtomicBool::new(false),
            paused: AtomicBool::new(false),
            orb_fullscreen: AtomicBool::new(false),
            shortcut: Mutex::new(None),
            hotkey_error: Mutex::new(None),
        }
    }

    pub fn config(&self) -> Config {
        self.config.lock().unwrap().clone()
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MenuShow {
    cx: f64,
    cy: f64,
    profile_id: String,
    sent_at: u64,
    /// Ponto de onde o menu "nasce" (centro do ícone), em px lógicos relativos à janela.
    /// `None` quando aberto pelo atalho/bandeja.
    origin_x: Option<f64>,
    origin_y: Option<f64>,
}

/// De onde o menu foi aberto.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Origin {
    /// Atalho global ou bandeja: abre no cursor (ou no centro, conforme a config).
    Cursor,
    /// Ícone flutuante: abre centrado neste ponto (px físicos da tela).
    Point(i32, i32),
}

fn radial(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(RADIAL).ok_or_else(|| "janela do menu não encontrada".to_string())
}

pub fn show(app: &AppHandle) -> Result<(), String> {
    show_from(app, Origin::Cursor)
}

pub fn show_from(app: &AppHandle, origin: Origin) -> Result<(), String> {
    let t = std::time::Instant::now();
    let mut marks: Vec<String> = Vec::new();
    let mut mark = |name: &str| marks.push(format!("{name} {:.1}ms", t.elapsed().as_secs_f64() * 1000.0));

    let state = app.state::<AppState>();
    let win = radial(app)?;
    let cfg = state.config();

    // Captura o app em foco ANTES de mostrar o menu (ignorando as janelas do próprio Kira:
    // se o clique no ícone tiver ativado alguma, usa a janela de app logo abaixo).
    let own = win.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    let orb = crate::orb::hwnd(app);
    let fg = foreground::current_app(&[own, orb]);
    if fg.hwnd != 0 {
        state.prev_hwnd.store(fg.hwnd, Ordering::SeqCst);
    }
    // Monitor onde o menu vai abrir (do ícone ou do cursor) + hora local → perfil.
    let at_pt = match origin {
        Origin::Point(x, y) => (x, y),
        Origin::Cursor => crate::monitors::cursor(),
    };
    let ctx = crate::schedule::now(crate::monitors::device_at(at_pt));
    let profile_id = cfg.profile_for(fg.exe.as_deref(), &ctx).id.clone();
    mark("foco");

    let (at, centered) = match origin {
        Origin::Cursor => (None, cfg.behavior.open_at == OpenAt::Center),
        Origin::Point(x, y) => (Some((x, y)), false),
    };
    let p = positioning::placement(cfg.ui_scale(), centered, at)?;
    let (origin_x, origin_y) = match at {
        Some(pt) => {
            let (x, y) = p.to_local(pt);
            (Some(x), Some(y))
        }
        None => (None, None),
    };
    let pos = PhysicalPosition::new(p.x, p.y);
    let size = PhysicalSize::new(p.side, p.side);
    let place = |w: &WebviewWindow| {
        let _ = w.set_position(pos);
        let _ = w.set_size(size);
    };
    mark("posição");

    place(&win);
    // Kira de teste: já vai para fora da tela ANTES de aparecer (não pisca no cursor).
    crate::qa::keep_offscreen(&win);
    mark("mover");
    app.emit_to(RADIAL, "menu:show", MenuShow { cx: p.center, cy: p.center, profile_id, sent_at: crate::perf::now_ms(), origin_x, origin_y })
        .map_err(|e| e.to_string())?;
    mark("emit");
    if crate::qa::ENABLED {
        // Kira de teste: "mostrada" fora da tela e sem ativar (não rouba o foco).
        crate::qa::set_visible_quiet(&win, true);
    } else {
        win.show().map_err(|e| e.to_string())?;
        mark("show");
        // Reaplica: ao trocar de monitor com DPI diferente o Windows pode redimensionar a janela.
        place(&win);
        let _ = win.set_focus();
    }
    mark("focar");
    state.visible.store(true, Ordering::SeqCst);
    crate::perf::log(
        "rust",
        &format!("abrir menu (janela {}x{} em {},{}; app {:?}): {}", p.side, p.side, p.x, p.y, fg.exe, marks.join(" · ")),
    );
    Ok(())
}

pub fn hide(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(win) = radial(app) {
        if crate::qa::ENABLED {
            crate::qa::set_visible_quiet(&win, false);
        } else {
            let _ = win.hide();
        }
        // O menu não usa webvis: fechado, a página não monta nada (custo ~0), e mexer na
        // visibilidade do WebView2 a cada abertura gerava perda de foco falsa e atraso.
    }
    state.visible.store(false, Ordering::SeqCst);
    let _ = app.emit_to(RADIAL, "menu:hide", ());
}

pub fn open_settings(app: &AppHandle) {
    hide(app);
    if let Some(w) = app.get_webview_window(SETTINGS) {
        let _ = w.unminimize();
        if crate::qa::ENABLED {
            crate::qa::set_visible_quiet(&w, true);
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
        // Depois de a janela aparecer: retoma a página (suspensa ao fechar) e volta a desenhar.
        crate::webvis::set(&w, true, false);
    }
}

/// A página das Configurações terminou de carregar: se a janela ainda está escondida, o
/// WebView2 para de desenhar. Se já foi aberta (ex.: atalho falhou ao iniciar), fica como está.
pub fn settings_ready(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SETTINGS) {
        crate::webvis::hide_if_hidden(&w);
    }
}

/// Fechar as Configurações: esconde e, como abre pouco, além de parar de desenhar
/// suspende a página (devolve memória). Abrir de novo retoma (`open_settings`).
pub fn close_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SETTINGS) {
        if crate::qa::ENABLED {
            crate::qa::set_visible_quiet(&w, false);
        } else {
            let _ = w.hide();
        }
        crate::webvis::set(&w, false, true);
    }
}

/// Handler do atalho global.
pub fn on_shortcut(app: &AppHandle, event: ShortcutState) {
    let state = app.state::<AppState>();
    if state.paused.load(Ordering::SeqCst) {
        return;
    }
    let mode = state.config.lock().unwrap().hotkey.mode;
    let visible = state.visible.load(Ordering::SeqCst);
    let result = match (event, mode) {
        (ShortcutState::Pressed, HotkeyMode::Toggle) if visible => {
            hide(app);
            Ok(())
        }
        (ShortcutState::Pressed, _) if !visible => show(app),
        (ShortcutState::Released, HotkeyMode::Hold) if visible => {
            // O front executa a fatia sob o cursor (ou fecha, se não houver).
            app.emit_to(RADIAL, "menu:release", ()).map_err(|e| e.to_string())
        }
        _ => Ok(()),
    };
    if let Err(e) = result {
        eprintln!("[kira-radial] erro ao abrir menu: {e}");
    }
}

/// Converte o formato da UI ("Ctrl+Alt+Space", "Win+Shift+Z") para o do plugin.
pub fn to_shortcut(accelerator: &str) -> Result<Shortcut, String> {
    let mut parts = Vec::new();
    for raw in accelerator.split('+') {
        let p = raw.trim();
        let lower = p.to_ascii_lowercase();
        let mapped = match lower.as_str() {
            "ctrl" | "control" => "Control".to_string(),
            "alt" => "Alt".to_string(),
            "shift" => "Shift".to_string(),
            "win" | "super" | "meta" => "Super".to_string(),
            "esc" | "escape" => "Escape".to_string(),
            "up" => "ArrowUp".to_string(),
            "down" => "ArrowDown".to_string(),
            "left" => "ArrowLeft".to_string(),
            "right" => "ArrowRight".to_string(),
            "`" => "Backquote".to_string(),
            "-" => "Minus".to_string(),
            "=" => "Equal".to_string(),
            "[" => "BracketLeft".to_string(),
            "]" => "BracketRight".to_string(),
            "\\" => "Backslash".to_string(),
            ";" => "Semicolon".to_string(),
            "'" => "Quote".to_string(),
            "," => "Comma".to_string(),
            "." => "Period".to_string(),
            "/" => "Slash".to_string(),
            s if s.len() == 1 && s.as_bytes()[0].is_ascii_alphabetic() => format!("Key{}", s.to_ascii_uppercase()),
            s if s.len() == 1 && s.as_bytes()[0].is_ascii_digit() => format!("Digit{s}"),
            _ => p.to_string(), // Space, Enter, Tab, F1..F24, Home, PageUp...
        };
        parts.push(mapped);
    }
    parts
        .join("+")
        .parse::<Shortcut>()
        .map_err(|e| format!("atalho inválido \"{accelerator}\": {e}"))
}

/// Liga ou desliga o atalho global conforme o modo de abertura (atalho / ícone / ambos).
pub fn apply_hotkey(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    if cfg.launcher.mode.wants_hotkey() {
        return register_hotkey(app, &cfg.hotkey.accelerator);
    }
    let state = app.state::<AppState>();
    if let Some(old) = state.shortcut.lock().unwrap().take() {
        let _ = app.global_shortcut().unregister(old);
    }
    *state.hotkey_error.lock().unwrap() = None;
    Ok(())
}

/// Registra o atalho global. Em caso de falha (ex.: já usado por outro app),
/// restaura o atalho anterior e devolve o erro.
pub fn register_hotkey(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let new = to_shortcut(accelerator)?;
    let gs = app.global_shortcut();
    let mut current = state.shortcut.lock().unwrap();
    if current.as_ref() == Some(&new) {
        return Ok(());
    }
    if let Some(old) = current.take() {
        let _ = gs.unregister(old);
        if let Err(e) = gs.register(new) {
            let _ = gs.register(old);
            *current = Some(old);
            return Err(format!("não foi possível registrar {accelerator} (em uso por outro programa?): {e}"));
        }
    } else {
        gs.register(new)
            .map_err(|e| format!("não foi possível registrar {accelerator} (em uso por outro programa?): {e}"))?;
    }
    *current = Some(new);
    *state.hotkey_error.lock().unwrap() = None;
    Ok(())
}

/// Pausa/retoma o atalho global de verdade: desregistra no Windows, para que a
/// combinação chegue aos outros apps (e ao gravador de atalho das configurações).
pub fn set_paused(app: &AppHandle, paused: bool) {
    let state = app.state::<AppState>();
    state.paused.store(paused, Ordering::SeqCst);
    let current = *state.shortcut.lock().unwrap();
    if let Some(sc) = current {
        let gs = app.global_shortcut();
        if paused {
            let _ = gs.unregister(sc);
        } else if !gs.is_registered(sc) {
            if let Err(e) = gs.register(sc) {
                eprintln!("[kira-radial] falha ao retomar atalho: {e}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converte_atalhos_da_ui() {
        for acc in ["Alt+Space", "Ctrl+Alt+R", "Win+Shift+Z", "Ctrl+Shift+1", "Ctrl+F12", "Alt+Up", "Ctrl+/"] {
            to_shortcut(acc).unwrap_or_else(|e| panic!("{acc}: {e}"));
        }
        assert!(to_shortcut("Ctrl+Nada").is_err());
    }
}
