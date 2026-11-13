//! Conversa com o Discord: handshake e comandos com `nonce` (pedido → resposta).
//! Sem thread de leitura: cada comando lê até achar a própria resposta e descarta eventos.

use super::ipc::{Transport, OP_CLOSE, OP_FRAME, OP_HANDSHAKE, OP_PING, OP_PONG};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq)]
pub enum RpcError {
    /// Pipe fechado/quebrado (Discord fechado ou reiniciado): vale reconectar.
    Closed(String),
    /// O Discord respondeu com erro (ex.: 4006 = não autenticado).
    Rpc { code: i64, message: String },
}

impl RpcError {
    pub fn text(&self) -> String {
        match self {
            RpcError::Closed(m) => m.clone(),
            RpcError::Rpc { code, message } => format!("o Discord recusou ({code}): {message}"),
        }
    }
}

pub struct Client {
    t: Box<dyn Transport>,
    nonce: u64,
}

impl Client {
    pub fn new(t: Box<dyn Transport>) -> Self {
        Client { t, nonce: 0 }
    }

    /// Apresenta o app ao Discord. Devolve o evento READY.
    pub fn handshake(&mut self, client_id: &str) -> Result<Value, RpcError> {
        self.t.send(OP_HANDSHAKE, &json!({ "v": 1, "client_id": client_id })).map_err(RpcError::Closed)?;
        loop {
            let (op, v) = self.t.recv().map_err(RpcError::Closed)?;
            match op {
                OP_CLOSE => return Err(close_error(&v)),
                OP_PING => self.t.send(OP_PONG, &v).map_err(RpcError::Closed)?,
                OP_FRAME if v["evt"] == "READY" => return Ok(v["data"].clone()),
                OP_FRAME if v["evt"] == "ERROR" => return Err(rpc_error(&v)),
                _ => {}
            }
        }
    }

    /// Envia um comando e espera a resposta com o mesmo nonce.
    pub fn command(&mut self, cmd: &str, args: Value) -> Result<Value, RpcError> {
        self.nonce += 1;
        let nonce = format!("kira-{}", self.nonce);
        self.t
            .send(OP_FRAME, &json!({ "cmd": cmd, "args": args, "nonce": nonce }))
            .map_err(RpcError::Closed)?;
        loop {
            let (op, v) = self.t.recv().map_err(RpcError::Closed)?;
            match op {
                OP_CLOSE => return Err(close_error(&v)),
                OP_PING => self.t.send(OP_PONG, &v).map_err(RpcError::Closed)?,
                OP_FRAME if v["nonce"].as_str() == Some(nonce.as_str()) => {
                    return if v["evt"] == "ERROR" { Err(rpc_error(&v)) } else { Ok(v["data"].clone()) };
                }
                // Eventos (DISPATCH) e respostas antigas: ignorados.
                _ => {}
            }
        }
    }
}

fn rpc_error(v: &Value) -> RpcError {
    RpcError::Rpc {
        code: v["data"]["code"].as_i64().unwrap_or(0),
        message: v["data"]["message"].as_str().unwrap_or("erro desconhecido").to_string(),
    }
}

fn close_error(v: &Value) -> RpcError {
    let msg = v["message"].as_str().unwrap_or("conexão encerrada");
    RpcError::Closed(format!("o Discord encerrou a conexão: {msg}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use std::sync::{Arc, Mutex};

    /// Transporte roteirizado: devolve as respostas na ordem e guarda o que foi enviado.
    struct Script {
        replies: VecDeque<(u32, Value)>,
        sent: Sent,
    }
    impl Transport for Script {
        fn send(&mut self, op: u32, v: &Value) -> Result<(), String> {
            self.sent.lock().unwrap().push((op, v.clone()));
            Ok(())
        }
        fn recv(&mut self) -> Result<(u32, Value), String> {
            self.replies.pop_front().ok_or_else(|| "pipe fechado".to_string())
        }
    }

    type Sent = Arc<Mutex<Vec<(u32, Value)>>>;

    fn client(replies: Vec<(u32, Value)>) -> (Client, Sent) {
        let sent = Arc::new(Mutex::new(vec![]));
        (Client::new(Box::new(Script { replies: replies.into(), sent: sent.clone() })), sent)
    }

    #[test]
    fn handshake_espera_ready_e_responde_ping() {
        let (mut c, sent) = client(vec![
            (OP_PING, json!({"x": 1})),
            (OP_FRAME, json!({"evt": "READY", "data": {"v": 1}})),
        ]);
        assert_eq!(c.handshake("123").unwrap(), json!({"v": 1}));
        let sent = sent.lock().unwrap();
        assert_eq!(sent[0], (OP_HANDSHAKE, json!({"v": 1, "client_id": "123"})));
        assert_eq!(sent[1], (OP_PONG, json!({"x": 1})));
    }

    #[test]
    fn handshake_recusado_vira_erro() {
        let (mut c, _) = client(vec![(OP_CLOSE, json!({"code": 4000, "message": "Invalid Client ID"}))]);
        let e = c.handshake("x").unwrap_err();
        assert!(matches!(&e, RpcError::Closed(m) if m.contains("Invalid Client ID")), "{e:?}");
    }

    #[test]
    fn comando_ignora_eventos_e_respostas_de_outro_nonce() {
        let (mut c, _) = client(vec![
            (OP_FRAME, json!({"cmd": "DISPATCH", "evt": "VOICE_SETTINGS_UPDATE", "data": {}, "nonce": null})),
            (OP_FRAME, json!({"cmd": "GET_VOICE_SETTINGS", "data": {"mute": false}, "nonce": "kira-99"})),
            (OP_FRAME, json!({"cmd": "GET_VOICE_SETTINGS", "data": {"mute": true}, "nonce": "kira-1"})),
        ]);
        assert_eq!(c.command("GET_VOICE_SETTINGS", json!({})).unwrap(), json!({"mute": true}));
    }

    #[test]
    fn erro_do_discord_tem_codigo_e_mensagem() {
        let (mut c, _) = client(vec![(
            OP_FRAME,
            json!({"cmd": "SET_VOICE_SETTINGS", "evt": "ERROR", "data": {"code": 4006, "message": "Not authenticated"}, "nonce": "kira-1"}),
        )]);
        assert_eq!(
            c.command("SET_VOICE_SETTINGS", json!({"mute": true})).unwrap_err(),
            RpcError::Rpc { code: 4006, message: "Not authenticated".into() }
        );
    }

    #[test]
    fn pipe_quebrado_no_meio_e_closed() {
        let (mut c, sent) = client(vec![]);
        assert!(matches!(c.command("GET_VOICE_SETTINGS", json!({})), Err(RpcError::Closed(_))));
        assert_eq!(sent.lock().unwrap()[0].1["nonce"], "kira-1");
    }
}
