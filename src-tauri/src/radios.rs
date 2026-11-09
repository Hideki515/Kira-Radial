//! Wi-Fi e Bluetooth: listar estado e ligar/desligar (WinRT Windows.Devices.Radios).
//! Usa a mesma permissão que o botão da Central de Ações; nada de modo avião ou drivers.

use serde::{Deserialize, Serialize};
use windows::Devices::Radios::{Radio, RadioAccessStatus, RadioKind, RadioState};

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Wifi,
    Bluetooth,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Toggle,
    On,
    Off,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RadioInfo {
    pub kind: Kind,
    pub name: String,
    pub on: bool,
}

fn kind_of(k: RadioKind) -> Option<Kind> {
    match k {
        RadioKind::WiFi => Some(Kind::Wifi),
        RadioKind::Bluetooth => Some(Kind::Bluetooth),
        _ => None,
    }
}

/// Estado desejado a partir do modo e do estado atual.
pub fn target(mode: Mode, currently_on: bool) -> bool {
    match mode {
        Mode::On => true,
        Mode::Off => false,
        Mode::Toggle => !currently_on,
    }
}

fn radios() -> Result<Vec<Radio>, String> {
    let err = |e: windows::core::Error| format!("não foi possível ler os rádios: {e}");
    let list = Radio::GetRadiosAsync().map_err(err)?.get().map_err(err)?;
    Ok(list.into_iter().collect())
}

/// Wi-Fi e Bluetooth presentes (outros rádios, como banda larga móvel, são ignorados).
pub fn list() -> Vec<RadioInfo> {
    radios()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|r| {
            let kind = kind_of(r.Kind().ok()?)?;
            let name = r.Name().map(|s| s.to_string()).unwrap_or_default();
            let on = r.State().ok()? == RadioState::On;
            Some(RadioInfo { kind, name, on })
        })
        .collect()
}

/// Liga/desliga o rádio do tipo `kind`. Devolve o novo estado (true = ligado).
pub fn set(kind: Kind, mode: Mode) -> Result<bool, String> {
    let access = Radio::RequestAccessAsync()
        .and_then(|op| op.get())
        .map_err(|e| format!("sem acesso aos rádios: {e}"))?;
    if access != RadioAccessStatus::Allowed {
        return Err("o Windows negou acesso ao controle de rádios (Configurações → Privacidade → Rádios)".into());
    }
    let radio = radios()?
        .into_iter()
        .find(|r| r.Kind().ok().and_then(kind_of) == Some(kind))
        .ok_or_else(|| if kind == Kind::Wifi { "Wi-Fi não encontrado".to_string() } else { "Bluetooth não encontrado".to_string() })?;
    let on = radio.State().map(|s| s == RadioState::On).unwrap_or(false);
    let want = target(mode, on);
    let state = if want { RadioState::On } else { RadioState::Off };
    let status = radio
        .SetStateAsync(state)
        .and_then(|op| op.get())
        .map_err(|e| format!("não foi possível mudar o rádio: {e}"))?;
    if status != RadioAccessStatus::Allowed {
        return Err("o Windows recusou a mudança do rádio".into());
    }
    Ok(want)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decide_o_estado_alvo() {
        assert!(target(Mode::Toggle, false));
        assert!(!target(Mode::Toggle, true));
        assert!(target(Mode::On, true));
        assert!(!target(Mode::Off, true));
    }

    #[test]
    fn serde_dos_tipos() {
        assert_eq!(serde_json::from_str::<Kind>("\"wifi\"").unwrap(), Kind::Wifi);
        assert_eq!(serde_json::from_str::<Mode>("\"toggle\"").unwrap(), Mode::Toggle);
        assert!(serde_json::from_str::<Kind>("\"nfc\"").is_err());
    }

    #[test]
    fn leitura_real_nao_falha() {
        // Só leitura: não liga/desliga nada.
        let l = list();
        assert!(l.len() <= 4);
    }
}
