//! Ações de sistema: bloquear, suspender, desligar, reiniciar, sair, captura de tela etc.

use super::{keys, shell_execute, SystemCmd};
use windows::core::PCWSTR;
use windows::Win32::System::Power::SetSuspendState;
use windows::Win32::System::Shutdown::{
    ExitWindowsEx, LockWorkStation, EWX_LOGOFF, EWX_POWEROFF, EWX_REBOOT, EWX_SHUTDOWN, EXIT_WINDOWS_FLAGS,
    SHTDN_REASON_FLAG_PLANNED, SHTDN_REASON_MAJOR_OTHER,
};

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

pub(super) fn system(cmd: SystemCmd) -> Result<(), String> {
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
