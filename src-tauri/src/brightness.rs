//! Brilho das telas: painel interno (notebook) pelo IOCTL de vídeo "\\.\LCD" e monitores
//! externos por DDC/CI (dxva2). Monitores sem suporte simplesmente não aparecem.
//! As leituras DDC/CI podem levar ~50–100 ms por monitor: chame numa thread bloqueante.

use serde::Serialize;
use windows::Win32::Foundation::{CloseHandle, HANDLE};

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    /// "lcd" (painel interno), "mon:<id permanente do Windows>" ou, se o Windows não der
    /// esse id, "ddc:N" (N-ésimo monitor físico — muda se a ordem mudar).
    pub id: String,
    pub name: String,
    /// Brilho atual, 0–100.
    pub level: u32,
    /// "\\.\DISPLAY2" (vazio = desconhecido).
    pub device: String,
    /// Número do monitor (1 = mais à esquerda, como em "Identificar"); 0 = desconhecido.
    pub number: usize,
    /// Posição na enumeração (ids antigos "ddc:N").
    #[serde(skip)]
    pub legacy: usize,
}

/// Telas que um alvo escolhe:
/// "all"/vazio = todas; "cursor" = a do monitor onde o menu abriu (`cursor_device`);
/// "lcd"; "ddc:N" (configs antigas); "mon:..." pelo id ou, se sumiu, pelo nome (`name`).
pub fn resolve<'a>(target: &str, name: Option<&str>, list: &'a [Display], cursor_device: &str) -> Result<Vec<&'a Display>, String> {
    if list.is_empty() {
        return Err("nenhuma tela com brilho ajustável (o monitor pode não suportar DDC/CI)".into());
    }
    let t = target.trim();
    let found: Vec<&Display> = match t {
        "" | "all" => list.iter().collect(),
        "cursor" => list.iter().filter(|d| !d.device.is_empty() && d.device.eq_ignore_ascii_case(cursor_device)).collect(),
        _ => {
            let legacy: Option<usize> = t.strip_prefix("ddc:").and_then(|n| n.parse().ok());
            let by_id: Vec<&Display> = list
                .iter()
                .filter(|d| d.id.eq_ignore_ascii_case(t) || legacy.is_some_and(|n| d.legacy == n && d.id != "lcd"))
                .take(1)
                .collect();
            if by_id.is_empty() {
                name.filter(|n| !n.trim().is_empty())
                    .and_then(|n| list.iter().find(|d| d.name.eq_ignore_ascii_case(n.trim())))
                    .into_iter()
                    .collect()
            } else {
                by_id
            }
        }
    };
    if found.is_empty() {
        return Err(match t {
            "cursor" => "a tela onde o menu abriu não aceita ajuste de brilho".into(),
            _ => format!("a tela \"{}\" não foi encontrada (desconectada?)", name.unwrap_or(t)),
        });
    }
    Ok(found)
}

/// Nome mostrado: o do monitor (DDC/Windows) ou "Monitor N" quando é genérico.
fn display_name(ddc: &str, windows_name: Option<&str>, number: usize, id: &str) -> String {
    let generic = |s: &str| {
        let s = s.trim();
        s.is_empty() || s.eq_ignore_ascii_case("Generic PnP Monitor") || (s.starts_with("Monitor") && s[7..].trim().chars().all(|c| c.is_ascii_digit()))
    };
    if !generic(ddc) {
        return ddc.trim().to_string();
    }
    if let Some(n) = windows_name.filter(|n| !generic(n)) {
        return n.to_string();
    }
    let base = if number > 0 { format!("Monitor {number}") } else { "Monitor".into() };
    match pnp_code(id) {
        Some(code) => format!("{base} ({code})"),
        None => base,
    }
}

/// Código do modelo no id permanente: `mon:\\?\DISPLAY#AOC2402#...` → "AOC2402".
fn pnp_code(id: &str) -> Option<&str> {
    let i = id.to_ascii_uppercase().find("DISPLAY#")? + "DISPLAY#".len();
    let code = id[i..].split('#').next()?;
    (!code.is_empty() && code.len() <= 16 && code.chars().all(|c| c.is_ascii_alphanumeric())).then_some(code)
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

/// Um monitor físico durante a enumeração.
struct Phys {
    /// Posição geral na enumeração (ids antigos "ddc:N").
    legacy: usize,
    /// Id permanente ("mon:...") ou "ddc:N".
    id: String,
    device: String,
    /// Descrição dada pelo próprio monitor (DDC).
    name: String,
}

/// Executa `f` para cada monitor físico; os handles são liberados no fim.
fn with_physical_monitors<T>(mut f: impl FnMut(&Phys, HANDLE) -> Option<T>) -> Vec<T> {
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
            let device = crate::monitors::device_of(hm);
            for (j, pm) in arr.iter().enumerate() {
                // PHYSICAL_MONITOR é "packed": copia os campos antes de usar (sem referências desalinhadas).
                let desc = pm.szPhysicalMonitorDescription;
                let handle = pm.hPhysicalMonitor;
                let len = desc.iter().position(|&c| c == 0).unwrap_or(desc.len());
                let id = crate::monitors::interface_id(&device, j as u32).map(|s| format!("mon:{s}")).unwrap_or_else(|| format!("ddc:{index}"));
                let p = Phys { legacy: index, id, device: device.clone(), name: String::from_utf16_lossy(&desc[..len]) };
                if let Some(v) = f(&p, handle) {
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

/// "\\.\DISPLAYn" da tela interna (notebook), pelo tipo de saída que o Windows informa
/// (interna, DisplayPort/UDI embutidos).
fn internal_device() -> Option<String> {
    use windows::Win32::Devices::Display::{
        DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QueryDisplayConfig, DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
        DISPLAYCONFIG_DEVICE_INFO_HEADER, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DISPLAYPORT_EMBEDDED,
        DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INTERNAL, DISPLAYCONFIG_OUTPUT_TECHNOLOGY_UDI_EMBEDDED, DISPLAYCONFIG_PATH_INFO,
        DISPLAYCONFIG_SOURCE_DEVICE_NAME, QDC_ONLY_ACTIVE_PATHS,
    };
    unsafe {
        let (mut np, mut nm) = (0u32, 0u32);
        if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut np, &mut nm).is_err() {
            return None;
        }
        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); np as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); nm as usize];
        if QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &mut np, paths.as_mut_ptr(), &mut nm, modes.as_mut_ptr(), None).is_err() {
            return None;
        }
        paths.truncate(np as usize);
        for p in &paths {
            let tech = p.targetInfo.outputTechnology;
            if tech != DISPLAYCONFIG_OUTPUT_TECHNOLOGY_INTERNAL
                && tech != DISPLAYCONFIG_OUTPUT_TECHNOLOGY_DISPLAYPORT_EMBEDDED
                && tech != DISPLAYCONFIG_OUTPUT_TECHNOLOGY_UDI_EMBEDDED
            {
                continue;
            }
            let mut src = DISPLAYCONFIG_SOURCE_DEVICE_NAME {
                header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
                    r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
                    size: std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32,
                    adapterId: p.sourceInfo.adapterId,
                    id: p.sourceInfo.id,
                },
                ..Default::default()
            };
            if DisplayConfigGetDeviceInfo(&mut src.header) == 0 {
                let name = src.viewGdiDeviceName;
                let n = name.iter().position(|&c| c == 0).unwrap_or(name.len());
                return Some(String::from_utf16_lossy(&name[..n]));
            }
        }
    }
    None
}

/// Painel do notebook: o monitor do Windows sem nenhuma tela DDC/CI (se houver só um assim).
fn guess_lcd_device(monitors: &[crate::monitors::MonitorInfo], ddc: &[Display]) -> String {
    let free: Vec<&crate::monitors::MonitorInfo> = monitors.iter().filter(|m| !ddc.iter().any(|d| d.device.eq_ignore_ascii_case(&m.device))).collect();
    if free.len() == 1 {
        free[0].device.clone()
    } else {
        String::new()
    }
}

/// Telas com brilho ajustável.
pub fn list() -> Vec<Display> {
    let monitors = crate::monitors::list();
    let info = |device: &str| monitors.iter().find(|m| m.device.eq_ignore_ascii_case(device));
    let ddc: Vec<Display> = with_physical_monitors(|p, h| {
        let (min, cur, max) = ddc_read(h)?;
        let m = info(&p.device);
        let number = m.map(|m| m.number).unwrap_or(0);
        Some(Display {
            id: p.id.clone(),
            name: display_name(&p.name, m.map(|m| m.name.as_str()), number, &p.id),
            level: to_percent(min, cur, max),
            device: p.device.clone(),
            number,
            legacy: p.legacy,
        })
    });
    let mut out = Vec::new();
    if let Some(level) = lcd_level() {
        let device = internal_device().unwrap_or_else(|| guess_lcd_device(&monitors, &ddc));
        let number = info(&device).map(|m| m.number).unwrap_or(0);
        out.push(Display { id: "lcd".into(), name: "Tela do notebook".into(), level, device, number, legacy: 0 });
    }
    out.extend(ddc);
    out.sort_by_key(|d| (d.number == 0, d.number));
    out
}

/// Aplica `pct` (0–100) numa tela.
fn set_one(d: &Display, pct: u32) -> Result<(), String> {
    use windows::Win32::Devices::Display::SetMonitorBrightness;
    if d.id == "lcd" {
        return lcd_set(pct);
    }
    let done = with_physical_monitors(|p, h| {
        if p.id != d.id {
            return None;
        }
        let (min, _, max) = ddc_read(h)?;
        (unsafe { SetMonitorBrightness(h, from_percent(min, max, pct)) } != 0).then_some(())
    });
    if done.is_empty() {
        return Err(format!("\"{}\" não aceitou o ajuste de brilho", d.name));
    }
    Ok(())
}

/// Monitor onde o menu abriu (o cursor está sobre o menu ao clicar).
fn cursor_device() -> String {
    crate::monitors::device_at(crate::monitors::cursor())
}

/// Aplica `pct` nas telas do alvo (veja [`resolve`]).
pub fn set(target: &str, name: Option<&str>, pct: u32) -> Result<(), String> {
    let screens = list();
    let chosen = resolve(target, name, &screens, &cursor_device())?;
    apply(&chosen, |_| pct)
}

/// Soma `delta` ao brilho de cada tela do alvo (passo relativo).
pub fn step_target(target: &str, name: Option<&str>, delta: i32) -> Result<(), String> {
    let screens = list();
    let chosen = resolve(target, name, &screens, &cursor_device())?;
    apply(&chosen, |d| step(d.level, delta))
}

/// Ajusta cada tela; erro só se nenhuma aceitar.
fn apply(chosen: &[&Display], pct: impl Fn(&Display) -> u32) -> Result<(), String> {
    let mut last_err = None;
    let mut ok = 0;
    for d in chosen {
        match set_one(d, pct(d)) {
            Ok(()) => ok += 1,
            Err(e) => last_err = Some(e),
        }
    }
    match (ok, last_err) {
        (0, Some(e)) => Err(e),
        _ => Ok(()),
    }
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

    fn d(id: &str, name: &str, device: &str, legacy: usize) -> Display {
        Display { id: id.into(), name: name.into(), level: 50, device: device.into(), number: 0, legacy }
    }

    fn ids(v: Result<Vec<&Display>, String>) -> Vec<String> {
        v.unwrap().into_iter().map(|d| d.id.clone()).collect()
    }

    #[test]
    fn alvo_todas_cursor_e_lcd() {
        let l = vec![d("lcd", "Tela do notebook", r"\\.\DISPLAY1", 0), d("mon:A", "LG", r"\\.\DISPLAY2", 0), d("mon:B", "Dell", r"\\.\DISPLAY3", 1)];
        assert_eq!(ids(resolve("all", None, &l, "")), vec!["lcd", "mon:A", "mon:B"]);
        assert_eq!(ids(resolve("", None, &l, "")), vec!["lcd", "mon:A", "mon:B"]);
        assert_eq!(ids(resolve("cursor", None, &l, r"\\.\display3")), vec!["mon:B"]);
        assert_eq!(ids(resolve("cursor", None, &l, r"\\.\DISPLAY1")), vec!["lcd"]);
        assert!(resolve("cursor", None, &l, r"\\.\DISPLAY9").unwrap_err().contains("onde o menu abriu"));
        assert_eq!(ids(resolve("lcd", None, &l, "")), vec!["lcd"]);
        assert!(resolve("all", None, &[], "").is_err());
    }

    #[test]
    fn monitor_escolhido_sobrevive_a_troca_de_ordem() {
        // Mesmo monitor (id permanente) em outra posição e em outro DISPLAYn.
        let antes = vec![d("mon:A", "LG", r"\\.\DISPLAY2", 0), d("mon:B", "Dell", r"\\.\DISPLAY3", 1)];
        let depois = vec![d("mon:B", "Dell", r"\\.\DISPLAY1", 0), d("mon:A", "LG", r"\\.\DISPLAY4", 1)];
        assert_eq!(ids(resolve("mon:A", Some("LG"), &antes, "")), vec!["mon:A"]);
        assert_eq!(ids(resolve("mon:A", Some("LG"), &depois, "")), vec!["mon:A"]);
        assert_eq!(ids(resolve("MON:a", None, &depois, "")), vec!["mon:A"]);
    }

    #[test]
    fn id_sumiu_usa_o_nome_e_depois_erro() {
        let l = vec![d("mon:NOVO", "LG", r"\\.\DISPLAY2", 0)];
        assert_eq!(ids(resolve("mon:VELHO", Some("lg"), &l, "")), vec!["mon:NOVO"]);
        let e = resolve("mon:VELHO", Some("Dell"), &l, "").unwrap_err();
        assert!(e.contains("Dell") && e.contains("não foi encontrada"), "{e}");
        assert!(resolve("mon:VELHO", None, &l, "").is_err());
    }

    #[test]
    fn id_antigo_ddc_n_continua_valendo() {
        let l = vec![d("lcd", "Tela do notebook", "", 0), d("mon:A", "LG", "", 0), d("ddc:1", "Dell", "", 1)];
        assert_eq!(ids(resolve("ddc:0", None, &l, "")), vec!["mon:A"]); // não confunde com o lcd
        assert_eq!(ids(resolve("ddc:1", None, &l, "")), vec!["ddc:1"]);
        assert!(resolve("ddc:7", None, &l, "").is_err());
    }

    #[test]
    fn nome_generico_vira_monitor_n() {
        let id = r"mon:\\?\DISPLAY#AOC2402#5&caf7c7f&0&UID4352#{e6f07b5f-ee97-4a90-b076-33f57bf4eaa7}";
        assert_eq!(display_name("LG ULTRAGEAR", Some("Monitor 2"), 2, id), "LG ULTRAGEAR");
        assert_eq!(display_name("Generic PnP Monitor", Some("Monitor 2"), 2, id), "Monitor 2 (AOC2402)");
        assert_eq!(display_name("", Some("DELL P2419H"), 1, id), "DELL P2419H");
        assert_eq!(display_name("", None, 3, "ddc:0"), "Monitor 3");
        assert_eq!(display_name("", None, 0, "ddc:0"), "Monitor");
        assert_eq!(pnp_code(r"mon:\\?\DISPLAY#x y#1"), None);
    }

    #[test]
    fn notebook_e_o_monitor_sem_ddc_quando_so_ha_um() {
        let m = |dev: &str| crate::monitors::MonitorInfo { device: dev.into(), name: String::new(), number: 0, left: 0, top: 0, width: 1, height: 1, primary: false };
        let ddc = vec![d("mon:A", "LG", r"\\.\DISPLAY2", 0)];
        assert_eq!(guess_lcd_device(&[m(r"\\.\DISPLAY1"), m(r"\\.\DISPLAY2")], &ddc), r"\\.\DISPLAY1");
        assert_eq!(guess_lcd_device(&[m(r"\\.\DISPLAY1"), m(r"\\.\DISPLAY2"), m(r"\\.\DISPLAY3")], &ddc), "");
    }

    #[test]
    fn leitura_real_nao_falha() {
        // Só leitura: não muda o brilho.
        let l = list();
        assert!(l.iter().all(|d| d.level <= 100));
        assert!(l.iter().all(|d| d.id == "lcd" || d.id.starts_with("mon:") || d.id.starts_with("ddc:")));
        let _ = internal_device();
    }
}
