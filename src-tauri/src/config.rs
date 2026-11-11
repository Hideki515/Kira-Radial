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
    /// Como o menu é aberto (atalho, ícone flutuante ou ambos). Ausente em configs antigas.
    #[serde(default)]
    pub launcher: Launcher,
    pub profiles: Vec<Profile>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LauncherMode {
    #[default]
    Hotkey,
    Orb,
    Both,
}

impl LauncherMode {
    pub fn wants_hotkey(self) -> bool {
        matches!(self, LauncherMode::Hotkey | LauncherMode::Both)
    }
    pub fn wants_orb(self) -> bool {
        matches!(self, LauncherMode::Orb | LauncherMode::Both)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Launcher {
    pub mode: LauncherMode,
    pub orb: OrbConfig,
}

/// Ícone flutuante. Posição em pixels físicos (canto superior esquerdo); `None` = canto padrão.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct OrbConfig {
    pub x: Option<i32>,
    pub y: Option<i32>,
    /// Diâmetro em px lógicos (56–160).
    pub size: f64,
    /// GIF/WebP/PNG próprio; `None` = orbe holográfico embutido.
    pub image: Option<String>,
    pub opacity_idle: f64,
    pub hide_on_fullscreen: bool,
    /// Escondido pelo usuário (menu do ícone / bandeja). Persistido entre reinícios.
    pub hidden: bool,
    /// Borda onde o ícone está encaixado (metade para fora), se houver.
    pub docked: Option<crate::positioning::Edge>,
    /// Núcleo fica avermelhado e pulsa mais rápido com CPU alta.
    pub cpu_alert: bool,
    /// Animação do orbe: sempre, só com o mouse em cima, ou parado (gasta quase nada).
    #[serde(deserialize_with = "lenient_animation")]
    pub animation: OrbAnimation,
}

/// Valor desconhecido (config editada à mão / de versão nova) vira o padrão em vez de
/// invalidar a config inteira.
fn lenient_animation<'de, D: serde::Deserializer<'de>>(d: D) -> Result<OrbAnimation, D::Error> {
    let v = Value::deserialize(d)?;
    Ok(serde_json::from_value(v).unwrap_or_default())
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum OrbAnimation {
    #[default]
    Full,
    Hover,
    Off,
}

impl Default for OrbConfig {
    fn default() -> Self {
        Self { x: None, y: None, size: 96.0, image: None, opacity_idle: 0.85, hide_on_fullscreen: true, hidden: false, docked: None, cpu_alert: true, animation: OrbAnimation::Full }
    }
}

impl OrbConfig {
    pub const MIN_SIZE: f64 = 56.0;
    pub const MAX_SIZE: f64 = 160.0;
    pub fn size(&self) -> f64 {
        self.size.clamp(Self::MIN_SIZE, Self::MAX_SIZE)
    }
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
    /// Histórico da área de transferência (só memória). Desligado por padrão.
    #[serde(default)]
    pub clipboard_history: bool,
    /// Navegador geral para "Abrir site" (id em StartMenuInternet); ausente = padrão do Windows.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser_name: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub match_exe: Vec<String>,
    /// "Quando usar": dias, horário e monitores (ausente = só por app/padrão).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<crate::schedule::When>,
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

    /// Perfil a usar. Prioridade:
    /// 1. app em primeiro plano (se o perfil também tiver "quando usar", precisa bater);
    /// 2. perfil sem app, mas com "quando usar" (horário/dias/monitor) que bate;
    /// 3. o primeiro perfil (padrão).
    pub fn profile_for(&self, exe: Option<&str>, ctx: &crate::schedule::Context) -> &Profile {
        let when_ok = |p: &Profile| p.when.as_ref().is_none_or(|w| !w.has_criteria() || w.matches(ctx));
        if let Some(exe) = exe {
            if let Some(p) = self
                .profiles
                .iter()
                .skip(1)
                .find(|p| p.match_exe.iter().any(|m| m.eq_ignore_ascii_case(exe)) && when_ok(p))
            {
                return p;
            }
        }
        if let Some(p) = self.profiles.iter().skip(1).find(|p| {
            p.match_exe.is_empty() && p.when.as_ref().is_some_and(|w| w.has_criteria() && w.matches(ctx))
        }) {
            return p;
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
    base.join(crate::qa::data_dir_name())
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
    // Backup automático da versão anterior, só quando o conteúdo realmente muda.
    if let Ok(previous) = fs::read_to_string(config_path()) {
        if crate::backup::significant_change(&previous, &text) {
            if let Err(e) = crate::backup::store(&previous) {
                eprintln!("[kira-radial] falha ao guardar backup da config: {e}");
            }
        }
    }
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
        let ctx = crate::schedule::Context { weekday: 1, minutes: 600, monitor: "D1".into() };
        assert_eq!(c.profile_for(Some("Code.EXE"), &ctx).id, "vs");
        assert_eq!(c.profile_for(Some("notepad.exe"), &ctx).id, "default");
        assert_eq!(c.profile_for(None, &ctx).id, "default");
    }

    #[test]
    fn config_antiga_sem_launcher_usa_atalho() {
        let mut v: Value = serde_json::to_value(Config::default_config()).unwrap();
        v.as_object_mut().unwrap().remove("launcher");
        let c: Config = serde_json::from_value(v).unwrap();
        assert_eq!(c.launcher.mode, LauncherMode::Hotkey);
        assert_eq!(c.launcher.orb, OrbConfig::default());
        assert!(c.launcher.mode.wants_hotkey() && !c.launcher.mode.wants_orb());
    }

    #[test]
    fn launcher_parcial_completa_com_padroes() {
        let mut v: Value = serde_json::to_value(Config::default_config()).unwrap();
        v["launcher"] = serde_json::json!({ "mode": "both", "orb": { "x": 10, "y": 20, "size": 999 } });
        let c: Config = serde_json::from_value(v).unwrap();
        assert!(c.launcher.mode.wants_hotkey() && c.launcher.mode.wants_orb());
        assert_eq!((c.launcher.orb.x, c.launcher.orb.y), (Some(10), Some(20)));
        assert_eq!(c.launcher.orb.size(), OrbConfig::MAX_SIZE);
        assert!(c.launcher.orb.hide_on_fullscreen);
        assert!(!c.launcher.orb.hidden);
        assert!(LauncherMode::Orb.wants_orb() && !LauncherMode::Orb.wants_hotkey());
    }

    #[test]
    fn perfil_por_horario_e_monitor_com_prioridade_do_app() {
        use crate::schedule::{Context, When};
        let mut c = Config::default_config();
        let mut trabalho = c.profiles[0].clone();
        trabalho.id = "trabalho".into();
        trabalho.when = Some(When { days: vec![1, 2, 3, 4, 5], from: Some("09:00".into()), to: Some("18:00".into()), monitors: vec![] });
        let mut tela2 = c.profiles[0].clone();
        tela2.id = "tela2".into();
        tela2.when = Some(When { monitors: vec!["D2".into()], ..Default::default() });
        let mut code = c.profiles[0].clone();
        code.id = "code".into();
        code.match_exe = vec!["code.exe".into()];
        c.profiles.extend([trabalho, tela2, code]);
        let seg10_d1 = Context { weekday: 1, minutes: 600, monitor: "D1".into() };
        let sab10_d1 = Context { weekday: 6, minutes: 600, monitor: "D1".into() };
        let sab10_d2 = Context { weekday: 6, minutes: 600, monitor: "d2".into() };
        assert_eq!(c.profile_for(None, &seg10_d1).id, "trabalho");
        assert_eq!(c.profile_for(None, &sab10_d1).id, "default");
        assert_eq!(c.profile_for(None, &sab10_d2).id, "tela2");
        // App em primeiro plano vence horário/monitor.
        assert_eq!(c.profile_for(Some("code.exe"), &seg10_d1).id, "code");
        // Config antiga (sem "when") continua carregando.
        let text = serde_json::to_string(&Config::default_config()).unwrap();
        assert!(!text.contains("\"when\""));
        assert!(parse(&text).unwrap().profiles[0].when.is_none());
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

/// QA (v0.5.0): config antiga sem `clipboardHistory`/`showMedia` continua válida e o
/// histórico fica desligado.
#[cfg(test)]
mod fase2_qa_tests {
    use super::*;

    #[test]
    fn config_antiga_sem_clipboard_history_fica_desligado() {
        assert!(!Config::default_config().behavior.clipboard_history);
        let mut v: Value = serde_json::to_value(Config::default_config()).unwrap();
        v["behavior"].as_object_mut().unwrap().remove("clipboardHistory");
        if let Some(a) = v["appearance"].as_object_mut() {
            a.remove("showMedia");
        }
        let c: Config = serde_json::from_value(v).unwrap();
        c.validate().unwrap();
        assert!(!c.behavior.clipboard_history);
    }
}

#[cfg(test)]
mod dock_qa_tests {
    use super::*;

    #[test]
    fn config_antiga_sem_docked_cpu_alert_usa_padroes() {
        let mut v: Value = serde_json::to_value(Config::default_config()).unwrap();
        let orb = v["launcher"]["orb"].as_object_mut().unwrap();
        orb.remove("docked");
        orb.remove("cpuAlert");
        let c: Config = serde_json::from_value(v).unwrap();
        c.validate().unwrap();
        assert_eq!(c.launcher.orb.docked, None);
        assert!(c.launcher.orb.cpu_alert);
    }

    #[test]
    fn bordas_do_front_desserializam_em_minusculas() {
        use crate::positioning::Edge;
        for (s, e) in [("left", Edge::Left), ("right", Edge::Right), ("top", Edge::Top), ("bottom", Edge::Bottom)] {
            let mut v: Value = serde_json::to_value(Config::default_config()).unwrap();
            v["launcher"]["orb"]["docked"] = Value::String(s.into());
            let c: Config = serde_json::from_value(v).unwrap();
            assert_eq!(c.launcher.orb.docked, Some(e));
            assert_eq!(serde_json::to_value(c).unwrap()["launcher"]["orb"]["docked"], s);
        }
    }
}

#[cfg(test)]
mod orb_animation_tests {
    use super::*;

    #[test]
    fn animacao_do_orbe_padrao_antiga_e_desconhecida() {
        assert_eq!(Config::default_config().launcher.orb.animation, OrbAnimation::Full);
        let mut v: Value = serde_json::to_value(Config::default_config()).unwrap();
        assert_eq!(v["launcher"]["orb"]["animation"], "full");
        // Config antiga (sem o campo) → Sempre.
        v["launcher"]["orb"].as_object_mut().unwrap().remove("animation");
        let c: Config = serde_json::from_value(v.clone()).unwrap();
        assert_eq!(c.launcher.orb.animation, OrbAnimation::Full);
        for (s, want) in [("hover", OrbAnimation::Hover), ("off", OrbAnimation::Off), ("rapida", OrbAnimation::Full), ("", OrbAnimation::Full)] {
            v["launcher"]["orb"]["animation"] = Value::from(s);
            let c: Config = serde_json::from_value(v.clone()).unwrap();
            assert_eq!(c.launcher.orb.animation, want, "{s}");
        }
        v["launcher"]["orb"]["animation"] = Value::from(7);
        assert_eq!(serde_json::from_value::<Config>(v).unwrap().launcher.orb.animation, OrbAnimation::Full);
    }
}
