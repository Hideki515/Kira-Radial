//! Navegadores instalados (registro do Windows) e abertura de sites num navegador escolhido,
//! com janela anônima e perfil (Chrome/Edge/Brave/Vivaldi) opcionais.
//!
//! Segurança: o endereço vai como **um único argumento** para o exe do navegador; só
//! `http(s)` sem espaços/aspas/controle — não dá para injetar opções na linha de comando.

use serde::Serialize;
use std::path::Path;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::System::Registry::{
    RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE,
    KEY_READ, RRF_RT_REG_SZ,
};

/// Valor de `browser` que força o navegador padrão do Windows (mesmo com um geral definido).
pub const SYSTEM: &str = "system";

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Family {
    Chrome,
    Edge,
    Brave,
    Vivaldi,
    Opera,
    Firefox,
    Other,
}

impl Family {
    pub fn from_exe(exe: &str) -> Family {
        let f = Path::new(exe).file_name().map(|n| n.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        match f.as_str() {
            "chrome.exe" => Family::Chrome,
            "msedge.exe" => Family::Edge,
            "brave.exe" => Family::Brave,
            "vivaldi.exe" => Family::Vivaldi,
            "opera.exe" | "launcher.exe" if exe.to_ascii_lowercase().contains("opera") => Family::Opera,
            // Derivados do Firefox aceitam as mesmas opções.
            "firefox.exe" | "zen.exe" | "librewolf.exe" | "waterfox.exe" | "floorp.exe" => Family::Firefox,
            _ => Family::Other,
        }
    }

    /// Opção de janela anônima; `None` = navegador desconhecido (não suportado).
    pub fn private_flag(self) -> Option<&'static str> {
        match self {
            Family::Chrome | Family::Brave | Family::Vivaldi => Some("--incognito"),
            Family::Edge => Some("--inprivate"),
            Family::Opera => Some("--private"),
            Family::Firefox => Some("-private-window"),
            Family::Other => None,
        }
    }

    /// Pasta "User Data" dos navegadores Chromium com perfis (relativa a %LOCALAPPDATA%).
    fn user_data(self) -> Option<&'static str> {
        match self {
            Family::Chrome => Some(r"Google\Chrome\User Data"),
            Family::Edge => Some(r"Microsoft\Edge\User Data"),
            Family::Brave => Some(r"BraveSoftware\Brave-Browser\User Data"),
            Family::Vivaldi => Some(r"Vivaldi\User Data"),
            _ => None,
        }
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Browser {
    /// Nome da chave em `Clients\StartMenuInternet` (ex.: "Google Chrome").
    pub id: String,
    pub name: String,
    pub exe: String,
    pub family: Family,
    pub is_default: bool,
    /// Ícone do exe (data URL PNG).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserProfile {
    /// Pasta do perfil ("Default", "Profile 1"...), usada em --profile-directory.
    pub dir: String,
    pub name: String,
}

// ---------------------------------------------------------------------------
// Funções puras

/// Endereço aceito para abrir num navegador: http(s), sem espaço, aspas ou caracteres de controle.
pub fn url_ok(url: &str) -> bool {
    let l = url.to_ascii_lowercase();
    (l.starts_with("http://") || l.starts_with("https://")) && url.len() <= 2048 && !url.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"')
}

/// Nome de pasta de perfil seguro (ex.: "Default", "Profile 3").
pub fn profile_ok(dir: &str) -> bool {
    !dir.is_empty() && dir.len() <= 64 && dir.chars().all(|c| c.is_ascii_alphanumeric() || c == ' ' || c == '_' || c == '-')
}

/// Argumentos para abrir `url` no navegador da família `f`.
pub fn build_args(f: Family, url: &str, private: bool, profile: Option<&str>) -> Result<Vec<String>, String> {
    if !url_ok(url) {
        return Err("endereço inválido para abrir no navegador (use http:// ou https://, sem espaços)".into());
    }
    let mut a = Vec::new();
    if let Some(p) = profile.filter(|p| !p.is_empty()) {
        if f.user_data().is_none() {
            return Err("este navegador não aceita escolher o perfil".into());
        }
        if !profile_ok(p) {
            return Err("nome de perfil inválido".into());
        }
        a.push(format!("--profile-directory={p}"));
    }
    if private {
        a.push(f.private_flag().ok_or("este navegador não tem janela anônima conhecida")?.to_string());
    }
    a.push(url.to_string());
    Ok(a)
}

/// Caminho do exe numa linha de comando do registro: `"C:\x\chrome.exe" -- "%1"` → `C:\x\chrome.exe`.
pub fn exe_from_command(cmd: &str) -> Option<String> {
    let c = cmd.trim();
    let exe = if let Some(rest) = c.strip_prefix('"') {
        rest.split('"').next()?
    } else {
        // Sem aspas: até o ".exe".
        let i = c.to_ascii_lowercase().find(".exe")?;
        &c[..i + 4]
    };
    let exe = exe.trim();
    (!exe.is_empty() && exe.to_ascii_lowercase().ends_with(".exe")).then(|| exe.to_string())
}

/// Escolhe o navegador: pelo id; se sumiu (reinstalado), pelo nome.
pub fn pick<'a>(list: &'a [Browser], id: &str, name: Option<&str>) -> Option<&'a Browser> {
    list.iter()
        .find(|b| b.id.eq_ignore_ascii_case(id))
        .or_else(|| name.and_then(|n| list.iter().find(|b| b.name.eq_ignore_ascii_case(n))))
}

/// Perfis do "Local State" (JSON) de um navegador Chromium, em ordem alfabética do nome.
pub fn parse_profiles(local_state: &str) -> Vec<BrowserProfile> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(local_state) else { return Vec::new() };
    let Some(cache) = v.pointer("/profile/info_cache").and_then(|c| c.as_object()) else { return Vec::new() };
    let mut out: Vec<BrowserProfile> = cache
        .iter()
        .filter(|(dir, _)| profile_ok(dir))
        .map(|(dir, info)| BrowserProfile {
            dir: dir.clone(),
            name: info.get("name").and_then(|n| n.as_str()).filter(|n| !n.trim().is_empty()).unwrap_or(dir).to_string(),
        })
        .collect();
    out.sort_by_key(|p| p.name.to_lowercase());
    out
}

// ---------------------------------------------------------------------------
// Registro

fn reg_str(root: HKEY, sub: &str, value: Option<&str>) -> Option<String> {
    let mut buf = vec![0u16; 1024];
    let mut size = (buf.len() * 2) as u32;
    let v = value.map(HSTRING::from);
    let r = unsafe {
        RegGetValueW(
            root,
            &HSTRING::from(sub),
            v.as_ref().map(|h| PCWSTR(h.as_ptr())).unwrap_or(PCWSTR::null()),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr() as *mut _),
            Some(&mut size),
        )
    };
    if r.is_err() {
        return None;
    }
    let n = (size as usize / 2).saturating_sub(1).min(buf.len());
    let s = String::from_utf16_lossy(&buf[..n]).trim_end_matches('\0').trim().to_string();
    (!s.is_empty()).then_some(s)
}

fn reg_subkeys(root: HKEY, sub: &str) -> Vec<String> {
    let mut key = HKEY::default();
    if unsafe { RegOpenKeyExW(root, &HSTRING::from(sub), None, KEY_READ, &mut key) }.is_err() {
        return Vec::new();
    }
    let mut out = Vec::new();
    for i in 0.. {
        let mut name = [0u16; 256];
        let mut len = name.len() as u32;
        let r = unsafe { RegEnumKeyExW(key, i, Some(windows::core::PWSTR(name.as_mut_ptr())), &mut len, None, None, None, None) };
        if r.is_err() {
            break;
        }
        out.push(String::from_utf16_lossy(&name[..len as usize]));
    }
    unsafe {
        let _ = RegCloseKey(key);
    }
    out
}

/// exe do navegador padrão para https (pela associação do usuário).
fn default_exe() -> Option<String> {
    let prog = reg_str(HKEY_CURRENT_USER, r"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice", Some("ProgId"))?;
    exe_from_command(&reg_str(HKEY_CLASSES_ROOT, &format!(r"{prog}\shell\open\command"), None)?)
}

/// Navegadores registrados no Windows (do usuário primeiro, sem repetir), com o padrão marcado.
pub fn list(with_icons: bool) -> Vec<Browser> {
    const ROOTS: [(HKEY, &str); 3] = [
        (HKEY_CURRENT_USER, r"SOFTWARE\Clients\StartMenuInternet"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Clients\StartMenuInternet"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Clients\StartMenuInternet"),
    ];
    let default = default_exe().map(|e| e.to_ascii_lowercase());
    let mut out: Vec<Browser> = Vec::new();
    for (root, base) in ROOTS {
        for id in reg_subkeys(root, base) {
            let key = format!(r"{base}\{id}");
            let Some(exe) = reg_str(root, &format!(r"{key}\shell\open\command"), None).and_then(|c| exe_from_command(&c)) else { continue };
            // O Internet Explorer só redireciona para o Edge hoje: fica de fora.
            let ie = exe.to_ascii_lowercase().ends_with("iexplore.exe");
            if ie || out.iter().any(|b| b.id.eq_ignore_ascii_case(&id) || b.exe.eq_ignore_ascii_case(&exe)) || !Path::new(&exe).exists() {
                continue;
            }
            let name = reg_str(root, &key, None).unwrap_or_else(|| id.clone());
            out.push(Browser {
                is_default: default.as_deref() == Some(exe.to_ascii_lowercase().as_str()),
                family: Family::from_exe(&exe),
                icon: if with_icons { crate::icons::data_url_of(&exe).ok() } else { None },
                id,
                name,
                exe,
            });
        }
    }
    out.sort_by_key(|b| (!b.is_default, b.name.to_lowercase()));
    out
}

/// Id do navegador padrão do Windows (se for um dos registrados).
pub fn default_id() -> Option<String> {
    list(false).into_iter().find(|b| b.is_default).map(|b| b.id)
}

/// Perfis do navegador `id` (só Chrome/Edge/Brave/Vivaldi; só leitura do "Local State").
pub fn profiles(id: &str) -> Vec<BrowserProfile> {
    let list = list(false);
    let Some(b) = pick(&list, id, None) else { return Vec::new() };
    let Some(rel) = b.family.user_data() else { return Vec::new() };
    let Ok(local) = std::env::var("LOCALAPPDATA") else { return Vec::new() };
    std::fs::read_to_string(Path::new(&local).join(rel).join("Local State")).map(|s| parse_profiles(&s)).unwrap_or_default()
}

/// Abre `url` no navegador `id` (`name` = alternativa se o id sumiu). `Ok(false)` = navegador
/// não encontrado: o chamador abre no padrão do Windows.
pub fn open(id: &str, name: Option<&str>, url: &str, private: bool, profile: Option<&str>) -> Result<bool, String> {
    let list = list(false);
    let Some(b) = pick(&list, id, name) else { return Ok(false) };
    let args = build_args(b.family, url, private, profile)?;
    std::process::Command::new(&b.exe).args(&args).spawn().map(|_| true).map_err(|e| format!("não foi possível abrir {}: {e}", b.name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn familia_pelo_exe() {
        assert_eq!(Family::from_exe(r"C:\Program Files\Google\Chrome\Application\chrome.exe"), Family::Chrome);
        assert_eq!(Family::from_exe(r"C:\x\MSEDGE.EXE"), Family::Edge);
        assert_eq!(Family::from_exe(r"C:\x\firefox.exe"), Family::Firefox);
        assert_eq!(Family::from_exe(r"C:\Users\a\AppData\Local\Programs\Opera\launcher.exe"), Family::Opera);
        assert_eq!(Family::from_exe(r"C:\x\launcher.exe"), Family::Other);
        assert_eq!(Family::from_exe(r"C:\x\brave.exe"), Family::Brave);
        assert_eq!(Family::from_exe(r"C:\Program Files\Zen Browser\zen.exe"), Family::Firefox);
    }

    #[test]
    fn argumentos_por_familia() {
        let u = "https://a.b/c?d=1";
        assert_eq!(build_args(Family::Chrome, u, true, Some("Profile 1")).unwrap(), vec!["--profile-directory=Profile 1", "--incognito", u]);
        assert_eq!(build_args(Family::Edge, u, true, None).unwrap(), vec!["--inprivate", u]);
        assert_eq!(build_args(Family::Firefox, u, true, None).unwrap(), vec!["-private-window", u]);
        assert_eq!(build_args(Family::Opera, u, true, None).unwrap(), vec!["--private", u]);
        assert_eq!(build_args(Family::Other, u, false, None).unwrap(), vec![u]);
        assert_eq!(build_args(Family::Brave, u, false, Some("")).unwrap(), vec![u]);
        assert!(build_args(Family::Other, u, true, None).is_err());
        assert!(build_args(Family::Firefox, u, false, Some("Default")).is_err());
    }

    #[test]
    fn recusa_endereco_ou_perfil_perigoso() {
        for bad in ["javascript:alert(1)", "file:///C:/x", "https://a.b\" --x", "https://a b", "--incognito", "https://a.b\n--x", "mailto:a@b.c"] {
            assert!(build_args(Family::Chrome, bad, false, None).is_err(), "{bad}");
        }
        assert!(build_args(Family::Chrome, "https://a.b", false, Some("x\" --y")).is_err());
        assert!(build_args(Family::Chrome, "https://a.b", false, Some("..\\x")).is_err());
        assert!(build_args(Family::Chrome, &format!("https://{}", "a".repeat(3000)), false, None).is_err());
    }

    #[test]
    fn exe_da_linha_de_comando() {
        assert_eq!(exe_from_command(r#""C:\P\chrome.exe" -- "%1""#).as_deref(), Some(r"C:\P\chrome.exe"));
        assert_eq!(exe_from_command(r#"C:\P F\firefox.exe -osint -url "%1""#).as_deref(), Some(r"C:\P F\firefox.exe"));
        assert_eq!(exe_from_command(r#""C:\x\script.cmd""#), None);
        assert_eq!(exe_from_command(""), None);
    }

    fn b(id: &str, name: &str) -> Browser {
        Browser { id: id.into(), name: name.into(), exe: format!(r"C:\{id}.exe"), family: Family::Other, is_default: false, icon: None }
    }

    #[test]
    fn escolhe_por_id_e_depois_pelo_nome() {
        let l = vec![b("Google Chrome", "Google Chrome"), b("Firefox-ABC", "Firefox")];
        assert_eq!(pick(&l, "google chrome", None).unwrap().id, "Google Chrome");
        assert_eq!(pick(&l, "Firefox-OLD", Some("Firefox")).unwrap().id, "Firefox-ABC");
        assert!(pick(&l, "Opera", Some("Opera")).is_none());
    }

    #[test]
    fn perfis_do_local_state() {
        let s = r#"{"profile":{"info_cache":{"Default":{"name":"Pessoal"},"Profile 2":{"name":"Trabalho"},"Profile 3":{"name":""},"..\\x":{"name":"mau"}}}}"#;
        let p = parse_profiles(s);
        assert_eq!(p.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), vec!["Pessoal", "Profile 3", "Trabalho"]);
        assert_eq!(p[2].dir, "Profile 2");
        assert!(parse_profiles("{lixo").is_empty());
        assert!(parse_profiles("{}").is_empty());
    }

    #[test]
    fn leitura_real_do_registro_nao_falha() {
        // Só leitura: lista navegadores (sem abrir nenhum).
        let l = list(false);
        assert!(l.iter().all(|b| b.exe.to_ascii_lowercase().ends_with(".exe")));
        assert!(!l.iter().any(|b| b.exe.to_ascii_lowercase().ends_with("iexplore.exe")));
        assert!(l.iter().filter(|b| b.is_default).count() <= 1);
        if let Some(first) = l.first() {
            let _ = profiles(&first.id);
        }
    }
}
