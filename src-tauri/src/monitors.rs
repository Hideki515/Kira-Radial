//! Monitores para os perfis "por monitor": lista com nome amigável, monitor de um ponto
//! e "Identificar" (mostra o número em cada tela por 2 s, sem foco e sem capturar o mouse).

use serde::Serialize;
use windows::Win32::Foundation::{LPARAM, POINT, RECT};
use windows::Win32::Graphics::Gdi::{
    EnumDisplayDevicesW, EnumDisplayMonitors, GetMonitorInfoW, MonitorFromPoint, DISPLAY_DEVICEW, HDC, HMONITOR,
    MONITORINFO, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST,
};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    /// Nome de dispositivo do Windows ("\\.\DISPLAY2") — é o que fica salvo no perfil.
    pub device: String,
    /// Nome amigável (ex.: "LG ULTRAGEAR") ou "Monitor N".
    pub name: String,
    pub number: usize,
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
    pub primary: bool,
}

fn wide(buf: &[u16]) -> String {
    let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..n])
}

fn info_ex(h: HMONITOR) -> Option<MONITORINFOEXW> {
    let mut mi = MONITORINFOEXW::default();
    mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    unsafe { GetMonitorInfoW(h, &mut mi as *mut MONITORINFOEXW as *mut MONITORINFO) }.as_bool().then_some(mi)
}

fn friendly(device: &str) -> Option<String> {
    let mut dd = DISPLAY_DEVICEW { cb: std::mem::size_of::<DISPLAY_DEVICEW>() as u32, ..Default::default() };
    let dev = windows::core::HSTRING::from(device);
    unsafe { EnumDisplayDevicesW(&dev, 0, &mut dd, 0) }.as_bool().then(|| wide(&dd.DeviceString)).filter(|s| !s.trim().is_empty())
}

/// Monitores conectados, numerados da esquerda para a direita (depois de cima para baixo).
pub fn list() -> Vec<MonitorInfo> {
    use windows::core::BOOL;
    unsafe extern "system" fn cb(h: HMONITOR, _dc: HDC, _r: *mut RECT, data: LPARAM) -> BOOL {
        (*(data.0 as *mut Vec<HMONITOR>)).push(h);
        BOOL(1)
    }
    let mut hs: Vec<HMONITOR> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(cb), LPARAM(&mut hs as *mut _ as isize));
    }
    let mut out: Vec<MonitorInfo> = hs
        .into_iter()
        .filter_map(|h| {
            let mi = info_ex(h)?;
            let r = mi.monitorInfo.rcMonitor;
            let device = wide(&mi.szDevice);
            Some(MonitorInfo {
                name: friendly(&device).unwrap_or_default(),
                device,
                number: 0,
                left: r.left,
                top: r.top,
                width: r.right - r.left,
                height: r.bottom - r.top,
                primary: mi.monitorInfo.dwFlags & 1 != 0, // MONITORINFOF_PRIMARY
            })
        })
        .collect();
    number(&mut out);
    out
}

/// Numera 1..N da esquerda para a direita; nome vazio vira "Monitor N".
pub fn number(list: &mut [MonitorInfo]) {
    list.sort_by_key(|m| (m.left, m.top));
    for (i, m) in list.iter_mut().enumerate() {
        m.number = i + 1;
        if m.name.trim().is_empty() || m.name.eq_ignore_ascii_case("Generic PnP Monitor") {
            m.name = format!("Monitor {}", i + 1);
        }
    }
}

/// Nome de dispositivo do monitor que contém (ou está mais perto de) `pt`.
pub fn device_at(pt: (i32, i32)) -> String {
    let h = unsafe { MonitorFromPoint(POINT { x: pt.0, y: pt.1 }, MONITOR_DEFAULTTONEAREST) };
    info_ex(h).map(|mi| wide(&mi.szDevice)).unwrap_or_default()
}

/// Posição atual do cursor.
pub fn cursor() -> (i32, i32) {
    let mut p = POINT::default();
    let _ = unsafe { windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut p) };
    (p.x, p.y)
}

// ---------------------------------------------------------------------------
// "Identificar": número grande no centro de cada monitor por 2 s.

/// Mostra o número de cada monitor (janelas sem foco, que deixam o clique passar). Não bloqueia.
pub fn identify() {
    if crate::qa::ENABLED {
        return; // Kira de teste: nada aparece na tela do usuário.
    }
    std::thread::spawn(|| unsafe { identify_blocking() });
}

unsafe fn identify_blocking() {
    use windows::core::w;
    use windows::Win32::Foundation::{COLORREF, HWND, LRESULT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        BeginPaint, CreateFontW, CreateSolidBrush, DeleteObject, DrawTextW, EndPaint, FillRect, SelectObject, SetBkMode,
        SetTextColor, DT_CENTER, DT_SINGLELINE, DT_VCENTER, FW_BOLD, PAINTSTRUCT, TRANSPARENT,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::*;

    unsafe extern "system" fn proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
        unsafe {
            if msg == WM_PAINT {
                let mut ps = PAINTSTRUCT::default();
                let dc = BeginPaint(hwnd, &mut ps);
                let mut rc = RECT::default();
                let _ = GetClientRect(hwnd, &mut rc);
                let bg = CreateSolidBrush(COLORREF(0x0018_120c));
                FillRect(dc, &rc, bg);
                let _ = DeleteObject(bg.into());
                let font = CreateFontW(140, 0, 0, 0, FW_BOLD.0 as i32, 0, 0, 0, Default::default(), Default::default(), Default::default(), Default::default(), 0, w!("Segoe UI"));
                let old = SelectObject(dc, font.into());
                SetBkMode(dc, TRANSPARENT);
                SetTextColor(dc, COLORREF(0x009b_de4a)); // verde da Kira (BGR)
                let mut text: Vec<u16> = GetWindowLongPtrW(hwnd, GWLP_USERDATA).to_string().encode_utf16().collect();
                DrawTextW(dc, &mut text, &mut rc, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
                SelectObject(dc, old);
                let _ = DeleteObject(font.into());
                let _ = EndPaint(hwnd, &ps);
                return LRESULT(0);
            }
            DefWindowProcW(hwnd, msg, wp, lp)
        }
    }

    let hinst = GetModuleHandleW(None).unwrap_or_default();
    let class = w!("KiraIdentifyMonitor");
    let wc = WNDCLASSW { lpfnWndProc: Some(proc), hInstance: hinst.into(), lpszClassName: class, ..Default::default() };
    RegisterClassW(&wc);
    let side = 220;
    let mut wins = Vec::new();
    for m in list() {
        let x = m.left + (m.width - side) / 2;
        let y = m.top + (m.height - side) / 2;
        // Sem foco (NOACTIVATE), sem barra de tarefas (TOOLWINDOW), clique atravessa (TRANSPARENT).
        let ex = WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TRANSPARENT;
        if let Ok(h) = CreateWindowExW(ex, class, w!(""), WS_POPUP, x, y, side, side, None, None, Some(hinst.into()), None) {
            SetWindowLongPtrW(h, GWLP_USERDATA, m.number as isize);
            let _ = SetLayeredWindowAttributes(h, COLORREF(0), 230, LWA_ALPHA);
            let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
            wins.push(h);
        }
    }
    let end = std::time::Instant::now() + std::time::Duration::from_secs(2);
    let mut msg = MSG::default();
    while std::time::Instant::now() < end {
        while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        std::thread::sleep(std::time::Duration::from_millis(30));
    }
    for h in wins {
        let _ = DestroyWindow(h);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(left: i32, name: &str) -> MonitorInfo {
        MonitorInfo { device: format!("D{left}"), name: name.into(), number: 0, left, top: 0, width: 100, height: 100, primary: false }
    }

    #[test]
    fn numera_da_esquerda_para_a_direita_e_da_nome_padrao() {
        let mut l = vec![m(1920, "LG"), m(-1280, ""), m(0, "Generic PnP Monitor")];
        number(&mut l);
        assert_eq!(l.iter().map(|x| (x.left, x.number)).collect::<Vec<_>>(), vec![(-1280, 1), (0, 2), (1920, 3)]);
        assert_eq!(l[0].name, "Monitor 1");
        assert_eq!(l[1].name, "Monitor 2");
        assert_eq!(l[2].name, "LG");
    }

    #[test]
    fn leitura_real() {
        let l = list();
        assert!(!l.is_empty());
        assert!(l.iter().all(|x| x.device.starts_with(r"\\.\DISPLAY") && x.width > 0));
        assert!(l.iter().filter(|x| x.primary).count() <= 1);
        let (cx, cy) = (l[0].left + 1, l[0].top + 1);
        assert_eq!(device_at((cx, cy)), l[0].device);
    }
}
