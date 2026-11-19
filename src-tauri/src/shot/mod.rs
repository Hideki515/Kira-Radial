//! Preview de capturas de tela feitas pela Kira.
//!
//! Depois de uma ação de print (Win+Shift+S, PrtSc do Lightshot...), a Kira fica "armada" por
//! alguns segundos (padrão 60) e observa a área de transferência e as pastas de capturas.
//! O primeiro print que chegar vira um preview no canto da tela. Fora desse intervalo nada é
//! observado (consumo zero) e prints tirados fora da Kira não geram preview.
//!
//! O print fica só na memória (o atual e o fixado), até o próximo ou até fechar.

pub mod detect;
pub mod image;

use crate::config::{Screenshot, ShotCorner};
use crate::lock::LockExt;
use image::Rgba;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const SHOT: &str = "shot";
pub const PIN: &str = "shot-pin";
/// Lado maior da miniatura mandada para o preview.
const THUMB: u32 = 640;
const TICK: Duration = Duration::from_millis(250);
/// Depois de achar o print na área de transferência, ainda espera o arquivo (Win+Shift+S
/// com "salvar capturas automaticamente") para habilitar "Abrir pasta".
const FILE_GRACE: Duration = Duration::from_secs(3);

pub struct Shot {
    pub id: u64,
    pub img: Rgba,
    pub thumb: String,
    pub path: Option<PathBuf>,
    pub source: &'static str,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShotInfo {
    pub id: u64,
    pub width: u32,
    pub height: u32,
    pub thumb: String,
    pub path: Option<String>,
    /// "clipboard" ou "file".
    pub source: &'static str,
    /// Quanto tempo o preview fica na tela (s).
    pub seconds: u32,
    pub corner: ShotCorner,
}

static CURRENT: Mutex<Option<Shot>> = Mutex::new(None);
static PINNED: Mutex<Option<Shot>> = Mutex::new(None);
static RUNNING: AtomicBool = AtomicBool::new(false);
static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn info(s: &Shot, cfg: &Screenshot) -> ShotInfo {
    ShotInfo {
        id: s.id,
        width: s.img.width,
        height: s.img.height,
        thumb: s.thumb.clone(),
        path: s.path.as_ref().map(|p| p.to_string_lossy().into_owned()),
        source: s.source,
        seconds: cfg.seconds.clamp(2, 60),
        corner: cfg.corner,
    }
}

pub fn make_shot(img: Rgba, path: Option<PathBuf>, source: &'static str) -> Result<Shot, String> {
    let thumb = image::png_data_url(&image::thumbnail(&img, THUMB))?;
    Ok(Shot { id: NEXT_ID.fetch_add(1, Ordering::SeqCst), img, thumb, path, source })
}

// ---------------------------------------------------------------------------
// Armar e observar

fn screenshot_cfg(app: &AppHandle) -> Screenshot {
    app.state::<crate::menu::AppState>().config().screenshot
}

/// Pastas observadas: a de capturas do Windows + as que o usuário adicionou.
pub fn folders(cfg: &Screenshot) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = windows_screenshots_dir().into_iter().collect();
    for f in &cfg.folders {
        let p = PathBuf::from(crate::actions::expand_env(f.trim()));
        if !f.trim().is_empty() && !out.contains(&p) {
            out.push(p);
        }
    }
    out
}

/// `Imagens\Capturas de Tela` (segue o redirecionamento do OneDrive).
fn windows_screenshots_dir() -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Screenshots, SHGetKnownFolderPath, KNOWN_FOLDER_FLAG};
    unsafe {
        let p = SHGetKnownFolderPath(&FOLDERID_Screenshots, KNOWN_FOLDER_FLAG(0), None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s.map(PathBuf::from)
    }
}

/// Como estavam a área de transferência e as pastas ANTES da ação de print: o que mudar
/// depois é o print (um PrtSc que copia na hora não passa despercebido).
#[derive(Clone)]
pub struct Baseline {
    seq: u32,
    since: SystemTime,
    dirs: Vec<(PathBuf, detect::Snapshot)>,
    cfg: Screenshot,
}

/// Tira a "foto" de antes. `None` = preview desligado (ou Kira de teste): nada a armar.
pub fn baseline(app: &AppHandle) -> Option<Baseline> {
    let cfg = screenshot_cfg(app);
    if !cfg.preview || crate::qa::ENABLED {
        return None;
    }
    let dirs = folders(&cfg).into_iter().map(|d| { let s = detect::snapshot(&d); (d, s) }).collect();
    Some(Baseline { seq: clip::sequence(), since: SystemTime::now() - Duration::from_secs(1), dirs, cfg })
}

struct Armed {
    deadline: Instant,
    base: Baseline,
}

static ARMED: Mutex<Option<Armed>> = Mutex::new(None);
/// Muda a cada arm(): a thread recomeça com a foto nova.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// A ação de print rodou: observa por `arm_seconds`. Outra ação renova o prazo e a foto.
pub fn arm(app: &AppHandle, base: Baseline) {
    let secs = base.cfg.arm_seconds.clamp(10, 300) as u64;
    {
        // Geração e estado mudam juntos (sob a trava): disarm() nunca apaga um arm mais novo.
        let mut a = ARMED.lock_ok();
        *a = Some(Armed { deadline: Instant::now() + Duration::from_secs(secs), base });
        GENERATION.fetch_add(1, Ordering::SeqCst);
    }
    ensure_watcher(app);
}

fn ensure_watcher(app: &AppHandle) {
    if RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    let app2 = app.clone();
    let spawned = std::thread::Builder::new().name("shot-watch".into()).spawn(move || {
        watch(&app2);
        RUNNING.store(false, Ordering::SeqCst);
        // Armado de novo bem na hora em que a thread terminava: começa outra.
        if ARMED.lock_ok().is_some() {
            ensure_watcher(&app2);
        }
    });
    if spawned.is_err() {
        RUNNING.store(false, Ordering::SeqCst);
        log("não foi possível iniciar a observação");
    }
}

/// Desarma, se ninguém armou de novo desde `gen`.
fn disarm(gen: u64) {
    let mut a = ARMED.lock_ok();
    if GENERATION.load(Ordering::SeqCst) == gen {
        *a = None;
    }
}

fn watch(app: &AppHandle) {
    let mut gen = u64::MAX;
    let mut base: Option<Baseline> = None;
    let mut found: Option<Shot> = None;
    let mut grace_until: Option<Instant> = None;
    let mut tick = 0u32;
    loop {
        std::thread::sleep(TICK);
        tick += 1;
        let g = GENERATION.load(Ordering::SeqCst);
        let deadline = {
            let a = ARMED.lock_ok();
            let Some(a) = a.as_ref() else { return };
            if g != gen {
                // Armado de novo: recomeça com a foto nova (um print achado e ainda não mostrado vale).
                base = Some(a.base.clone());
                gen = g;
            }
            a.deadline
        };
        let b = base.as_mut().expect("foto de antes");
        if found.is_none() && Instant::now() >= deadline {
            disarm(gen);
            return;
        }
        let seq = clip::sequence();
        if found.is_none() && seq != b.seq {
            // Lê uma vez por mudança (conteúdo que não é imagem não é relido a cada 250 ms).
            // Área de transferência ocupada por outro app: tenta de novo no próximo tique.
            let read = clip::read_image();
            if !matches!(read, Err(clip::Busy)) {
                b.seq = seq;
            }
            if let Ok(Some(img)) = read {
                match make_shot(img, None, "clipboard") {
                    Ok(s) => {
                        found = Some(s);
                        grace_until = Some(Instant::now() + FILE_GRACE);
                    }
                    Err(e) => log(&e),
                }
            }
        }
        if tick.is_multiple_of(2) {
            let since = b.since;
            for (dir, before) in b.dirs.iter_mut() {
                let now = detect::snapshot(dir);
                if let Some(path) = detect::new_file(before, &now, since) {
                    if wait_complete(&path) {
                        match &mut found {
                            // Já veio pela área de transferência: só guarda onde o arquivo ficou.
                            Some(s) => s.path = Some(path.clone()),
                            None => match image::decode_file(&path).and_then(|img| make_shot(img, Some(path.clone()), "file")) {
                                Ok(s) => found = Some(s),
                                Err(e) => log(&e),
                            },
                        }
                        grace_until = Some(Instant::now());
                    }
                }
                *before = now;
            }
        }
        if let (Some(_), Some(gu)) = (&found, grace_until) {
            if Instant::now() >= gu {
                disarm(gen);
                show(app, found.take().expect("print encontrado"));
                return;
            }
        }
    }
}

/// Espera o arquivo parar de crescer (o app ainda pode estar gravando).
fn wait_complete(path: &Path) -> bool {
    let size = |p: &Path| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    let mut last = size(path);
    for _ in 0..8 {
        std::thread::sleep(Duration::from_millis(150));
        let now = size(path);
        if now == last && now > 0 {
            return true;
        }
        last = now;
    }
    false
}

fn log(msg: &str) {
    crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("preview de captura: {msg}"));
}

// ---------------------------------------------------------------------------
// Janelas (criadas no primeiro uso; escondidas = página suspensa)

fn window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(label) {
        return Ok(w);
    }
    let pin = label == PIN;
    let url = if pin { "shot.html?pin=1" } else { "shot.html" };
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(if pin { tr!("Kira Radial — Print fixado", "Kira Radial — Pinned screenshot") } else { tr!("Kira Radial — Print", "Kira Radial — Screenshot") })
        .inner_size(if pin { 480.0 } else { 360.0 }, if pin { 320.0 } else { 300.0 })
        .decorations(false)
        .transparent(!pin)
        .shadow(pin)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(pin)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| trf!("não foi possível abrir a janela do print: {e}", "couldn't open the screenshot window: {e}"))
}

fn set_visible(w: &WebviewWindow, visible: bool) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE, SW_SHOWNOACTIVATE};
    if visible {
        crate::webvis::set(w, true, false);
    }
    if let Ok(h) = w.hwnd() {
        unsafe {
            let _ = ShowWindow(HWND(h.0 as *mut _), if visible { SW_SHOWNOACTIVATE } else { SW_HIDE });
        }
    }
    if !visible {
        crate::webvis::set(w, false, true);
    }
}

/// Canto da área de trabalho (px físicos) onde a janela de `w`×`h` fica, com margem.
pub fn corner_position(work: crate::positioning::Rect, w: i32, h: i32, corner: ShotCorner, margin: i32) -> (i32, i32) {
    let x = match corner {
        ShotCorner::BottomRight | ShotCorner::TopRight => work.right - w - margin,
        ShotCorner::BottomLeft | ShotCorner::TopLeft => work.left + margin,
    };
    let y = match corner {
        ShotCorner::BottomRight | ShotCorner::BottomLeft => work.bottom - h - margin,
        ShotCorner::TopRight | ShotCorner::TopLeft => work.top + margin,
    };
    (x.max(work.left), y.max(work.top))
}

/// Área de trabalho e escala do monitor onde está o mouse.
fn cursor_work() -> (crate::positioning::Rect, f64) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    unsafe {
        let mut pt = POINT::default();
        let _ = GetCursorPos(&mut pt);
        let hmon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
            return (crate::positioning::monitors().1, 1.0);
        }
        let (mut dx, mut dy) = (96u32, 96u32);
        let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
        let w = mi.rcWork;
        (crate::positioning::Rect { left: w.left, top: w.top, right: w.right, bottom: w.bottom }, dx as f64 / 96.0)
    }
}

/// Mostra o preview do print (substitui o anterior).
pub fn show(app: &AppHandle, shot: Shot) {
    let cfg = screenshot_cfg(app);
    let inf = info(&shot, &cfg);
    *CURRENT.lock_ok() = Some(shot);
    let w = match window(app, SHOT) {
        Ok(w) => w,
        Err(e) => return log(&e),
    };
    if crate::qa::ENABLED {
        crate::qa::keep_offscreen(&w);
    } else {
        let (work, scale) = cursor_work();
        let (ww, wh) = ((360.0 * scale) as i32, (300.0 * scale) as i32);
        let (x, y) = corner_position(work, ww, wh, cfg.corner, (16.0 * scale) as i32);
        let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
    }
    set_visible(&w, true);
    let _ = app.emit_to(SHOT, "shot:new", inf);
}

// ---------------------------------------------------------------------------
// Área de transferência (leitura/escrita de imagem)

mod clip {
    use super::image::{self, Rgba};
    use windows::core::w;
    use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
    use windows::Win32::System::DataExchange::*;
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};

    const CF_DIB: u32 = 8;
    const CF_DIBV5: u32 = 17;

    pub fn sequence() -> u32 {
        unsafe { GetClipboardSequenceNumber() }
    }

    fn open() -> bool {
        // Outro app pode estar com a área de transferência aberta neste instante.
        for _ in 0..10 {
            if unsafe { OpenClipboard(None) }.is_ok() {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(30));
        }
        false
    }

    /// Outro programa está com a área de transferência aberta (vale tentar de novo).
    #[derive(Debug, PartialEq)]
    pub struct Busy;

    /// Imagem atual da área de transferência (respeita os pedidos de "não monitorar").
    pub fn read_image() -> Result<Option<Rgba>, Busy> {
        unsafe {
            let fmt = if IsClipboardFormatAvailable(CF_DIBV5).is_ok() {
                CF_DIBV5
            } else if IsClipboardFormatAvailable(CF_DIB).is_ok() {
                CF_DIB
            } else {
                return Ok(None);
            };
            let fmt_exclude = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
            if IsClipboardFormatAvailable(fmt_exclude).is_ok() {
                return Ok(None);
            }
            if !open() {
                return Err(Busy);
            }
            let bytes = (|| {
                let h = GetClipboardData(fmt).ok()?;
                let g = HGLOBAL(h.0);
                let p = GlobalLock(g) as *const u8;
                if p.is_null() {
                    return None;
                }
                let bytes = std::slice::from_raw_parts(p, GlobalSize(g)).to_vec();
                let _ = GlobalUnlock(g);
                Some(bytes)
            })();
            let _ = CloseClipboard();
            Ok(bytes.and_then(|b| image::dib_to_rgba(&b)))
        }
    }

    fn global(data: &[u8]) -> Result<HGLOBAL, String> {
        unsafe {
            let g = GlobalAlloc(GMEM_MOVEABLE, data.len()).map_err(|e| e.to_string())?;
            let p = GlobalLock(g) as *mut u8;
            if p.is_null() {
                let _ = GlobalFree(Some(g));
                return Err(tr!("memória indisponível", "out of memory").into());
            }
            std::ptr::copy_nonoverlapping(data.as_ptr(), p, data.len());
            let _ = GlobalUnlock(g);
            Ok(g)
        }
    }

    /// Copia a imagem (CF_DIB para todos os apps + "PNG" para os que preferem).
    pub fn write_image(img: &Rgba) -> Result<(), String> {
        let png_bytes = image::encode_png(img)?;
        let dib = global(&image::rgba_to_dib(img))?;
        let png = match global(&png_bytes) {
            Ok(g) => g,
            Err(e) => {
                unsafe { let _ = GlobalFree(Some(dib)); }
                return Err(e);
            }
        };
        unsafe {
            if !open() {
                let _ = GlobalFree(Some(dib));
                let _ = GlobalFree(Some(png));
                return Err(tr!("a área de transferência está ocupada por outro programa", "the clipboard is busy with another program").into());
            }
            let _ = EmptyClipboard();
            // Depois de SetClipboardData o Windows é o dono da memória; se falhar, ela é nossa.
            let r = SetClipboardData(CF_DIB, Some(HANDLE(dib.0))).map(|_| ()).map_err(|e| e.to_string());
            if r.is_err() {
                let _ = GlobalFree(Some(dib));
            }
            let fmt_png = RegisterClipboardFormatW(w!("PNG"));
            if SetClipboardData(fmt_png, Some(HANDLE(png.0))).is_err() {
                let _ = GlobalFree(Some(png));
            }
            let _ = CloseClipboard();
            r
        }
    }
}

// ---------------------------------------------------------------------------
// Comandos do preview

fn with_shot<T>(id: u64, f: impl FnOnce(&Shot) -> Result<T, String>) -> Result<T, String> {
    let cur = CURRENT.lock_ok();
    let pin = PINNED.lock_ok();
    let s = cur.as_ref().filter(|s| s.id == id).or(pin.as_ref().filter(|s| s.id == id));
    f(s.ok_or(tr!("este print não está mais disponível", "this screenshot is no longer available"))?)
}

#[tauri::command]
pub fn shot_current(app: AppHandle) -> Option<ShotInfo> {
    let cfg = screenshot_cfg(&app);
    CURRENT.lock_ok().as_ref().map(|s| info(s, &cfg))
}

#[tauri::command]
pub async fn shot_copy(id: u64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || with_shot(id, |s| clip::write_image(&s.img))).await.map_err(|e| e.to_string())?
}

/// Grava em PNG (acrescenta .png se faltar). Devolve o caminho final.
#[tauri::command]
pub async fn shot_save(id: u64, path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut p = PathBuf::from(path.trim());
        if p.as_os_str().is_empty() {
            return Err(tr!("caminho vazio", "empty path").into());
        }
        if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("png")) {
            p.set_extension("png");
        }
        let png = with_shot(id, |s| image::encode_png(&s.img))?;
        std::fs::write(&p, png).map_err(|e| trf!("não foi possível salvar: {e}", "couldn't save: {e}"))?;
        Ok(p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn shot_open_folder(id: u64) -> Result<(), String> {
    let path = with_shot(id, |s| s.path.clone().ok_or(tr!("este print não foi salvo em arquivo", "this screenshot wasn't saved to a file").into()))?;
    std::process::Command::new("explorer.exe")
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Abre no Paint (o arquivo original, ou uma cópia temporária em PNG).
#[tauri::command]
pub async fn shot_edit(id: u64) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = with_shot(id, |s| match &s.path {
            Some(p) if p.exists() => Ok(p.clone()),
            _ => {
                let dir = std::env::temp_dir().join("Kira-Radial");
                let _ = std::fs::create_dir_all(&dir);
                // Os temporários anteriores não acumulam (um aberto no Paint só falha em silêncio).
                for e in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
                    let n = e.file_name().to_string_lossy().into_owned();
                    if n.starts_with("print-") && n.ends_with(".png") {
                        let _ = std::fs::remove_file(e.path());
                    }
                }
                let p = dir.join(format!("print-{}.png", s.id));
                std::fs::write(&p, image::encode_png(&s.img)?).map_err(|e| e.to_string())?;
                Ok(p)
            }
        })?;
        std::process::Command::new("mspaint.exe").arg(&path).spawn().map(|_| ()).map_err(|e| trf!("não foi possível abrir o Paint: {e}", "couldn't open Paint: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn shot_dismiss(app: AppHandle) {
    if let Some(w) = app.get_webview_window(SHOT) {
        set_visible(&w, false);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PinImage {
    pub id: u64,
    pub width: u32,
    pub height: u32,
    pub src: String,
}

/// Fixa o print numa janela "sempre no topo" (substitui o fixado anterior).
#[tauri::command]
pub async fn shot_pin(app: AppHandle, id: u64) -> Result<(), String> {
    let (img, path) = with_shot(id, |s| Ok((s.img.clone(), s.path.clone())))?;
    let shot = Shot { id, thumb: String::new(), img, path, source: "pin" };
    let (w, h) = (shot.img.width as f64, shot.img.height as f64);
    *PINNED.lock_ok() = Some(shot);
    let win = window(&app, PIN)?;
    let (work, scale) = cursor_work();
    // Até 60% da área de trabalho, mantendo a proporção.
    let fit = ((work.width() as f64 * 0.6 / w).min(work.height() as f64 * 0.6 / h)).min(1.0);
    let (pw, ph) = ((w * fit).max(80.0), (h * fit).max(60.0));
    let _ = win.set_size(tauri::PhysicalSize::new(pw as u32, ph as u32));
    if crate::qa::ENABLED {
        crate::qa::keep_offscreen(&win);
    } else {
        let x = work.left + (work.width() - pw as i32) / 2;
        let y = work.top + (work.height() - ph as i32) / 2;
        let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    }
    let _ = scale;
    set_visible(&win, true);
    if !crate::qa::ENABLED {
        let _ = win.set_focus();
    }
    let _ = app.emit_to(PIN, "shot:pin", id);
    shot_dismiss(app);
    Ok(())
}

#[tauri::command]
pub async fn shot_pin_image() -> Result<Option<PinImage>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let pin = PINNED.lock_ok();
        let Some(s) = pin.as_ref() else { return Ok(None) };
        Ok(Some(PinImage { id: s.id, width: s.img.width, height: s.img.height, src: image::png_data_url(&s.img)? }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn shot_unpin(app: AppHandle) {
    *PINNED.lock_ok() = None;
    if let Some(w) = app.get_webview_window(PIN) {
        set_visible(&w, false);
    }
}

/// Kira de teste: um "print" gerado (degradê com faixas) no lugar de uma captura real.
#[cfg(feature = "qa")]
#[tauri::command]
pub async fn qa_fake_shot(app: AppHandle, width: u32, height: u32) -> Result<u64, String> {
    let (w, h) = (width.clamp(8, 4000), height.clamp(8, 4000));
    let mut pixels = Vec::with_capacity((w * h * 4) as usize);
    for y in 0..h {
        for x in 0..w {
            let band = if (y / 20) % 2 == 0 { 40 } else { 0 };
            pixels.extend_from_slice(&[(x * 255 / w) as u8, (y * 255 / h) as u8, 160 + band, 255]);
        }
    }
    let shot = make_shot(Rgba { width: w, height: h, pixels }, None, "clipboard")?;
    let id = shot.id;
    show(&app, shot);
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::positioning::Rect;

    #[test]
    fn preview_no_canto_escolhido_dentro_da_area_de_trabalho() {
        let work = Rect { left: 0, top: 0, right: 1920, bottom: 1040 };
        assert_eq!(corner_position(work, 360, 300, ShotCorner::BottomRight, 16), (1544, 724));
        assert_eq!(corner_position(work, 360, 300, ShotCorner::TopLeft, 16), (16, 16));
        assert_eq!(corner_position(work, 360, 300, ShotCorner::BottomLeft, 16), (16, 724));
        let second = Rect { left: 1920, top: -200, right: 3840, bottom: 880 };
        assert_eq!(corner_position(second, 360, 300, ShotCorner::TopRight, 16), (3464, -184));
        // Tela menor que a janela: não sai pela esquerda/topo.
        let tiny = Rect { left: 0, top: 0, right: 200, bottom: 150 };
        assert_eq!(corner_position(tiny, 360, 300, ShotCorner::BottomRight, 16), (0, 0));
    }

    #[test]
    fn print_novo_tem_id_e_miniatura() {
        let img = Rgba { width: 2000, height: 1000, pixels: vec![128; 2000 * 1000 * 4] };
        let a = make_shot(img.clone(), None, "clipboard").unwrap();
        let b = make_shot(img, Some("x.png".into()), "file").unwrap();
        assert!(b.id > a.id);
        assert!(a.thumb.starts_with("data:image/png;base64,"));
        let cfg = Screenshot::default();
        let i = info(&b, &cfg);
        assert_eq!((i.width, i.height, i.path.as_deref(), i.source), (2000, 1000, Some("x.png"), "file"));
    }

    #[test]
    fn pastas_sem_duplicar_e_sem_vazias() {
        let cfg = Screenshot { folders: vec!["".into(), "C:/Prints".into(), "C:/Prints".into()], ..Screenshot::default() };
        let f = folders(&cfg);
        assert_eq!(f.iter().filter(|p| p.as_path() == Path::new("C:/Prints")).count(), 1);
        assert!(!f.iter().any(|p| p.as_os_str().is_empty()));
    }
}
