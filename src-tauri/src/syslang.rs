//! Idiomas do usuário no Windows (Configurações → Hora e idioma → Idioma), na ordem de
//! preferência. O WebView2 só informa o idioma de exibição (ex.: en-US), mesmo quando o
//! português está na lista, e o "Automático" da Kira precisa da lista inteira.

use std::sync::OnceLock;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::System::Registry::{RegGetValueW, HKEY, HKEY_CURRENT_USER, RRF_RT_REG_MULTI_SZ, RRF_RT_REG_SZ};

/// Lista lida uma vez por execução (muda raramente; reiniciar a Kira pega a nova).
pub fn languages() -> Vec<String> {
    static CACHE: OnceLock<Vec<String>> = OnceLock::new();
    CACHE.get_or_init(read).clone()
}

fn read() -> Vec<String> {
    let mut out = reg(HKEY_CURRENT_USER, r"Control Panel\International\User Profile", "Languages", true)
        .map(|s| split_multi(&s))
        .unwrap_or_default();
    // Formato regional (ex.: pt-BR) entra por último, como reforço.
    if let Some(l) = reg(HKEY_CURRENT_USER, r"Control Panel\International", "LocaleName", false) {
        out.push(l);
    }
    dedup(out)
}

fn split_multi(s: &str) -> Vec<String> {
    s.split('\0').map(str::trim).filter(|x| !x.is_empty()).map(str::to_owned).collect()
}

fn dedup(v: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for x in v {
        if !out.iter().any(|y| y.eq_ignore_ascii_case(&x)) {
            out.push(x);
        }
    }
    out
}

fn reg(root: HKEY, sub: &str, value: &str, multi: bool) -> Option<String> {
    let mut buf = vec![0u16; 2048];
    let mut size = (buf.len() * 2) as u32;
    let v = HSTRING::from(value);
    let r = unsafe {
        RegGetValueW(
            root,
            &HSTRING::from(sub),
            PCWSTR(v.as_ptr()),
            if multi { RRF_RT_REG_MULTI_SZ } else { RRF_RT_REG_SZ },
            None,
            Some(buf.as_mut_ptr() as *mut _),
            Some(&mut size),
        )
    };
    if r.is_err() {
        return None;
    }
    let n = (size as usize / 2).min(buf.len());
    // O tamanho inclui o(s) NUL do fim; num MULTI_SZ o NUL também separa os itens.
    let text = String::from_utf16_lossy(&buf[..n]);
    Some(if multi { text } else { text.trim_end_matches('\0').trim().to_owned() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn separa_multi_sz_e_tira_repetidos() {
        let v = split_multi("en-US\0pt-BR\0\0");
        assert_eq!(v, ["en-US", "pt-BR"]);
        assert_eq!(dedup(vec!["en-US".into(), "pt-BR".into(), "PT-br".into()]), ["en-US", "pt-BR"]);
    }

    #[test]
    fn le_o_registro_sem_falhar() {
        // Não depende do idioma da máquina: sem vazios, sem NUL e sem repetidos.
        let l = languages();
        assert!(l.iter().all(|x| !x.is_empty() && !x.contains('\0')), "{l:?}");
        assert_eq!(dedup(l.clone()), l);
        if let Some(loc) = reg(HKEY_CURRENT_USER, r"Control Panel\International", "LocaleName", false) {
            assert!(!loc.contains('\0'), "{loc:?}");
        }
    }
}
