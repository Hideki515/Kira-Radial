//! Layouts de janelas: guardar onde as janelas abertas estão (posição, tamanho, monitor e
//! se estão maximizadas) e devolver cada uma ao lugar com uma fatia.
//!
//! O layout fica dentro da própria ação (sem mudar o esquema da config). Para casar as
//! janelas salvas com as abertas usa o exe e o título. Opcionalmente abre os apps que não
//! estiverem abertos e posiciona a janela quando ela aparecer.
//! A Kira de teste nunca move nem abre nada: só calcula o plano e registra no log.

use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::UI::WindowsAndMessaging::{GetWindowPlacement, SetWindowPlacement, WINDOWPLACEMENT};

/// Máximo de janelas num layout.
pub const MAX_WINDOWS: usize = 20;
/// Quanto esperar a janela de um app recém-aberto aparecer.
const LAUNCH_WAIT: Duration = Duration::from_secs(10);

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum WinState {
    #[default]
    Normal,
    Maximized,
    Minimized,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedWindow {
    /// Caminho completo do exe.
    pub exe: String,
    pub title: String,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    #[serde(default)]
    pub state: WinState,
}

/// Janela aberta agora (para casar com as salvas).
#[derive(Clone, Debug, PartialEq)]
pub struct OpenWindow {
    pub hwnd: isize,
    pub exe: String,
    pub title: String,
}

fn exe_key(path: &str) -> String {
    path.rsplit(['\\', '/']).next().unwrap_or(path).to_ascii_lowercase()
}

/// Quão bem o título aberto bate com o salvo (maior = melhor; 0 = só o exe bate).
fn title_score(saved: &str, open: &str) -> u32 {
    let (s, o) = (saved.trim().to_lowercase(), open.trim().to_lowercase());
    if s == o {
        return 3;
    }
    // "Documento - Word" x "Outro - Word": a parte final (nome do app) costuma repetir;
    // a inicial identifica o documento/projeto.
    let head = |t: &str| t.split([' ', '-', '—', '–', '|']).find(|p| !p.is_empty()).unwrap_or("").to_string();
    // Trecho curto demais ("A") bateria com quase tudo.
    if s.chars().count() >= 3 && o.chars().count() >= 3 && (o.contains(&s) || s.contains(&o)) {
        return 2;
    }
    if !head(&s).is_empty() && head(&s) == head(&o) {
        return 1;
    }
    0
}

/// Para cada janela salva, a janela aberta escolhida (índice em `open`), sem repetir:
/// primeiro os pares com título mais parecido, depois qualquer uma do mesmo exe.
pub fn plan(saved: &[SavedWindow], open: &[OpenWindow]) -> Vec<Option<usize>> {
    let mut pairs: Vec<(u32, usize, usize)> = Vec::new();
    for (si, s) in saved.iter().enumerate() {
        for (oi, o) in open.iter().enumerate() {
            if exe_key(&s.exe) == exe_key(&o.exe) {
                pairs.push((title_score(&s.title, &o.title), si, oi));
            }
        }
    }
    // Melhor pontuação primeiro; empate: ordem salva, depois a janela mais recente (Z).
    pairs.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
    let mut out = vec![None; saved.len()];
    let mut used = vec![false; open.len()];
    for (_, si, oi) in pairs {
        if out[si].is_none() && !used[oi] {
            out[si] = Some(oi);
            used[oi] = true;
        }
    }
    out
}

/// Janelas de app abertas agora (mesmo filtro do "Janelas abertas"), mais recentes primeiro.
fn open_windows() -> Vec<OpenWindow> {
    let own = std::process::id();
    crate::winlist::all_switchable()
        .into_iter()
        .filter_map(|h| {
            let (c, pid) = crate::winlist::candidate(HWND(h as *mut _), own);
            Some(OpenWindow { hwnd: h, exe: crate::foreground::exe_path(pid)?, title: c.title })
        })
        .collect()
}

/// Layout atual: posição "normal" (a que volta ao restaurar) e o estado de cada janela.
pub fn capture() -> Vec<SavedWindow> {
    open_windows()
        .into_iter()
        .filter_map(|w| {
            let mut wp = WINDOWPLACEMENT { length: std::mem::size_of::<WINDOWPLACEMENT>() as u32, ..Default::default() };
            unsafe { GetWindowPlacement(HWND(w.hwnd as *mut _), &mut wp).ok()? };
            let r = wp.rcNormalPosition;
            // SW_SHOWMINIMIZED = 2, SW_SHOWMAXIMIZED = 3.
            let state = match wp.showCmd {
                2 => WinState::Minimized,
                3 => WinState::Maximized,
                _ => WinState::Normal,
            };
            Some(SavedWindow { exe: w.exe, title: w.title, x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top, state })
        })
        .filter(|s| s.w > 0 && s.h > 0)
        .take(MAX_WINDOWS)
        .collect()
}

fn apply(hwnd: isize, s: &SavedWindow) -> bool {
    let wp = WINDOWPLACEMENT {
        length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
        flags: Default::default(),
        // SW_SHOWNORMAL = 1, SW_SHOWMINNOACTIVE = 7, SW_SHOWMAXIMIZED = 3.
        showCmd: match s.state {
            WinState::Normal => 1,
            WinState::Maximized => 3,
            WinState::Minimized => 7,
        },
        ptMinPosition: POINT { x: -1, y: -1 },
        ptMaxPosition: POINT { x: -1, y: -1 },
        rcNormalPosition: RECT { left: s.x, top: s.y, right: s.x + s.w, bottom: s.y + s.h },
    };
    unsafe { SetWindowPlacement(HWND(hwnd as *mut _), &wp).is_ok() }
}

/// Confere o que dá para salvar (a interface faz a mesma validação).
pub fn validate(saved: &[SavedWindow]) -> Result<(), String> {
    if saved.is_empty() || saved.len() > MAX_WINDOWS {
        return Err(trf!("o layout precisa de 1 a {MAX_WINDOWS} janelas", "the layout needs 1 to {MAX_WINDOWS} windows"));
    }
    if saved.iter().any(|s| s.exe.trim().is_empty() || s.w <= 0 || s.h <= 0 || s.w > 100_000 || s.h > 100_000) {
        return Err(tr!("layout com janela inválida", "layout with an invalid window").into());
    }
    Ok(())
}

/// Devolve as janelas aos lugares salvos. Com `launch_missing`, abre os apps que faltam e
/// posiciona a janela quando ela aparecer (em segundo plano, até 10 s).
pub fn restore(saved: &[SavedWindow], launch_missing: bool) -> Result<(), String> {
    validate(saved)?;
    let open = open_windows();
    let chosen = plan(saved, &open);
    if crate::qa::ENABLED {
        let found = chosen.iter().filter(|c| c.is_some()).count();
        crate::perf::log("rust", &format!("Kira de teste: layout com {} janelas, {found} encontradas (nada foi movido)", saved.len()));
        return Ok(());
    }
    let mut placed = 0;
    let mut missing = Vec::new();
    for (s, c) in saved.iter().zip(&chosen) {
        match c {
            Some(i) => placed += apply(open[*i].hwnd, s) as usize,
            None => missing.push(s.clone()),
        }
    }
    if launch_missing && !missing.is_empty() {
        let taken: Vec<isize> = chosen.iter().flatten().map(|i| open[*i].hwnd).collect();
        for s in &missing {
            crate::actions::launch_path(&s.exe)?;
        }
        std::thread::spawn(move || place_when_open(missing, taken));
        return Ok(());
    }
    if placed == 0 {
        return Err(tr!("nenhuma janela do layout está aberta", "none of the layout's windows are open").into());
    }
    Ok(())
}

/// Espera as janelas dos apps recém-abertos e posiciona cada uma.
fn place_when_open(mut missing: Vec<SavedWindow>, mut taken: Vec<isize>) {
    let start = Instant::now();
    while !missing.is_empty() && start.elapsed() < LAUNCH_WAIT {
        std::thread::sleep(Duration::from_millis(400));
        let open: Vec<OpenWindow> = open_windows().into_iter().filter(|w| !taken.contains(&w.hwnd)).collect();
        let chosen = plan(&missing, &open);
        let mut still = Vec::new();
        for (s, c) in missing.into_iter().zip(chosen) {
            match c {
                Some(i) => {
                    apply(open[i].hwnd, &s);
                    taken.push(open[i].hwnd);
                }
                None => still.push(s),
            }
        }
        missing = still;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sw(exe: &str, title: &str) -> SavedWindow {
        SavedWindow { exe: exe.into(), title: title.into(), x: 0, y: 0, w: 800, h: 600, state: WinState::Normal }
    }
    fn ow(h: isize, exe: &str, title: &str) -> OpenWindow {
        OpenWindow { hwnd: h, exe: exe.into(), title: title.into() }
    }

    #[test]
    fn casa_pelo_exe_e_prefere_o_titulo_parecido() {
        let saved = vec![sw(r"C:\Apps\Code.exe", "Kira-Radial - Visual Studio Code"), sw(r"C:\Apps\Code.exe", "notas - Visual Studio Code"), sw(r"C:\Chrome\chrome.exe", "Gmail")];
        let open = vec![
            ow(1, r"D:\outro\code.exe", "notas - Visual Studio Code"),
            ow(2, r"C:\Apps\Code.exe", "Kira-Radial - Visual Studio Code"),
            ow(3, r"C:\Windows\explorer.exe", "Downloads"),
        ];
        assert_eq!(plan(&saved, &open), vec![Some(1), Some(0), None]);
    }

    #[test]
    fn sem_titulo_igual_usa_qualquer_do_mesmo_exe_sem_repetir() {
        let saved = vec![sw("chrome.exe", "A"), sw("chrome.exe", "B"), sw("chrome.exe", "C")];
        let open = vec![ow(10, "chrome.exe", "X"), ow(11, "chrome.exe", "B - Google Chrome")];
        assert_eq!(plan(&saved, &open), vec![Some(0), Some(1), None]);
    }

    #[test]
    fn pontuacao_do_titulo() {
        assert_eq!(title_score("Gmail", "gmail"), 3);
        assert_eq!(title_score("Gmail", "Gmail - Caixa de entrada"), 2);
        assert_eq!(title_score("Relatório - Word", "Relatório (2) - Word"), 1);
        assert_eq!(title_score("A", "B"), 0);
    }

    #[test]
    fn validacao_e_serde() {
        assert!(validate(&[]).is_err());
        assert!(validate(&vec![sw("a.exe", "t"); MAX_WINDOWS + 1]).is_err());
        assert!(validate(&[SavedWindow { w: 0, ..sw("a.exe", "t") }]).is_err());
        assert!(validate(&[sw(" ", "t")]).is_err());
        assert!(validate(&[sw("a.exe", "t")]).is_ok());
        let s: SavedWindow = serde_json::from_str(r#"{"exe":"a.exe","title":"t","x":-8,"y":0,"w":10,"h":20,"state":"maximized"}"#).unwrap();
        assert_eq!(s.state, WinState::Maximized);
        let s: SavedWindow = serde_json::from_str(r#"{"exe":"a.exe","title":"t","x":0,"y":0,"w":10,"h":20}"#).unwrap();
        assert_eq!(s.state, WinState::Normal);
    }
}
