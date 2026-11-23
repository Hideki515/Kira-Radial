//! Projetos recentes do VS Code (submenu automático): pastas e workspaces da lista
//! "Abrir recente" do próprio VS Code. Versões antigas guardam a lista no banco
//! `state.vscdb` (lido de uma cópia temporária, para nunca travar o arquivo do VS Code);
//! as atuais, no `storage.json` (dados do menu "Abrir recente"). Só caminhos locais
//! que ainda existem.

use serde::Serialize;
use std::path::{Path, PathBuf};

pub const MAX_PROJECTS: usize = 8;
const KEY: &str = "history.recentlyOpenedPathsList";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VsProject {
    /// Nome curto (última pasta, ou o arquivo .code-workspace sem extensão).
    pub name: String,
    /// Caminho local da pasta ou do .code-workspace.
    pub path: String,
    pub workspace: bool,
    /// Code.exe que abre o projeto.
    pub exe: String,
}

/// Decodifica %XX de uma URI (bytes UTF-8).
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// "file:///d%3A/Code/Kira" → "d:\Code\Kira"; "file://server/share/x" → "\\server\share\x".
/// Outros esquemas (vscode-remote, wsl...) → None.
pub fn file_uri_to_path(uri: &str) -> Option<String> {
    let rest = uri.strip_prefix("file://")?;
    let decoded = percent_decode(rest);
    let p = if let Some(local) = decoded.strip_prefix('/') {
        local.replace('/', "\\")
    } else if !decoded.is_empty() {
        format!("\\\\{}", decoded.replace('/', "\\"))
    } else {
        return None;
    };
    (!p.is_empty()).then_some(p)
}

fn short_name(path: &str, workspace: bool) -> String {
    let p = Path::new(path.trim_end_matches('\\'));
    let n = if workspace { p.file_stem() } else { p.file_name() };
    n.map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string())
}

/// Projetos (pastas e workspaces) do JSON da lista de recentes, na ordem do VS Code.
pub fn parse(json: &str, exe: &str, exists: impl Fn(&str) -> bool) -> Vec<VsProject> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else { return Vec::new() };
    let Some(entries) = v.get("entries").and_then(|e| e.as_array()) else { return Vec::new() };
    let paths = entries.iter().filter_map(|e| {
        // Arquivos soltos ficam de fora.
        if let Some(u) = e.get("folderUri").and_then(|u| u.as_str()) {
            file_uri_to_path(u).map(|p| (p, false))
        } else {
            let u = e.get("workspace").and_then(|w| w.get("configPath")).and_then(|u| u.as_str())?;
            file_uri_to_path(u).map(|p| (p, true))
        }
    });
    collect(paths, exe, exists)
}

/// Caminho local de uma URI já separada do VS Code ({scheme, authority, path}).
fn uri_parts_to_path(u: &serde_json::Value) -> Option<String> {
    if u.get("scheme")?.as_str()? != "file" {
        return None;
    }
    let path = u.get("path")?.as_str()?;
    let authority = u.get("authority").and_then(|a| a.as_str()).unwrap_or("");
    let local = path.replace('/', "\\");
    if !authority.is_empty() {
        return Some(format!("\\\\{authority}{local}"));
    }
    let local = local.strip_prefix('\\').unwrap_or(&local).to_string();
    (!local.is_empty()).then_some(local)
}

/// Lista do `storage.json` (VS Code atual): itens "openRecentFolder"/"openRecentWorkspace"
/// do menu "Abrir recente", na ordem do menu.
pub fn parse_storage(json: &str, exe: &str, exists: impl Fn(&str) -> bool) -> Vec<VsProject> {
    fn walk<'a>(v: &'a serde_json::Value, out: &mut Vec<(&'a serde_json::Value, bool)>) {
        match v {
            serde_json::Value::Object(m) => {
                match m.get("id").and_then(|i| i.as_str()) {
                    Some("openRecentFolder") => {
                        if let Some(u) = m.get("uri") {
                            out.push((u, false));
                        }
                    }
                    Some("openRecentWorkspace") => {
                        if let Some(u) = m.get("uri") {
                            out.push((u, true));
                        }
                    }
                    _ => {}
                }
                for x in m.values() {
                    walk(x, out);
                }
            }
            serde_json::Value::Array(a) => a.iter().for_each(|x| walk(x, out)),
            _ => {}
        }
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(json) else { return Vec::new() };
    let Some(menu) = v.get("lastKnownMenubarData") else { return Vec::new() };
    let mut found = Vec::new();
    walk(menu, &mut found);
    collect(found.into_iter().filter_map(|(u, ws)| uri_parts_to_path(u).map(|p| (p, ws))), exe, exists)
}

/// Tira repetidos e caminhos que não existem, até `MAX_PROJECTS`.
fn collect(paths: impl Iterator<Item = (String, bool)>, exe: &str, exists: impl Fn(&str) -> bool) -> Vec<VsProject> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for (path, workspace) in paths {
        if !seen.insert(path.to_lowercase()) || !exists(&path) {
            continue;
        }
        out.push(VsProject { name: short_name(&path, workspace), path, workspace, exe: exe.to_string() });
        if out.len() >= MAX_PROJECTS {
            break;
        }
    }
    out
}

/// Instalações conhecidas: (pasta globalStorage do VS Code, Code.exe).
fn installs() -> Vec<(PathBuf, PathBuf)> {
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    let mut out = Vec::new();
    for (data, folder, exe) in [("Code", "Microsoft VS Code", "Code.exe"), ("Code - Insiders", "Microsoft VS Code Insiders", "Code - Insiders.exe")] {
        let Some(appdata) = env("APPDATA") else { continue };
        let candidates = [env("LOCALAPPDATA").map(|p| p.join("Programs").join(folder).join(exe)), env("ProgramFiles").map(|p| p.join(folder).join(exe))];
        if let Some(exe) = candidates.into_iter().flatten().find(|p| p.is_file()) {
            out.push((appdata.join(data).join("User").join("globalStorage"), exe));
        }
    }
    out
}

/// Projetos recentes da primeira instalação do VS Code encontrada. Chame numa thread bloqueante.
pub fn list() -> Result<Vec<VsProject>, String> {
    let exists = |p: &str| Path::new(p).exists();
    for (dir, exe) in installs() {
        let exe = exe.to_string_lossy();
        // VS Code atual: storage.json.
        if let Ok(text) = std::fs::read_to_string(dir.join("storage.json")) {
            let got = parse_storage(&text, &exe, exists);
            if !got.is_empty() {
                return Ok(got);
            }
        }
        // Versões antigas: banco state.vscdb (cópia temporária: o VS Code pode estar gravando nele).
        let db = dir.join("state.vscdb");
        if db.is_file() {
            let tmp = std::env::temp_dir().join(format!("kira-vscode-{}.db", std::process::id()));
            std::fs::copy(&db, &tmp).map_err(|e| trf!("não foi possível ler o histórico do VS Code: {e}", "couldn't read the VS Code history: {e}"))?;
            let r = crate::sqlite::query_text(&tmp, &format!("SELECT value FROM ItemTable WHERE key = '{KEY}'"));
            let _ = std::fs::remove_file(&tmp);
            let got = parse(&r?.unwrap_or_default(), &exe, exists);
            if !got.is_empty() {
                return Ok(got);
            }
        }
    }
    Ok(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uri_para_caminho() {
        assert_eq!(file_uri_to_path("file:///d%3A/Code/Kira-Radial").as_deref(), Some("d:\\Code\\Kira-Radial"));
        assert_eq!(file_uri_to_path("file:///c%3A/Users/Ana/Meu%20Projeto%20%C3%A7").as_deref(), Some("c:\\Users\\Ana\\Meu Projeto ç"));
        assert_eq!(file_uri_to_path("file://server/share/proj").as_deref(), Some("\\\\server\\share\\proj"));
        assert_eq!(file_uri_to_path("vscode-remote://wsl%2Bubuntu/home/x"), None);
        assert_eq!(file_uri_to_path("file://"), None);
        // %XX quebrado no fim não derruba
        assert_eq!(file_uri_to_path("file:///c%3A/a%2").as_deref(), Some("c:\\a%2"));
    }

    #[test]
    fn lista_pastas_e_workspaces_sem_arquivos_nem_remotos() {
        let json = r#"{"entries":[
            {"folderUri":"file:///d%3A/Code/Kira-Radial"},
            {"fileUri":"file:///d%3A/notas.txt"},
            {"workspace":{"id":"x","configPath":"file:///d%3A/ws/Trabalho.code-workspace"}},
            {"folderUri":"vscode-remote://wsl%2Bubuntu/home/x"},
            {"folderUri":"file:///D%3A/Code/kira-radial"},
            {"folderUri":"file:///d%3A/Sumiu"}
        ]}"#;
        let got = parse(json, "C:\\Code.exe", |p| !p.contains("Sumiu"));
        assert_eq!(got.len(), 2, "{got:?}");
        assert_eq!(got[0], VsProject { name: "Kira-Radial".into(), path: "d:\\Code\\Kira-Radial".into(), workspace: false, exe: "C:\\Code.exe".into() });
        assert_eq!(got[1].name, "Trabalho");
        assert!(got[1].workspace);
    }

    #[test]
    fn storage_json_do_vscode_atual() {
        let json = r#"{"theme":"x","lastKnownMenubarData":{"menus":{"File":{"items":[
            {"id":"submenuitem.MenubarRecentMenu","label":"Open &&Recent","submenu":{"items":[
                {"id":"workbench.action.reopenClosedEditor","label":"&&Reopen Closed Editor"},
                {"id":"openRecentFolder","uri":{"$mid":1,"path":"/d:/Code/Udemy","scheme":"file"},"label":"D:\\Code\\Udemy"},
                {"id":"openRecentWorkspace","uri":{"$mid":1,"path":"/d:/ws/Time.code-workspace","scheme":"file"}},
                {"id":"openRecentFolder","uri":{"$mid":1,"path":"/home/x","scheme":"vscode-remote","authority":"wsl+ubuntu"}},
                {"id":"openRecentFolder","uri":{"$mid":1,"path":"/share/proj","scheme":"file","authority":"server"}},
                {"id":"openRecentFile","uri":{"$mid":1,"path":"/d:/notas.txt","scheme":"file"}},
                {"id":"openRecentFolder","uri":{"$mid":1,"path":"/d:/Code/Download/Site do portfólio","scheme":"file"}}
            ]}}
        ]}}}}"#;
        let got = parse_storage(json, "C:\\Code.exe", |_| true);
        let paths: Vec<_> = got.iter().map(|p| (p.path.as_str(), p.name.as_str(), p.workspace)).collect();
        assert_eq!(paths, vec![
            ("d:\\Code\\Udemy", "Udemy", false),
            ("d:\\ws\\Time.code-workspace", "Time", true),
            ("\\\\server\\share\\proj", "proj", false),
            ("d:\\Code\\Download\\Site do portfólio", "Site do portfólio", false),
        ]);
        assert!(parse_storage("{}", "x", |_| true).is_empty());
        assert!(parse_storage("nada", "x", |_| true).is_empty());
    }

    #[test]
    fn json_invalido_ou_vazio_da_lista_vazia_e_respeita_o_maximo() {
        assert!(parse("", "x", |_| true).is_empty());
        assert!(parse("{\"entries\":5}", "x", |_| true).is_empty());
        let many: Vec<String> = (0..20).map(|i| format!("{{\"folderUri\":\"file:///c%3A/p{i}\"}}")).collect();
        let json = format!("{{\"entries\":[{}]}}", many.join(","));
        assert_eq!(parse(&json, "x", |_| true).len(), MAX_PROJECTS);
    }
}
