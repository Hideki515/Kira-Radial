//! Onde abrir o menu.
//!
//! A janela "radial" tem só o tamanho do canvas do menu (900 px lógicos × escala) e é
//! centrada no cursor. Uma janela pequena é muito mais barata de compor do que uma
//! janela transparente do tamanho do monitor. Perto de uma borda, a janela é empurrada
//! para dentro da área de trabalho, para o menu aparecer inteiro.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn width(&self) -> i32 {
        self.right - self.left
    }
    pub fn height(&self) -> i32 {
        self.bottom - self.top
    }
}

/// Lado do canvas SVG em px lógicos a 100% (igual a LAYOUT.size em geometry.ts).
pub const CANVAS_SIZE: f64 = 900.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Placement {
    /// Canto superior esquerdo da janela, em pixels físicos.
    pub x: i32,
    pub y: i32,
    /// Lado da janela (quadrada), em pixels físicos.
    pub side: u32,
    /// Centro do menu em pixels lógicos, relativo à janela.
    pub center: f64,
}

/// Calcula a janela do menu: centrada no cursor (ou na área de trabalho, no modo
/// "centro") e deslocada para caber em `work`. `dpi_scale` = DPI do monitor / 96.
pub fn place(cursor: (i32, i32), work: Rect, dpi_scale: f64, ui_scale: f64, centered: bool) -> Placement {
    let logical = CANVAS_SIZE * ui_scale;
    let side = (logical * dpi_scale).round() as i32;
    let (cx, cy) = if centered {
        (work.left + work.width() / 2, work.top + work.height() / 2)
    } else {
        cursor
    };
    let axis = |c: i32, lo: i32, hi: i32| {
        if hi - lo <= side {
            lo + (hi - lo - side) / 2 // área menor que a janela: centraliza
        } else {
            (c - side / 2).clamp(lo, hi - side)
        }
    };
    Placement {
        x: axis(cx, work.left, work.right),
        y: axis(cy, work.top, work.bottom),
        side: side as u32,
        center: logical / 2.0,
    }
}

#[cfg(windows)]
pub fn placement(ui_scale: f64, centered: bool) -> Result<Placement, String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut pt = POINT::default();
        GetCursorPos(&mut pt).map_err(|e| e.to_string())?;
        let hmon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
            return Err("GetMonitorInfoW falhou".into());
        }
        let (mut dx, mut dy) = (96u32, 96u32);
        let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
        let w = mi.rcWork;
        let work = Rect { left: w.left, top: w.top, right: w.right, bottom: w.bottom };
        Ok(place((pt.x, pt.y), work, dx as f64 / 96.0, ui_scale, centered))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK: Rect = Rect { left: 0, top: 0, right: 1920, bottom: 1032 };

    #[test]
    fn centraliza_a_janela_no_cursor() {
        let p = place((960, 500), WORK, 1.0, 0.75, false);
        assert_eq!(p.side, 675);
        assert_eq!((p.x, p.y), (960 - 337, 500 - 337));
        assert_eq!(p.center, 337.5);
    }

    #[test]
    fn empurra_para_dentro_nas_bordas() {
        let p = place((5, 1030), WORK, 1.0, 0.75, false);
        assert_eq!((p.x, p.y), (0, 1032 - 675));
        let q = place((1915, 3), WORK, 1.0, 0.75, false);
        assert_eq!((q.x, q.y), (1920 - 675, 0));
    }

    #[test]
    fn usa_dpi_do_monitor_e_monitor_deslocado() {
        // Segundo monitor à direita, 150%.
        let mon = Rect { left: 1920, top: 0, right: 4480, bottom: 1440 };
        let p = place((3200, 720), mon, 1.5, 1.0, false);
        assert_eq!(p.side, 1350);
        assert_eq!((p.x, p.y), (3200 - 675, 720 - 675));
        assert_eq!(p.center, 450.0); // lógico, independente do DPI
    }

    #[test]
    fn area_menor_que_a_janela_centraliza() {
        let small = Rect { left: 0, top: 0, right: 1280, bottom: 720 };
        let p = place((100, 100), small, 1.0, 1.0, false);
        assert_eq!(p.y, (720 - 900) / 2);
    }

    #[test]
    fn modo_centro_ignora_cursor() {
        let p = place((5, 5), WORK, 1.0, 0.75, true);
        assert_eq!((p.x, p.y), (960 - 337, 516 - 337));
    }
}
