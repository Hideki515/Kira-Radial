//! VPNs do Windows (as de Configurações → Rede → VPN): listar com o estado e
//! conectar/desconectar pelo `rasdial` do próprio Windows, com as credenciais salvas.
//! Sem credenciais salvas, abre a janela de conexão do Windows para digitar.
//! A Kira de teste nunca conecta nem desconecta nada (só finge).

use serde::{Deserialize, Serialize};

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Toggle,
    Connect,
    Disconnect,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VpnInfo {
    pub name: String,
    pub connected: bool,
}

fn wide_to_string(w: &[u16]) -> String {
    let n = w.iter().position(|&c| c == 0).unwrap_or(w.len());
    String::from_utf16_lossy(&w[..n])
}

/// Conexões salvas (todas as agendas: do usuário e do PC).
fn entries() -> Result<Vec<String>, String> {
    use windows::Win32::NetworkManagement::Rras::{RasEnumEntriesW, RASENTRYNAMEW};
    const ERROR_BUFFER_TOO_SMALL: u32 = 603;
    let mut buf = vec![RASENTRYNAMEW { dwSize: std::mem::size_of::<RASENTRYNAMEW>() as u32, ..Default::default() }; 16];
    loop {
        let mut cb = (buf.len() * std::mem::size_of::<RASENTRYNAMEW>()) as u32;
        let mut count = 0u32;
        let rc = unsafe { RasEnumEntriesW(None, None, Some(buf.as_mut_ptr()), &mut cb, &mut count) };
        if rc == ERROR_BUFFER_TOO_SMALL {
            let need = (cb as usize).div_ceil(std::mem::size_of::<RASENTRYNAMEW>()).max(buf.len() * 2);
            buf = vec![RASENTRYNAMEW { dwSize: std::mem::size_of::<RASENTRYNAMEW>() as u32, ..Default::default() }; need];
            continue;
        }
        if rc != 0 {
            return Err(trf!("não foi possível listar as VPNs (código {rc})", "couldn't list the VPNs (code {rc})"));
        }
        return Ok(buf[..count as usize].iter().map(|e| wide_to_string(&e.szEntryName)).collect());
    }
}

/// Nomes das conexões ativas agora.
fn connected() -> Vec<String> {
    use windows::Win32::NetworkManagement::Rras::{RasEnumConnectionsW, RASCONNW};
    let mut buf = vec![RASCONNW { dwSize: std::mem::size_of::<RASCONNW>() as u32, ..Default::default() }; 8];
    let mut cb = (buf.len() * std::mem::size_of::<RASCONNW>()) as u32;
    let mut count = 0u32;
    let rc = unsafe { RasEnumConnectionsW(Some(buf.as_mut_ptr()), &mut cb, &mut count) };
    if rc != 0 {
        return Vec::new();
    }
    buf[..count as usize].iter().map(|c| wide_to_string(&c.szEntryName)).collect()
}

/// Junta as salvas com o estado, sem repetir (ordem alfabética, sem diferenciar maiúsculas).
pub fn merge(mut names: Vec<String>, active: &[String]) -> Vec<VpnInfo> {
    names.sort_by_key(|n| n.to_lowercase());
    names.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
    names
        .into_iter()
        .filter(|n| !n.trim().is_empty())
        .map(|name| VpnInfo { connected: active.iter().any(|a| a.eq_ignore_ascii_case(&name)), name })
        .collect()
}

/// Kira de teste: estado fingido ("conectada?") da VPN de mentira.
#[cfg(feature = "qa")]
static FAKE_ON: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
#[cfg(feature = "qa")]
pub const FAKE_NAME: &str = "Kira QA VPN";

/// VPNs salvas com o estado. Chame numa thread bloqueante.
pub fn list() -> Result<Vec<VpnInfo>, String> {
    #[cfg(feature = "qa")]
    {
        // Kira de teste: só a VPN de mentira (o estado real do usuário nunca é lido nem mexido).
        return Ok(vec![VpnInfo { name: FAKE_NAME.into(), connected: FAKE_ON.load(std::sync::atomic::Ordering::SeqCst) }]);
    }
    #[allow(unreachable_code)]
    Ok(merge(entries()?, &connected()))
}

/// Nome aceitável (vai como argumento do rasdial).
pub fn valid_name(name: &str) -> bool {
    let n = name.trim();
    !n.is_empty() && n.chars().count() <= 256 && !n.contains('"') && !n.chars().any(char::is_control)
}

/// O que fazer, dado o modo e se ela está conectada agora: true = conectar.
pub fn wants_connect(mode: Mode, is_connected: bool) -> bool {
    match mode {
        Mode::Toggle => !is_connected,
        Mode::Connect => true,
        Mode::Disconnect => false,
    }
}

pub fn set(name: &str, mode: Mode) -> Result<(), String> {
    if !valid_name(name) {
        return Err(tr!("nome de VPN inválido", "invalid VPN name").into());
    }
    let name = name.trim();
    #[cfg(feature = "qa")]
    {
        use std::sync::atomic::Ordering;
        if name != FAKE_NAME {
            return Err(trf!("VPN não encontrada: {name}", "VPN not found: {name}"));
        }
        let on = wants_connect(mode, FAKE_ON.load(Ordering::SeqCst));
        FAKE_ON.store(on, Ordering::SeqCst);
        crate::perf::log("rust", &format!("Kira de teste: VPN fingida {}", if on { "conectada" } else { "desconectada" }));
        return Ok(());
    }
    #[allow(unreachable_code)]
    {
        let saved = entries()?;
        let Some(real) = saved.iter().find(|n| n.eq_ignore_ascii_case(name)) else {
            return Err(trf!("VPN não encontrada: {name}", "VPN not found: {name}"));
        };
        let is_on = connected().iter().any(|a| a.eq_ignore_ascii_case(real));
        if wants_connect(mode, is_on) {
            if is_on {
                return Ok(());
            }
            dial(real)
        } else if is_on {
            rasdial(&[real.as_str(), "/disconnect"]).map(|_| ())
        } else {
            Ok(())
        }
    }
}

/// Roda o rasdial escondido; devolve o código de saída.
fn rasdial(args: &[&str]) -> Result<i32, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let exe = std::env::var_os("SystemRoot").map(std::path::PathBuf::from).unwrap_or_else(|| "C:\\Windows".into()).join("System32").join("rasdial.exe");
    let out = std::process::Command::new(exe)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| trf!("não foi possível rodar o rasdial: {e}", "couldn't run rasdial: {e}"))?;
    Ok(out.status.code().unwrap_or(-1))
}

/// Conecta com as credenciais salvas; se o Windows pedir usuário/senha, abre a janela dele.
fn dial(name: &str) -> Result<(), String> {
    match rasdial(&[name])? {
        0 => Ok(()),
        // 691 = usuário/senha recusados; 703 = precisa de dados do usuário.
        691 | 703 => {
            let exe = std::env::var_os("SystemRoot").map(std::path::PathBuf::from).unwrap_or_else(|| "C:\\Windows".into()).join("System32").join("rasphone.exe");
            std::process::Command::new(exe)
                .args(["-d", name])
                .spawn()
                .map(|_| ())
                .map_err(|e| trf!("não foi possível abrir a conexão da VPN: {e}", "couldn't open the VPN connection window: {e}"))
        }
        code => Err(trf!("a VPN {name} não conectou (código {code})", "the VPN {name} didn't connect (code {code})")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn junta_estado_sem_repetir_e_em_ordem() {
        let got = merge(vec!["Trabalho".into(), "casa".into(), "trabalho".into(), " ".into()], &["TRABALHO".into()]);
        assert_eq!(got, vec![VpnInfo { name: "casa".into(), connected: false }, VpnInfo { name: "Trabalho".into(), connected: true }]);
    }

    #[test]
    fn modo_decide_conectar_ou_desconectar() {
        assert!(wants_connect(Mode::Toggle, false));
        assert!(!wants_connect(Mode::Toggle, true));
        assert!(wants_connect(Mode::Connect, true));
        assert!(!wants_connect(Mode::Disconnect, false));
    }

    #[test]
    fn nome_valido() {
        assert!(valid_name("VPN do Trabalho"));
        assert!(!valid_name("  "));
        assert!(!valid_name("a\"b"));
        assert!(!valid_name("a\nb"));
        assert!(!valid_name(&"x".repeat(300)));
    }

    #[test]
    fn modo_le_do_json() {
        let m: Mode = serde_json::from_str("\"disconnect\"").unwrap();
        assert_eq!(m, Mode::Disconnect);
    }
}
