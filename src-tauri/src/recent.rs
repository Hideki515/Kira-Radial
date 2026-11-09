//! Arquivos recentes do Windows: atalhos (.lnk) em %APPDATA%\Microsoft\Windows\Recent,
//! do mais novo para o mais antigo, resolvidos para o arquivo de verdade (só arquivos que
//! ainda existem; pastas ficam de fora).

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub const MAX_RECENT: usize = 8;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    /// Extensão em minúsculas, sem ponto ("pdf", "docx"...).
    pub ext: String,
}

/// Ordena por data (mais novo primeiro), tira duplicados e alvos que não existem.
pub fn pick(mut entries: Vec<(PathBuf, SystemTime)>, exists: impl Fn(&Path) -> bool) -> Vec<RecentFile> {
    entries.sort_by_key(|e| std::cmp::Reverse(e.1));
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for (target, _) in entries {
        let key = target.to_string_lossy().to_lowercase();
        if !seen.insert(key) || !exists(&target) {
            continue;
        }
        let name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let ext = target.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        out.push(RecentFile { path: target.to_string_lossy().into_owned(), name, ext });
        if out.len() >= MAX_RECENT {
            break;
        }
    }
    out
}

/// Alvo de um atalho .lnk (COM IShellLinkW). Precisa de COM inicializado na thread.
fn resolve_lnk(lnk: &Path) -> Option<PathBuf> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = link.cast().ok()?;
        file.Load(&HSTRING::from(lnk.as_os_str()), STGM_READ).ok()?;
        let mut buf = [0u16; 1024];
        link.GetPath(&mut buf, std::ptr::null_mut(), 0).ok()?;
        let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        (len > 0).then(|| PathBuf::from(String::from_utf16_lossy(&buf[..len])))
    }
}

fn recent_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("Microsoft").join("Windows").join("Recent"))
}

/// Arquivos abertos recentemente (até `MAX_RECENT`). Chame numa thread bloqueante.
pub fn list() -> Vec<RecentFile> {
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
    let Some(dir) = recent_dir() else { return Vec::new() };
    let Ok(read) = std::fs::read_dir(&dir) else { return Vec::new() };
    // Só os 40 atalhos mais novos: a pasta pode ter centenas e resolver .lnk custa.
    let mut lnks: Vec<(PathBuf, SystemTime)> = read
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")))
        .filter_map(|e| Some((e.path(), e.metadata().ok()?.modified().ok()?)))
        .collect();
    lnks.sort_by_key(|e| std::cmp::Reverse(e.1));
    lnks.truncate(40);

    let init = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let resolved: Vec<(PathBuf, SystemTime)> = lnks.into_iter().filter_map(|(l, t)| Some((resolve_lnk(&l)?, t))).collect();
    if init.is_ok() {
        unsafe { CoUninitialize() };
    }
    pick(resolved, |p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn t(secs: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(secs)
    }

    #[test]
    fn mais_novo_primeiro_sem_duplicados_e_sem_inexistentes() {
        let entries = vec![
            (PathBuf::from("C:/a/velho.txt"), t(10)),
            (PathBuf::from("C:/a/Novo.PDF"), t(30)),
            (PathBuf::from("C:/a/novo.pdf"), t(20)),
            (PathBuf::from("C:/a/sumiu.docx"), t(25)),
        ];
        let out = pick(entries, |p| !p.to_string_lossy().contains("sumiu"));
        assert_eq!(out.iter().map(|f| f.name.as_str()).collect::<Vec<_>>(), ["Novo.PDF", "velho.txt"]);
        assert_eq!(out[0].ext, "pdf");
    }

    #[test]
    fn limita_a_oito() {
        let entries = (0..20).map(|i| (PathBuf::from(format!("C:/x/{i}.txt")), t(i))).collect();
        assert_eq!(pick(entries, |_| true).len(), MAX_RECENT);
    }

    #[test]
    fn leitura_real_nao_falha() {
        let l = list();
        assert!(l.len() <= MAX_RECENT);
        assert!(l.iter().all(|f| Path::new(&f.path).is_file()));
    }
}
