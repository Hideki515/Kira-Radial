//! Configuração persistida em %APPDATA%\Kira-Radial\config.json.
//!
//! O Rust só tipa o que precisa (atalho, comportamento, perfis/executáveis); itens e
//! aparência ficam como `serde_json::Value` e são preservados intactos. O schema
//! completo vive em src/shared/types.ts, e os padrões em src/shared/default-config.json.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::PathBuf};

pub const DEFAULT_JSON: &str = include_str!("../../src/shared/default-config.json");
pub const CURRENT_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub version: u32,
    pub hotkey: Hotkey,
    pub behavior: Behavior,
    pub appearance: Value,
    pub profiles: Vec<Profile>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hotkey {
    pub accelerator: String,
    pub mode: HotkeyMode,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HotkeyMode {
    Toggle,
    Hold,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OpenAt {
    Cursor,
    Center,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Behavior {
    pub open_at: OpenAt,
    pub close_on_blur: bool,
    pub close_on_action: bool,
    pub dead_zone_px: f64,
    pub autostart: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub match_exe: Vec<String>,
    pub items: Vec<Value>,
}

impl Config {
    pub fn default_config() -> Self {
        serde_json::from_str(DEFAULT_JSON).expect("default-config.json inválido")
    }

    /// Escala da interface (appearance.scale), limitada a uma faixa sensata.
    pub fn ui_scale(&self) -> f64 {
        self.appearance
            .get("scale")
            .and_then(Value::as_f64)
            .unwrap_or(1.0)
            .clamp(0.5, 1.6)
    }

    /// Perfil do executável em primeiro plano; o primeiro perfil é o padrão.
    pub fn profile_for(&self, exe: Option<&str>) -> &Profile {
        if let Some(exe) = exe {
            let exe = exe.to_ascii_lowercase();
            if let Some(p) = self
                .profiles
                .iter()
                .skip(1)
                .find(|p| p.match_exe.iter().any(|m| m.eq_ignore_ascii_case(&exe)))
            {
                return p;
            }
        }
        &self.profiles[0]
    }

    /// Validação mínima no backend (a UI faz a validação completa e amigável).
    pub fn validate(&self) -> Result<(), String> {
        if self.version != CURRENT_VERSION {
            return Err(format!("versão de configuração não suportada: {}", self.version));
        }
        if self.profiles.is_empty() {
            return Err("é necessário ao menos um perfil".into());
        }
        for p in &self.profiles {
            if !(3..=10).contains(&p.items.len()) {
                return Err(format!("perfil \"{}\": use de 3 a 10 fatias", p.name));
            }
        }
        Ok(())
    }
}

pub fn config_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("Kira-Radial")
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

/// Lê a configuração. Arquivo ausente → padrão (e grava). Arquivo corrompido → é
/// renomeado para config.invalid.json e o padrão é usado, para nunca travar a inicialização.
pub fn load() -> Config {
    let path = config_path();
    match fs::read_to_string(&path) {
        Ok(text) => match parse(&text) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[kira-radial] config inválida ({e}); usando padrão");
                let _ = fs::rename(&path, path.with_file_name("config.invalid.json"));
                let c = Config::default_config();
                let _ = save(&c);
                c
            }
        },
        Err(_) => {
            let c = Config::default_config();
            let _ = save(&c);
            c
        }
    }
}

pub fn parse(text: &str) -> Result<Config, String> {
    let c: Config = serde_json::from_str(text).map_err(|e| e.to_string())?;
    c.validate()?;
    Ok(c)
}

/// Grava de forma atômica (arquivo temporário + rename).
pub fn save(c: &Config) -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("config.json.tmp");
    let text = serde_json::to_string_pretty(c).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| e.to_string())?;
    fs::rename(&tmp, config_path()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn padrao_e_valido_e_faz_roundtrip() {
        let c = Config::default_config();
        c.validate().unwrap();
        assert_eq!(c.hotkey.accelerator, "Ctrl+Alt+Q");
        let text = serde_json::to_string(&c).unwrap();
        assert_eq!(parse(&text).unwrap(), c);
    }

    #[test]
    fn preserva_campos_de_itens_desconhecidos_pelo_rust() {
        let c = Config::default_config();
        let text = serde_json::to_string(&c).unwrap();
        assert!(text.contains("\"children\""));
        assert!(text.contains("\"showCpu\""));
    }

    #[test]
    fn escolhe_perfil_por_exe() {
        let mut c = Config::default_config();
        let mut vs = c.profiles[0].clone();
        vs.id = "vs".into();
        vs.match_exe = vec!["code.exe".into()];
        c.profiles.push(vs);
        assert_eq!(c.profile_for(Some("Code.EXE")).id, "vs");
        assert_eq!(c.profile_for(Some("notepad.exe")).id, "default");
        assert_eq!(c.profile_for(None).id, "default");
    }

    #[test]
    fn rejeita_versao_e_limites() {
        let mut c = Config::default_config();
        c.version = 9;
        assert!(c.validate().is_err());
        let mut d = Config::default_config();
        d.profiles[0].items.truncate(2);
        assert!(d.validate().is_err());
    }
}
