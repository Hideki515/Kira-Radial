//! Ícone flutuante ("orbe"): janela pequena, transparente e sempre no topo que abre o
//! menu ao ser clicada e pode ser arrastada para qualquer lugar da tela.

use crate::config::{self, Config};
use crate::menu::{self, AppState};
use crate::positioning;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow};

pub const ORB: &str = "orb";

/// A janela tem margem em volta do orbe para o brilho não ser cortado.
pub const WINDOW_FACTOR: f64 = 1.5;

/// Lado da janela (px lógicos) para um orbe de `size` px.
pub fn window_side(size: f64) -> f64 {
    (size * WINDOW_FACTOR).round()
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(ORB)
}

/// HWND da janela do ícone (0 se não existir).
pub fn hwnd(app: &AppHandle) -> isize {
    window(app).and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize).unwrap_or(0)
}

/// Configura a janela uma única vez: não rouba o foco ao ser clicada (o menu precisa
/// saber qual app estava ativo) e aparece/some sem a animação do Windows.
pub fn init(app: &AppHandle) {
    let h = hwnd(app);
    if h == 0 {
        return;
    }
    crate::foreground::disable_transitions(h);
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE};
    unsafe {
        let w = HWND(h as *mut _);
        let ex = GetWindowLongPtrW(w, GWL_EXSTYLE);
        SetWindowLongPtrW(w, GWL_EXSTYLE, ex | WS_EX_NOACTIVATE.0 as isize);
    }
}

/// Mostra sem ativar (não tira o foco do app em uso).
fn show_no_activate(win: &WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
    if let Ok(h) = win.hwnd() {
        unsafe {
            let _ = ShowWindow(windows::Win32::Foundation::HWND(h.0 as *mut _), SW_SHOWNOACTIVATE);
        }
    }
}

/// Aplica a configuração: mostra/esconde o ícone, ajusta tamanho e posição.
pub fn apply(app: &AppHandle, cfg: &Config) {
    let Some(win) = window(app) else { return };
    let paused = app.state::<AppState>().orb_hidden.load(Ordering::SeqCst);
    if !cfg.launcher.mode.wants_orb() || paused {
        let _ = win.hide();
        return;
    }
    let orb = &cfg.launcher.orb;
    let side_logical = window_side(orb.size());
    let _ = win.set_size(LogicalSize::new(side_logical, side_logical));
    let side = win.outer_size().map(|s| s.width as i32).unwrap_or(side_logical as i32);
    let saved = orb.x.zip(orb.y);
    let (monitors, primary_work) = positioning::monitors();
    let (x, y) = positioning::orb_position(saved, side, &monitors, primary_work);
    // Movimento feito pelo próprio app: não deve virar "posição escolhida pelo usuário"
    // (senão o canto padrão seria gravado como posição fixa).
    *PLACED.lock().unwrap() = Some((x, y));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    show_no_activate(&win);
    let _ = app.emit_to(ORB, "orb:config", cfg.launcher.orb.clone());
}

/// Centro do ícone em px físicos da tela.
pub fn center(app: &AppHandle) -> Option<(i32, i32)> {
    let win = window(app)?;
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    Some((pos.x + size.width as i32 / 2, pos.y + size.height as i32 / 2))
}

/// Clique no ícone: abre o menu centrado nele (ou fecha, se já estiver aberto).
pub fn clicked(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.visible.load(Ordering::SeqCst) {
        menu::hide(app);
        return Ok(());
    }
    let (x, y) = center(app).ok_or("ícone não encontrado")?;
    menu::show_from(app, menu::Origin::Point(x, y))
}

static MOVE_GEN: AtomicU64 = AtomicU64::new(0);
/// Última posição aplicada pelo app (não pelo usuário).
static PLACED: Mutex<Option<(i32, i32)>> = Mutex::new(None);

/// Deve gravar a posição `now`? Só se veio do usuário (diferente da aplicada pelo app)
/// e mudou em relação à salva.
pub fn should_save(now: (i32, i32), placed: Option<(i32, i32)>, saved: (Option<i32>, Option<i32>)) -> bool {
    placed != Some(now) && saved != (Some(now.0), Some(now.1))
}

/// A janela do ícone mudou de lugar (arrastada pelo usuário). Grava a posição
/// 400 ms depois do último movimento, para não escrever no disco a cada pixel.
pub fn on_moved(app: &AppHandle, x: i32, y: i32) {
    let gen = MOVE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        if MOVE_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap();
        let placed = *PLACED.lock().unwrap();
        if !cfg.launcher.mode.wants_orb() || !should_save((x, y), placed, (cfg.launcher.orb.x, cfg.launcher.orb.y)) {
            return;
        }
        cfg.launcher.orb.x = Some(x);
        cfg.launcher.orb.y = Some(y);
        if let Err(e) = config::save(&cfg) {
            eprintln!("[kira-radial] falha ao salvar posição do ícone: {e}");
        }
    });
}

/// Volta o ícone para o canto padrão (botão nas configurações).
pub fn reset_position(app: &AppHandle) {
    let cfg = {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap();
        cfg.launcher.orb.x = None;
        cfg.launcher.orb.y = None;
        let _ = config::save(&cfg);
        cfg.clone()
    };
    apply(app, &cfg);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn so_grava_posicao_escolhida_pelo_usuario() {
        // Reset: app colocou no canto (sem posição salva) → não grava o canto como fixo.
        assert!(!should_save((1752, 864), Some((1752, 864)), (None, None)));
        // Usuário arrastou para outro lugar → grava.
        assert!(should_save((300, 200), Some((1752, 864)), (None, None)));
        // Já salva igual → não regrava.
        assert!(!should_save((300, 200), None, (Some(300), Some(200))));
    }

    #[test]
    fn janela_tem_margem_para_o_brilho() {
        assert_eq!(window_side(96.0), 144.0);
        assert_eq!(window_side(56.0), 84.0);
    }
}
