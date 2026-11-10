//! Ícones próprios nas fatias: imagem escolhida pelo usuário (PNG/SVG/ICO/WebP) ou o ícone
//! extraído de um programa/atalho (salvo como PNG em `<pasta de dados>\icons\`).

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Limite das imagens próprias.
pub const MAX_ICON_BYTES: u64 = 512 * 1024;

pub fn icons_dir() -> PathBuf {
    crate::config::config_dir().join("icons")
}

/// Tipo MIME pela extensão; `None` = formato não aceito.
pub fn icon_mime(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// Imagem do ícone como data URL.
pub fn read(path: &str) -> Result<String, String> {
    let mime = icon_mime(path).ok_or("formato não suportado (use PNG, SVG, ICO ou WebP)")?;
    crate::orb::read_data_url(path, mime, MAX_ICON_BYTES, "ícone")
}

/// Nome estável do arquivo extraído: o mesmo programa gera sempre o mesmo PNG (FNV-1a).
pub fn cache_name(source: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in source.to_ascii_lowercase().bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("app-{h:016x}.png")
}

/// Extrai o ícone de um programa, atalho ou arquivo (o mesmo que o Explorador mostra),
/// salva como PNG em `icons\` e devolve o caminho do PNG.
pub fn extract(source: &str) -> Result<String, String> {
    use windows::core::HSTRING;
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;

    let raw = source.trim().trim_matches('"');
    if raw.is_empty() {
        return Err("informe o programa primeiro".into());
    }
    // Nome solto ("wt.exe", "notepad"): o shell só acha o ícone com o caminho completo.
    let resolved = resolve_program(raw);
    let src = resolved.as_str();
    let mut info = SHFILEINFOW::default();
    let ok = unsafe {
        SHGetFileInfoW(
            &HSTRING::from(src),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };
    if ok == 0 || info.hIcon.is_invalid() {
        return Err(format!("não foi possível ler o ícone de \"{src}\""));
    }
    let pixels = crate::winlist::render_icon(info.hIcon);
    unsafe {
        let _ = DestroyIcon(info.hIcon);
    }
    let bgra = pixels.ok_or("não foi possível desenhar o ícone")?;
    let png = crate::winlist::png_bytes(&crate::winlist::bgra_to_rgba(&bgra), crate::winlist::ICON_SIZE)
        .ok_or("falha ao gerar o PNG")?;
    let dir = icons_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(cache_name(raw));
    fs::write(&out, png).map_err(|e| e.to_string())?;
    Ok(out.to_string_lossy().into_owned())
}

/// Nome solto de programa ("wt.exe", "notepad") → caminho completo pelo PATH do Windows
/// (inclui os atalhos de apps da Loja em WindowsApps). Caminho já completo fica igual.
pub fn resolve_program(name: &str) -> String {
    use windows::core::{w, HSTRING};
    use windows::Win32::Storage::FileSystem::SearchPathW;
    if name.contains(['\\', '/', ':']) {
        return name.to_string();
    }
    let mut buf = [0u16; 1024];
    let n = unsafe { SearchPathW(None, &HSTRING::from(name), w!(".exe"), Some(&mut buf), None) } as usize;
    if n == 0 || n > buf.len() {
        return name.to_string();
    }
    String::from_utf16_lossy(&buf[..n])
}

/// Ícones extraídos (em `icons\`) que nenhuma fatia usa mais.
pub fn unused(files: &[String], used: &HashSet<String>) -> Vec<String> {
    files
        .iter()
        .filter(|f| f.starts_with("app-") && f.ends_with(".png") && !used.contains(&f.to_ascii_lowercase()))
        .cloned()
        .collect()
}

/// Nomes de arquivo (minúsculos) dos ícones de `icons\` referenciados na config.
fn referenced(cfg: &crate::config::Config) -> HashSet<String> {
    fn walk(v: &serde_json::Value, dir: &Path, out: &mut HashSet<String>) {
        if let Some(p) = v.get("iconFile").and_then(|x| x.as_str()) {
            let path = Path::new(p);
            // Windows não diferencia maiúsculas em caminhos: compara sem caixa para nunca
            // apagar um ícone em uso por causa de "AppData" × "appdata".
            let same_dir = path.parent().is_some_and(|d| d.to_string_lossy().eq_ignore_ascii_case(&dir.to_string_lossy()));
            if same_dir {
                if let Some(n) = path.file_name() {
                    out.insert(n.to_string_lossy().to_ascii_lowercase());
                }
            }
        }
        if let Some(kids) = v.get("children").and_then(|c| c.as_array()) {
            for k in kids {
                walk(k, dir, out);
            }
        }
    }
    let dir = icons_dir();
    let mut out = HashSet::new();
    for p in &cfg.profiles {
        for it in &p.items {
            walk(it, &dir, &mut out);
        }
    }
    out
}

/// Apaga ícones extraídos que não são mais usados (chamado ao salvar a config).
pub fn prune(cfg: &crate::config::Config) {
    let Ok(rd) = fs::read_dir(icons_dir()) else { return };
    let files: Vec<String> = rd.filter_map(|e| e.ok()?.file_name().into_string().ok()).collect();
    for f in unused(&files, &referenced(cfg)) {
        let _ = fs::remove_file(icons_dir().join(f));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formatos_aceitos() {
        assert_eq!(icon_mime("a.PNG"), Some("image/png"));
        assert_eq!(icon_mime("a.svg"), Some("image/svg+xml"));
        assert_eq!(icon_mime("a.ico"), Some("image/x-icon"));
        assert_eq!(icon_mime("a.webp"), Some("image/webp"));
        assert_eq!(icon_mime("a.exe"), None);
        assert!(read("x.exe").is_err());
    }

    #[test]
    fn nome_estavel_por_programa() {
        assert_eq!(cache_name("C:\\Windows\\notepad.exe"), cache_name("c:\\windows\\NOTEPAD.EXE"));
        assert_ne!(cache_name("a.exe"), cache_name("b.exe"));
        assert!(cache_name("a.exe").starts_with("app-") && cache_name("a.exe").ends_with(".png"));
    }

    #[test]
    fn nome_solto_vira_caminho_completo_pelo_path() {
        let p = resolve_program("notepad.exe");
        assert!(p.to_ascii_lowercase().ends_with(r"\notepad.exe"), "{p}");
        assert!(std::path::Path::new(&p).is_absolute());
        assert_eq!(resolve_program("notepad"), p); // sem extensão também
        assert_eq!(resolve_program(r"C:\x\y.exe"), r"C:\x\y.exe"); // já completo: igual
        assert_eq!(resolve_program("programa-que-nao-existe-xyz"), "programa-que-nao-existe-xyz");
    }

    #[test]
    fn so_apaga_extraidos_sem_uso() {
        let files = vec!["app-1.png".to_string(), "app-2.png".to_string(), "minha-foto.png".to_string()];
        let used: HashSet<String> = ["app-1.png".to_string()].into();
        assert_eq!(unused(&files, &used), vec!["app-2.png".to_string()]);
    }

    #[test]
    fn qa_referenciados_so_da_pasta_icons_inclusive_subitens() {
        // QA v0.13.0: só leitura (não lista nem apaga nada no disco).
        let dir = icons_dir();
        let dentro = dir.join("app-AAAA.png").to_string_lossy().into_owned();
        let filho = dir.join("app-bbbb.png").to_string_lossy().into_owned();
        let fora = r"D:\Imagens\app-cccc.png".to_string();
        let mut cfg = crate::config::Config::default_config();
        cfg.profiles[0].items = vec![
            serde_json::json!({ "id": "a", "iconFile": dentro, "children": [{ "id": "b", "iconFile": filho }] }),
            serde_json::json!({ "id": "c", "iconFile": fora }),
        ];
        let r = referenced(&cfg);
        assert!(r.contains("app-aaaa.png") && r.contains("app-bbbb.png"), "{r:?}");
        assert!(!r.contains("app-cccc.png"), "imagem fora de icons\\ não conta: {r:?}");
        // imagem do usuário fora de icons\ nunca entra na lista de apagar (prune só lista icons\)
        let files = vec!["app-aaaa.png".into(), "app-bbbb.png".into(), "app-dddd.png".into(), "foto.png".into()];
        assert_eq!(unused(&files, &r), vec!["app-dddd.png".to_string()]);
    }

    #[test]
    fn pasta_com_caixa_diferente_continua_referenciada() {
        let dir = icons_dir().to_string_lossy().to_uppercase();
        let mut cfg = crate::config::Config::default_config();
        cfg.profiles[0].items = vec![serde_json::json!({ "id": "a", "iconFile": format!("{dir}\\app-eeee.png") })];
        assert!(referenced(&cfg).contains("app-eeee.png"));
    }

    #[test]
    fn extrai_icone_de_programa_do_sistema_so_leitura_no_temp() {
        // Desenha o ícone do Bloco de Notas (só leitura do exe) — sem gravar na pasta de dados:
        // usa as mesmas funções que extract(), mas guarda o PNG só na memória.
        use windows::core::HSTRING;
        use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
        use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
        use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;
        let mut info = SHFILEINFOW::default();
        let ok = unsafe {
            SHGetFileInfoW(&HSTRING::from("C:\\Windows\\notepad.exe"), FILE_FLAGS_AND_ATTRIBUTES(0), Some(&mut info), std::mem::size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON)
        };
        assert!(ok != 0 && !info.hIcon.is_invalid());
        let px = crate::winlist::render_icon(info.hIcon).unwrap();
        unsafe {
            let _ = DestroyIcon(info.hIcon);
        }
        let png = crate::winlist::png_bytes(&crate::winlist::bgra_to_rgba(&px), crate::winlist::ICON_SIZE).unwrap();
        assert_eq!(&png[1..4], b"PNG");
    }
}

