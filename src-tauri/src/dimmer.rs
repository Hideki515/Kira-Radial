//! "Brilho por software" para monitores sem DDC/CI (ex.: monitores portáteis por USB-C):
//! uma camada preta semitransparente sobre a tela inteira daquele monitor.
//!
//! - A janela deixa o clique passar (WS_EX_TRANSPARENT), não pega foco, não aparece na barra
//!   de tarefas e fica fora de capturas/compartilhamento de tela (WDA_EXCLUDEFROMCAPTURE).
//! - Só escurece: 100% = sem camada (o máximo é o brilho do próprio monitor).
//! - O nível de cada monitor (id permanente "mon:...") fica salvo em `brilho-software.json`
//!   e volta ao abrir a Kira. A thread das camadas só existe se algum monitor estiver < 100%.
//! - Muda resolução/posição/conecta/desconecta (WM_DISPLAYCHANGE): as camadas se reajustam.
//! - Kira de teste: guarda o nível, mas nunca escurece a tela do usuário.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

/// Escurecimento máximo (nível 0%): ~85% de preto — a tela continua legível.
pub const MAX_ALPHA: f64 = 217.0;
const FILE: &str = "brilho-software.json";

/// Opacidade da camada (0 = sem camada) para o nível 0–100.
pub fn alpha_for(level: u32) -> u8 {
    if level >= 100 {
        return 0;
    }
    ((100 - level) as f64 / 100.0 * MAX_ALPHA).round() as u8
}

/// Níveis por monitor (só os < 100 ficam guardados).
static LEVELS: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);
/// Thread das camadas (0 = ainda não pronta).
static THREAD_ID: AtomicU32 = AtomicU32::new(0);
/// A thread já foi criada (uma só, mesmo com várias ações ao mesmo tempo).
static STARTED: AtomicBool = AtomicBool::new(false);

fn file() -> PathBuf {
    crate::config::config_dir().join(FILE)
}

/// Lê o arquivo; inválido/ausente = nada escurecido.
fn parse(text: &str) -> HashMap<String, u32> {
    serde_json::from_str::<HashMap<String, u32>>(text)
        .unwrap_or_default()
        .into_iter()
        .filter(|(k, v)| k.starts_with("mon:") && *v < 100)
        .collect()
}

fn with_levels<T>(f: impl FnOnce(&mut HashMap<String, u32>) -> T) -> T {
    let mut g = LEVELS.lock().unwrap_or_else(|e| e.into_inner());
    let map = g.get_or_insert_with(|| std::fs::read_to_string(file()).map(|t| parse(&t)).unwrap_or_default());
    f(map)
}

/// Nível atual (100 = sem camada).
pub fn level(id: &str) -> u32 {
    with_levels(|m| m.get(id).copied().unwrap_or(100))
}

/// Define o nível de um monitor e atualiza as camadas.
pub fn set(id: &str, pct: u32) -> Result<(), String> {
    if !id.starts_with("mon:") {
        return Err("monitor sem identificação permanente".into());
    }
    let pct = pct.min(100);
    let snapshot = with_levels(|m| {
        if pct >= 100 {
            m.remove(id);
        } else {
            m.insert(id.to_string(), pct);
        }
        m.clone()
    });
    save(&snapshot);
    sync();
    Ok(())
}

fn save(levels: &HashMap<String, u32>) {
    if cfg!(test) {
        return; // testes nunca gravam na pasta de dados do usuário
    }
    if let Ok(text) = serde_json::to_string_pretty(levels) {
        let _ = std::fs::create_dir_all(crate::config::config_dir());
        if let Err(e) = std::fs::write(file(), text) {
            crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("brilho por software: não salvou ({e})"));
        }
    }
}

/// Monitores que responderam com controle de verdade (DDC/CI ou painel do notebook): tira a
/// camada que tenham ganhado numa falha passageira de leitura (senão ela ficaria presa, já que
/// o ajuste passa a ir para o hardware).
pub fn forget_hardware(ids: &[String]) {
    let changed = with_levels(|m| {
        let before = m.len();
        m.retain(|k, _| !ids.iter().any(|id| id.eq_ignore_ascii_case(k)));
        (m.len() != before).then(|| m.clone())
    });
    if let Some(levels) = changed {
        save(&levels);
        sync();
    }
}

/// Na partida: reaplica os níveis salvos (sem custo se nada estiver escurecido).
pub fn restore() {
    if with_levels(|m| !m.is_empty()) {
        sync();
    }
}

/// Garante a thread e pede para ela reconciliar as camadas.
fn sync() {
    if crate::qa::ENABLED || cfg!(test) {
        return; // Kira de teste e testes: nunca escurecem a tela do usuário.
    }
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_APP};
    // Cria a thread uma única vez e não espera por ela: ao ficar pronta ela mesma aplica os
    // níveis atuais (uma mudança feita antes disso já está em LEVELS quando ela ler).
    if STARTED.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        std::thread::spawn(|| unsafe { run() });
        return;
    }
    let tid = THREAD_ID.load(Ordering::SeqCst);
    if tid != 0 {
        unsafe {
            let _ = PostThreadMessageW(tid, WM_APP, WPARAM(0), LPARAM(0));
        }
    }
}

/// Monitor com camada: id permanente → (dispositivo, retângulo).
struct Target {
    left: i32,
    top: i32,
    width: i32,
    height: i32,
    alpha: u8,
}

/// Onde desenhar agora: monitores conectados cujo id tem nível < 100.
fn targets() -> HashMap<String, Target> {
    let levels = with_levels(|m| m.clone());
    let mut out = HashMap::new();
    if levels.is_empty() {
        return out;
    }
    for m in crate::monitors::list() {
        let Some(id) = crate::monitors::interface_id(&m.device, 0).map(|s| format!("mon:{s}")) else { continue };
        let Some(level) = levels.iter().find(|(k, _)| k.eq_ignore_ascii_case(&id)).map(|(_, v)| *v) else { continue };
        let alpha = alpha_for(level);
        if alpha > 0 {
            out.insert(m.device.clone(), Target { left: m.left, top: m.top, width: m.width, height: m.height, alpha });
        }
    }
    out
}

thread_local! {
    /// Camadas desta thread: dispositivo ("\\.\DISPLAY2") → HWND.
    static OVERLAYS: std::cell::RefCell<HashMap<String, isize>> = std::cell::RefCell::new(HashMap::new());
}

unsafe fn reconcile() {
    use windows::core::w;
    use windows::Win32::Foundation::{COLORREF, HWND};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::*;
    let want = targets();
    let hinst = GetModuleHandleW(None).unwrap_or_default();
    OVERLAYS.with(|o| {
        let mut o = o.borrow_mut();
        // Remove camadas de monitores que sumiram ou voltaram a 100%.
        o.retain(|dev, h| {
            if want.contains_key(dev) {
                return true;
            }
            let _ = DestroyWindow(HWND(*h as *mut _));
            false
        });
        for (dev, t) in &want {
            let h = match o.get(dev) {
                Some(h) => HWND(*h as *mut _),
                None => {
                    // Sem foco, fora da barra de tarefas, clique atravessa, sempre no topo.
                    let ex = WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TRANSPARENT;
                    let Ok(h) = CreateWindowExW(ex, w!("KiraDimmer"), w!(""), WS_POPUP, t.left, t.top, t.width, t.height, None, None, Some(hinst.into()), None) else {
                        continue;
                    };
                    // Prints e compartilhamento de tela não saem escurecidos (Windows 10 2004+).
                    let _ = SetWindowDisplayAffinity(h, WDA_EXCLUDEFROMCAPTURE);
                    o.insert(dev.clone(), h.0 as isize);
                    h
                }
            };
            let _ = SetLayeredWindowAttributes(h, COLORREF(0), t.alpha, LWA_ALPHA);
            let _ = SetWindowPos(h, Some(HWND_TOPMOST), t.left, t.top, t.width, t.height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    });
}

unsafe extern "system" fn proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wp: windows::Win32::Foundation::WPARAM,
    lp: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{DefWindowProcW, WM_DISPLAYCHANGE};
    if msg == WM_DISPLAYCHANGE {
        // Resolução/posição mudou ou monitor conectado/desconectado.
        unsafe { reconcile() };
    }
    unsafe { DefWindowProcW(hwnd, msg, wp, lp) }
}

/// Thread das camadas: uma janela escondida recebe WM_DISPLAYCHANGE mesmo sem camada visível.
unsafe fn run() {
    use windows::core::w;
    use windows::Win32::Graphics::Gdi::{GetStockObject, HBRUSH, BLACK_BRUSH};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::WindowsAndMessaging::*;
    let hinst = GetModuleHandleW(None).unwrap_or_default();
    let wc = WNDCLASSW {
        lpfnWndProc: Some(proc),
        hInstance: hinst.into(),
        lpszClassName: w!("KiraDimmer"),
        hbrBackground: HBRUSH(GetStockObject(BLACK_BRUSH).0),
        ..Default::default()
    };
    RegisterClassW(&wc);
    // Janela "ouvinte" (nunca mostrada).
    let _ = CreateWindowExW(WS_EX_TOOLWINDOW, w!("KiraDimmer"), w!(""), WS_POPUP, 0, 0, 0, 0, None, None, Some(hinst.into()), None);
    let mut msg = MSG::default();
    // Garante a fila de mensagens da thread antes de publicar o id (PostThreadMessage precisa dela);
    // só depois lê os níveis — o que mudou antes disso entra nesta primeira passada.
    let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);
    THREAD_ID.store(GetCurrentThreadId(), Ordering::SeqCst);
    reconcile();
    while GetMessageW(&mut msg, None, 0, 0).as_bool() {
        if msg.hwnd.0.is_null() && msg.message == WM_APP {
            reconcile();
            continue;
        }
        let _ = TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opacidade_por_nivel() {
        assert_eq!(alpha_for(100), 0);
        assert_eq!(alpha_for(150), 0);
        assert_eq!(alpha_for(0), 217);
        assert_eq!(alpha_for(50), 109);
        assert!(alpha_for(90) < alpha_for(10));
    }

    #[test]
    fn hardware_que_voltou_perde_a_camada_sem_mexer_nos_outros() {
        // Só memória: em teste save() e sync() não fazem nada (nem arquivo, nem camada).
        *LEVELS.lock().unwrap_or_else(|e| e.into_inner()) =
            Some(HashMap::from([("mon:QA-DDC".to_string(), 30), ("mon:QA-SOFT".to_string(), 40)]));
        forget_hardware(&["MON:qa-ddc".to_string(), "mon:outro".to_string()]);
        assert_eq!(level("mon:QA-DDC"), 100);
        assert_eq!(level("mon:QA-SOFT"), 40);
        // Sem nada a tirar: não muda.
        forget_hardware(&["mon:outro".to_string()]);
        assert_eq!(level("mon:QA-SOFT"), 40);
    }

    #[test]
    fn arquivo_salvo_invalido_ou_estranho_e_ignorado() {
        let m = parse(r#"{"mon:\\\\?\\DISPLAY#GWD1161#x": 40, "mon:B": 100, "lcd": 20, "x": 5}"#);
        assert_eq!(m.len(), 1);
        assert_eq!(m.values().next(), Some(&40));
        assert!(parse("não é json").is_empty());
        assert!(parse(r#"{"mon:A": -5}"#).is_empty());
    }
}
