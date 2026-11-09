//! Executor das ações configuradas nas fatias.

pub mod keys;

use serde::Deserialize;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::time::Duration;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::System::Environment::ExpandEnvironmentStringsW;
use windows::Win32::System::Power::SetSuspendState;
use windows::Win32::System::Shutdown::{
    ExitWindowsEx, LockWorkStation, EWX_LOGOFF, EWX_POWEROFF, EWX_REBOOT, EWX_SHUTDOWN, EXIT_WINDOWS_FLAGS,
    SHTDN_REASON_FLAG_PLANNED, SHTDN_REASON_MAJOR_OTHER,
};
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
    Url { url: String },
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
        matches!(self, Action::Keys { .. } | Action::System { cmd: SystemCmd::Screenshot })
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
        Action::Url { url } => {
            let u = url.trim();
            let lower = u.to_ascii_lowercase();
            if !(lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")) {
                return Err("só são aceitas URLs http(s) ou mailto".into());
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
    }
}

/// Desligar/reiniciar/sair pela API documentada (ExitWindowsEx), sem processo auxiliar.
/// Desligar e reiniciar exigem habilitar o privilégio SeShutdownPrivilege no próprio token.
fn exit_windows(flags: EXIT_WINDOWS_FLAGS, needs_privilege: bool) -> Result<(), String> {
    if needs_privilege {
        enable_shutdown_privilege()?;
    }
    unsafe { ExitWindowsEx(flags, SHTDN_REASON_MAJOR_OTHER | SHTDN_REASON_FLAG_PLANNED) }
        .map_err(|e| format!("o Windows recusou o comando: {e}"))
}

fn enable_shutdown_privilege() -> Result<(), String> {
    use windows::Win32::Foundation::{CloseHandle, HANDLE};
    use windows::Win32::Security::{
        AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED, SE_SHUTDOWN_NAME,
        TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
    };
    use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    unsafe {
        let mut token = HANDLE::default();
        OpenProcessToken(GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, &mut token)
            .map_err(|e| e.to_string())?;
        let mut tp = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES { Luid: Default::default(), Attributes: SE_PRIVILEGE_ENABLED }],
        };
        let r = LookupPrivilegeValueW(PCWSTR::null(), SE_SHUTDOWN_NAME, &mut tp.Privileges[0].Luid)
            .and_then(|_| AdjustTokenPrivileges(token, false, Some(&tp), 0, None, None))
            // AdjustTokenPrivileges "dá certo" mesmo sem conceder: o resultado real fica no GetLastError.
            .map(|_| windows::Win32::Foundation::GetLastError().0);
        let _ = CloseHandle(token);
        match r {
            Ok(last_error) => privilege_result(last_error),
            Err(e) => Err(format!("sem permissão para desligar: {e}")),
        }
    }
}

/// Interpreta o GetLastError() logo após um AdjustTokenPrivileges bem-sucedido.
pub fn privilege_result(last_error: u32) -> Result<(), String> {
    const ERROR_NOT_ALL_ASSIGNED: u32 = 1300;
    match last_error {
        ERROR_NOT_ALL_ASSIGNED => Err(
            "sem permissão para desligar/reiniciar: a conta não tem o privilégio de desligamento (política do Windows)".into(),
        ),
        _ => Ok(()),
    }
}

fn system(cmd: SystemCmd) -> Result<(), String> {
    match cmd {
        SystemCmd::Lock => unsafe { LockWorkStation().map_err(|e| e.to_string()) },
        SystemCmd::Sleep => {
            // hibernate=false, force=false, wakeupEventsDisabled=false
            if unsafe { SetSuspendState(false, false, false) } {
                Ok(())
            } else {
                Err("não foi possível suspender".into())
            }
        }
        SystemCmd::Shutdown => exit_windows(EWX_SHUTDOWN | EWX_POWEROFF, true),
        SystemCmd::Restart => exit_windows(EWX_REBOOT, true),
        SystemCmd::SignOut => exit_windows(EWX_LOGOFF, false),
        SystemCmd::Screenshot => keys::send_combo("Win+Shift+S"),
        SystemCmd::TaskMgr => shell_execute("taskmgr.exe", None, None, "open"),
        SystemCmd::Settings => shell_execute("ms-settings:", None, None, "open"),
    }
}

fn shell_execute(file: &str, params: Option<&str>, dir: Option<&str>, verb: &str) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn privilegio_nao_concedido_vira_erro_legivel() {
        assert!(privilege_result(0).is_ok());
        let e = privilege_result(1300).unwrap_err();
        assert!(e.contains("sem permissão"));
    }

    #[test]
    fn midia_mantem_menu_aberto() {
        let media: Action = serde_json::from_str(r#"{"type":"media","cmd":"volup"}"#).unwrap();
        let keys: Action = serde_json::from_str(r#"{"type":"keys","combo":"Win+D"}"#).unwrap();
        assert!(media.keeps_menu_open());
        assert!(!media.needs_previous_focus());
        assert!(!keys.keeps_menu_open());
    }

    #[test]
    fn desserializa_formato_do_front() {
        let a: Action = serde_json::from_str(r#"{"type":"keys","combo":"Win+D"}"#).unwrap();
        assert!(matches!(a, Action::Keys { .. }) && a.needs_previous_focus());
        let a: Action = serde_json::from_str(r#"{"type":"keys","combo":"Ctrl+Shift+S","delayMs":250}"#).unwrap();
        assert_eq!(a.delay(), Duration::from_millis(250));
        let a: Action = serde_json::from_str(r#"{"type":"keys","combo":"A","delayMs":999999}"#).unwrap();
        assert_eq!(a.delay(), Duration::from_secs(10));
        let a: Action = serde_json::from_str(r#"{"type":"media","cmd":"playpause"}"#).unwrap();
        assert!(matches!(a, Action::Media { cmd: MediaCmd::PlayPause }));
        let a: Action = serde_json::from_str(r#"{"type":"system","cmd":"signout"}"#).unwrap();
        assert!(matches!(a, Action::System { cmd: SystemCmd::SignOut }));
        let a: Action = serde_json::from_str(r#"{"type":"openSettings"}"#).unwrap();
        assert!(matches!(a, Action::OpenSettings));
        let a: Action = serde_json::from_str(r#"{"type":"launch","path":"calc.exe"}"#).unwrap();
        assert!(matches!(a, Action::Launch { admin: false, .. }));
        let a: Action = serde_json::from_str(r#"{"type":"audioOutput","mode":"cycle"}"#).unwrap();
        assert!(matches!(a, Action::AudioOutput { mode: AudioMode::Cycle, device_id: None, .. }) && !a.needs_previous_focus());
        let a: Action =
            serde_json::from_str(r#"{"type":"audioOutput","mode":"set","deviceId":"{0.0.0}.{x}","deviceName":"Headset"}"#).unwrap();
        match a {
            Action::AudioOutput { mode: AudioMode::Set, device_id, device_name } => {
                assert_eq!(device_id.as_deref(), Some("{0.0.0}.{x}"));
                assert_eq!(device_name.as_deref(), Some("Headset"));
            }
            _ => panic!("esperava audioOutput"),
        }
    }

    #[test]
    fn todas_as_acoes_do_padrao_desserializam() {
        let v: serde_json::Value = serde_json::from_str(crate::config::DEFAULT_JSON).unwrap();
        let mut n = 0;
        fn walk(items: &serde_json::Value, n: &mut usize) {
            for it in items.as_array().unwrap() {
                if let Some(a) = it.get("action") {
                    serde_json::from_value::<Action>(a.clone()).unwrap();
                    *n += 1;
                }
                if let Some(c) = it.get("children") {
                    walk(c, n);
                }
            }
        }
        walk(&v["profiles"][0]["items"], &mut n);
        assert!(n > 10);
    }

    #[test]
    fn expande_variaveis() {
        let home = std::env::var("USERPROFILE").unwrap();
        assert_eq!(expand_env("%USERPROFILE%\\Downloads"), format!("{home}\\Downloads"));
        assert_eq!(expand_env("C:\\sem\\var"), "C:\\sem\\var");
    }
}
