//! Planos de energia do Windows (Equilibrado, Alto desempenho...): listar e trocar.
//! API powrprof: PowerEnumerate / PowerReadFriendlyName / Power{Get,Set}ActiveScheme.

use serde::Serialize;
use windows::core::GUID;
use windows::Win32::System::Power::{
    PowerEnumerate, PowerGetActiveScheme, PowerReadFriendlyName, PowerSetActiveScheme, ACCESS_SCHEME,
};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PowerPlan {
    /// GUID em texto, minúsculo, com hífens.
    pub guid: String,
    pub name: String,
    pub active: bool,
}

/// GUID → "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c".
pub fn guid_to_string(g: &GUID) -> String {
    let h = format!("{:032x}", g.to_u128());
    format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

/// Texto (com ou sem hífens/chaves) → GUID.
pub fn parse_guid(s: &str) -> Option<GUID> {
    let hex: String = s.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if hex.len() != 32 || s.chars().any(|c| !(c.is_ascii_hexdigit() || c == '-' || c == '{' || c == '}')) {
        return None;
    }
    u128::from_str_radix(&hex, 16).ok().map(GUID::from_u128)
}

fn friendly_name(g: &GUID) -> String {
    unsafe {
        let mut size = 0u32;
        let _ = PowerReadFriendlyName(None, Some(g), None, None, None, &mut size);
        if size == 0 {
            return guid_to_string(g);
        }
        let mut buf = vec![0u8; size as usize];
        if PowerReadFriendlyName(None, Some(g), None, None, Some(buf.as_mut_ptr()), &mut size).is_err() {
            return guid_to_string(g);
        }
        let wide: Vec<u16> = buf.as_chunks::<2>().0.iter().map(|b| u16::from_le_bytes(*b)).take_while(|&c| c != 0).collect();
        String::from_utf16_lossy(&wide)
    }
}

fn active() -> Option<GUID> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    unsafe {
        let mut p: *mut GUID = std::ptr::null_mut();
        if PowerGetActiveScheme(None, &mut p).is_err() || p.is_null() {
            return None;
        }
        let g = *p;
        let _ = LocalFree(Some(HLOCAL(p as *mut _)));
        Some(g)
    }
}

/// Planos instalados, com o ativo marcado.
pub fn list() -> Vec<PowerPlan> {
    let current = active();
    let mut out = Vec::new();
    for index in 0..32u32 {
        let mut g = GUID::zeroed();
        let mut size = std::mem::size_of::<GUID>() as u32;
        let r = unsafe { PowerEnumerate(None, None, None, ACCESS_SCHEME, index, Some(&mut g as *mut GUID as *mut u8), &mut size) };
        if r.is_err() {
            break; // ERROR_NO_MORE_ITEMS
        }
        out.push(PowerPlan { guid: guid_to_string(&g), name: friendly_name(&g), active: current == Some(g) });
    }
    out
}

/// Ativa o plano `guid`.
pub fn set(guid: &str) -> Result<(), String> {
    let g = parse_guid(guid).ok_or_else(|| format!("plano de energia inválido: {guid}"))?;
    unsafe { PowerSetActiveScheme(None, Some(&g)) }.ok().map_err(|e| format!("não foi possível trocar o plano de energia: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const BALANCED: &str = "381b4222-f694-41f0-9685-ff5bb260df2e";

    #[test]
    fn guid_ida_e_volta() {
        let g = parse_guid(BALANCED).unwrap();
        assert_eq!(guid_to_string(&g), BALANCED);
        assert_eq!(parse_guid("{381B4222-F694-41F0-9685-FF5BB260DF2E}"), Some(g));
        assert_eq!(parse_guid("381b4222"), None);
        assert_eq!(parse_guid("zzzzzzzz-f694-41f0-9685-ff5bb260df2e"), None);
    }

    #[test]
    fn lista_real_tem_no_maximo_um_ativo() {
        // Só leitura: não troca o plano.
        let l = list();
        assert!(l.iter().filter(|p| p.active).count() <= 1);
        assert!(l.iter().all(|p| parse_guid(&p.guid).is_some() && !p.name.is_empty()));
    }

    #[test]
    fn trocar_para_guid_invalido_da_erro_sem_chamar_o_windows() {
        assert!(set("não-é-guid").is_err());
    }
}
