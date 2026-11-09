//! Histórico da área de transferência (opcional, desligado por padrão).
//!
//! - Só texto, só na memória (nada vai para disco), no máximo 8 itens.
//! - Respeita os formatos que gerenciadores de senha usam para pedir "não guarde isto":
//!   ExcludeClipboardContentFromMonitorProcessing, CanIncludeInClipboardHistory = 0 e
//!   Clipboard Viewer Ignore.
//! - O monitor (AddClipboardFormatListener) só é criado quando o recurso é ligado.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, Once};
use windows::core::w;
use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};

pub const MAX_ITEMS: usize = 8;
/// Textos maiores são guardados cortados neste tamanho (caracteres).
pub const MAX_CHARS: usize = 64 * 1024;
const CF_UNICODETEXT: u32 = 13;

/// Últimos textos copiados, mais recente primeiro.
#[derive(Default, Debug)]
pub struct History {
    items: VecDeque<String>,
}

impl History {
    /// Acrescenta no topo (sem duplicar; texto vazio é ignorado).
    pub fn push(&mut self, text: &str) {
        if text.trim().is_empty() {
            return;
        }
        let t: String = text.chars().take(MAX_CHARS).collect();
        self.items.retain(|x| *x != t);
        self.items.push_front(t);
        self.items.truncate(MAX_ITEMS);
    }
    pub fn get(&self, i: usize) -> Option<&String> {
        self.items.get(i)
    }
    pub fn clear(&mut self) {
        self.items.clear();
    }
    pub fn previews(&self, max: usize) -> Vec<String> {
        self.items.iter().map(|s| preview(s, max)).collect()
    }
}

/// Uma linha curta para mostrar no menu.
pub fn preview(s: &str, max: usize) -> String {
    let one: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if one.chars().count() > max {
        format!("{}…", one.chars().take(max.saturating_sub(1)).collect::<String>())
    } else {
        one
    }
}

/// O dono do conteúdo pediu para não ser guardado? (`can_include` = valor de
/// CanIncludeInClipboardHistory, se presente.)
pub fn excluded(has_exclude: bool, has_viewer_ignore: bool, can_include: Option<u32>) -> bool {
    has_exclude || has_viewer_ignore || can_include == Some(0)
}

static HISTORY: Mutex<History> = Mutex::new(History { items: VecDeque::new() });
static ENABLED: AtomicBool = AtomicBool::new(false);
static STARTED: Once = Once::new();

// ---------------------------------------------------------------------------
// Leitura/escrita da área de transferência

fn read_text() -> Option<String> {
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
    use windows::Win32::Foundation::HGLOBAL;
    unsafe {
        let fmt_exclude = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
        let fmt_ignore = RegisterClipboardFormatW(w!("Clipboard Viewer Ignore"));
        let fmt_can = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
        if IsClipboardFormatAvailable(CF_UNICODETEXT).is_err() {
            return None;
        }
        OpenClipboard(None).ok()?;
        let result = (|| {
            let can_include = GetClipboardData(fmt_can).ok().and_then(|h| {
                let p = GlobalLock(HGLOBAL(h.0)) as *const u32;
                let v = (!p.is_null()).then(|| *p);
                let _ = GlobalUnlock(HGLOBAL(h.0));
                v
            });
            let skip = excluded(
                IsClipboardFormatAvailable(fmt_exclude).is_ok(),
                IsClipboardFormatAvailable(fmt_ignore).is_ok(),
                can_include,
            );
            if skip {
                return None;
            }
            let h = GetClipboardData(CF_UNICODETEXT).ok()?;
            let g = HGLOBAL(h.0);
            let p = GlobalLock(g) as *const u16;
            if p.is_null() {
                return None;
            }
            let max = GlobalSize(g) / 2;
            let slice = std::slice::from_raw_parts(p, max);
            let len = slice.iter().position(|&c| c == 0).unwrap_or(max);
            let text = String::from_utf16_lossy(&slice[..len]);
            let _ = GlobalUnlock(g);
            Some(text)
        })();
        let _ = CloseClipboard();
        result
    }
}

/// Põe `text` na área de transferência.
pub fn write_text(text: &str) -> Result<(), String> {
    use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let g = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2).map_err(|e| e.to_string())?;
        let p = GlobalLock(g) as *mut u16;
        if p.is_null() {
            return Err("memória indisponível".into());
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), p, wide.len());
        let _ = GlobalUnlock(g);
        OpenClipboard(None).map_err(|e| format!("área de transferência ocupada: {e}"))?;
        let _ = EmptyClipboard();
        // Após SetClipboardData o Windows passa a ser dono da memória.
        let r = SetClipboardData(CF_UNICODETEXT, Some(HANDLE(g.0))).map(|_| ()).map_err(|e| e.to_string());
        let _ = CloseClipboard();
        r
    }
}

// ---------------------------------------------------------------------------
// Monitor (janela só de mensagens)

unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{DefWindowProcW, WM_CLIPBOARDUPDATE};
    if msg == WM_CLIPBOARDUPDATE {
        if ENABLED.load(Ordering::SeqCst) {
            if let Some(t) = read_text() {
                HISTORY.lock().unwrap().push(&t);
            }
        }
        return LRESULT(0);
    }
    unsafe { DefWindowProcW(hwnd, msg, wp, lp) }
}

fn start_listener() {
    std::thread::spawn(|| unsafe {
        use windows::Win32::System::DataExchange::AddClipboardFormatListener;
        use windows::Win32::System::LibraryLoader::GetModuleHandleW;
        use windows::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DispatchMessageW, GetMessageW, RegisterClassW, TranslateMessage, HWND_MESSAGE, MSG,
            WINDOW_EX_STYLE, WNDCLASSW, WS_OVERLAPPED,
        };
        let hinst = GetModuleHandleW(None).unwrap_or_default();
        let class = w!("KiraClipboardListener");
        let wc = WNDCLASSW { lpfnWndProc: Some(wnd_proc), hInstance: hinst.into(), lpszClassName: class, ..Default::default() };
        RegisterClassW(&wc);
        let Ok(hwnd) = CreateWindowExW(WINDOW_EX_STYLE(0), class, w!(""), WS_OVERLAPPED, 0, 0, 0, 0, Some(HWND_MESSAGE), None, Some(hinst.into()), None) else {
            eprintln!("[kira-radial] histórico da área de transferência: janela não criada");
            return;
        };
        if AddClipboardFormatListener(hwnd).is_err() {
            eprintln!("[kira-radial] histórico da área de transferência: listener recusado");
            return;
        }
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

/// Liga/desliga o histórico. Desligar apaga o que foi guardado.
pub fn set_enabled(on: bool) {
    ENABLED.store(on, Ordering::SeqCst);
    if on {
        STARTED.call_once(start_listener);
    } else {
        HISTORY.lock().unwrap().clear();
    }
}

/// Prévia de uma linha dos itens (mais recente primeiro).
pub fn list() -> Vec<String> {
    if !ENABLED.load(Ordering::SeqCst) {
        return Vec::new();
    }
    HISTORY.lock().unwrap().previews(60)
}

pub fn clear() {
    HISTORY.lock().unwrap().clear();
}

/// Coloca o item `index` na área de transferência (o envio do Ctrl+V é feito por quem chama).
pub fn put(index: usize) -> Result<(), String> {
    let text = HISTORY.lock().unwrap().get(index).cloned().ok_or("item do histórico não existe mais")?;
    write_text(&text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn historico_sem_duplicar_e_com_limite() {
        let mut h = History::default();
        for i in 0..12 {
            h.push(&format!("item {i}"));
        }
        h.push("item 5");
        h.push("   ");
        assert_eq!(h.previews(100).len(), MAX_ITEMS);
        assert_eq!(h.get(0).unwrap(), "item 5");
        assert_eq!(h.previews(100).iter().filter(|p| *p == "item 5").count(), 1);
        h.clear();
        assert!(h.get(0).is_none());
    }

    #[test]
    fn corta_texto_gigante_e_resume_previa() {
        let mut h = History::default();
        h.push(&"x".repeat(MAX_CHARS + 10));
        assert_eq!(h.get(0).unwrap().chars().count(), MAX_CHARS);
        assert_eq!(preview("linha 1\n   linha 2", 100), "linha 1 linha 2");
        assert_eq!(preview("abcdefghij", 5), "abcd…");
    }

    #[test]
    fn respeita_pedido_de_nao_guardar() {
        assert!(!excluded(false, false, None));
        assert!(!excluded(false, false, Some(1)));
        assert!(excluded(false, false, Some(0)));
        assert!(excluded(true, false, None));
        assert!(excluded(false, true, None));
    }

    #[test]
    fn desligado_nao_lista_nada() {
        set_enabled(false);
        assert!(list().is_empty());
        assert!(put(0).is_err());
    }
}
