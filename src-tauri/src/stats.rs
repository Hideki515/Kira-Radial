//! Uso de CPU/RAM emitido para o hub central — só enquanto o menu está visível.
//! Usa direto GetSystemTimes / GlobalMemoryStatusEx (sem varrer processos).

use crate::menu::{AppState, RADIAL};
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use windows::Win32::Foundation::FILETIME;
use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows::Win32::System::Threading::GetSystemTimes;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Stats {
    cpu: f32,
    ram: f32,
    /// Rede (bytes/s) desde a amostra anterior; None na primeira.
    #[serde(skip_serializing_if = "Option::is_none")]
    net_down: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    net_up: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    timer: Option<crate::timer::TimerView>,
}

/// Bytes recebidos e enviados por todas as placas de rede físicas ligadas (sem loopback
/// nem os filtros virtuais, que repetiriam o mesmo tráfego).
pub fn net_octets() -> Option<(u64, u64)> {
    use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};
    use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;
    const IF_TYPE_SOFTWARE_LOOPBACK: u32 = 24;
    unsafe {
        let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
        if GetIfTable2(&mut table).is_err() || table.is_null() {
            return None;
        }
        let rows = std::slice::from_raw_parts((*table).Table.as_ptr(), (*table).NumEntries as usize);
        let (mut down, mut up) = (0u64, 0u64);
        for r in rows {
            // Bit 0 de InterfaceAndOperStatusFlags = HardwareInterface.
            if r.Type != IF_TYPE_SOFTWARE_LOOPBACK && r.OperStatus == IfOperStatusUp && r.InterfaceAndOperStatusFlags._bitfield & 1 != 0 {
                down = down.wrapping_add(r.InOctets);
                up = up.wrapping_add(r.OutOctets);
            }
        }
        FreeMibTable(table as *const _);
        Some((down, up))
    }
}

/// Bytes/s entre duas leituras (contador que voltou, ex.: placa religada → 0).
pub fn rate(prev: u64, now: u64, secs: f64) -> f64 {
    if secs <= 0.0 || now < prev {
        return 0.0;
    }
    (now - prev) as f64 / secs
}

/// Tempos acumulados do sistema (unidades de 100 ns). `kernel` inclui o tempo ocioso.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct CpuTimes {
    pub idle: u64,
    pub kernel: u64,
    pub user: u64,
}

fn ft(f: FILETIME) -> u64 {
    ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64
}

fn cpu_times() -> Option<CpuTimes> {
    let (mut idle, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
    unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) }.ok()?;
    Some(CpuTimes { idle: ft(idle), kernel: ft(kernel), user: ft(user) })
}

/// % de CPU ocupada entre duas amostras.
pub fn cpu_percent(prev: CpuTimes, now: CpuTimes) -> f32 {
    let idle = now.idle.saturating_sub(prev.idle);
    let total = now.kernel.saturating_sub(prev.kernel) + now.user.saturating_sub(prev.user);
    if total == 0 {
        return 0.0;
    }
    (100.0 * (1.0 - idle as f64 / total as f64)).clamp(0.0, 100.0) as f32
}

fn ram_percent() -> f32 {
    let mut m = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
    if unsafe { GlobalMemoryStatusEx(&mut m) }.is_err() || m.ullTotalPhys == 0 {
        return 0.0;
    }
    ((m.ullTotalPhys - m.ullAvailPhys) as f64 / m.ullTotalPhys as f64 * 100.0) as f32
}

/// O ícone está na tela e com o alerta de CPU ligado?
fn orb_wants_cpu(app: &AppHandle) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::IsWindowVisible;
    let cfg = app.state::<AppState>().config();
    if !cfg.launcher.mode.wants_orb() || !cfg.launcher.orb.cpu_alert {
        return false;
    }
    let h = crate::orb::hwnd(app);
    h != 0 && unsafe { IsWindowVisible(HWND(h as *mut _)) }.as_bool()
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        let mut prev = cpu_times().unwrap_or_default();
        let mut prev_orb = prev;
        let mut tick: u32 = 0;
        let mut was_visible = false;
        // Rede: só lida com o menu aberto; a 1ª amostra após abrir não tem taxa.
        let mut net_prev: Option<((u64, u64), std::time::Instant)> = None;
        loop {
            let visible = app.state::<AppState>().visible.load(Ordering::SeqCst);
            if let Some(now) = cpu_times() {
                if visible {
                    let net_now = net_octets().map(|n| (n, std::time::Instant::now()));
                    let (net_down, net_up) = match (net_prev, net_now) {
                        (Some(((d0, u0), t0)), Some(((d1, u1), t1))) => {
                            let s = t1.duration_since(t0).as_secs_f64();
                            (Some(rate(d0, d1, s)), Some(rate(u0, u1, s)))
                        }
                        _ => (None, None),
                    };
                    net_prev = net_now;
                    // Na primeira amostra após abrir, a média cobre o intervalo desde a última leitura.
                    let s = Stats { cpu: cpu_percent(prev, now), ram: ram_percent(), net_down, net_up, timer: crate::timer::snapshot() };
                    let _ = app.emit_to(RADIAL, "stats", s);
                } else {
                    net_prev = None;
                }
                prev = now;
                // Ícone flutuante (alerta de CPU alta): a cada ~2 s, só se ele estiver visível.
                tick = tick.wrapping_add(1);
                if !visible && tick.is_multiple_of(5) {
                    if orb_wants_cpu(&app) {
                        let s = Stats { cpu: cpu_percent(prev_orb, now), ram: 0.0, net_down: None, net_up: None, timer: None };
                        let _ = app.emit_to(crate::orb::ORB, "stats", s);
                    }
                    prev_orb = now;
                }
            }
            // Ao abrir, responde rápido; aberto, a cada 1s; fechado, quase sem custo.
            let wait = if visible && !was_visible { 250 } else if visible { 1000 } else { 400 };
            was_visible = visible;
            std::thread::sleep(Duration::from_millis(wait));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_percent_calcula_ocupacao() {
        let a = CpuTimes { idle: 100, kernel: 200, user: 100 };
        // +100 kernel (dos quais 50 ocioso) + 100 user → 50 ociosos de 200 = 75% ocupado
        let b = CpuTimes { idle: 150, kernel: 300, user: 200 };
        assert!((cpu_percent(a, b) - 75.0).abs() < 0.01);
        assert_eq!(cpu_percent(a, a), 0.0);
        // Contadores nunca voltam, mas não pode dar pânico/negativo se voltarem.
        assert_eq!(cpu_percent(b, a), 0.0);
    }

    #[test]
    fn taxa_da_rede() {
        assert_eq!(rate(1000, 3000, 2.0), 1000.0);
        assert_eq!(rate(3000, 1000, 2.0), 0.0, "contador zerado");
        assert_eq!(rate(0, 10, 0.0), 0.0);
        let a = net_octets();
        assert!(a.is_some(), "GetIfTable2 deve responder");
    }

    #[test]
    fn leituras_reais_ficam_entre_0_e_100() {
        let a = cpu_times().expect("GetSystemTimes");
        std::thread::sleep(Duration::from_millis(50));
        let b = cpu_times().unwrap();
        assert!((0.0..=100.0).contains(&cpu_percent(a, b)));
        assert!((0.0..=100.0).contains(&ram_percent()));
        assert!(ram_percent() > 0.0);
    }
}
