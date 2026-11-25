//! Controle de videogame (XInput: Xbox e compatíveis). Desligado por padrão: só lê o
//! controle quem liga em Configurações. Ligado, uma thread lê o estado 10×/s com o menu
//! fechado (para a combinação que abre) e 30×/s com ele aberto (analógico e botões).
//! A xinput1_4.dll é carregada na hora, da System32 (o executável não depende dela).
//!
//! Com o menu aberto: analógico esquerdo aponta a fatia, A escolhe, B volta/fecha,
//! direcional passa uma fatia. A combinação configurada abre (e fecha) o menu.

use crate::config::PadCombo;
use crate::lock::LockExt;
use crate::menu::{self, AppState, RADIAL};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub const DPAD_UP: u16 = 0x0001;
pub const DPAD_DOWN: u16 = 0x0002;
pub const DPAD_LEFT: u16 = 0x0004;
pub const DPAD_RIGHT: u16 = 0x0008;
pub const START: u16 = 0x0010;
pub const BACK: u16 = 0x0020;
pub const LB: u16 = 0x0100;
pub const RB: u16 = 0x0200;
pub const A: u16 = 0x1000;
pub const B: u16 = 0x2000;

/// Segurar a combinação este tempo para abrir (evita abrir sem querer no meio de um jogo).
pub const HOLD_MS: u64 = 400;
/// Analógico abaixo disto (fração do curso) = solto: a seleção fica onde está.
const DEADZONE: f64 = 0.55;
/// Só avisa o menu quando o ângulo muda pelo menos isto (graus).
const AIM_STEP: i32 = 3;

/// Leitura de um instante do controle.
#[derive(Clone, Copy, Default, Debug, PartialEq, Eq)]
pub struct Pad {
    pub buttons: u16,
    pub lx: i16,
    pub ly: i16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effect {
    Show,
    Close,
    /// Analógico apontando: ângulo de tela em graus (0 = direita, 90 = baixo).
    Aim(i32),
    Step(i32),
    Select,
    Back,
}

pub fn combo_mask(c: PadCombo) -> u16 {
    match c {
        PadCombo::LbRb => LB | RB,
        PadCombo::View => BACK,
        PadCombo::ViewStart => BACK | START,
    }
}

/// Ângulo de tela do analógico, ou None dentro da zona morta.
pub fn stick_angle(lx: i16, ly: i16) -> Option<i32> {
    let (x, y) = (lx as f64 / 32767.0, ly as f64 / 32767.0);
    if (x * x + y * y).sqrt() < DEADZONE {
        return None;
    }
    // No controle, y positivo é para cima; na tela, para baixo.
    let deg = (-y).atan2(x).to_degrees().round() as i32;
    Some(deg.rem_euclid(360))
}

/// Estado entre leituras (função pura em `step`, para testar sem controle).
#[derive(Default, Debug)]
pub struct Tracker {
    prev: Pad,
    combo_since: Option<u64>,
    combo_fired: bool,
    last_aim: Option<i32>,
}

impl Tracker {
    /// O que esta leitura faz, dado o menu visível ou não e o horário (ms).
    pub fn step(&mut self, now: Pad, visible: bool, combo: PadCombo, now_ms: u64) -> Vec<Effect> {
        let mut out = Vec::new();
        let pressed = now.buttons & !self.prev.buttons;
        let mask = combo_mask(combo);
        if now.buttons & mask == mask {
            let since = *self.combo_since.get_or_insert(now_ms);
            if !self.combo_fired && now_ms.saturating_sub(since) >= HOLD_MS {
                self.combo_fired = true;
                out.push(if visible { Effect::Close } else { Effect::Show });
            }
        } else {
            self.combo_since = None;
            self.combo_fired = false;
        }
        if visible {
            // Botões da combinação não contam como A/B/direcional.
            let pressed = pressed & !mask;
            if pressed & A != 0 {
                out.push(Effect::Select);
            }
            if pressed & B != 0 {
                out.push(Effect::Back);
            }
            if pressed & (DPAD_RIGHT | DPAD_DOWN) != 0 {
                out.push(Effect::Step(1));
            }
            if pressed & (DPAD_LEFT | DPAD_UP) != 0 {
                out.push(Effect::Step(-1));
            }
            match stick_angle(now.lx, now.ly) {
                Some(a) => {
                    let moved = self.last_aim.is_none_or(|l| {
                        let d = (a - l).rem_euclid(360);
                        d.min(360 - d) >= AIM_STEP
                    });
                    if moved {
                        self.last_aim = Some(a);
                        out.push(Effect::Aim(a));
                    }
                }
                None => self.last_aim = None,
            }
        } else {
            self.last_aim = None;
        }
        self.prev = now;
        out
    }
}

static TRACKER: Mutex<Option<Tracker>> = Mutex::new(None);
static RUNNING: AtomicBool = AtomicBool::new(false);
static CONNECTED: AtomicBool = AtomicBool::new(false);

/// Há controle conectado agora (para as Configurações). Desligado = false.
pub fn connected() -> bool {
    CONNECTED.load(Ordering::SeqCst)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Uma leitura: decide e executa (também usado pelo qa_gamepad da Kira de teste).
pub fn feed(app: &AppHandle, pad: Pad, at_ms: u64) {
    let state = app.state::<AppState>();
    let paused = state.paused.load(Ordering::SeqCst);
    let combo = state.config.lock_ok().gamepad.combo;
    let visible = state.visible.load(Ordering::SeqCst);
    let effects = {
        let mut t = TRACKER.lock_ok();
        t.get_or_insert_with(Tracker::default).step(pad, visible, combo, at_ms)
    };
    if paused {
        return;
    }
    for e in effects {
        let r = match e {
            Effect::Show => menu::show(app),
            Effect::Close => app.emit_to(RADIAL, "gamepad:close", ()).map_err(|e| e.to_string()),
            Effect::Aim(a) => app.emit_to(RADIAL, "gamepad:aim", a).map_err(|e| e.to_string()),
            Effect::Step(d) => app.emit_to(RADIAL, "knob:step", d).map_err(|e| e.to_string()),
            Effect::Select => app.emit_to(RADIAL, "knob:press", ()).map_err(|e| e.to_string()),
            Effect::Back => app.emit_to(RADIAL, "gamepad:back", ()).map_err(|e| e.to_string()),
        };
        if let Err(e) = r {
            crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("controle: {e}"));
        }
    }
}

/// Liga/desliga a leitura conforme a config. A Kira de teste nunca lê o controle de verdade.
pub fn apply(app: &AppHandle, cfg: &crate::config::Config) {
    if !cfg.gamepad.enabled || crate::qa::ENABLED {
        RUNNING.store(false, Ordering::SeqCst);
        CONNECTED.store(false, Ordering::SeqCst);
        return;
    }
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    let spawned = std::thread::Builder::new().name("gamepad".into()).spawn(move || poll_loop(&app));
    if let Err(e) = spawned {
        RUNNING.store(false, Ordering::SeqCst);
        crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("controle: {e}"));
    }
}

fn poll_loop(app: &AppHandle) {
    let Some(get) = xinput::load() else {
        crate::perf::log_level(crate::perf::Level::Warn, "rust", "controle: xinput1_4.dll indisponível");
        RUNNING.store(false, Ordering::SeqCst);
        return;
    };
    let mut slot: Option<u32> = None;
    let mut last_scan = 0u64;
    while RUNNING.load(Ordering::SeqCst) {
        let t = now_ms();
        // Ler um slot vazio é lento: procura controle novo só a cada 2 s.
        if slot.is_none() && t.saturating_sub(last_scan) >= 2000 {
            last_scan = t;
            slot = (0..4).find(|&i| get(i).is_some());
        }
        match slot.and_then(&get) {
            Some(pad) => {
                CONNECTED.store(true, Ordering::SeqCst);
                feed(app, pad, t);
            }
            None => {
                CONNECTED.store(false, Ordering::SeqCst);
                if slot.take().is_some() {
                    // Desconectou: solta tudo (não deixa a combinação "presa").
                    feed(app, Pad::default(), t);
                }
            }
        }
        let visible = app.state::<AppState>().visible.load(Ordering::SeqCst);
        std::thread::sleep(std::time::Duration::from_millis(if visible { 33 } else { 100 }));
    }
    CONNECTED.store(false, Ordering::SeqCst);
}

mod xinput {
    use super::Pad;
    use windows::core::{s, w};
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32};

    #[repr(C)]
    #[derive(Default)]
    struct Gamepad {
        buttons: u16,
        left_trigger: u8,
        right_trigger: u8,
        lx: i16,
        ly: i16,
        rx: i16,
        ry: i16,
    }
    #[repr(C)]
    #[derive(Default)]
    struct State {
        packet: u32,
        pad: Gamepad,
    }
    type GetState = unsafe extern "system" fn(u32, *mut State) -> u32;

    /// Função de leitura de um slot (0–3): None = sem controle ali.
    pub fn load() -> Option<impl Fn(u32) -> Option<Pad>> {
        let f: GetState = unsafe {
            let lib = LoadLibraryExW(w!("xinput1_4.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32).ok()?;
            std::mem::transmute::<unsafe extern "system" fn() -> isize, GetState>(GetProcAddress(lib, s!("XInputGetState"))?)
        };
        Some(move |slot: u32| {
            let mut st = State::default();
            // 0 = ERROR_SUCCESS; 1167 = sem controle neste slot.
            (unsafe { f(slot, &mut st) } == 0).then_some(Pad { buttons: st.pad.buttons, lx: st.pad.lx, ly: st.pad.ly })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const UP: Pad = Pad { buttons: 0, lx: 0, ly: 32767 };

    #[test]
    fn angulo_do_analogico_e_zona_morta() {
        assert_eq!(stick_angle(0, 32767), Some(270), "para cima = topo da tela");
        assert_eq!(stick_angle(32767, 0), Some(0));
        assert_eq!(stick_angle(0, -32767), Some(90));
        assert_eq!(stick_angle(-32767, 0), Some(180));
        assert_eq!(stick_angle(8000, 8000), None, "dentro da zona morta");
    }

    #[test]
    fn combinacao_precisa_ser_segurada_e_dispara_uma_vez() {
        let mut t = Tracker::default();
        let both = Pad { buttons: LB | RB, ..Default::default() };
        assert!(t.step(both, false, PadCombo::LbRb, 1000).is_empty());
        assert!(t.step(both, false, PadCombo::LbRb, 1000 + HOLD_MS - 1).is_empty());
        assert_eq!(t.step(both, false, PadCombo::LbRb, 1000 + HOLD_MS), [Effect::Show]);
        assert!(t.step(both, false, PadCombo::LbRb, 3000).is_empty(), "segurando não repete");
        t.step(Pad::default(), false, PadCombo::LbRb, 3100);
        // Só LB não é a combinação.
        let lb = Pad { buttons: LB, ..Default::default() };
        assert!(t.step(lb, false, PadCombo::LbRb, 3200).is_empty());
        assert!(t.step(lb, false, PadCombo::LbRb, 5000).is_empty());
        // Com o menu aberto, a combinação fecha.
        let mut t = Tracker::default();
        t.step(both, true, PadCombo::LbRb, 0);
        assert_eq!(t.step(both, true, PadCombo::LbRb, HOLD_MS), [Effect::Close]);
    }

    #[test]
    fn menu_fechado_ignora_botoes_e_analogico() {
        let mut t = Tracker::default();
        assert!(t.step(Pad { buttons: A | B | DPAD_RIGHT, ..UP }, false, PadCombo::View, 0).is_empty());
    }

    #[test]
    fn menu_aberto_botoes_por_borda_e_analogico_por_mudanca() {
        let mut t = Tracker::default();
        let a = Pad { buttons: A, ..Default::default() };
        assert_eq!(t.step(a, true, PadCombo::View, 0), [Effect::Select]);
        assert!(t.step(a, true, PadCombo::View, 33).is_empty(), "segurar A não repete");
        assert_eq!(t.step(Pad { buttons: B, ..Default::default() }, true, PadCombo::View, 66), [Effect::Back]);
        assert_eq!(t.step(Pad { buttons: DPAD_RIGHT, ..Default::default() }, true, PadCombo::View, 99), [Effect::Step(1)]);
        assert_eq!(t.step(Pad { buttons: DPAD_UP, ..Default::default() }, true, PadCombo::View, 132), [Effect::Step(-1)]);
        assert_eq!(t.step(UP, true, PadCombo::View, 165), [Effect::Aim(270)]);
        assert!(t.step(Pad { lx: 600, ..UP }, true, PadCombo::View, 198).is_empty(), "mudança menor que 3°");
        assert_eq!(t.step(Pad { buttons: 0, lx: 32767, ly: 0 }, true, PadCombo::View, 231), [Effect::Aim(0)]);
        // Soltar o analógico não muda a seleção; apontar de novo para o mesmo lugar avisa outra vez.
        assert!(t.step(Pad::default(), true, PadCombo::View, 264).is_empty());
        assert_eq!(t.step(Pad { buttons: 0, lx: 32767, ly: 0 }, true, PadCombo::View, 297), [Effect::Aim(0)]);
    }

    #[test]
    fn botoes_da_combinacao_nao_contam_como_comando() {
        let mut t = Tracker::default();
        // View+Start configurado: apertar View não vira "voltar" nem nada.
        assert!(t.step(Pad { buttons: BACK, ..Default::default() }, true, PadCombo::ViewStart, 0).is_empty());
        assert_eq!(combo_mask(PadCombo::LbRb), LB | RB);
        assert_eq!(combo_mask(PadCombo::View), BACK);
    }
}
