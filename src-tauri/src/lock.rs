//! Travas que se recuperam sozinhas.
//!
//! Se uma thread entrar em pânico segurando um `Mutex`, o padrão do Rust é "envenenar" a
//! trava: todo `lock().unwrap()` seguinte também entra em pânico — um erro raro (ex.: no
//! histórico da área de transferência) derrubaria o menu inteiro até reiniciar a Kira.
//! Os dados protegidos aqui são simples (config, listas, estados) e continuam válidos, então
//! seguimos com eles e limpamos o veneno.

use std::sync::{Mutex, MutexGuard};

pub trait LockExt<T> {
    /// Como `lock().unwrap()`, mas sem propagar o pânico de outra thread.
    fn lock_ok(&self) -> MutexGuard<'_, T>;
}

impl<T> LockExt<T> for Mutex<T> {
    fn lock_ok(&self) -> MutexGuard<'_, T> {
        match self.lock() {
            Ok(g) => g,
            Err(poisoned) => {
                let g = poisoned.into_inner();
                self.clear_poison();
                g
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn trava_envenenada_continua_usavel() {
        let m = Arc::new(Mutex::new(vec![1, 2]));
        let m2 = Arc::clone(&m);
        let _ = std::thread::spawn(move || {
            let mut g = m2.lock_ok();
            g.push(3);
            panic!("pânico de propósito segurando a trava");
        })
        .join();
        assert!(m.is_poisoned());
        assert_eq!(*m.lock_ok(), vec![1, 2, 3]);
        assert!(!m.is_poisoned(), "o veneno é limpo");
        m.lock_ok().push(4);
        assert_eq!(m.lock_ok().len(), 4);
    }
}
