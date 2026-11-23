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
        /// Abre uma ferramenta de print (ex.: atalho do ShareX): mostra o preview do print.
        #[serde(default)]
        capture: bool,
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
    /// Conecta/desconecta uma VPN do Windows pelo nome.
    Vpn { name: String, mode: crate::vpn::Mode },
    /// OBS Studio (WebSocket local): cena, gravação, transmissão, mudo de fonte...
    Obs {
        cmd: crate::obs::ObsCmd,
        #[serde(default)]
        scene: Option<String>,
        #[serde(default)]
        input: Option<String>,
    },
    /// Cola o item `index` do histórico da área de transferência no app anterior.
    Paste { index: usize },
    /// Devolve as janelas aos lugares guardados (e abre os apps que faltam, se pedido).
    Layout {
        windows: Vec<crate::layout::SavedWindow>,
        #[serde(default, rename = "launchMissing")]
        launch_missing: bool,
    },
    /// Texto pronto: cola o modelo com as variáveis trocadas ({data}, {hora}...).
    Text {
        text: String,
        /// Devolve a área de transferência anterior depois de colar (padrão: sim).
        #[serde(default = "yes", rename = "restoreClipboard")]
        restore_clipboard: bool,
    },
    /// Várias ações em ordem (ex.: abrir o VS Code, o terminal e mutar o Discord).
    Sequence {
        steps: Vec<Action>,
        /// Espera entre um passo e o próximo (padrão 300 ms, máx. 5 s).
        #[serde(default, rename = "delayMs")]
        delay_ms: Option<u64>,
    },
    /// Discord: mudo, ensurdecer e dispositivos de entrada/saída (pelo RPC local).
    Discord {
        cmd: crate::discord::DiscordCmd,
        #[serde(default, rename = "deviceId")]
        device_id: Option<String>,
        #[serde(default, rename = "deviceName")]
        device_name: Option<String>,
    },
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

/// Limites da sequência.
pub const SEQUENCE_MIN: usize = 2;
pub const SEQUENCE_MAX: usize = 10;
pub const SEQUENCE_DEFAULT_DELAY_MS: u64 = 300;
pub const SEQUENCE_MAX_DELAY_MS: u64 = 5_000;

/// Sequência inválida? Tamanho 2–10, sem sequência dentro de sequência e sem
/// desligar/reiniciar/encerrar sessão (esses pedem confirmação e não rodam encadeados).
pub fn sequence_error(steps: &[Action]) -> Option<String> {
    if !(SEQUENCE_MIN..=SEQUENCE_MAX).contains(&steps.len()) {
        return Some(trf!("a sequência precisa de {SEQUENCE_MIN} a {SEQUENCE_MAX} ações", "the sequence needs {SEQUENCE_MIN} to {SEQUENCE_MAX} actions"));
    }
    for (i, s) in steps.iter().enumerate() {
        match s {
            Action::Sequence { .. } => return Some(trf!("passo {}: sequência dentro de sequência não é permitida", "step {}: a sequence inside a sequence isn't allowed", i + 1)),
            Action::System { cmd: SystemCmd::Shutdown | SystemCmd::Restart | SystemCmd::SignOut } => {
                return Some(trf!("passo {}: desligar, reiniciar e encerrar sessão não entram numa sequência", "step {}: shut down, restart and sign out can't be part of a sequence", i + 1))
            }
            _ => {}
        }
    }
    None
}

impl Action {
    /// Espera entre os passos de uma sequência.
    pub fn step_delay(&self) -> Duration {
        match self {
            Action::Sequence { delay_ms, .. } => {
                Duration::from_millis(delay_ms.unwrap_or(SEQUENCE_DEFAULT_DELAY_MS).min(SEQUENCE_MAX_DELAY_MS))
            }
            _ => Duration::ZERO,
        }
    }

    /// Ações que enviam teclas precisam que o foco volte ao app anterior antes de rodar.
    pub fn needs_previous_focus(&self) -> bool {
        matches!(self, Action::Keys { .. } | Action::Paste { .. } | Action::Text { .. } | Action::System { cmd: SystemCmd::Screenshot })
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
                return Err(tr!("só são aceitas URLs http(s) ou mailto", "only http(s) or mailto URLs are accepted").into());
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
            c.spawn().map(|_| ()).map_err(|e| trf!("falha ao iniciar script: {e}", "couldn't start the script: {e}"))
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
        Action::Layout { windows, launch_missing } => crate::layout::restore(windows, *launch_missing),
        Action::Text { text, restore_clipboard } => crate::snippet::paste(text, *restore_clipboard),
        Action::Radio { kind, mode } => crate::radios::set(*kind, *mode).map(|_| ()),
        Action::Vpn { name, mode } => crate::vpn::set(name, *mode),
        Action::Obs { cmd, scene, input } => crate::obs::run(*cmd, scene.as_deref(), input.as_deref()),
        Action::Discord { cmd, device_id, device_name } => crate::discord::run(*cmd, device_id.as_deref(), device_name.as_deref()),
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
        Action::Window { .. } => Err(tr!("ação de janela sem janela-alvo", "window action without a target window").into()),
        // Passo a passo (foco, atrasos, janela) em commands::run_action.
        Action::Sequence { .. } => Err(tr!("sequência só pode rodar pelo menu", "a sequence can only run from the menu").into()),
    }
}

/// Abre um programa pelo caminho (layouts: apps que não estavam abertos).
pub fn launch_path(path: &str) -> Result<(), String> {
    shell_execute(path, None, None, "open")
}

/// Ctrl+V no app em foco (textos prontos).
pub fn send_paste() -> Result<(), String> {
    keys::send_combo("Ctrl+V")
}

fn yes() -> bool {
    true
}

pub(super) fn shell_execute(file: &str, params: Option<&str>, dir: Option<&str>, verb: &str) -> Result<(), String> {
    if file.trim().is_empty() {
        return Err(tr!("caminho vazio", "empty path").into());
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
            2 | 3 => trf!("não encontrado: {file}", "not found: {file}"),
            5 => tr!("acesso negado", "access denied").into(),
            1223 => tr!("cancelado pelo usuário", "canceled by the user").into(),
            _ => trf!("falha ao abrir {file} (código {code})", "couldn't open {file} (code {code})"),
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
