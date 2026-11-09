//! Brilho das telas: painel interno (notebook) pelo IOCTL de vídeo "\\.\LCD" e monitores
//! externos por DDC/CI (dxva2). Monitores sem suporte simplesmente não aparecem.
//! As leituras DDC/CI podem levar ~50–100 ms por monitor: chame numa thread bloqueante.

use serde::Serialize;
use windows::Win32::Foundation::{CloseHandle, HANDLE};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    /// "lcd" (painel interno) ou "ddc:N" (N-ésimo monitor físico com DDC/CI).
    pub id: String,
    pub name: String,
    /// Brilho atual, 0–100.
    pub level: u32,
}

/// Converte o valor DDC (faixa min..max do monitor) para 0–100.
pub fn to_percent(min: u32, cur: u32, max: u32) -> u32 {
    if max <= min {
        return 0;
    }
    (((cur.clamp(min, max) - min) as f64 / (max - min) as f64) * 100.0).round() as u32
}

/// Converte 0–100 para a faixa do monitor.
pub fn from_percent(min: u32, max: u32, pct: u32) -> u32 {
    if max <= min {
        return min;
    }
    min + ((max - min) as f64 * pct.min(100) as f64 / 100.0).round() as u32
}

/// Novo nível após um passo (±), limitado a 0–100.
pub fn step(level: u32, delta: i32) -> u32 {
    (level as i32 + delta).clamp(0, 100) as u32
}

// ---------------------------------------------------------------------------
// Painel interno (IOCTL_VIDEO_*_DISPLAY_BRIGHTNESS)

const IOCTL_QUERY: u32 = 0x0023_0498; // CTL_CODE(FILE_DEVICE_VIDEO, 0x126, METHOD_BUFFERED, FILE_ANY_ACCESS)
const IOCTL_SET: u32 = 0x0023_049C; // função 0x127
const DISPLAYPOLICY_BOTH: u8 = 3;

#[repr(C)]
#[derive(Default, Clone, Copy)]
struct DisplayBrightness {
    policy: u8,
    ac: u8,
    dc: u8,
}

fn open_lcd() -> Option<HANDLE> {
    use windows::core::w;
    use windows::Win32::Storage::FileSystem::{CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
    const GENERIC_READ_WRITE: u32 = 0x8000_0000 | 0x4000_0000;
    unsafe {
        CreateFileW(w!("\\\\.\\LCD"), GENERIC_READ_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, None).ok()
    }
}

fn lcd_level() -> Option<u32> {
    use windows::Win32::System::IO::DeviceIoControl;
    let h = open_lcd()?;
    let mut b = DisplayBrightness::default();
    let mut ret = 0u32;
    let ok = unsafe {
        DeviceIoControl(h, IOCTL_QUERY, None, 0, Some(&mut b as *mut _ as *mut _), std::mem::size_of::<DisplayBrightness>() as u32, Some(&mut ret), None)
    };
    unsafe {
        let _ = CloseHandle(h);
    }
    ok.ok()?;
    Some(b.ac.max(b.dc).min(100) as u32)
}

fn lcd_set(pct: u32) -> Result<(), String> {
    use windows::Win32::System::IO::DeviceIoControl;
    let h = open_lcd().ok_or("tela interna sem controle de brilho")?;
    let v = pct.min(100) as u8;
    let b = DisplayBrightness { policy: DISPLAYPOLICY_BOTH, ac: v, dc: v };
    let mut ret = 0u32;
    let r = unsafe {
        DeviceIoControl(h, IOCTL_SET, Some(&b as *const _ as *const _), std::mem::size_of::<DisplayBrightness>() as u32, None, 0, Some(&mut ret), None)
    };
    unsafe {
        let _ = CloseHandle(h);
    }
    r.map_err(|e| format!("não foi possível ajustar o brilho: {e}"))
}

// ---------------------------------------------------------------------------
// Monitores externos (DDC/CI)

/// Executa `f` para cada monitor físico; os handles são liberados no fim.
fn with_physical_monitors<T>(mut f: impl FnMut(usize, HANDLE, String) -> Option<T>) -> Vec<T> {
    use windows::core::BOOL;
    use windows::Win32::Devices::Display::{
        DestroyPhysicalMonitors, GetNumberOfPhysicalMonitorsFromHMONITOR, GetPhysicalMonitorsFromHMONITOR, PHYSICAL_MONITOR,
    };
    use windows::Win32::Foundation::{LPARAM, RECT};
    use windows::Win32::Graphics::Gdi::{EnumDisplayMonitors, HDC, HMONITOR};

    unsafe extern "system" fn cb(m: HMONITOR, _dc: HDC, _r: *mut RECT, data: LPARAM) -> BOOL {
        (*(data.0 as *mut Vec<HMONITOR>)).push(m);
        BOOL(1)
    }
    let mut hmons: Vec<HMONITOR> = Vec::new();
    let mut out = Vec::new();
    let mut index = 0usize;
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(cb), LPARAM(&mut hmons as *mut _ as isize));
        for hm in hmons {
            let mut n = 0u32;
            if GetNumberOfPhysicalMonitorsFromHMONITOR(hm, &mut n).is_err() || n == 0 {
                continue;
            }
            let mut arr = vec![PHYSICAL_MONITOR::default(); n as usize];
            if GetPhysicalMonitorsFromHMONITOR(hm, &mut arr).is_err() {
                continue;
            }
            for pm in &arr {
                // PHYSICAL_MONITOR é "packed": copia os campos antes de usar (sem referências desalinhadas).
                let desc = pm.szPhysicalMonitorDescription;
                let handle = pm.hPhysicalMonitor;
                let len = desc.iter().position(|&c| c == 0).unwrap_or(desc.len());
                let name = String::from_utf16_lossy(&desc[..len]);
                if let Some(v) = f(index, handle, name) {
                    out.push(v);
                }
                index += 1;
            }
            let _ = DestroyPhysicalMonitors(&arr);
        }
    }
    out
}

fn ddc_read(h: HANDLE) -> Option<(u32, u32, u32)> {
    use windows::Win32::Devices::Display::GetMonitorBrightness;
    let (mut min, mut cur, mut max) = (0u32, 0u32, 0u32);
    (unsafe { GetMonitorBrightness(h, &mut min, &mut cur, &mut max) } != 0).then_some((min, cur, max))
}

// ---------------------------------------------------------------------------

/// Telas com brilho ajustável.
pub fn list() -> Vec<Display> {
    let mut out = Vec::new();
    if let Some(level) = lcd_level() {
        out.push(Display { id: "lcd".into(), name: "Tela do notebook".into(), level });
    }
    out.extend(with_physical_monitors(|i, h, name| {
        let (min, cur, max) = ddc_read(h)?;
        Some(Display { id: format!("ddc:{i}"), name: if name.trim().is_empty() { format!("Monitor {}", i + 1) } else { name }, level: to_percent(min, cur, max) })
    }));
    out
}

/// Aplica `pct` (0–100) na tela `id`, ou em todas se `id` for "all".
pub fn set(id: &str, pct: u32) -> Result<(), String> {
    use windows::Win32::Devices::Display::SetMonitorBrightness;
    let mut done = 0;
    if id == "all" || id == "lcd" {
        if lcd_set(pct).is_ok() {
            done += 1;
        } else if id == "lcd" {
            return lcd_set(pct);
        }
    }
    if id == "all" || id.starts_with("ddc:") {
        let want: Option<usize> = id.strip_prefix("ddc:").and_then(|n| n.parse().ok());
        done += with_physical_monitors(|i, h, _| {
            if want.is_some_and(|w| w != i) {
                return None;
            }
            let (min, _, max) = ddc_read(h)?;
            (unsafe { SetMonitorBrightness(h, from_percent(min, max, pct)) } != 0).then_some(())
        })
        .len();
    }
    if done == 0 {
        return Err("nenhuma tela aceitou o ajuste de brilho (o monitor pode não suportar DDC/CI)".into());
    }
    Ok(())
}

/// Soma `delta` ao brilho de cada tela (passo relativo).
pub fn step_all(delta: i32) -> Result<(), String> {
    let screens = list();
    if screens.is_empty() {
        return Err("nenhuma tela com brilho ajustável".into());
    }
    for d in &screens {
        set(&d.id, step(d.level, delta))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converte_faixa_do_monitor() {
        assert_eq!(to_percent(0, 50, 100), 50);
        assert_eq!(to_percent(20, 20, 220), 0);
        assert_eq!(to_percent(20, 220, 220), 100);
        assert_eq!(to_percent(0, 999, 100), 100);
        assert_eq!(to_percent(5, 5, 5), 0);
        assert_eq!(from_percent(20, 220, 50), 120);
        assert_eq!(from_percent(0, 100, 150), 100);
    }

    #[test]
    fn passo_fica_entre_0_e_100() {
        assert_eq!(step(95, 10), 100);
        assert_eq!(step(5, -10), 0);
        assert_eq!(step(40, 10), 50);
    }

    #[test]
    fn leitura_real_nao_falha() {
        // Só leitura: não muda o brilho.
        let l = list();
        assert!(l.iter().all(|d| d.level <= 100));
    }
}
