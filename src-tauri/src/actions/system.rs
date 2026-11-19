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
        .map_err(|e| trf!("o Windows recusou o comando: {e}", "Windows refused the command: {e}"))
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
            Err(e) => Err(trf!("sem permissão para desligar: {e}", "no permission to shut down: {e}")),
        }
    }
}

/// Interpreta o GetLastError() logo após um AdjustTokenPrivileges bem-sucedido.
pub fn privilege_result(last_error: u32) -> Result<(), String> {
    const ERROR_NOT_ALL_ASSIGNED: u32 = 1300;
    match last_error {
        ERROR_NOT_ALL_ASSIGNED => Err(
            tr!("sem permissão para desligar/reiniciar: a conta não tem o privilégio de desligamento (política do Windows)", "no permission to shut down/restart: the account doesn't have the shutdown privilege (Windows policy)").into(),
        ),
        _ => Ok(()),
    }
}

/// Na Kira de teste, nada que tire o usuário da sessão ou da máquina roda de verdade.
pub fn blocked_in_qa(cmd: SystemCmd) -> bool {
    crate::qa::ENABLED
        && matches!(cmd, SystemCmd::Shutdown | SystemCmd::Restart | SystemCmd::SignOut | SystemCmd::Sleep | SystemCmd::Lock)
}

pub(super) fn system(cmd: SystemCmd) -> Result<(), String> {
    if blocked_in_qa(cmd) {
        return Err(trf!("{cmd:?} bloqueado na Kira de teste", "{cmd:?} blocked in the test Kira"));
    }
    match cmd {
        SystemCmd::Lock => unsafe { LockWorkStation().map_err(|e| e.to_string()) },
        SystemCmd::Sleep => {
            // hibernate=false, force=false, wakeupEventsDisabled=false
            if unsafe { SetSuspendState(false, false, false) } {
                Ok(())
            } else {
                Err(tr!("não foi possível suspender", "couldn't sleep").into())
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

#[cfg(test)]
mod qa_guard_tests {
    use super::*;

    #[test]
    fn kira_de_teste_nao_desliga_reinicia_nem_bloqueia() {
        for cmd in [SystemCmd::Shutdown, SystemCmd::Restart, SystemCmd::SignOut, SystemCmd::Sleep, SystemCmd::Lock] {
            assert_eq!(blocked_in_qa(cmd), crate::qa::ENABLED, "{cmd:?}");
            if crate::qa::ENABLED {
                assert!(system(cmd).unwrap_err().contains("bloqueado"));
            }
        }
        assert!(!blocked_in_qa(SystemCmd::TaskMgr));
    }
}
