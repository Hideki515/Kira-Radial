//! Timer / Pomodoro: um contador que segue com o menu fechado. O centro do menu mostra o
//! tempo restante; no fim toca o som do sistema e avisa na dica do ícone da bandeja.
//!
//! Uma thread dorme até o fim (acordada quando o timer muda): parado, não gasta nada.

use serde::{Deserialize, Serialize};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

pub const DEFAULT_MINUTES: u32 = 25;
pub const MAX_MINUTES: u32 = 180;

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TimerCmd {
    /// Inicia (ou continua, se pausado); rodando, pausa.
    Toggle,
    Start,
    Pause,
    Reset,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Timer {
    pub total: Duration,
    /// Rodando: quando termina. Pausado: None (e `left` guarda o que falta).
    pub ends: Option<Instant>,
    pub left: Duration,
}

impl Timer {
    pub fn remaining(&self, now: Instant) -> Duration {
        match self.ends {
            Some(e) => e.saturating_duration_since(now),
            None => self.left,
        }
    }
}

/// Novo estado após um comando (puro: o relógio vem de fora).
pub fn apply(cur: Option<Timer>, cmd: TimerCmd, minutes: u32, now: Instant) -> Option<Timer> {
    let total = Duration::from_secs(60 * minutes.clamp(1, MAX_MINUTES) as u64);
    let fresh = || Some(Timer { total, ends: Some(now + total), left: total });
    match (cmd, cur) {
        (TimerCmd::Reset, _) => None,
        // Rodando: Toggle/Pause pausam; Start não muda.
        (TimerCmd::Toggle | TimerCmd::Pause, Some(t)) if t.ends.is_some() => Some(Timer { ends: None, left: t.remaining(now), ..t }),
        (TimerCmd::Start, Some(t)) if t.ends.is_some() => Some(t),
        // Pausado: Toggle/Start continuam de onde parou.
        (TimerCmd::Toggle | TimerCmd::Start, Some(t)) => Some(Timer { ends: Some(now + t.left), ..t }),
        (TimerCmd::Pause, Some(t)) => Some(t),
        (TimerCmd::Pause, None) => None,
        (TimerCmd::Toggle | TimerCmd::Start, None) => fresh(),
    }
}

/// O que o centro do menu mostra.
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TimerView {
    pub remaining_ms: u64,
    pub total_ms: u64,
    pub running: bool,
}

pub fn view(t: &Timer, now: Instant) -> TimerView {
    TimerView { remaining_ms: t.remaining(now).as_millis() as u64, total_ms: t.total.as_millis() as u64, running: t.ends.is_some() }
}

static STATE: Mutex<Option<Timer>> = Mutex::new(None);
static WAKE: Condvar = Condvar::new();
static STARTED: std::sync::Once = std::sync::Once::new();
/// Aviso extra no fim (a bandeja), registrado ao iniciar. Um callback em vez de guardar o
/// AppHandle aqui: assim o executável de testes não precisa do runtime do Tauri.
type OnDone = Box<dyn Fn() + Send + Sync>;
static ON_DONE: std::sync::OnceLock<OnDone> = std::sync::OnceLock::new();

pub fn on_done(f: impl Fn() + Send + Sync + 'static) {
    let _ = ON_DONE.set(Box::new(f));
}

fn lock() -> std::sync::MutexGuard<'static, Option<Timer>> {
    STATE.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn snapshot() -> Option<TimerView> {
    lock().as_ref().map(|t| view(t, Instant::now()))
}

/// Executa a ação "timer".
pub fn run(cmd: TimerCmd, minutes: Option<u32>) -> Result<(), String> {
    STARTED.call_once(spawn_waiter);
    let mut g = lock();
    *g = apply(*g, cmd, minutes.unwrap_or(DEFAULT_MINUTES), Instant::now());
    WAKE.notify_all();
    Ok(())
}

/// Dorme até o fim do timer (ou até ele mudar) e avisa quando acabar.
fn spawn_waiter() {
    let _ = std::thread::Builder::new().name("timer".into()).spawn(move || {
        let mut g = lock();
        loop {
            let now = Instant::now();
            match g.and_then(|t| t.ends) {
                Some(end) if end <= now => {
                    *g = None;
                    drop(g);
                    finished();
                    g = lock();
                }
                Some(end) => g = WAKE.wait_timeout(g, end - now).map(|r| r.0).unwrap_or_else(|e| e.into_inner().0),
                None => g = WAKE.wait(g).unwrap_or_else(|e| e.into_inner()),
            }
        }
    });
}

fn finished() {
    crate::perf::log("rust", "timer terminou");
    if let Some(f) = ON_DONE.get() {
        f();
    }
    if !crate::qa::ENABLED {
        // Som "Asterisco" do Windows (o mesmo do esquema de sons do usuário), sem esperar.
        use windows::core::w;
        use windows::Win32::Media::Audio::{PlaySoundW, SND_ALIAS, SND_ASYNC, SND_NODEFAULT};
        unsafe {
            let _ = PlaySoundW(w!("SystemAsterisk"), None, SND_ALIAS | SND_ASYNC | SND_NODEFAULT);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iniciar_pausar_continuar_zerar() {
        let t0 = Instant::now();
        let t = apply(None, TimerCmd::Toggle, 25, t0).unwrap();
        assert_eq!(view(&t, t0), TimerView { remaining_ms: 25 * 60_000, total_ms: 25 * 60_000, running: true });
        let t1 = t0 + Duration::from_secs(60);
        let p = apply(Some(t), TimerCmd::Toggle, 25, t1).unwrap();
        assert!(p.ends.is_none());
        assert_eq!(p.remaining(t1 + Duration::from_secs(600)), Duration::from_secs(24 * 60), "pausado não corre");
        let t2 = t1 + Duration::from_secs(600);
        let r = apply(Some(p), TimerCmd::Start, 5, t2).unwrap();
        assert_eq!(r.remaining(t2), Duration::from_secs(24 * 60), "continua de onde parou (ignora os minutos)");
        assert_eq!(r.total, Duration::from_secs(25 * 60));
        assert_eq!(apply(Some(r), TimerCmd::Start, 5, t2), Some(r), "Start rodando não muda");
        assert_eq!(apply(Some(r), TimerCmd::Reset, 5, t2), None);
        assert_eq!(apply(None, TimerCmd::Pause, 5, t2), None);
        assert_eq!(apply(Some(p), TimerCmd::Pause, 5, t2), Some(p));
    }

    #[test]
    fn minutos_limitados_e_tempo_nao_fica_negativo() {
        let t0 = Instant::now();
        assert_eq!(apply(None, TimerCmd::Start, 0, t0).unwrap().total, Duration::from_secs(60));
        assert_eq!(apply(None, TimerCmd::Start, 999, t0).unwrap().total, Duration::from_secs(60 * MAX_MINUTES as u64));
        let t = apply(None, TimerCmd::Start, 1, t0).unwrap();
        assert_eq!(t.remaining(t0 + Duration::from_secs(3600)), Duration::ZERO);
    }

    #[test]
    fn comando_le_do_json() {
        let c: TimerCmd = serde_json::from_str("\"toggle\"").unwrap();
        assert_eq!(c, TimerCmd::Toggle);
        assert!(serde_json::from_str::<TimerCmd>("\"explode\"").is_err());
    }
}
