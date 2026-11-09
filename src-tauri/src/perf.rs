//! Log de diagnóstico de desempenho: %APPDATA%\Kira-Radial\perf.log
//! Recebe medições do Rust (abertura do menu) e do front (quadros, tarefas longas).

use std::fs::OpenOptions;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

pub fn log(source: &str, msg: &str) {
    let line = format!("{} [{source}] {msg}\n", now_ms());
    eprint!("[kira-radial] {line}");
    let path = crate::config::config_dir().join("perf.log");
    // Evita crescer sem limite: recomeça acima de ~1 MB.
    if std::fs::metadata(&path).map(|m| m.len() > 1_000_000).unwrap_or(false) {
        let _ = std::fs::remove_file(&path);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(line.as_bytes());
    }
}

#[tauri::command]
pub fn perf_log(msg: String) {
    log("front", &msg);
}
