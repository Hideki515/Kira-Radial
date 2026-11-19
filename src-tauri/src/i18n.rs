//! Idioma das mensagens do Rust que chegam à tela (erros de ação, bandeja, avisos).
//! O log continua em português (é para diagnóstico).
//!
//! - `tr!("pt", "en")`: texto fixo.
//! - `trf!("pt {}", "en {}"; a)`: texto com valores (os dois com os mesmos `{}`).
//!
//! O idioma segue `behavior.language`: "pt", "en" ou automático (português se ele estiver
//! em qualquer posição da lista de idiomas do Windows — a mesma regra do front).

use std::sync::atomic::{AtomicBool, Ordering};

static EN: AtomicBool = AtomicBool::new(false);

/// Inglês está ativo?
pub fn is_en() -> bool {
    #[cfg(test)]
    if let Some(v) = TEST_EN.with(|c| c.get()) {
        return v;
    }
    EN.load(Ordering::Relaxed)
}

// Nos testes o idioma vale só para a thread (os testes rodam em paralelo).
#[cfg(test)]
thread_local! {
    static TEST_EN: std::cell::Cell<Option<bool>> = const { std::cell::Cell::new(None) };
}

/// Resolve o idioma da config (lista do Windows só no automático).
pub fn resolve_en(setting: Option<&str>, system: impl FnOnce() -> Vec<String>) -> bool {
    match setting {
        Some("pt") => false,
        Some("en") => true,
        _ => !system().iter().any(|l| l.to_ascii_lowercase().starts_with("pt")),
    }
}

/// Aplica o idioma da config; devolve `true` se mudou.
pub fn apply(setting: Option<&str>) -> bool {
    let en = resolve_en(setting, crate::syslang::languages);
    EN.swap(en, Ordering::Relaxed) != en
}

/// Só para testes: idioma desta thread.
#[cfg(test)]
pub fn set_en_for_tests(en: bool) {
    TEST_EN.with(|c| c.set(Some(en)));
}

#[macro_export]
macro_rules! tr {
    ($pt:expr, $en:expr $(,)?) => {
        if $crate::i18n::is_en() { $en } else { $pt }
    };
}

#[macro_export]
macro_rules! trf {
    ($pt:literal, $en:literal $(,)?) => {
        if $crate::i18n::is_en() { format!($en) } else { format!($pt) }
    };
    ($pt:literal, $en:literal, $($arg:expr),+ $(,)?) => {
        if $crate::i18n::is_en() { format!($en, $($arg),+) } else { format!($pt, $($arg),+) }
    };
    ($pt:literal, $en:literal; $($arg:expr),* $(,)?) => {
        if $crate::i18n::is_en() { format!($en, $($arg),*) } else { format!($pt, $($arg),*) }
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trf_captura_variaveis_e_troca_de_idioma() {
        let combo = "Ctrl+Q";
        set_en_for_tests(false);
        assert_eq!(trf!("inválida: {combo}", "invalid: {combo}"), "inválida: Ctrl+Q");
        set_en_for_tests(true);
        assert_eq!(trf!("inválida: {combo}", "invalid: {combo}"), "invalid: Ctrl+Q");
        assert_eq!(tr!("Sair", "Quit"), "Quit");
        set_en_for_tests(false);
    }

    #[test]
    fn mensagens_do_rust_saem_no_idioma() {
        let mut c = crate::config::Config::default_config();
        c.profiles.clear();
        set_en_for_tests(true);
        assert_eq!(c.validate().unwrap_err(), "at least one profile is required");
        set_en_for_tests(false);
        assert_eq!(c.validate().unwrap_err(), "é necessário ao menos um perfil");
    }

    #[test]
    fn automatico_usa_a_lista_do_windows() {
        let sys = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(!resolve_en(None, || sys(&["en-US", "pt-BR"])), "pt em 2º lugar ainda é português");
        assert!(resolve_en(Some("auto"), || sys(&["en-US", "es-ES"])));
        assert!(resolve_en(None, Vec::new));
        assert!(!resolve_en(Some("pt"), || sys(&["en-US"])));
        assert!(resolve_en(Some("en"), || sys(&["pt-BR"])));
    }
}
