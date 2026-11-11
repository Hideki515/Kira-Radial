//! Avisa o WebView2 quando a janela fica escondida, para ele **parar de desenhar**.
//!
//! Esconder a janela pelo Windows (ShowWindow/`hide()`) não basta: o WebView2 continua
//! renderizando as animações (anéis, esfera, prévias dos temas) sem ninguém ver — medido
//! em ~0,5–1,4 núcleo de CPU/GPU com tudo escondido. Com `IsVisible = false` ele pausa a
//! pintura, os `requestAnimationFrame` e as animações CSS; `TrySuspend` (só na janela de
//! configurações, que abre pouco) ainda congela o script e devolve memória.

use tauri::WebviewWindow;

/// Para de desenhar só se a janela **ainda** estiver escondida — verificado na thread
/// principal, na mesma fila dos outros `set`, para não ganhar de uma abertura que acabou de
/// acontecer (ex.: a página termina de carregar enquanto as Configurações são abertas).
pub fn hide_if_hidden(win: &WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::IsWindowVisible;
    let hwnd = win.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    let _ = win.with_webview(move |pw| {
        // Pelo Win32: na Kira de teste a janela é mostrada direto (set_visible_quiet) e o Tauri não sabe.
        if hwnd == 0 || unsafe { IsWindowVisible(windows::Win32::Foundation::HWND(hwnd as *mut _)) }.as_bool() {
            return;
        }
        unsafe {
            let _ = pw.controller().SetIsVisible(false);
        }
    });
}

/// `visible`: mostra ou esconde para o WebView2. Ao mostrar, chame **depois** de a janela
/// aparecer (com a janela-mãe ainda escondida o WebView2 pode continuar "hidden"). `suspend`: ao esconder, também suspende
/// a página (volta sozinha quando fica visível de novo).
pub fn set(win: &WebviewWindow, visible: bool, suspend: bool) {
    let label = win.label().to_string();
    let r = win.with_webview(move |pw| {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_3;
        use webview2_com_core::Interface;
        let controller = pw.controller();
        unsafe {
            let core3 = controller.CoreWebView2().ok().and_then(|c| c.cast::<ICoreWebView2_3>().ok());
            if visible {
                // Retoma antes de mostrar (suspensa, a página não roda script nem responde à IPC).
                if let Some(c) = &core3 {
                    let _ = c.Resume();
                }
                let _ = controller.SetIsVisible(true);
                return;
            }
            let _ = controller.SetIsVisible(false);
            if let (true, Some(c)) = (suspend, core3) {
                let handler = webview2_com::TrySuspendCompletedHandler::create(Box::new(|_, _| Ok(())));
                let _ = c.TrySuspend(&handler);
            }
        }
    });
    if let Err(e) = r {
        crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("webview \"{label}\": não foi possível mudar a visibilidade: {e}"));
    }
}
