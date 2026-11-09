//! Combinações de teclas → SendInput. Mesmo formato do front (src/shared/keys.ts):
//! "Ctrl+Shift+Esc", "Win+D", "Alt+F4".

use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY,
    KEYEVENTF_KEYUP, VIRTUAL_KEY,
};

pub const VK_CONTROL: u16 = 0x11;
pub const VK_MENU: u16 = 0x12;
pub const VK_SHIFT: u16 = 0x10;
pub const VK_LWIN: u16 = 0x5B;

/// Converte o texto da combinação em VKs na ordem de pressionamento (modificadores primeiro).
pub fn parse_combo(combo: &str) -> Result<Vec<u16>, String> {
    let mut mods: Vec<u16> = Vec::new();
    let mut key: Option<u16> = None;
    for raw in combo.split('+') {
        let part = raw.trim();
        if part.is_empty() {
            return Err(format!("combinação inválida: \"{combo}\""));
        }
        let lower = part.to_ascii_lowercase();
        let m = match lower.as_str() {
            "ctrl" | "control" | "ctl" => Some(VK_CONTROL),
            "alt" | "option" => Some(VK_MENU),
            "shift" => Some(VK_SHIFT),
            "win" | "meta" | "super" | "cmd" | "windows" => Some(VK_LWIN),
            _ => None,
        };
        if let Some(m) = m {
            if !mods.contains(&m) {
                mods.push(m);
            }
            continue;
        }
        if key.is_some() {
            return Err(format!("mais de uma tecla principal em \"{combo}\""));
        }
        key = Some(key_vk(&lower).ok_or_else(|| format!("tecla desconhecida: \"{part}\""))?);
    }
    match key {
        Some(k) => {
            mods.push(k);
            Ok(mods)
        }
        // "Win" sozinho abre o menu Iniciar.
        None if mods == [VK_LWIN] => Ok(mods),
        None => Err(format!("combinação sem tecla principal: \"{combo}\"")),
    }
}

fn key_vk(k: &str) -> Option<u16> {
    let b = k.as_bytes();
    if b.len() == 1 {
        let c = b[0];
        return match c {
            b'a'..=b'z' => Some((c - 32) as u16),
            b'0'..=b'9' => Some(c as u16),
            b'`' => Some(0xC0),
            b'-' => Some(0xBD),
            b'=' => Some(0xBB),
            b'[' => Some(0xDB),
            b']' => Some(0xDD),
            b'\\' => Some(0xDC),
            b';' => Some(0xBA),
            b'\'' => Some(0xDE),
            b',' => Some(0xBC),
            b'.' => Some(0xBE),
            b'/' => Some(0xBF),
            _ => None,
        };
    }
    if let Some(n) = k.strip_prefix('f').and_then(|n| n.parse::<u16>().ok()) {
        if (1..=24).contains(&n) {
            return Some(0x70 + n - 1);
        }
    }
    Some(match k {
        "esc" | "escape" => 0x1B,
        "enter" | "return" => 0x0D,
        "tab" => 0x09,
        "space" | "spacebar" => 0x20,
        "backspace" => 0x08,
        "delete" | "del" => 0x2E,
        "insert" | "ins" => 0x2D,
        "home" => 0x24,
        "end" => 0x23,
        "pageup" | "pgup" => 0x21,
        "pagedown" | "pgdn" => 0x22,
        "left" | "arrowleft" => 0x25,
        "up" | "arrowup" => 0x26,
        "right" | "arrowright" => 0x27,
        "down" | "arrowdown" => 0x28,
        "printscreen" | "prtsc" => 0x2C,
        _ => return None,
    })
}

/// Nome da tecla a partir do VK (inverso de `key_vk`), no formato da UI.
pub fn vk_name(vk: u16) -> Option<String> {
    Some(match vk {
        0x41..=0x5A | 0x30..=0x39 => (vk as u8 as char).to_string(),
        0x70..=0x87 => format!("F{}", vk - 0x70 + 1),
        0x1B => "Esc".into(),
        0x0D => "Enter".into(),
        0x09 => "Tab".into(),
        0x20 => "Space".into(),
        0x08 => "Backspace".into(),
        0x2E => "Delete".into(),
        0x2D => "Insert".into(),
        0x24 => "Home".into(),
        0x23 => "End".into(),
        0x21 => "PageUp".into(),
        0x22 => "PageDown".into(),
        0x25 => "Left".into(),
        0x26 => "Up".into(),
        0x27 => "Right".into(),
        0x28 => "Down".into(),
        0x2C => "PrintScreen".into(),
        0xC0 => "`".into(),
        0xBD => "-".into(),
        0xBB => "=".into(),
        0xDB => "[".into(),
        0xDD => "]".into(),
        0xDC => "\\".into(),
        0xBA => ";".into(),
        0xDE => "'".into(),
        0xBC => ",".into(),
        0xBE => ".".into(),
        0xBF => "/".into(),
        _ => return None,
    })
}

/// Teclas que precisam da flag "extended" para não virarem as do teclado numérico.
fn is_extended(vk: u16) -> bool {
    matches!(vk, 0x21..=0x28 | 0x2D | 0x2E | 0x5B | 0x5C | 0xAD..=0xB3)
}

fn input(vk: u16, up: bool) -> INPUT {
    let mut flags = KEYBD_EVENT_FLAGS(0);
    if up {
        flags |= KEYEVENTF_KEYUP;
    }
    if is_extended(vk) {
        flags |= KEYEVENTF_EXTENDEDKEY;
    }
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 },
        },
    }
}

/// Pressiona as teclas na ordem e solta na ordem inversa.
pub fn send_vks(vks: &[u16]) -> Result<(), String> {
    let mut inputs: Vec<INPUT> = vks.iter().map(|&v| input(v, false)).collect();
    inputs.extend(vks.iter().rev().map(|&v| input(v, true)));
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        return Err("SendInput bloqueado (app com privilégio maior em foco?)".into());
    }
    Ok(())
}

pub fn send_combo(combo: &str) -> Result<(), String> {
    send_vks(&parse_combo(combo)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basico() {
        assert_eq!(parse_combo("Ctrl+Shift+Esc").unwrap(), vec![VK_CONTROL, VK_SHIFT, 0x1B]);
        assert_eq!(parse_combo("win + d").unwrap(), vec![VK_LWIN, b'D' as u16]);
        assert_eq!(parse_combo("Alt+F4").unwrap(), vec![VK_MENU, 0x73]);
        assert_eq!(parse_combo("Ctrl+1").unwrap(), vec![VK_CONTROL, b'1' as u16]);
        assert_eq!(parse_combo("Win").unwrap(), vec![VK_LWIN]);
    }

    #[test]
    fn parse_invalido() {
        assert!(parse_combo("Ctrl+Shift").is_err());
        assert!(parse_combo("Ctrl+A+B").is_err());
        assert!(parse_combo("Ctrl+").is_err());
        assert!(parse_combo("Ctrl+Foo").is_err());
        assert!(parse_combo("F25").is_err());
    }

    #[test]
    fn vk_name_e_inverso_de_key_vk() {
        for vk in (0x41..=0x5A).chain(0x30..=0x39).chain(0x70..=0x87).chain([0x1B, 0x20, 0x25, 0x26, 0xC0, 0xBD, 0xBB, 0xDB, 0xDD, 0xDC, 0xBA, 0xDE, 0xBC, 0xBE, 0xBF]) {
            let name = vk_name(vk).unwrap();
            assert_eq!(key_vk(&name.to_ascii_lowercase()), Some(vk), "{name}");
        }
        assert_eq!(vk_name(0x5B), None); // Win é modificador
    }

    #[test]
    fn setas_sao_extended() {
        assert!(is_extended(0x26));
        assert!(!is_extended(b'A' as u16));
    }
}
