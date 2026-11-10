//! Backups automáticos da configuração: antes de cada gravação que MUDA o conteúdo, a
//! versão anterior vai para `backups/config-AAAAMMDD-HHMMSS.json` (na pasta de dados).
//! Mantém as 10 mais recentes. Só local; nada sai do PC.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

pub const KEEP: usize = 10;
/// Config que não carregou (renomeada por config::load): também pode ser restaurada.
pub const INVALID_NAME: &str = "config.invalid.json";

pub fn backups_dir() -> PathBuf {
    crate::config::config_dir().join("backups")
}

/// "config-20261110-143005.json" (com sufixo -2, -3... se já existir no mesmo segundo).
pub fn backup_name(y: u16, mo: u16, d: u16, h: u16, mi: u16, s: u16, n: u32) -> String {
    let base = format!("config-{y:04}{mo:02}{d:02}-{h:02}{mi:02}{s:02}");
    if n <= 1 {
        format!("{base}.json")
    } else {
        format!("{base}-{n}.json")
    }
}

/// Nome aceito para leitura: só backups gerados aqui (nada de "..", barras ou caminhos).
pub fn valid_name(name: &str) -> bool {
    if name == INVALID_NAME {
        return true;
    }
    let Some(rest) = name.strip_prefix("config-").and_then(|r| r.strip_suffix(".json")) else { return false };
    let b = rest.as_bytes();
    if b.len() < 15 {
        return false;
    }
    let stamp_ok = b[..8].iter().all(u8::is_ascii_digit) && b[8] == b'-' && b[9..15].iter().all(u8::is_ascii_digit);
    let suffix_ok = match rest.get(15..) {
        Some("") => true,
        Some(s) => s.strip_prefix('-').is_some_and(|n| !n.is_empty() && n.bytes().all(|c| c.is_ascii_digit())),
        None => false,
    };
    stamp_ok && suffix_ok
}

/// Chave de ordenação cronológica: (data-hora, sufixo). Sem sufixo = 1. Evita a ordem
/// lexical, em que "…-2.json" viria antes de "….json" e "-10" antes de "-9".
pub fn sort_key(name: &str) -> (String, u32) {
    let rest = name.trim_start_matches("config-").trim_end_matches(".json");
    let stamp = rest.get(..15).unwrap_or(rest).to_string();
    let n = rest.get(16..).and_then(|s| s.parse().ok()).unwrap_or(1);
    (stamp, n)
}

/// Quais apagar para sobrar `keep` (os mais antigos saem).
pub fn to_prune(mut names: Vec<String>, keep: usize) -> Vec<String> {
    names.retain(|n| n != INVALID_NAME && valid_name(n));
    names.sort_by_key(|n| sort_key(n));
    let extra = names.len().saturating_sub(keep);
    names.into_iter().take(extra).collect()
}

/// Campos que mudam sozinhos (arrastar/encaixar/esconder o ícone): não valem um backup,
/// senão alguns arrastos apagariam todo o histórico de mudanças de verdade.
const VOLATILE: [&str; 4] = ["x", "y", "docked", "hidden"];

fn strip_volatile(mut v: serde_json::Value) -> serde_json::Value {
    if let Some(orb) = v.pointer_mut("/launcher/orb").and_then(|o| o.as_object_mut()) {
        for k in VOLATILE {
            orb.remove(k);
        }
    }
    v
}

/// A gravação muda algo além da posição/estado do ícone? (JSON inválido = sim.)
pub fn significant_change(previous: &str, next: &str) -> bool {
    match (serde_json::from_str(previous), serde_json::from_str(next)) {
        (Ok(a), Ok(b)) => strip_volatile(a) != strip_volatile(b),
        _ => previous != next,
    }
}

fn now_parts() -> (u16, u16, u16, u16, u16, u16) {
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    (t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond)
}

/// Guarda `previous` (o conteúdo que vai ser substituído) e limpa os antigos.
pub fn store(previous: &str) -> Result<(), String> {
    let dir = backups_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (y, mo, d, h, mi, s) = now_parts();
    let mut n = 1;
    let path = loop {
        let p = dir.join(backup_name(y, mo, d, h, mi, s, n));
        if !p.exists() {
            break p;
        }
        n += 1;
    };
    fs::write(&path, previous).map_err(|e| e.to_string())?;
    let names: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .collect();
    for old in to_prune(names, KEEP) {
        let _ = fs::remove_file(dir.join(old));
    }
    Ok(())
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSummary {
    pub name: String,
    pub items: usize,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    /// Data de modificação (ms desde 1970).
    pub modified: u64,
    pub size: u64,
    /// O JSON abre? (config.invalid.json normalmente não)
    pub valid: bool,
    pub profiles: Vec<ProfileSummary>,
}

fn summarize(text: &str) -> (bool, Vec<ProfileSummary>) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(text) else { return (false, Vec::new()) };
    let profiles = v["profiles"]
        .as_array()
        .map(|ps| {
            ps.iter()
                .map(|p| ProfileSummary {
                    name: p["name"].as_str().unwrap_or("?").to_string(),
                    items: p["items"].as_array().map_or(0, |a| a.len()),
                })
                .collect()
        })
        .unwrap_or_default();
    (true, profiles)
}

fn info(path: &Path, name: String) -> Option<BackupInfo> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64);
    let text = fs::read_to_string(path).unwrap_or_default();
    let (valid, profiles) = summarize(&text);
    Some(BackupInfo { name, modified, size: meta.len(), valid, profiles })
}

/// Backups disponíveis, mais recente primeiro (inclui config.invalid.json, se existir).
pub fn list() -> Vec<BackupInfo> {
    let mut out: Vec<BackupInfo> = fs::read_dir(backups_dir())
        .map(|rd| {
            rd.filter_map(|e| {
                let e = e.ok()?;
                let name = e.file_name().into_string().ok()?;
                (valid_name(&name) && name != INVALID_NAME).then(|| info(&e.path(), name))?
            })
            .collect()
        })
        .unwrap_or_default();
    out.sort_by_key(|b| std::cmp::Reverse(sort_key(&b.name)));
    let invalid = crate::config::config_dir().join(INVALID_NAME);
    if let Some(i) = info(&invalid, INVALID_NAME.into()) {
        out.push(i);
    }
    out
}

/// Conteúdo de um backup (só nomes válidos; nada fora da pasta de dados).
pub fn read(name: &str) -> Result<String, String> {
    if !valid_name(name) {
        return Err("nome de backup inválido".into());
    }
    let path = if name == INVALID_NAME { crate::config::config_dir().join(name) } else { backups_dir().join(name) };
    fs::read_to_string(path).map_err(|e| format!("não foi possível ler o backup: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nome_ordena_por_data_e_desempata_no_mesmo_segundo() {
        assert_eq!(backup_name(2026, 11, 10, 14, 30, 5, 1), "config-20261110-143005.json");
        assert_eq!(backup_name(2026, 1, 2, 3, 4, 5, 2), "config-20260102-030405-2.json");
        assert!(backup_name(2026, 1, 2, 3, 4, 5, 1) < backup_name(2026, 1, 2, 3, 4, 6, 1));
    }

    #[test]
    fn so_aceita_nomes_gerados_aqui() {
        assert!(valid_name("config-20261110-143005.json"));
        assert!(valid_name("config-20261110-143005-3.json"));
        assert!(valid_name(INVALID_NAME));
        for bad in ["../config.json", "config-2026.json", "config-20261110-143005.json.exe", "x/config-20261110-143005.json", "config-20261110-1430a5.json", "config-20261110-143005-.json", "C:\\config-20261110-143005.json"] {
            assert!(!valid_name(bad), "{bad}");
        }
        assert!(read("../../segredo.txt").is_err());
    }

    #[test]
    fn mantem_os_10_mais_recentes() {
        let names: Vec<String> = (1..=13).map(|i| backup_name(2026, 1, i, 0, 0, 0, 1)).chain(["lixo.txt".to_string()]).collect();
        let del = to_prune(names, KEEP);
        assert_eq!(del, vec![backup_name(2026, 1, 1, 0, 0, 0, 1), backup_name(2026, 1, 2, 0, 0, 0, 1), backup_name(2026, 1, 3, 0, 0, 0, 1)]);
        assert!(to_prune(vec!["config-20260101-000000.json".into()], KEEP).is_empty());
    }

    #[test]
    fn mesmo_segundo_ordena_pelo_sufixo() {
        let base = backup_name(2026, 1, 1, 0, 0, 0, 1);
        let s2 = backup_name(2026, 1, 1, 0, 0, 0, 2);
        let s10 = backup_name(2026, 1, 1, 0, 0, 0, 10);
        assert!(sort_key(&base) < sort_key(&s2) && sort_key(&s2) < sort_key(&s10));
        // O mais antigo (sem sufixo) é o primeiro a sair.
        assert_eq!(to_prune(vec![s10.clone(), base.clone(), s2.clone()], 2), vec![base]);
    }

    #[test]
    fn arrastar_ou_esconder_o_icone_nao_gera_backup() {
        let a = r#"{"hotkey":{"accelerator":"Ctrl+Alt+Q"},"launcher":{"mode":"orb","orb":{"x":10,"y":20,"size":96,"docked":null,"hidden":false}}}"#;
        let moved = a.replace(r#""x":10"#, r#""x":900"#).replace("null", r#""left""#).replace("false", "true");
        assert!(!significant_change(a, &moved));
        let bigger = a.replace(r#""size":96"#, r#""size":120"#);
        assert!(significant_change(a, &bigger));
        let other_key = a.replace("Ctrl+Alt+Q", "Alt+Q");
        assert!(significant_change(a, &other_key));
        assert!(significant_change("{quebrado", a));
    }

    #[test]
    fn resumo_do_json() {
        let (ok, ps) = summarize(r#"{"profiles":[{"name":"Padrão","items":[1,2,3]},{"name":"VS","items":[]}]}"#);
        assert!(ok);
        assert_eq!((ps[0].name.as_str(), ps[0].items, ps[1].items), ("Padrão", 3, 0));
        assert!(!summarize("{quebrado").0);
    }
}
