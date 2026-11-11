//! Executor das ações configuradas nas fatias.

pub mod keys;
mod system;
#[cfg(test)]
mod tests;

use system::system;

use serde::Deserialize;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::time::Duration;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::System::Environment::ExpandEnvironmentStringsW;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Action {
    Launch {
        path: String,
        #[serde(default)]
        args: Option<String>,
        #[serde(default)]
        cwd: Option<String>,
        #[serde(default)]
        admin: bool,
    },
    Folder { path: String },
    Url {
        url: String,
        /// Navegador (id em StartMenuInternet); ausente = o geral; "system" = padrão do Windows.
        #[serde(default)]
        browser: Option<String>,
        /// Nome do navegador, usado se o id não for encontrado.
        #[serde(default, rename = "browserName")]
        browser_name: Option<String>,
        /// Janela anônima/InPrivate.
        #[serde(default)]
        private: bool,
        /// Pasta do perfil (Chrome/Edge/Brave/Vivaldi).
        #[serde(default)]
        profile: Option<String>,
    },
    Keys {
        combo: String,
        /// Espera extra (ms) depois que o menu sumiu, antes de enviar as teclas.
        #[serde(default, rename = "delayMs")]
        delay_ms: Option<u64>,
    },
    Media { cmd: MediaCmd },
    System { cmd: SystemCmd },
    Script {
        shell: Shell,
        command: String,
        #[serde(default)]
        hidden: bool,
    },
    OpenSettings,
    AudioOutput {
        mode: AudioMode,
        #[serde(default, rename = "deviceId")]
        device_id: Option<String>,
        #[serde(default, rename = "deviceName")]
        device_name: Option<String>,
    },
    /// Traz uma janela para a frente (gerada pelo submenu "Janelas abertas").
    FocusWindow { hwnd: i64 },
    /// Controla a janela que estava ativa antes do menu (topo, monitor, encaixe...).
    Window { cmd: crate::winops::WindowCmd },
    /// Ativa um plano de energia (gerada pelo submenu "Planos de energia").
    PowerPlan { guid: String },
    /// Brilho: "set" (valor 0–100, numa tela ou em todas) ou "up"/"down" (±10%).
    Brightness {
        mode: BrightnessMode,
        #[serde(default)]
        value: Option<u32>,
        /// "all" (padrão), "cursor", "lcd", "mon:..." ou "ddc:N" (antigo).
        #[serde(default)]
        target: Option<String>,
        /// Nome da tela; usado se o id não for encontrado.
        #[serde(default, rename = "targetName")]
        target_name: Option<String>,
    },
    /// Liga/desliga Wi-Fi ou Bluetooth.
    Radio { kind: crate::radios::Kind, mode: crate::radios::Mode },
    /// Cola o item `index` do histórico da área de transferência no app anterior.
    Paste { index: usize },
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BrightnessMode {
    Set,
    Up,
    Down,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AudioMode {
    Set,
    Cycle,
}

#[derive(Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum MediaCmd {
    PlayPause,
    Next,
    Prev,
    VolUp,
    VolDown,
    Mute,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SystemCmd {
    Lock,
    Sleep,
    Shutdown,
    Restart,
    SignOut,
    Screenshot,
    TaskMgr,
    Settings,
}

#[derive(Deserialize, Debug, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum Shell {
    PowerShell,
    Cmd,
}

impl Action {
    /// Ações que enviam teclas precisam que o foco volte ao app anterior antes de rodar.
    pub fn needs_previous_focus(&self) -> bool {
        matches!(self, Action::Keys { .. } | Action::Paste { .. } | Action::System { cmd: SystemCmd::Screenshot })
    }

    /// Ações que mantêm o menu aberto (ex.: mídia — dá para clicar várias vezes em volume +).
    pub fn keeps_menu_open(&self) -> bool {
        matches!(self, Action::Media { .. })
    }

    /// Atraso configurado pelo usuário antes de executar (limitado a 10 s).
    pub fn delay(&self) -> Duration {
        match self {
            Action::Keys { delay_ms: Some(ms), .. } => Duration::from_millis((*ms).min(10_000)),
            _ => Duration::ZERO,
        }
    }
}

/// Executa a ação. Deve rodar fora da thread principal (pode esperar ~50ms).
/// `OpenSettings` é tratada pelo chamador, que tem acesso às janelas.
pub fn execute(action: &Action) -> Result<(), String> {
    // ShellExecute recomenda COM em STA na thread chamadora.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    }
    match action {
        Action::Launch { path, args, cwd, admin } => shell_execute(
            &expand_env(path),
            args.as_deref().map(expand_env).as_deref(),
            cwd.as_deref().map(expand_env).as_deref(),
            if *admin { "runas" } else { "open" },
        ),
        Action::Folder { path } => shell_execute(&expand_env(path), None, None, "open"),
        Action::Url { url, browser, browser_name, private, profile } => {
            let u = url.trim();
            let lower = u.to_ascii_lowercase();
            if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")) {
                return Err("só são aceitas URLs http(s) ou mailto".into());
            }
            // mailto sempre vai para o app de e-mail; "system"/ausente = navegador padrão.
            // Janela anônima sem navegador escolhido: usa o padrão do Windows pelo exe dele.
            let chosen = browser
                .clone()
                .filter(|b| !b.is_empty() && b != crate::browsers::SYSTEM)
                .or_else(|| if *private { crate::browsers::default_id() } else { None });
            if let (Some(id), false) = (chosen, lower.starts_with("mailto:")) {
                if crate::browsers::open(&id, browser_name.as_deref(), u, *private, profile.as_deref())? {
                    return Ok(());
                }
                crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("navegador \"{id}\" não encontrado; abrindo no padrão do Windows"));
            }
            shell_execute(u, None, None, "open")
        }
        Action::Keys { combo, .. } => keys::send_combo(combo),
        Action::Media { cmd } => keys::send_vks(&[match cmd {
            MediaCmd::PlayPause => 0xB3,
            MediaCmd::Next => 0xB0,
            MediaCmd::Prev => 0xB1,
            MediaCmd::VolUp => 0xAF,
            MediaCmd::VolDown => 0xAE,
            MediaCmd::Mute => 0xAD,
        }]),
        Action::System { cmd } => system(*cmd),
        Action::Script { shell, command, hidden } => {
            let mut c = match shell {
                Shell::PowerShell => {
                    let mut c = Command::new("powershell.exe");
                    // Sem "-ExecutionPolicy Bypass": comandos inline (-Command) não dependem da política;
                    // arquivos .ps1 seguem a política configurada pelo usuário.
                    c.args(["-NoProfile", "-Command", command]);
                    c
                }
                Shell::Cmd => {
                    let mut c = Command::new("cmd.exe");
                    c.args(["/C", command]);
                    c
                }
            };
            if *hidden {
                c.creation_flags(CREATE_NO_WINDOW);
            }
            c.spawn().map(|_| ()).map_err(|e| format!("falha ao iniciar script: {e}"))
        }
        Action::OpenSettings => Ok(()),
        Action::AudioOutput { mode, device_id, device_name } => {
            crate::audio::run(*mode == AudioMode::Cycle, device_id.as_deref(), device_name.as_deref())
        }
        Action::FocusWindow { hwnd } => crate::winlist::focus(*hwnd),
        Action::PowerPlan { guid } => crate::power::set(guid),
        Action::Paste { index } => {
            crate::clipboard::put(*index)?;
            keys::send_combo("Ctrl+V")
        }
        Action::Radio { kind, mode } => crate::radios::set(*kind, *mode).map(|_| ()),
        Action::Brightness { mode, value, target, target_name } => {
            let t = target.as_deref().unwrap_or("all");
            let n = target_name.as_deref();
            match mode {
                BrightnessMode::Set => crate::brightness::set(t, n, value.unwrap_or(100)),
                BrightnessMode::Up => crate::brightness::step_target(t, n, 10),
                BrightnessMode::Down => crate::brightness::step_target(t, n, -10),
            }
        }
        // Precisa da janela anterior: executado por run_action (commands.rs).
        Action::Window { .. } => Err("ação de janela sem janela-alvo".into()),
    }
}

pub(super) fn shell_execute(file: &str, params: Option<&str>, dir: Option<&str>, verb: &str) -> Result<(), String> {
    if file.trim().is_empty() {
        return Err("caminho vazio".into());
    }
    let file_h = HSTRING::from(file);
    let verb_h = HSTRING::from(verb);
    let params_h = params.filter(|s| !s.is_empty()).map(HSTRING::from);
    let dir_h = dir.filter(|s| !s.is_empty()).map(HSTRING::from);
    let pc = |h: &Option<HSTRING>| h.as_ref().map(|h| PCWSTR(h.as_ptr())).unwrap_or(PCWSTR::null());
    let r = unsafe { ShellExecuteW(None, &verb_h, &file_h, pc(&params_h), pc(&dir_h), SW_SHOWNORMAL) };
    // Valores <= 32 indicam erro (convenção histórica do ShellExecute).
    let code = r.0 as isize;
    if code > 32 {
        Ok(())
    } else {
        Err(match code {
            2 | 3 => format!("não encontrado: {file}"),
            5 => "acesso negado".into(),
            1223 => "cancelado pelo usuário".into(),
            _ => format!("falha ao abrir {file} (código {code})"),
        })
    }
}

/// Expande %VARIAVEIS% de ambiente (ex.: %USERPROFILE%\Downloads).
pub fn expand_env(s: &str) -> String {
    if !s.contains('%') {
        return s.to_string();
    }
    let src = HSTRING::from(s);
    unsafe {
        let mut buf = vec![0u16; 1024];
        let n = ExpandEnvironmentStringsW(&src, Some(&mut buf));
        if n == 0 {
            return s.to_string();
        }
        if n as usize > buf.len() {
            buf = vec![0u16; n as usize];
            let n2 = ExpandEnvironmentStringsW(&src, Some(&mut buf));
            if n2 == 0 {
                return s.to_string();
            }
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        String::from_utf16_lossy(&buf[..end])
    }
}
