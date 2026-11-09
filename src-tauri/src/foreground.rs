//! App em primeiro plano (para escolher o perfil e devolver o foco depois).

use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
};

#[derive(Clone, Debug, Default)]
pub struct Foreground {
    /// HWND como inteiro (HWND não é Send).
    pub hwnd: isize,
    /// Nome do executável em minúsculas, ex.: "code.exe".
    pub exe: Option<String>,
}

pub fn current() -> Foreground {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return Foreground::default();
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        Foreground { hwnd: hwnd.0 as isize, exe: exe_name(pid) }
    }
}

pub fn exe_name(pid: u32) -> Option<String> {
    if pid == 0 {
        return None;
    }
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(handle);
        ok.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit(['\\', '/']).next().map(|s| s.to_ascii_lowercase())
    }
}

/// Devolve o foco à janela que estava ativa antes do menu abrir.
pub fn restore(hwnd: isize) {
    if hwnd == 0 {
        return;
    }
    unsafe {
        let h = HWND(hwnd as *mut _);
        if IsWindow(Some(h)).as_bool() {
            let _ = SetForegroundWindow(h);
        }
    }
}

/// Executáveis com janela visível e com título (para a lista "Apps abertos").
pub fn visible_window_exes() -> Vec<String> {
    use windows::core::BOOL;
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextLengthW, IsWindowVisible};

    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let pids = &mut *(lparam.0 as *mut Vec<u32>);
        if IsWindowVisible(hwnd).as_bool() && GetWindowTextLengthW(hwnd) > 0 {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            pids.push(pid);
        }
        BOOL(1)
    }

    let mut pids: Vec<u32> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(cb), LPARAM(&mut pids as *mut _ as isize));
    }
    let mut exes: Vec<String> = pids
        .into_iter()
        .filter_map(exe_name)
        .filter(|e| e != "kira-radial.exe" && e != "applicationframehost.exe" && e != "textinputhost.exe")
        .collect();
    exes.sort();
    exes.dedup();
    exes
}

/// Desliga as animações de mostrar/esconder do Windows (DWM) para a janela.
/// Sem isso, ao esconder, o menu "esmaece" por ~100–200 ms e aparece em prints.
pub fn disable_transitions(hwnd: isize) {
    use windows::core::BOOL;
    use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_TRANSITIONS_FORCEDISABLED};
    unsafe {
        let on = BOOL(1);
        let _ = DwmSetWindowAttribute(
            HWND(hwnd as *mut _),
            DWMWA_TRANSITIONS_FORCEDISABLED,
            &on as *const BOOL as *const _,
            std::mem::size_of::<BOOL>() as u32,
        );
    }
}

/// Espera a janela deixar de estar visível e o compositor (DWM) apresentar um
/// quadro sem ela — só então a tela está "limpa" para um print. Máx. `timeout_ms`.
pub fn wait_hidden(hwnd: isize, timeout_ms: u64) {
    use windows::Win32::Graphics::Dwm::DwmFlush;
    use windows::Win32::UI::WindowsAndMessaging::IsWindowVisible;
    if hwnd == 0 {
        return;
    }
    let h = HWND(hwnd as *mut _);
    let start = std::time::Instant::now();
    while unsafe { IsWindowVisible(h).as_bool() } && start.elapsed().as_millis() < timeout_ms as u128 {
        std::thread::sleep(std::time::Duration::from_millis(2));
    }
    // DwmFlush bloqueia até o próximo quadro composto; dois garantem que a tela já foi atualizada.
    unsafe {
        let _ = DwmFlush();
        let _ = DwmFlush();
    }
}
