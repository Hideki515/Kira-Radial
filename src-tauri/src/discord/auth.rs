//! Troca do código de autorização por tokens (OAuth2 do Discord) via WinHTTP — sem crate HTTP.
//! A parte de rede fica atrás de `TokenApi` para os testes (e a Kira de teste) não saírem do PC.
// Na Kira de teste (feature qa) só o Discord falso é usado: o real fica sem chamadas.
#![cfg_attr(feature = "qa", allow(dead_code))]

use serde_json::Value;

/// Endereço de retorno cadastrado no app do Discord (o RPC não abre navegador: só precisa bater).
pub const REDIRECT_URI: &str = "http://localhost";
pub const SCOPES: [&str; 3] = ["rpc", "rpc.voice.read", "rpc.voice.write"];

#[derive(Debug, Clone, PartialEq)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

pub trait TokenApi: Send + Sync {
    /// POST do formulário em /api/oauth2/token; devolve o JSON da resposta (ou o erro em português).
    fn post_token(&self, form: &[(&str, &str)]) -> Result<Value, String>;
}

pub fn exchange_code(api: &dyn TokenApi, client_id: &str, secret: &str, code: &str) -> Result<Tokens, String> {
    parse_tokens(&api.post_token(&[
        ("client_id", client_id),
        ("client_secret", secret),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", REDIRECT_URI),
    ])?)
}

pub fn refresh(api: &dyn TokenApi, client_id: &str, secret: &str, refresh_token: &str) -> Result<Tokens, String> {
    parse_tokens(&api.post_token(&[
        ("client_id", client_id),
        ("client_secret", secret),
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
    ])?)
}

pub fn parse_tokens(v: &Value) -> Result<Tokens, String> {
    if let Some(err) = v["error"].as_str() {
        let why = v["error_description"].as_str().unwrap_or(err);
        return Err(match err {
            "invalid_client" => tr!("Client ID ou Client Secret incorretos.", "Wrong Client ID or Client Secret.").into(),
            "invalid_grant" => trf!("autorização expirada ou recusada ({why}); clique em Conectar de novo.", "authorization expired or refused ({why}); click Connect again."),
            _ => trf!("o Discord recusou a autorização: {why}", "Discord refused the authorization: {why}"),
        });
    }
    let access = v["access_token"].as_str().filter(|s| !s.is_empty()).ok_or(tr!("resposta do Discord sem access_token", "Discord response without access_token"))?;
    Ok(Tokens {
        access_token: access.to_string(),
        refresh_token: v["refresh_token"].as_str().unwrap_or_default().to_string(),
        expires_in: v["expires_in"].as_u64().unwrap_or(7 * 24 * 3600),
    })
}

/// application/x-www-form-urlencoded.
pub fn form_encode(form: &[(&str, &str)]) -> String {
    fn enc(s: &str) -> String {
        s.bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
                _ => format!("%{b:02X}"),
            })
            .collect()
    }
    form.iter().map(|(k, v)| format!("{}={}", enc(k), enc(v))).collect::<Vec<_>>().join("&")
}

/// Chamada de verdade para discord.com (HTTPS pelo WinHTTP do Windows, que usa o proxy do sistema).
pub struct WinHttp;

impl TokenApi for WinHttp {
    fn post_token(&self, form: &[(&str, &str)]) -> Result<Value, String> {
        let body = form_encode(form);
        let (status, text) = winhttp::post("discord.com", "/api/oauth2/token", "application/x-www-form-urlencoded", body.as_bytes())?;
        match serde_json::from_slice::<Value>(&text) {
            Ok(v) => Ok(v),
            Err(_) => Err(trf!("resposta inesperada do Discord (HTTP {status})", "unexpected response from Discord (HTTP {status})")),
        }
    }
}

mod winhttp {
    use windows::core::{w, HSTRING, PCWSTR};
    use windows::Win32::Networking::WinHttp::*;

    /// Fecha o handle ao sair do escopo.
    struct H(*mut core::ffi::c_void);
    impl Drop for H {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    let _ = WinHttpCloseHandle(self.0);
                }
            }
        }
    }

    fn check(h: *mut core::ffi::c_void, what: &str) -> Result<H, String> {
        if h.is_null() {
            Err(trf!("sem conexão com o Discord ({what}: {})", "no connection to Discord ({what}: {})", windows::core::Error::from_win32()))
        } else {
            Ok(H(h))
        }
    }

    pub fn post(host: &str, path: &str, content_type: &str, body: &[u8]) -> Result<(u32, Vec<u8>), String> {
        let net = |e: windows::core::Error| trf!("sem conexão com o Discord: {e}", "no connection to Discord: {e}");
        unsafe {
            let session = check(
                WinHttpOpen(w!("KiraRadial"), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, PCWSTR::null(), PCWSTR::null(), 0),
                "sessão",
            )?;
            WinHttpSetTimeouts(session.0, 10_000, 10_000, 10_000, 15_000).map_err(net)?;
            let conn = check(WinHttpConnect(session.0, &HSTRING::from(host), INTERNET_DEFAULT_HTTPS_PORT, 0), "conexão")?;
            let req = check(
                WinHttpOpenRequest(conn.0, w!("POST"), &HSTRING::from(path), PCWSTR::null(), PCWSTR::null(), std::ptr::null(), WINHTTP_FLAG_SECURE),
                "pedido",
            )?;
            let headers: Vec<u16> = format!("Content-Type: {content_type}\r\n").encode_utf16().collect();
            WinHttpSendRequest(req.0, Some(&headers), Some(body.as_ptr() as *const _), body.len() as u32, body.len() as u32, 0).map_err(net)?;
            WinHttpReceiveResponse(req.0, std::ptr::null_mut()).map_err(net)?;
            let mut status = 0u32;
            let mut len = 4u32;
            let mut idx = 0u32;
            WinHttpQueryHeaders(
                req.0,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                PCWSTR::null(),
                Some(&mut status as *mut u32 as *mut _),
                &mut len,
                &mut idx,
            )
            .map_err(net)?;
            let mut out = Vec::new();
            loop {
                let mut avail = 0u32;
                WinHttpQueryDataAvailable(req.0, &mut avail).map_err(net)?;
                if avail == 0 {
                    break;
                }
                if out.len() + avail as usize > super::super::ipc::MAX_FRAME {
                    return Err(tr!("resposta do Discord grande demais", "Discord response too large").into());
                }
                let mut buf = vec![0u8; avail as usize];
                let mut read = 0u32;
                WinHttpReadData(req.0, buf.as_mut_ptr() as *mut _, avail, &mut read).map_err(net)?;
                out.extend_from_slice(&buf[..read as usize]);
            }
            Ok((status, out))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex;

    struct Fake(Mutex<Vec<String>>, Value);
    impl TokenApi for Fake {
        fn post_token(&self, form: &[(&str, &str)]) -> Result<Value, String> {
            self.0.lock().unwrap().push(form_encode(form));
            Ok(self.1.clone())
        }
    }

    #[test]
    fn codifica_formulario() {
        assert_eq!(form_encode(&[("a b", "x&y=z"), ("u", "http://localhost")]), "a%20b=x%26y%3Dz&u=http%3A%2F%2Flocalhost");
    }

    #[test]
    fn troca_o_codigo_com_redirect_e_le_tokens() {
        let api = Fake(Mutex::new(vec![]), json!({"access_token": "A", "refresh_token": "R", "expires_in": 604800}));
        let t = exchange_code(&api, "1", "s", "C").unwrap();
        assert_eq!(t, Tokens { access_token: "A".into(), refresh_token: "R".into(), expires_in: 604800 });
        let sent = api.0.lock().unwrap()[0].clone();
        assert!(sent.contains("grant_type=authorization_code") && sent.contains("code=C") && sent.contains("redirect_uri=http%3A%2F%2Flocalhost"), "{sent}");
        refresh(&api, "1", "s", "R").unwrap();
        assert!(api.0.lock().unwrap()[1].contains("grant_type=refresh_token&refresh_token=R"));
    }

    #[test]
    fn erros_de_oauth_em_portugues() {
        assert!(parse_tokens(&json!({"error": "invalid_client"})).unwrap_err().contains("Client Secret"));
        assert!(parse_tokens(&json!({"error": "invalid_grant", "error_description": "x"})).unwrap_err().contains("Conectar"));
        assert!(parse_tokens(&json!({"token_type": "Bearer"})).is_err());
    }
}
