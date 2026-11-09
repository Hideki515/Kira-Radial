//! Janelas abertas (submenu automático "Janelas abertas") e foco numa janela escolhida.
//!
//! A lista segue a ordem Z (mais recente primeiro) e só traz janelas "de app": visíveis,
//! com título, sem dono, que não são tool windows, não estão ocultas pelo DWM ("cloaked",
//! ex.: apps da Loja suspensos e outras áreas de trabalho virtuais) e não são do Kira.

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::HICON;

/// Máximo de janelas no submenu (igual ao limite de subitens).
pub const MAX_WINDOWS: usize = 8;
/// Lado do ícone gerado (px).
pub const ICON_SIZE: u32 = 32;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    /// HWND como número (cabe com folga num f64 do JS).
    pub hwnd: i64,
    pub title: String,
    pub exe: Option<String>,
    /// Ícone do app como data URL PNG (32×32), se disponível.
    pub icon: Option<String>,
}

/// Dados de uma janela candidata (separados da API para o filtro ser testável).
#[derive(Clone, Debug, Default)]
pub struct Candidate {
    pub visible: bool,
    pub title: String,
    pub has_owner: bool,
    pub tool_window: bool,
    pub cloaked: bool,
    pub own_process: bool,
    pub class: String,
}

/// Classes do próprio shell que nunca devem aparecer (área de trabalho, barra de tarefas).
const SHELL_CLASSES: [&str; 4] = ["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"];

/// É uma janela para a qual faz sentido alternar?
pub fn is_switchable(c: &Candidate) -> bool {
    c.visible
        && !c.title.trim().is_empty()
        && !c.has_owner
        && !c.tool_window
        && !c.cloaked
        && !c.own_process
        && !SHELL_CLASSES.contains(&c.class.as_str())
}

// ---------------------------------------------------------------------------
// Ícone → PNG (data URL)

/// BGRA (DIB do Windows, de cima para baixo) → RGBA. Ícones antigos sem canal alfa
/// (tudo 0) ganham alfa opaco onde há cor.
pub fn bgra_to_rgba(bgra: &[u8]) -> Vec<u8> {
    let (px, _) = bgra.as_chunks::<4>();
    let has_alpha = px.iter().any(|p| p[3] != 0);
    px.iter()
        .flat_map(|p| {
            let a = if has_alpha { p[3] } else if p[0] | p[1] | p[2] != 0 { 255 } else { 0 };
            [p[2], p[1], p[0], a]
        })
        .collect()
}

pub fn png_data_url(rgba: &[u8], side: u32) -> Option<String> {
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, side, side);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().ok()?;
        w.write_image_data(rgba).ok()?;
    }
    Some(format!("data:image/png;base64,{}", crate::orb::base64(&out)))
}

/// Desenha o ícone num DIB 32 bpp e devolve os pixels BGRA.
fn render_icon(icon: HICON) -> Option<Vec<u8>> {
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS,
    };
    use windows::Win32::UI::WindowsAndMessaging::{DrawIconEx, DI_NORMAL};
    let side = ICON_SIZE as i32;
    unsafe {
        let dc = CreateCompatibleDC(None);
        if dc.is_invalid() {
            return None;
        }
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: side,
                biHeight: -side, // de cima para baixo
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let Ok(bmp) = CreateDIBSection(Some(dc), &bmi, DIB_RGB_COLORS, &mut bits, None, 0) else {
            let _ = DeleteDC(dc);
            return None;
        };
        let old = SelectObject(dc, bmp.into());
        let drawn = DrawIconEx(dc, 0, 0, icon, side, side, 0, None, DI_NORMAL).is_ok();
        let len = (side * side * 4) as usize;
        let out = (drawn && !bits.is_null()).then(|| std::slice::from_raw_parts(bits as *const u8, len).to_vec());
        SelectObject(dc, old);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(dc);
        out
    }
}

/// Ícone da janela: o que ela anuncia (WM_GETICON) ou o da classe.
fn window_icon(hwnd: HWND) -> Option<HICON> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassLongPtrW, SendMessageTimeoutW, GCLP_HICON, GCLP_HICONSM, ICON_BIG, ICON_SMALL2, SMTO_ABORTIFHUNG,
        WM_GETICON,
    };
    unsafe {
        for kind in [ICON_BIG, ICON_SMALL2] {
            let mut res = 0usize;
            // Timeout curto: um app travado não pode atrasar o menu.
            let ok = SendMessageTimeoutW(hwnd, WM_GETICON, WPARAM(kind as usize), LPARAM(0), SMTO_ABORTIFHUNG, 50, Some(&mut res));
            if ok.0 != 0 && res != 0 {
                return Some(HICON(res as *mut _));
            }
        }
        for idx in [GCLP_HICON, GCLP_HICONSM] {
            let h = GetClassLongPtrW(hwnd, idx);
            if h != 0 {
                return Some(HICON(h as *mut _));
            }
        }
    }
    None
}

/// Ícones já convertidos, por executável (o mesmo app não é redesenhado a cada abertura).
static ICON_CACHE: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

fn icon_for(hwnd: HWND, exe: Option<&str>) -> Option<String> {
    let key = exe.map(str::to_owned);
    if let Some(k) = &key {
        if let Some(hit) = ICON_CACHE.lock().unwrap().get_or_insert_with(HashMap::new).get(k) {
            return hit.clone();
        }
    }
    let url = window_icon(hwnd).and_then(render_icon).and_then(|bgra| png_data_url(&bgra_to_rgba(&bgra), ICON_SIZE));
    if let Some(k) = key {
        ICON_CACHE.lock().unwrap().get_or_insert_with(HashMap::new).insert(k, url.clone());
    }
    url
}

// ---------------------------------------------------------------------------
// Enumeração

fn candidate(hwnd: HWND, own_pid: u32) -> (Candidate, u32) {
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetWindow, GetWindowLongPtrW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
        GWL_EXSTYLE, GW_OWNER, WS_EX_TOOLWINDOW,
    };
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let mut buf = [0u16; 256];
        let n = GetWindowTextW(hwnd, &mut buf);
        let title = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
        let mut cbuf = [0u16; 128];
        let cn = GetClassNameW(hwnd, &mut cbuf);
        let class = String::from_utf16_lossy(&cbuf[..cn.max(0) as usize]);
        let mut cloaked = 0u32;
        let _ = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut _, 4);
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        (
            Candidate {
                visible: IsWindowVisible(hwnd).as_bool(),
                title,
                has_owner: GetWindow(hwnd, GW_OWNER).is_ok(),
                tool_window: ex & WS_EX_TOOLWINDOW.0 != 0,
                cloaked: cloaked != 0,
                own_process: pid == own_pid,
                class,
            },
            pid,
        )
    }
}

/// Todas as janelas de app (HWND), mais recentes primeiro.
pub fn all_switchable() -> Vec<isize> {
    let own_pid = std::process::id();
    enum_all().into_iter().filter(|h| is_switchable(&candidate(HWND(*h as *mut _), own_pid).0)).collect()
}

fn enum_all() -> Vec<isize> {
    use windows::core::BOOL;
    use windows::Win32::UI::WindowsAndMessaging::EnumWindows;

    unsafe extern "system" fn cb(hwnd: HWND, data: LPARAM) -> BOOL {
        let v = &mut *(data.0 as *mut Vec<isize>);
        v.push(hwnd.0 as isize);
        BOOL(1)
    }
    let mut all: Vec<isize> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(cb), LPARAM(&mut all as *mut _ as isize));
    }
    all
}

/// Janelas de app abertas, mais recentes primeiro (até `MAX_WINDOWS`).
pub fn list() -> Vec<WindowInfo> {
    let all = enum_all();
    let own_pid = std::process::id();
    let mut out = Vec::new();
    for h in all {
        let hwnd = HWND(h as *mut _);
        let (c, pid) = candidate(hwnd, own_pid);
        if !is_switchable(&c) {
            continue;
        }
        let exe = crate::foreground::exe_name(pid);
        let icon = icon_for(hwnd, exe.as_deref());
        out.push(WindowInfo { hwnd: h as i64, title: c.title, exe, icon });
        if out.len() >= MAX_WINDOWS {
            break;
        }
    }
    out
}

/// Traz a janela para a frente (restaurando se estiver minimizada).
pub fn focus(hwnd: i64) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        IsIconic, IsWindow, SetForegroundWindow, ShowWindow, SwitchToThisWindow, SW_RESTORE,
    };
    let h = HWND(hwnd as isize as *mut _);
    unsafe {
        if !IsWindow(Some(h)).as_bool() {
            return Err("a janela foi fechada".into());
        }
        if IsIconic(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }
        if !SetForegroundWindow(h).as_bool() {
            // O Windows pode recusar o foco a um processo em segundo plano; este caminho
            // (o mesmo do Alt+Tab) é aceito.
            SwitchToThisWindow(h, true);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app() -> Candidate {
        Candidate { visible: true, title: "Documento - Bloco de Notas".into(), class: "Notepad".into(), ..Default::default() }
    }

    #[test]
    fn filtra_so_janelas_de_app() {
        assert!(is_switchable(&app()));
        assert!(!is_switchable(&Candidate { visible: false, ..app() }));
        assert!(!is_switchable(&Candidate { title: "   ".into(), ..app() }));
        assert!(!is_switchable(&Candidate { has_owner: true, ..app() }));
        assert!(!is_switchable(&Candidate { tool_window: true, ..app() }));
        assert!(!is_switchable(&Candidate { cloaked: true, ..app() }));
        assert!(!is_switchable(&Candidate { own_process: true, ..app() }));
        assert!(!is_switchable(&Candidate { class: "Progman".into(), ..app() }));
        assert!(!is_switchable(&Candidate { class: "Shell_TrayWnd".into(), ..app() }));
    }

    #[test]
    fn converte_bgra_e_trata_icone_sem_alfa() {
        // Com alfa: só troca B↔R.
        assert_eq!(bgra_to_rgba(&[1, 2, 3, 128, 0, 0, 0, 0]), vec![3, 2, 1, 128, 0, 0, 0, 0]);
        // Sem alfa nenhum: cor vira opaca, preto puro vira transparente.
        assert_eq!(bgra_to_rgba(&[10, 20, 30, 0, 0, 0, 0, 0]), vec![30, 20, 10, 255, 0, 0, 0, 0]);
    }

    #[test]
    fn gera_png_valido() {
        let rgba = vec![255u8; (ICON_SIZE * ICON_SIZE * 4) as usize];
        let url = png_data_url(&rgba, ICON_SIZE).unwrap();
        assert!(url.starts_with("data:image/png;base64,iVBORw0KGgo")); // assinatura PNG
    }

    #[test]
    fn foco_em_janela_inexistente_da_erro() {
        assert!(focus(0x7fff_fff0).is_err());
    }

    #[test]
    fn lista_real_nao_inclui_o_proprio_processo_e_respeita_limite() {
        let l = list();
        assert!(l.len() <= MAX_WINDOWS);
        assert!(l.iter().all(|w| !w.title.trim().is_empty()));
    }
}
