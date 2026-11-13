//! Discord falso, em memória: usado nos testes e na Kira de teste (`--features qa`), que
//! assim NUNCA fala com o Discord do usuário. Responde ao mesmo protocolo do RPC de verdade.

use super::auth::TokenApi;
use super::ipc::{Transport, OP_CLOSE, OP_FRAME, OP_HANDSHAKE};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

pub const FAKE_CODE: &str = "codigo-falso";
pub const FAKE_TOKEN: &str = "token-falso";

#[derive(Debug, Clone)]
pub struct FakeState {
    pub mute: bool,
    pub deaf: bool,
    pub input: String,
    pub output: String,
    /// Discord "fechado": abrir o pipe falha.
    pub closed: bool,
    /// Quantos comandos recebeu (para os testes).
    pub commands: Vec<String>,
}

impl Default for FakeState {
    fn default() -> Self {
        FakeState {
            mute: false,
            deaf: false,
            input: "default".into(),
            output: "default".into(),
            closed: false,
            commands: vec![],
        }
    }
}

pub type Shared = Arc<Mutex<FakeState>>;

pub struct FakeDiscord {
    state: Shared,
    authed: bool,
    out: VecDeque<(u32, Value)>,
}

impl FakeDiscord {
    pub fn open(state: &Shared) -> Result<Self, String> {
        if state.lock().unwrap().closed {
            return Err(super::CLOSED.into());
        }
        Ok(FakeDiscord { state: state.clone(), authed: false, out: VecDeque::new() })
    }
}

fn devices(kind: &str) -> Value {
    if kind == "input" {
        json!([{"id": "default", "name": "Default"}, {"id": "mic-1", "name": "Microfone (USB Audio)"}, {"id": "mic-2", "name": "Headset Microphone (Arctis)"}])
    } else {
        json!([{"id": "default", "name": "Default"}, {"id": "out-1", "name": "Alto-falantes (Realtek(R) Audio)"}, {"id": "out-2", "name": "Headset Earphone (Arctis)"}])
    }
}

fn settings(s: &FakeState) -> Value {
    json!({
        "mute": s.mute || s.deaf,
        "deaf": s.deaf,
        "input": {"device_id": s.input, "available_devices": devices("input"), "volume": 100},
        "output": {"device_id": s.output, "available_devices": devices("output"), "volume": 100},
    })
}

impl Transport for FakeDiscord {
    fn send(&mut self, op: u32, v: &Value) -> Result<(), String> {
        let mut s = self.state.lock().unwrap();
        if s.closed {
            return Err("conexão com o Discord encerrada (falso)".into());
        }
        if op == OP_HANDSHAKE {
            if v["client_id"].as_str().unwrap_or("").is_empty() {
                self.out.push_back((OP_CLOSE, json!({"code": 4000, "message": "Invalid Client ID"})));
            } else {
                self.out.push_back((OP_FRAME, json!({"cmd": "DISPATCH", "evt": "READY", "data": {"v": 1}})));
            }
            return Ok(());
        }
        let cmd = v["cmd"].as_str().unwrap_or("").to_string();
        s.commands.push(cmd.clone());
        let nonce = v["nonce"].clone();
        let args = &v["args"];
        let reply = |data: Value| json!({"cmd": cmd, "data": data, "nonce": nonce});
        let error = |code: i64, msg: &str| json!({"cmd": cmd, "evt": "ERROR", "data": {"code": code, "message": msg}, "nonce": nonce});
        // Um evento qualquer antes da resposta, como o Discord de verdade faz às vezes.
        self.out.push_back((OP_FRAME, json!({"cmd": "DISPATCH", "evt": "VOICE_CONNECTION_STATUS", "data": {}, "nonce": null})));
        let r = match cmd.as_str() {
            "AUTHORIZE" => reply(json!({"code": FAKE_CODE})),
            "AUTHENTICATE" if args["access_token"] == FAKE_TOKEN => {
                self.authed = true;
                reply(json!({"user": {"username": "kira-teste"}}))
            }
            "AUTHENTICATE" => error(4009, "Invalid OAuth2 access token"),
            _ if !self.authed => error(4006, "Not authenticated or invalid scope"),
            "GET_VOICE_SETTINGS" => reply(settings(&s)),
            "SET_VOICE_SETTINGS" => {
                if let Some(d) = args["deaf"].as_bool() {
                    s.deaf = d;
                }
                if let Some(m) = args["mute"].as_bool() {
                    s.mute = m;
                }
                if let Some(id) = args["input"]["device_id"].as_str() {
                    s.input = id.into();
                }
                if let Some(id) = args["output"]["device_id"].as_str() {
                    s.output = id.into();
                }
                reply(settings(&s))
            }
            _ => error(4000, "comando desconhecido"),
        };
        self.out.push_back((OP_FRAME, r));
        Ok(())
    }

    fn recv(&mut self) -> Result<(u32, Value), String> {
        self.out.pop_front().ok_or_else(|| "conexão com o Discord encerrada (falso)".to_string())
    }
}

/// Troca de token falsa: o código falso vira o token falso; qualquer outro, recusado.
pub struct FakeTokens;

impl TokenApi for FakeTokens {
    fn post_token(&self, form: &[(&str, &str)]) -> Result<Value, String> {
        let get = |k: &str| form.iter().find(|(a, _)| *a == k).map(|(_, v)| *v).unwrap_or("");
        if get("client_secret").is_empty() {
            return Ok(json!({"error": "invalid_client"}));
        }
        let ok = match get("grant_type") {
            "authorization_code" => get("code") == FAKE_CODE,
            "refresh_token" => !get("refresh_token").is_empty(),
            _ => false,
        };
        Ok(if ok {
            json!({"access_token": FAKE_TOKEN, "refresh_token": "refresh-falso", "expires_in": 604800})
        } else {
            json!({"error": "invalid_grant"})
        })
    }
}
