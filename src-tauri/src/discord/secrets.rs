//! Credenciais do Discord (client secret e tokens) cifradas com DPAPI em `discord.bin`.
//! Ficam fora do config.json: não vão para backups, exportação nem relatório de diagnóstico.
//! A DPAPI amarra a cifra ao usuário do Windows: outro usuário ou outro PC não consegue ler.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use windows::Win32::Foundation::{LocalFree, HLOCAL};
use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB};

#[derive(Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct Secrets {
    pub client_id: String,
    pub client_secret: String,
    pub access_token: String,
    pub refresh_token: String,
    /// Validade do access token (segundos desde 1970).
    pub expires_at: u64,
    /// Nome do usuário do Discord (só para mostrar nas Configurações).
    #[serde(default)]
    pub user: Option<String>,
}

/// Debug sem o segredo e os tokens (nada disso pode ir para o log por engano).
impl std::fmt::Debug for Secrets {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Secrets")
            .field("client_id", &self.client_id)
            .field("client_secret", &"***")
            .field("access_token", &"***")
            .field("refresh_token", &"***")
            .field("expires_at", &self.expires_at)
            .field("user", &self.user)
            .finish()
    }
}

pub fn path() -> PathBuf {
    crate::config::config_dir().join("discord.bin")
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

impl Secrets {
    /// Falta menos de um dia para o token vencer (vale renovar antes de usar).
    pub fn needs_refresh(&self, now: u64) -> bool {
        self.expires_at <= now + 24 * 3600
    }
}

fn blob(data: &[u8]) -> CRYPT_INTEGER_BLOB {
    CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 }
}

/// Copia a saída da DPAPI e libera a memória dela.
unsafe fn take(out: CRYPT_INTEGER_BLOB) -> Vec<u8> {
    let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
    let _ = LocalFree(Some(HLOCAL(out.pbData as *mut _)));
    v
}

pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
    let input = blob(data);
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(&input, windows::core::w!("Kira Radial — Discord"), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            .map_err(|e| format!("falha ao cifrar as credenciais: {e}"))?;
        Ok(take(out))
    }
}

pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    let input = blob(data);
    let mut out = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            .map_err(|e| format!("falha ao decifrar as credenciais: {e}"))?;
        Ok(take(out))
    }
}

pub fn load_from(p: &Path) -> Option<Secrets> {
    let raw = std::fs::read(p).ok()?;
    let plain = unprotect(&raw).ok()?;
    serde_json::from_slice(&plain).ok()
}

pub fn save_to(p: &Path, s: &Secrets) -> Result<(), String> {
    let plain = serde_json::to_vec(s).map_err(|e| e.to_string())?;
    let enc = protect(&plain)?;
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    // Grava num temporário e renomeia: um corte de energia não deixa o arquivo pela metade.
    let tmp = p.with_extension("bin.tmp");
    std::fs::write(&tmp, enc).map_err(|e| format!("falha ao gravar as credenciais: {e}"))?;
    std::fs::rename(&tmp, p).map_err(|e| format!("falha ao gravar as credenciais: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Secrets {
        Secrets {
            client_id: "123".into(),
            client_secret: "segredo-de-teste".into(),
            access_token: "a".into(),
            refresh_token: "r".into(),
            expires_at: 1_000,
            user: Some("kira".into()),
        }
    }

    #[test]
    fn dpapi_ida_e_volta_e_cifra_de_verdade() {
        let enc = protect(b"segredo-de-teste").unwrap();
        assert!(!enc.windows(16).any(|w| w == b"segredo-de-teste"), "texto puro no arquivo");
        assert_eq!(unprotect(&enc).unwrap(), b"segredo-de-teste");
        assert!(unprotect(b"lixo").is_err());
    }

    #[test]
    fn arquivo_ida_e_volta_fora_da_pasta_real() {
        let dir = std::env::temp_dir().join(format!("kira-discord-secrets-{}", std::process::id()));
        let p = dir.join("discord.bin");
        save_to(&p, &sample()).unwrap();
        assert_eq!(load_from(&p), Some(sample()));
        std::fs::write(&p, b"corrompido").unwrap();
        assert_eq!(load_from(&p), None);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn debug_nao_mostra_segredos() {
        let d = format!("{:?}", sample());
        assert!(!d.contains("segredo-de-teste") && d.contains("123") && d.contains("***"), "{d}");
    }

    #[test]
    fn renova_um_dia_antes_de_vencer() {
        let s = Secrets { expires_at: 100_000, ..sample() };
        assert!(!s.needs_refresh(100_000 - 25 * 3600));
        assert!(s.needs_refresh(100_000 - 23 * 3600));
        assert!(s.needs_refresh(200_000));
    }
}
