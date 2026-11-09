//! Gravação de atalhos em nível de sistema (WH_KEYBOARD_LL).
//!
//! Combinações com a tecla Windows (Win+D, Win+E...) são tratadas pelo shell antes
//! de chegarem a qualquer janela, e a tecla Win sozinha abre o Iniciar. Por isso o
//! gravador de atalhos, enquanto ativo, instala um hook de teclado que lê a
//! combinação e a BLOQUEIA (o Windows não executa nada). O hook é removido assim
//! que a combinação é lida, ao cancelar, ou após 15 s — nunca fica preso.
//!
//! Eventos emitidos para a janela de configurações:
//! - "keycapture:combo"  (String, ex.: "Win+Shift+Z")
//! - "keycapture:cancel" (Esc sozinho, tempo esgotado ou parada)

use crate::actions::keys::vk_name;
use crate::menu::SETTINGS;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx, HC_ACTION,
    KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

const CTRL: u8 = 1;
const ALT: u8 = 2;
const SHIFT: u8 = 4;
const WIN: u8 = 8;
const TIMEOUT: Duration = Duration::from_secs(15);

struct Capture {
    app: AppHandle,
    session: u64,
    thread_id: u32,
    /// Modificadores pressionados agora.
    held: u8,
    /// Uma tecla comum foi pressionada nesta gravação.
    other_pressed: bool,
    /// Combinação já lida: só esperamos soltar os modificadores (bloqueando-os).
    done: bool,
}

static STATE: Mutex<Option<Capture>> = Mutex::new(None);
static SESSION: AtomicU64 = AtomicU64::new(0);

fn modifier_bit(vk: u32) -> Option<u8> {
    match vk {
        0x11 | 0xA2 | 0xA3 => Some(CTRL),
        0x12 | 0xA4 | 0xA5 => Some(ALT),
        0x10 | 0xA0 | 0xA1 => Some(SHIFT),
        0x5B | 0x5C => Some(WIN),
        _ => None,
    }
}

/// Mesmo formato/ordem de src/shared/keys.ts: Ctrl, Alt, Shift, Win, tecla.
pub fn format_combo(mods: u8, key: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    if mods & CTRL != 0 {
        parts.push("Ctrl");
    }
    if mods & ALT != 0 {
        parts.push("Alt");
    }
    if mods & SHIFT != 0 {
        parts.push("Shift");
    }
    if mods & WIN != 0 {
        parts.push("Win");
    }
    parts.push(key);
    parts.join("+")
}

fn finish(c: &mut Capture, event: &str, payload: Option<String>) {
    c.done = true;
    let _ = match payload {
        Some(p) => c.app.emit_to(SETTINGS, event, p),
        None => c.app.emit_to(SETTINGS, event, ()),
    };
    if c.held == 0 {
        unsafe {
            let _ = PostThreadMessageW(c.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code != HC_ACTION as i32 {
        return CallNextHookEx(None, code, wparam, lparam);
    }
    let mut guard = match STATE.lock() {
        Ok(g) => g,
        Err(_) => return CallNextHookEx(None, code, wparam, lparam),
    };
    let Some(c) = guard.as_mut() else {
        return CallNextHookEx(None, code, wparam, lparam);
    };

    let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
    let vk = kb.vkCode;
    let msg = wparam.0 as u32;
    let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
    let up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

    if let Some(bit) = modifier_bit(vk) {
        if down {
            c.held |= bit;
        } else if up {
            let was = c.held;
            c.held &= !bit;
            // "Win" sozinho: pressionou e soltou só a tecla Windows.
            if !c.done && !c.other_pressed && bit == WIN && was == WIN {
                finish(c, "keycapture:combo", Some("Win".into()));
            } else if c.done && c.held == 0 {
                let _ = PostThreadMessageW(c.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
    } else if down && !c.done {
        c.other_pressed = true;
        if vk == 0x1B && c.held == 0 {
            finish(c, "keycapture:cancel", None);
        } else if let Some(name) = vk_name(vk as u16) {
            let combo = format_combo(c.held, &name);
            finish(c, "keycapture:combo", Some(combo));
        }
    }
    // Bloqueia tudo enquanto grava: o Windows não executa Win+D, não abre o Iniciar etc.
    LRESULT(1)
}

/// Inicia a gravação (substitui uma gravação anterior, se houver).
pub fn start(app: AppHandle) -> Result<(), String> {
    stop();
    let session = SESSION.fetch_add(1, Ordering::SeqCst) + 1;
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    std::thread::spawn(move || unsafe {
        let module = match GetModuleHandleW(None) {
            Ok(m) => m,
            Err(e) => {
                let _ = tx.send(Err(e.to_string()));
                return;
            }
        };
        let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook_proc), Some(module.into()), 0) {
            Ok(h) => h,
            Err(e) => {
                let _ = tx.send(Err(format!("não foi possível capturar o teclado: {e}")));
                return;
            }
        };
        *STATE.lock().unwrap() = Some(Capture {
            app,
            session,
            thread_id: GetCurrentThreadId(),
            held: 0,
            other_pressed: false,
            done: false,
        });
        let _ = tx.send(Ok(()));
        // O hook só recebe eventos enquanto esta thread bombeia mensagens.
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {}
        let _ = UnhookWindowsHookEx(hook);
        let mut guard = STATE.lock().unwrap();
        if guard.as_ref().map(|c| c.session) == Some(session) {
            *guard = None;
        }
    });
    rx.recv().map_err(|e| e.to_string())??;

    // Segurança: nunca deixar o teclado capturado por muito tempo.
    std::thread::spawn(move || {
        std::thread::sleep(TIMEOUT);
        let mut guard = STATE.lock().unwrap();
        if let Some(c) = guard.as_mut() {
            if c.session == session && !c.done {
                c.held = 0;
                finish(c, "keycapture:cancel", None);
            }
        }
    });
    Ok(())
}

/// Para a gravação atual (se houver) e remove o hook.
pub fn stop() {
    if let Some(c) = STATE.lock().unwrap().take() {
        unsafe {
            let _ = PostThreadMessageW(c.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}

#[tauri::command]
pub fn start_key_capture(app: AppHandle) -> Result<(), String> {
    start(app)
}

#[tauri::command]
pub fn stop_key_capture() {
    stop();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formata_na_ordem_da_ui() {
        assert_eq!(format_combo(WIN | SHIFT, "Z"), "Shift+Win+Z");
        assert_eq!(format_combo(CTRL | ALT, "Q"), "Ctrl+Alt+Q");
        assert_eq!(format_combo(0, "F5"), "F5");
    }

    #[test]
    fn reconhece_modificadores_esquerdo_e_direito() {
        assert_eq!(modifier_bit(0x5B), Some(WIN));
        assert_eq!(modifier_bit(0x5C), Some(WIN));
        assert_eq!(modifier_bit(0xA5), Some(ALT)); // AltGr chega como RMENU
        assert_eq!(modifier_bit(0x41), None);
    }
}
