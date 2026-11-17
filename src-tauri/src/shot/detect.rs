//! Quando armar o preview e como reconhecer um print novo numa pasta (funções puras).

use crate::actions::{Action, SystemCmd};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const VK_SNAPSHOT: u16 = 0x2C;
const VK_SHIFT: u16 = 0x10;
const VK_LWIN: u16 = 0x5B;
const VK_S: u16 = 0x53;

/// A ação abre uma ferramenta de print? (captura do sistema, PrtSc com ou sem modificador,
/// Win+Shift+S, ou atalho marcado como "é uma ferramenta de print").
pub fn is_capture(action: &Action) -> bool {
    match action {
        Action::System { cmd: SystemCmd::Screenshot } => true,
        Action::Keys { combo, capture, .. } => *capture || combo_is_capture(combo),
        _ => false,
    }
}

pub fn combo_is_capture(combo: &str) -> bool {
    let Ok(vks) = crate::actions::keys::parse_combo(combo) else { return false };
    vks.contains(&VK_SNAPSHOT) || (vks.contains(&VK_LWIN) && vks.contains(&VK_SHIFT) && vks.contains(&VK_S))
}

pub fn is_image(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(),
        Some("png" | "jpg" | "jpeg" | "bmp" | "gif" | "webp")
    )
}

/// Arquivos de imagem de uma pasta (só o primeiro nível) com a data de modificação.
pub type Snapshot = HashMap<PathBuf, SystemTime>;

pub fn snapshot(dir: &Path) -> Snapshot {
    std::fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .filter(|e| is_image(&e.path()))
                .filter_map(|e| Some((e.path(), e.metadata().ok()?.modified().ok()?)))
                .collect()
        })
        .unwrap_or_default()
}

/// Arquivo novo (ou regravado) desde `before`, modificado depois de `since`. O mais recente.
pub fn new_file(before: &Snapshot, now: &Snapshot, since: SystemTime) -> Option<PathBuf> {
    now.iter()
        .filter(|(p, t)| **t >= since && before.get(*p).is_none_or(|old| old != *t))
        .max_by_key(|(_, t)| **t)
        .map(|(p, _)| p.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn keys(combo: &str, capture: bool) -> Action {
        Action::Keys { combo: combo.into(), delay_ms: None, capture }
    }

    #[test]
    fn quais_acoes_armam() {
        assert!(is_capture(&Action::System { cmd: SystemCmd::Screenshot }));
        assert!(!is_capture(&Action::System { cmd: SystemCmd::Lock }));
        for c in ["PrtSc", "PrintScreen", "Alt+PrtSc", "Ctrl+PrtSc", "Win+PrtSc", "Win+Shift+S", "Shift+Win+S"] {
            assert!(is_capture(&keys(c, false)), "{c}");
        }
        for c in ["Ctrl+C", "Win+S", "Ctrl+Shift+S", "Win+Shift+D", "lixo+"] {
            assert!(!is_capture(&keys(c, false)), "{c}");
        }
        // Atalho próprio (ex.: ShareX) marcado como ferramenta de print.
        assert!(is_capture(&keys("Ctrl+Shift+X", true)));
    }

    #[test]
    fn so_imagens() {
        assert!(is_image(Path::new("a/Captura 1.PNG")));
        assert!(is_image(Path::new("b.jpeg")));
        assert!(!is_image(Path::new("c.txt")));
        assert!(!is_image(Path::new("sem-extensao")));
    }

    #[test]
    fn arquivo_novo_so_depois_de_armar() {
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000);
        let armed = t0 + Duration::from_secs(10);
        let mut before = Snapshot::new();
        before.insert("velho.png".into(), t0);
        let mut now = before.clone();
        assert_eq!(new_file(&before, &now, armed), None);
        // Arquivo antigo que só apareceu na lista agora (ex.: copiado com data antiga): ignora.
        now.insert("copiado.png".into(), t0);
        assert_eq!(new_file(&before, &now, armed), None);
        now.insert("print1.png".into(), armed + Duration::from_secs(3));
        now.insert("print2.png".into(), armed + Duration::from_secs(5));
        assert_eq!(new_file(&before, &now, armed), Some("print2.png".into()));
        // Mesmo nome regravado depois de armar também conta.
        now.insert("velho.png".into(), armed + Duration::from_secs(9));
        assert_eq!(new_file(&before, &now, armed), Some("velho.png".into()));
    }

    #[test]
    fn foto_da_pasta_real_temporaria() {
        let dir = std::env::temp_dir().join(format!("kira-shot-dir-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        std::fs::write(dir.join("a.png"), b"x").unwrap();
        std::fs::write(dir.join("b.txt"), b"x").unwrap();
        let s = snapshot(&dir);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(s.len(), 1);
        assert!(snapshot(Path::new("C:/nao/existe")).is_empty());
    }
}
