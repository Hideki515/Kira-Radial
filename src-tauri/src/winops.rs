//! Ações sobre a janela que estava ativa antes do menu abrir: sempre no topo,
//! mover para o próximo monitor, encaixar à esquerda/direita, maximizar, minimizar
//! e minimizar todas. Sem simular teclas (Win+Seta etc.): tudo via API de janelas.

use crate::positioning::Rect;
use serde::Deserialize;
use windows::Win32::Foundation::{HWND, RECT};

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WindowCmd {
    Topmost,
    NextMonitor,
    SnapLeft,
    SnapRight,
    Maximize,
    Minimize,
    MinimizeAll,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Left,
    Right,
}

/// Metade da área de trabalho.
pub fn snap_rect(work: Rect, side: Side) -> Rect {
    let half = work.width() / 2;
    match side {
        Side::Left => Rect { left: work.left, top: work.top, right: work.left + half, bottom: work.bottom },
        Side::Right => Rect { left: work.left + half, top: work.top, right: work.right, bottom: work.bottom },
    }
}

/// Leva `win` de `from` para `to` mantendo posição e tamanho proporcionais à área de trabalho.
pub fn move_between(win: Rect, from: Rect, to: Rect) -> Rect {
    let sx = to.width() as f64 / from.width().max(1) as f64;
    let sy = to.height() as f64 / from.height().max(1) as f64;
    let w = ((win.width() as f64 * sx).round() as i32).min(to.width());
    let h = ((win.height() as f64 * sy).round() as i32).min(to.height());
    let left = (to.left + ((win.left - from.left) as f64 * sx).round() as i32).clamp(to.left, to.right - w);
    let top = (to.top + ((win.top - from.top) as f64 * sy).round() as i32).clamp(to.top, to.bottom - h);
    Rect { left, top, right: left + w, bottom: top + h }
}

/// Índice do próximo monitor (em ordem da esquerda para a direita, depois de cima para baixo).
pub fn next_monitor(works: &[Rect], current: Rect) -> Option<Rect> {
    if works.len() < 2 {
        return None;
    }
    let mut sorted = works.to_vec();
    sorted.sort_by_key(|r| (r.left, r.top));
    let i = sorted.iter().position(|r| *r == current).unwrap_or(0);
    Some(sorted[(i + 1) % sorted.len()])
}

/// Compensa as bordas invisíveis do Windows 10/11: o retângulo "visual" (DWM) é menor
/// que o da janela. Dado o alvo visual, devolve o retângulo a passar ao SetWindowPos.
pub fn compensate(target: Rect, window: Rect, visual: Rect) -> Rect {
    Rect {
        left: target.left - (visual.left - window.left),
        top: target.top - (visual.top - window.top),
        right: target.right + (window.right - visual.right),
        bottom: target.bottom + (window.bottom - visual.bottom),
    }
}

// ---------------------------------------------------------------------------

fn to_rect(r: RECT) -> Rect {
    Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

fn work_area_of(hwnd: HWND) -> Option<Rect> {
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    unsafe {
        let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        GetMonitorInfoW(mon, &mut mi).as_bool().then(|| to_rect(mi.rcWork))
    }
}

fn all_work_areas() -> Vec<Rect> {
    use windows::core::BOOL;
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO};
    unsafe extern "system" fn cb(m: HMONITOR, _dc: HDC, _r: *mut RECT, data: LPARAM) -> BOOL {
        let out = &mut *(data.0 as *mut Vec<Rect>);
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if GetMonitorInfoW(m, &mut mi).as_bool() {
            out.push(to_rect(mi.rcWork));
        }
        BOOL(1)
    }
    let mut v = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(cb), LPARAM(&mut v as *mut _ as isize));
    }
    v
}

fn rects(hwnd: HWND) -> Option<(Rect, Rect)> {
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    unsafe {
        let mut w = RECT::default();
        GetWindowRect(hwnd, &mut w).ok()?;
        let mut v = RECT::default();
        let visual = DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &mut v as *mut RECT as *mut _, std::mem::size_of::<RECT>() as u32)
            .map(|_| to_rect(v))
            .unwrap_or(to_rect(w));
        Some((to_rect(w), visual))
    }
}

fn place(hwnd: HWND, target_visual: Rect) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};
    let (window, visual) = rects(hwnd).ok_or("não foi possível ler a posição da janela")?;
    let r = compensate(target_visual, window, visual);
    unsafe { SetWindowPos(hwnd, None, r.left, r.top, r.width(), r.height(), SWP_NOZORDER | SWP_NOACTIVATE) }
        .map_err(|e| e.to_string())
}

fn restore_if_maximized(hwnd: HWND) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{IsZoomed, ShowWindow, SW_RESTORE};
    unsafe {
        let zoomed = IsZoomed(hwnd).as_bool();
        if zoomed {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        zoomed
    }
}

/// Executa `cmd` na janela `prev` (a ativa antes do menu).
pub fn run(cmd: WindowCmd, prev: isize) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, IsIconic, IsWindow, IsZoomed, SetWindowPos, ShowWindow, GWL_EXSTYLE, HWND_NOTOPMOST,
        HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE, WS_EX_TOPMOST,
    };
    if cmd == WindowCmd::MinimizeAll {
        for h in crate::winlist::all_switchable() {
            unsafe {
                let _ = ShowWindow(HWND(h as *mut _), SW_MINIMIZE);
            }
        }
        return Ok(());
    }
    let hwnd = HWND(prev as *mut _);
    if prev == 0 || !unsafe { IsWindow(Some(hwnd)) }.as_bool() {
        return Err("nenhuma janela ativa para controlar".into());
    }
    unsafe {
        match cmd {
            WindowCmd::Topmost => {
                let on = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST.0 != 0;
                let after = if on { HWND_NOTOPMOST } else { HWND_TOPMOST };
                SetWindowPos(hwnd, Some(after), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE).map_err(|e| e.to_string())
            }
            WindowCmd::Maximize => {
                let _ = ShowWindow(hwnd, if IsZoomed(hwnd).as_bool() { SW_RESTORE } else { SW_MAXIMIZE });
                Ok(())
            }
            WindowCmd::Minimize => {
                let _ = ShowWindow(hwnd, SW_MINIMIZE);
                Ok(())
            }
            WindowCmd::SnapLeft | WindowCmd::SnapRight => {
                if IsIconic(hwnd).as_bool() {
                    let _ = ShowWindow(hwnd, SW_RESTORE);
                }
                restore_if_maximized(hwnd);
                let work = work_area_of(hwnd).ok_or("monitor não encontrado")?;
                let side = if cmd == WindowCmd::SnapLeft { Side::Left } else { Side::Right };
                place(hwnd, snap_rect(work, side))
            }
            WindowCmd::NextMonitor => {
                let from = work_area_of(hwnd).ok_or("monitor não encontrado")?;
                let to = next_monitor(&all_work_areas(), from).ok_or("só há um monitor")?;
                let was_max = restore_if_maximized(hwnd);
                let (_, visual) = rects(hwnd).ok_or("não foi possível ler a posição da janela")?;
                place(hwnd, move_between(visual, from, to))?;
                if was_max {
                    let _ = ShowWindow(hwnd, SW_MAXIMIZE);
                }
                Ok(())
            }
            WindowCmd::MinimizeAll => unreachable!(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: Rect = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };
    const B: Rect = Rect { left: 1920, top: 0, right: 4480, bottom: 1400 };

    #[test]
    fn encaixa_nas_metades() {
        assert_eq!(snap_rect(A, Side::Left), Rect { left: 0, top: 0, right: 960, bottom: 1040 });
        assert_eq!(snap_rect(A, Side::Right), Rect { left: 960, top: 0, right: 1920, bottom: 1040 });
        assert_eq!(snap_rect(B, Side::Right).left, 1920 + 1280);
    }

    #[test]
    fn move_para_outro_monitor_proporcional() {
        let win = Rect { left: 480, top: 260, right: 1440, bottom: 780 }; // metade central de A
        let r = move_between(win, A, B);
        assert_eq!((r.left, r.width()), (1920 + 640, 1280));
        assert!(r.left >= B.left && r.right <= B.right && r.top >= B.top && r.bottom <= B.bottom);
        // Janela maior que o destino é limitada ao destino.
        let big = Rect { left: -100, top: -100, right: 5000, bottom: 5000 };
        let s = move_between(big, B, A);
        assert!(s.width() <= A.width() && s.height() <= A.height() && s.left >= A.left);
    }

    #[test]
    fn proximo_monitor_da_volta() {
        assert_eq!(next_monitor(&[B, A], A), Some(B));
        assert_eq!(next_monitor(&[B, A], B), Some(A));
        assert_eq!(next_monitor(&[A], A), None);
    }

    #[test]
    fn compensa_bordas_invisiveis() {
        let window = Rect { left: 93, top: 100, right: 1007, bottom: 807 };
        let visual = Rect { left: 100, top: 100, right: 1000, bottom: 800 }; // 7 px de borda invisível
        let r = compensate(Rect { left: 0, top: 0, right: 960, bottom: 1040 }, window, visual);
        assert_eq!(r, Rect { left: -7, top: 0, right: 967, bottom: 1047 });
    }

    #[test]
    fn serde_dos_comandos() {
        let c: WindowCmd = serde_json::from_str("\"snapLeft\"").unwrap();
        assert_eq!(c, WindowCmd::SnapLeft);
        assert!(serde_json::from_str::<WindowCmd>("\"explodir\"").is_err());
    }

    #[test]
    fn sem_janela_ativa_da_erro() {
        assert!(run(WindowCmd::Maximize, 0).is_err());
    }
}
