//! Log do app: `kira.log` na pasta de dados, com níveis (INFO/WARN/ERROR), origem
//! (rust, radial, settings, orb, panic) e rotação (1 MB × 3 arquivos).
//! Também: diagnóstico resumido e relatório para anexar em issue (sem dados pessoais).

use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_BYTES: u64 = 1_000_000;
/// kira.log + kira.log.1 + kira.log.2
pub const FILES: usize = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    Info,
    Warn,
    Error,
}

impl Level {
    pub fn as_str(self) -> &'static str {
        match self {
            Level::Info => "INFO",
            Level::Warn => "WARN",
            Level::Error => "ERROR",
        }
    }
    pub fn parse(s: &str) -> Level {
        match s.to_ascii_uppercase().as_str() {
            "WARN" | "WARNING" => Level::Warn,
            "ERROR" => Level::Error,
            _ => Level::Info,
        }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn local_stamp() -> String {
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
        t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond, t.wMilliseconds
    )
}

/// "2026-11-10 15:30:05.123 WARN [settings] mensagem" (quebras de linha viram " ⏎ ").
pub fn format_line(stamp: &str, level: Level, source: &str, msg: &str) -> String {
    let one = msg.replace("\r\n", " ⏎ ").replace('\n', " ⏎ ");
    format!("{stamp} {} [{source}] {one}\n", level.as_str())
}

/// Nível de uma linha já gravada (linhas do perf.log antigo = INFO).
pub fn line_level(line: &str) -> Level {
    line.split_whitespace().nth(2).map(Level::parse).unwrap_or(Level::Info)
}

pub fn log_path() -> PathBuf {
    crate::config::config_dir().join("kira.log")
}

fn rotated(i: usize) -> PathBuf {
    let base = log_path();
    if i == 0 {
        base
    } else {
        base.with_file_name(format!("kira.log.{i}"))
    }
}

static WRITE: Mutex<()> = Mutex::new(());

/// Gira os arquivos quando o atual passa de `MAX_BYTES` (o mais antigo é descartado).
fn rotate_if_needed() {
    if fs::metadata(log_path()).map(|m| m.len() <= MAX_BYTES).unwrap_or(true) {
        return;
    }
    let _ = fs::remove_file(rotated(FILES - 1));
    for i in (0..FILES - 1).rev() {
        let _ = fs::rename(rotated(i), rotated(i + 1));
    }
}

/// O perf.log das versões antigas vira kira.log.1 (uma vez).
fn migrate_old() {
    let old = crate::config::config_dir().join("perf.log");
    if old.exists() && !rotated(1).exists() {
        let _ = fs::rename(&old, rotated(1));
    }
}

pub fn log_level(level: Level, source: &str, msg: &str) {
    let line = format_line(&local_stamp(), level, source, msg);
    eprint!("[kira-radial] {line}");
    let _guard = WRITE.lock();
    let _ = fs::create_dir_all(crate::config::config_dir());
    migrate_old();
    rotate_if_needed();
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_path()) {
        let _ = f.write_all(line.as_bytes());
    }
}

pub fn log(source: &str, msg: &str) {
    log_level(Level::Info, source, msg);
}

/// Grava o pânico (com o local) antes do encerramento padrão.
pub fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let place = info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_default();
        let msg = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "pânico".into());
        log_level(Level::Error, "panic", &format!("{msg} em {place}"));
        default(info);
    }));
}

/// Últimas `n` linhas (do kira.log e, se faltar, dos anteriores), mais antigas primeiro.
pub fn tail(n: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for i in 0..FILES {
        if out.len() >= n {
            break;
        }
        let Ok(text) = fs::read_to_string(rotated(i)) else { continue };
        let mut lines: Vec<String> = text.lines().map(str::to_owned).collect();
        lines.append(&mut out);
        out = lines;
    }
    let skip = out.len().saturating_sub(n);
    out.split_off(skip)
}

/// Esconde o nome do usuário do Windows em caminhos (C:\Users\fulano → %USERPROFILE%).
///
/// Cobre as três formas em que o caminho aparece — `C:\Users\x` (texto), `C:\\Users\\x`
/// (dentro de JSON) e `C:/Users/x` (URLs/front) — sem diferenciar maiúsculas (ASCII).
pub fn redact(text: &str, profile: Option<&str>) -> String {
    let Some(p) = profile.filter(|p| p.len() > 3) else { return text.to_string() };
    let variants = [p.replace('/', "\\").replace('\\', "\\\\"), p.replace('/', "\\"), p.replace('\\', "/")];
    let mut out = text.to_string();
    // A forma escapada primeiro: senão a simples casaria só metade dela.
    for v in variants {
        out = replace_ascii_ci(&out, &v, "%USERPROFILE%");
    }
    out
}

/// `str::replace` sem diferenciar maiúsculas/minúsculas ASCII.
fn replace_ascii_ci(hay: &str, needle: &str, with: &str) -> String {
    if needle.is_empty() {
        return hay.to_string();
    }
    let (h, n) = (hay.as_bytes(), needle.as_bytes());
    let mut out = String::with_capacity(hay.len());
    let (mut i, mut last) = (0, 0);
    while i + n.len() <= h.len() {
        if h[i..i + n.len()].eq_ignore_ascii_case(n) && hay.is_char_boundary(i) && hay.is_char_boundary(i + n.len()) {
            out.push_str(&hay[last..i]);
            out.push_str(with);
            i += n.len();
            last = i;
        } else {
            i += 1;
        }
    }
    out.push_str(&hay[last..]);
    out
}

// ---------------------------------------------------------------------------
// Comandos

/// Registro vindo do front (o nível e a origem são opcionais: versões antigas mandam só a mensagem).
#[tauri::command]
pub fn perf_log(msg: String, level: Option<String>, source: Option<String>) {
    log_level(level.as_deref().map(Level::parse).unwrap_or(Level::Info), source.as_deref().unwrap_or("front"), &msg);
}

#[tauri::command]
pub fn read_log(lines: Option<usize>) -> Vec<String> {
    tail(lines.unwrap_or(500).min(5000))
}

#[tauri::command]
pub fn clear_log() {
    let _guard = WRITE.lock();
    for i in 0..FILES {
        let _ = fs::remove_file(rotated(i));
    }
}

/// Abre a pasta de dados no Explorador.
#[tauri::command]
pub fn open_data_dir() -> Result<(), String> {
    std::process::Command::new("explorer.exe")
        .arg(crate::config::config_dir())
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Tempo de abertura do menu: do atalho/clique até o primeiro quadro pintado.

/// Quantas aberturas recentes entram na estatística.
pub const OPEN_SAMPLES: usize = 50;
static OPEN_TIMES: Mutex<Vec<f64>> = Mutex::new(Vec::new());

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct OpenStats {
    pub count: usize,
    pub avg_ms: f64,
    /// 90% das aberturas foram mais rápidas que isto.
    pub p90_ms: f64,
    pub max_ms: f64,
    pub last_ms: f64,
}

/// Guarda uma medição (descarta valores absurdos) mantendo só as últimas `OPEN_SAMPLES`.
pub fn push_sample(list: &mut Vec<f64>, ms: f64) {
    if !ms.is_finite() || !(0.0..60_000.0).contains(&ms) {
        return;
    }
    list.push(ms);
    if list.len() > OPEN_SAMPLES {
        let extra = list.len() - OPEN_SAMPLES;
        list.drain(..extra);
    }
}

pub fn open_stats_of(list: &[f64]) -> OpenStats {
    if list.is_empty() {
        return OpenStats::default();
    }
    let mut sorted = list.to_vec();
    sorted.sort_by(f64::total_cmp);
    let round = |v: f64| (v * 10.0).round() / 10.0;
    let p90 = sorted[((sorted.len() as f64 * 0.9).ceil() as usize).saturating_sub(1).min(sorted.len() - 1)];
    OpenStats {
        count: list.len(),
        avg_ms: round(list.iter().sum::<f64>() / list.len() as f64),
        p90_ms: round(p90),
        max_ms: round(*sorted.last().unwrap()),
        last_ms: round(*list.last().unwrap()),
    }
}

/// O menu informa quanto levou para aparecer (só na memória; some ao fechar a Kira).
#[tauri::command]
pub fn perf_open_sample(ms: f64) {
    push_sample(&mut OPEN_TIMES.lock().unwrap(), ms);
}

pub fn open_stats() -> OpenStats {
    open_stats_of(&OPEN_TIMES.lock().unwrap())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub version: String,
    pub webview: String,
    pub windows: String,
    pub monitors: Vec<String>,
    pub launcher_mode: String,
    pub theme: String,
    pub hotkey: String,
    pub hotkey_registered: bool,
    pub hotkey_error: Option<String>,
    pub memory_mb: f64,
    /// Linhas de ERROR entre as últimas 500 do log.
    pub recent_errors: usize,
    pub data_dir: String,
    pub qa: bool,
    /// Tempo de abertura do menu nesta sessão.
    pub menu_open: OpenStats,
}

fn memory_mb() -> f64 {
    use windows::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows::Win32::System::Threading::GetCurrentProcess;
    let mut c = PROCESS_MEMORY_COUNTERS { cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32, ..Default::default() };
    if unsafe { K32GetProcessMemoryInfo(GetCurrentProcess(), &mut c, c.cb) }.as_bool() {
        (c.WorkingSetSize as f64 / 1_048_576.0 * 10.0).round() / 10.0
    } else {
        0.0
    }
}

/// "Windows 11 Pro 24H2 (build 26100)" — lido do registro (sem abrir processos).
fn windows_version() -> String {
    use windows::core::{w, PCWSTR};
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    let read = |name: PCWSTR| -> String {
        let mut buf = [0u16; 128];
        let mut size = (buf.len() * 2) as u32;
        let r = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"),
                name,
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr() as *mut _),
                Some(&mut size),
            )
        };
        if r.is_err() {
            return String::new();
        }
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..len])
    };
    let build = read(w!("CurrentBuild"));
    let mut product = read(w!("ProductName"));
    // O registro ainda diz "Windows 10" no 11: corrige pelo número do build.
    if build.parse::<u32>().is_ok_and(|b| b >= 22000) {
        product = product.replace("Windows 10", "Windows 11");
    }
    format!("{product} {} (build {build})", read(w!("DisplayVersion"))).trim().to_string()
}

pub fn diagnostics_of(app: &tauri::AppHandle) -> Diagnostics {
    use tauri::Manager;
    let state = app.state::<crate::menu::AppState>();
    let cfg = state.config();
    let (mons, _) = crate::positioning::monitors();
    let hotkey_registered = state.shortcut.lock().unwrap().is_some();
    let hotkey_error = state.hotkey_error.lock().unwrap().clone();
    Diagnostics {
        version: app.package_info().version.to_string(),
        webview: tauri::webview_version().unwrap_or_else(|e| format!("indisponível ({e})")),
        windows: windows_version(),
        monitors: mons.iter().map(|m| format!("{}×{} em {},{}", m.width(), m.height(), m.left, m.top)).collect(),
        launcher_mode: format!("{:?}", cfg.launcher.mode).to_lowercase(),
        theme: cfg.appearance.get("theme").and_then(|v| v.as_str()).unwrap_or("glass").to_string(),
        hotkey: cfg.hotkey.accelerator.clone(),
        hotkey_registered,
        hotkey_error,
        memory_mb: memory_mb(),
        recent_errors: tail(500).iter().filter(|l| line_level(l) == Level::Error).count(),
        data_dir: crate::config::config_dir().to_string_lossy().into_owned(),
        qa: crate::qa::ENABLED,
        menu_open: open_stats(),
    }
}

#[tauri::command]
pub fn diagnostics(app: tauri::AppHandle) -> Diagnostics {
    diagnostics_of(&app)
}

/// Escreve um relatório (diagnóstico + últimas 300 linhas do log) na pasta de dados e
/// devolve o caminho. Não inclui a configuração inteira, o histórico da área de
/// transferência nem arquivos recentes; o nome do usuário do Windows é ocultado.
#[tauri::command]
pub fn write_report(app: tauri::AppHandle) -> Result<String, String> {
    let d = diagnostics_of(&app);
    let mut text = String::from("Relatório de diagnóstico — Kira Radial\n\n");
    text += &serde_json::to_string_pretty(&d).map_err(|e| e.to_string())?;
    text += "\n\n--- últimas linhas do log ---\n";
    text += &tail(300).join("\n");
    let profile = std::env::var("USERPROFILE").ok();
    let text = redact(&text, profile.as_deref());
    let stamp = local_stamp().replace([':', ' ', '.'], "-");
    let path = crate::config::config_dir().join(format!("relatorio-{stamp}.txt"));
    fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formato_da_linha_e_nivel() {
        let l = format_line("2026-11-10 15:30:05.123", Level::Warn, "settings", "linha 1\nlinha 2");
        assert_eq!(l, "2026-11-10 15:30:05.123 WARN [settings] linha 1 ⏎ linha 2\n");
        assert_eq!(line_level(&l), Level::Warn);
        assert_eq!(line_level("1731250000000 [rust] abrir menu"), Level::Info); // perf.log antigo
        assert_eq!(Level::parse("error"), Level::Error);
        assert_eq!(Level::parse("qualquer"), Level::Info);
    }

    #[test]
    fn oculta_o_usuario_nos_caminhos() {
        let t = "abriu C:\\Users\\fulano\\Docs\\a.txt";
        assert_eq!(redact(t, Some("C:\\Users\\fulano")), "abriu %USERPROFILE%\\Docs\\a.txt");
        assert_eq!(redact(t, None), t);
        assert_eq!(redact(t, Some("C:")), t); // prefixo curto demais não é ocultado
    }

    #[test]
    fn oculta_formas_escapada_barra_normal_e_maiusculas() {
        let p = Some("C:\\Users\\Fulano");
        assert_eq!(redact("{\"d\":\"C:\\\\Users\\\\fulano\\\\x\"}", p), "{\"d\":\"%USERPROFILE%\\\\x\"}");
        assert_eq!(redact("file:///c:/users/FULANO/a.png", p), "file:///%USERPROFILE%/a.png");
        assert_eq!(redact("c:\\USERS\\fulano\\b", p), "%USERPROFILE%\\b");
        // Não mexe em outros usuários nem quebra texto com acentos.
        assert_eq!(redact("C:\\Users\\fulanoX ção", p), "%USERPROFILE%X ção");
        assert_eq!(redact("C:\\Users\\beltrano", p), "C:\\Users\\beltrano");
    }
}

/// QA (v0.11.0): o relatório serializa o diagnóstico em JSON ANTES do `redact`, e no JSON
/// as barras invertidas viram `\\`. O perfil do usuário não pode sobrar em nenhuma forma.
#[cfg(test)]
mod redact_qa_tests {
    use super::*;

    #[test]
    fn relatorio_em_json_nao_vaza_o_perfil() {
        let profile = "C:\\Users\\fulano";
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct D {
            data_dir: String,
        }
        let json = serde_json::to_string_pretty(&D { data_dir: format!("{profile}\\AppData\\Roaming\\Kira-Radial") }).unwrap();
        let text = format!("{json}\n--- log ---\n2026-11-10 15:30:05.123 INFO [rust] abrir {profile}\\a.txt");
        let out = redact(&text, Some(profile));
        assert!(!out.contains("fulano"), "nome do usuário vazou no relatório:\n{out}");
    }

    #[test]
    fn perfil_com_acento_some_em_json_texto_e_barra_normal() {
        let profile = "C:\\Users\\joão";
        let json = serde_json::to_string(&serde_json::json!({ "dataDir": format!("{profile}\\AppData") })).unwrap();
        let text = format!("{json}\nabrir {profile}\\a.txt\nfile:///C:/Users/joão/b.png\nC:\\USERS\\JOÃO\\c");
        let out = redact(&text, Some(profile));
        assert!(!out.contains("joão"), "nome com acento vazou:\n{out}");
        assert!(out.contains("%USERPROFILE%\\\\AppData") && out.contains("%USERPROFILE%/b.png"), "{out}");
    }
}

#[cfg(test)]
mod open_time_tests {
    use super::*;

    #[test]
    fn estatistica_da_abertura() {
        assert_eq!(open_stats_of(&[]), OpenStats::default());
        let mut v = Vec::new();
        for ms in [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 300.0] {
            push_sample(&mut v, ms);
        }
        let s = open_stats_of(&v);
        assert_eq!((s.count, s.avg_ms, s.p90_ms, s.max_ms, s.last_ms), (10, 75.0, 90.0, 300.0, 300.0));
        let one = open_stats_of(&[12.34]);
        assert_eq!((one.avg_ms, one.p90_ms, one.max_ms), (12.3, 12.3, 12.3));
    }

    #[test]
    fn guarda_so_as_ultimas_e_ignora_lixo() {
        let mut v = Vec::new();
        for i in 0..(OPEN_SAMPLES + 7) {
            push_sample(&mut v, i as f64);
        }
        assert_eq!(v.len(), OPEN_SAMPLES);
        assert_eq!(v[0], 7.0);
        for bad in [f64::NAN, f64::INFINITY, -1.0, 120_000.0] {
            push_sample(&mut v, bad);
        }
        assert_eq!(v.len(), OPEN_SAMPLES);
        assert_eq!(*v.last().unwrap(), (OPEN_SAMPLES + 6) as f64);
    }
}
