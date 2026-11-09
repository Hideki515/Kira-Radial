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
    /// DPI do monitor / 96.
    pub dpi_scale: f64,
}

impl Placement {
    /// Converte um ponto da tela (px físicos) para px lógicos relativos à janela do menu.
    pub fn to_local(self, pt: (i32, i32)) -> (f64, f64) {
        ((pt.0 - self.x) as f64 / self.dpi_scale, (pt.1 - self.y) as f64 / self.dpi_scale)
    }
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
        dpi_scale,
    }
}

/// Margem do ícone flutuante até as bordas da área de trabalho na posição padrão.
pub const ORB_MARGIN: i32 = 24;

/// Posição (canto superior esquerdo, px físicos) do ícone flutuante de lado `side`.
/// A posição salva vale em qualquer lugar da tela: só é ajustada para a janela caber
/// inteira no monitor onde está o centro. Se esse monitor não existe mais (desconectado,
/// resolução menor), volta ao canto inferior direito da área de trabalho principal.
pub fn orb_position(saved: Option<(i32, i32)>, side: i32, monitors: &[Rect], primary_work: Rect) -> (i32, i32) {
    if let Some((x, y)) = saved {
        let (cx, cy) = (x + side / 2, y + side / 2);
        if let Some(m) = monitors.iter().find(|m| cx >= m.left && cx < m.right && cy >= m.top && cy < m.bottom) {
            let fit = |v: i32, lo: i32, hi: i32| if hi - lo <= side { lo } else { v.clamp(lo, hi - side) };
            return (fit(x, m.left, m.right), fit(y, m.top, m.bottom));
        }
    }
    (
        (primary_work.right - side - ORB_MARGIN).max(primary_work.left),
        (primary_work.bottom - side - ORB_MARGIN).max(primary_work.top),
    )
}

/// Retângulos (px físicos) de todos os monitores e a área de trabalho do principal.
#[cfg(windows)]
pub fn monitors() -> (Vec<Rect>, Rect) {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{LPARAM, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, MonitorFromPoint, HDC, HMONITOR, MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
    };

    unsafe extern "system" fn cb(_m: HMONITOR, _dc: HDC, r: *mut RECT, data: LPARAM) -> BOOL {
        let out = &mut *(data.0 as *mut Vec<Rect>);
        let r = &*r;
        out.push(Rect { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        BOOL(1)
    }

    let mut list: Vec<Rect> = Vec::new();
    let mut work = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(cb), LPARAM(&mut list as *mut _ as isize));
        let hmon = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if GetMonitorInfoW(hmon, &mut mi).as_bool() {
            let w = mi.rcWork;
            work = Rect { left: w.left, top: w.top, right: w.right, bottom: w.bottom };
        }
    }
    (list, work)
}

/// Janela do menu centrada em `at` (px físicos) ou, se `None`, no cursor.
#[cfg(windows)]
pub fn placement(ui_scale: f64, centered: bool, at: Option<(i32, i32)>) -> Result<Placement, String> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut pt = POINT::default();
        match at {
            Some((x, y)) => pt = POINT { x, y },
            None => GetCursorPos(&mut pt).map_err(|e| e.to_string())?,
        }
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
    fn converte_ponto_da_tela_para_a_janela() {
        let mon = Rect { left: 1920, top: 0, right: 4480, bottom: 1440 };
        let p = place((3200, 720), mon, 1.5, 1.0, false);
        assert_eq!(p.to_local((3200, 720)), (450.0, 450.0));
        // Perto da borda o menu é empurrado: a origem (ícone) deixa de ser o centro.
        let q = place((10, 1000), WORK, 1.0, 0.75, false);
        let (ox, oy) = q.to_local((10, 1000));
        assert_eq!((ox, oy), (10.0, 1000.0 - (1032.0 - 675.0)));
    }

    const MONS: [Rect; 2] = [
        Rect { left: 0, top: 0, right: 1920, bottom: 1080 },
        Rect { left: 1920, top: -200, right: 4480, bottom: 1240 },
    ];

    #[test]
    fn icone_sem_posicao_vai_para_o_canto_inferior_direito() {
        assert_eq!(orb_position(None, 144, &MONS, WORK), (1920 - 144 - ORB_MARGIN, 1032 - 144 - ORB_MARGIN));
    }

    #[test]
    fn icone_fica_em_qualquer_lugar_de_qualquer_monitor() {
        // Sobre a barra de tarefas, no topo, no 2º monitor (coordenada negativa): tudo vale.
        assert_eq!(orb_position(Some((900, 1000)), 144, &MONS, WORK), (900, 1000 - 64));
        assert_eq!(orb_position(Some((0, 0)), 144, &MONS, WORK), (0, 0));
        assert_eq!(orb_position(Some((3000, -150)), 144, &MONS, WORK), (3000, -150));
        // Metade para fora da borda: puxa só o necessário para caber.
        assert_eq!(orb_position(Some((-50, 500)), 144, &MONS, WORK), (0, 500));
    }

    #[test]
    fn icone_em_monitor_desconectado_volta_ao_canto() {
        let only_main = [MONS[0]];
        let p = orb_position(Some((3000, 300)), 144, &only_main, WORK);
        assert_eq!(p, (1920 - 144 - ORB_MARGIN, 1032 - 144 - ORB_MARGIN));
    }

    #[test]
    fn modo_centro_ignora_cursor() {
        let p = place((5, 5), WORK, 1.0, 0.75, true);
        assert_eq!((p.x, p.y), (960 - 337, 516 - 337));
    }
}
