//! Controle do OBS Studio pelo servidor WebSocket local dele (obs-websocket 5, que já vem
//! no OBS 28+): trocar de cena, gravar, transmitir, pausar, salvar replay, câmera virtual
//! e mutar fontes de áudio.
//!
//! Cada chamada abre a conexão, faz o pedido e fecha: sem conexão parada nem polling (parada,
//! a Kira não gasta nada). Porta e senha ficam cifradas com DPAPI em `obs.bin`, fora do
//! config.json (não vão para backups nem para a exportação).
//! A Kira de teste nunca fala com o OBS de verdade: usa um OBS de mentira em memória.

// Na Kira de teste o caminho de rede só é usado pelos testes.
#![cfg_attr(feature = "qa", allow(dead_code))]

#[cfg(any(test, feature = "qa"))]
pub mod fake;
pub mod proto;
pub mod ws;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use ws::{Ws, WsError};

pub const DEFAULT_PORT: u16 = 4455;
const TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ObsCmd {
    SetScene,
    ToggleRecord,
    StartRecord,
    StopRecord,
    ToggleRecordPause,
    ToggleStream,
    StartStream,
    StopStream,
    ToggleMute,
    SaveReplay,
    ToggleVirtualCam,
}

impl ObsCmd {
    /// Pedido do obs-websocket e se precisa de cena/fonte.
    pub fn request(self) -> &'static str {
        match self {
            ObsCmd::SetScene => "SetCurrentProgramScene",
            ObsCmd::ToggleRecord => "ToggleRecord",
            ObsCmd::StartRecord => "StartRecord",
            ObsCmd::StopRecord => "StopRecord",
            ObsCmd::ToggleRecordPause => "ToggleRecordPause",
            ObsCmd::ToggleStream => "ToggleStream",
            ObsCmd::StartStream => "StartStream",
            ObsCmd::StopStream => "StopStream",
            ObsCmd::ToggleMute => "ToggleInputMute",
            ObsCmd::SaveReplay => "SaveReplayBuffer",
            ObsCmd::ToggleVirtualCam => "ToggleVirtualCam",
        }
    }
}

/// Porta e senha (a senha nunca sai daqui para a interface).
#[derive(Serialize, Deserialize, Clone, PartialEq, Default)]
pub struct Settings {
    pub port: u16,
    #[serde(default)]
    pub password: String,
}

impl std::fmt::Debug for Settings {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Settings").field("port", &self.port).field("password", &if self.password.is_empty() { "" } else { "***" }).finish()
    }
}

fn settings_path() -> std::path::PathBuf {
    crate::config::config_dir().join("obs.bin")
}

pub fn load_settings() -> Settings {
    std::fs::read(settings_path())
        .ok()
        .and_then(|b| crate::discord::secrets::unprotect(&b).ok())
        .and_then(|b| serde_json::from_slice::<Settings>(&b).ok())
        .filter(|s| s.port != 0)
        .unwrap_or(Settings { port: DEFAULT_PORT, password: String::new() })
}

pub fn save_settings(s: &Settings) -> Result<(), String> {
    let data = serde_json::to_vec(s).map_err(|e| e.to_string())?;
    let enc = crate::discord::secrets::protect(&data)?;
    std::fs::create_dir_all(crate::config::config_dir()).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(), enc).map_err(|e| e.to_string())
}

/// O que a interface vê da configuração.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub port: u16,
    pub has_password: bool,
}

pub fn settings_view() -> SettingsView {
    let s = load_settings();
    SettingsView { port: s.port, has_password: !s.password.is_empty() }
}

/// Grava porta e senha. `password`: None = mantém a atual; Some("") = apaga.
pub fn update_settings(port: u16, password: Option<String>) -> Result<SettingsView, String> {
    if port == 0 {
        return Err(tr!("porta inválida", "invalid port").into());
    }
    let mut s = load_settings();
    s.port = port;
    if let Some(p) = password {
        s.password = p;
    }
    save_settings(&s)?;
    Ok(SettingsView { port: s.port, has_password: !s.password.is_empty() })
}

#[derive(Debug, PartialEq)]
pub enum ObsError {
    /// OBS fechado ou servidor WebSocket desligado.
    Closed,
    NeedPassword,
    AuthFailed,
    /// O OBS recusou o pedido (código, comentário).
    Request(i64, String),
    Other(String),
}

impl ObsError {
    pub fn status(&self) -> &'static str {
        match self {
            ObsError::Closed => "closed",
            ObsError::NeedPassword => "needPassword",
            ObsError::AuthFailed => "authFailed",
            _ => "error",
        }
    }

    pub fn message(&self) -> String {
        match self {
            ObsError::Closed => tr!(
                "O OBS não está aberto, ou o servidor WebSocket dele está desligado (OBS → Ferramentas → Configurações do servidor WebSocket).",
                "OBS isn't open, or its WebSocket server is off (OBS → Tools → WebSocket Server Settings)."
            )
            .into(),
            ObsError::NeedPassword => tr!("O OBS pede senha: informe-a em Configurações → OBS.", "OBS asks for a password: enter it in Settings → OBS.").into(),
            ObsError::AuthFailed => tr!("O OBS recusou a senha. Confira em Configurações → OBS.", "OBS rejected the password. Check it in Settings → OBS.").into(),
            ObsError::Request(code, comment) if comment.is_empty() => trf!("o OBS recusou o pedido (código {code})", "OBS rejected the request (code {code})"),
            ObsError::Request(code, comment) => trf!("o OBS recusou o pedido: {comment} (código {code})", "OBS rejected the request: {comment} (code {code})"),
            ObsError::Other(e) => trf!("falha ao falar com o OBS: {e}", "couldn't talk to OBS: {e}"),
        }
    }
}

impl From<WsError> for ObsError {
    fn from(e: WsError) -> Self {
        match e {
            WsError::Refused => ObsError::Closed,
            WsError::Closed(proto::CLOSE_AUTH_FAILED, _) => ObsError::AuthFailed,
            WsError::Closed(code, reason) if !reason.is_empty() => ObsError::Other(format!("{reason} ({code})")),
            WsError::Closed(code, _) => ObsError::Other(trf!("conexão fechada ({code})", "connection closed ({code})")),
            WsError::Timeout => ObsError::Other(tr!("o OBS não respondeu a tempo", "OBS didn't respond in time").into()),
            WsError::Protocol(p) => ObsError::Other(p),
            WsError::Io(e) => ObsError::Other(e.to_string()),
        }
    }
}

/// Conexão identificada com o OBS (uma por chamada).
pub struct Session {
    ws: Ws,
    next: u32,
}

impl Session {
    pub fn open(s: &Settings) -> Result<Session, ObsError> {
        let mut ws = Ws::connect(s.port, TIMEOUT)?;
        let hello: Value = serde_json::from_str(&ws.recv_text()?).map_err(|e| ObsError::Other(e.to_string()))?;
        let id = proto::identify(&hello, Some(&s.password)).map_err(|e| match e {
            proto::HelloError::NeedPassword => ObsError::NeedPassword,
            proto::HelloError::NotHello => ObsError::Other(tr!("o servidor não parece ser o OBS", "the server doesn't look like OBS").into()),
        })?;
        ws.send_text(&id.to_string())?;
        // Identified (op 2); senha errada chega como fechamento 4009.
        loop {
            let msg: Value = serde_json::from_str(&ws.recv_text()?).map_err(|e| ObsError::Other(e.to_string()))?;
            if msg.get("op").and_then(Value::as_i64) == Some(2) {
                return Ok(Session { ws, next: 0 });
            }
        }
    }

    pub fn call(&mut self, kind: &str, data: Option<Value>) -> Result<Value, ObsError> {
        self.next += 1;
        let id = format!("k{}", self.next);
        self.ws.send_text(&proto::request(kind, &id, data).to_string())?;
        loop {
            let msg: Value = serde_json::from_str(&self.ws.recv_text()?).map_err(|e| ObsError::Other(e.to_string()))?;
            if let Some(r) = proto::response(&msg, &id) {
                return r.map_err(|(c, m)| ObsError::Request(c, m));
            }
        }
    }

    pub fn close(self) {
        self.ws.close();
    }
}

/// Estado mostrado nas Configurações e no submenu de cenas.
#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ObsState {
    /// "ok", "closed", "needPassword", "authFailed" ou "error".
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub scenes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current: Option<String>,
    pub recording: bool,
    pub streaming: bool,
    pub inputs: Vec<String>,
}

impl ObsState {
    pub fn failed(e: &ObsError) -> ObsState {
        ObsState { status: e.status().into(), message: Some(e.message()), ..Default::default() }
    }
}

/// Lê versão, cenas, gravação, transmissão e fontes de áudio.
pub fn read_state(s: &mut Session) -> Result<ObsState, ObsError> {
    let version = s.call("GetVersion", None)?.get("obsVersion").and_then(Value::as_str).map(str::to_string);
    let (scenes, current) = proto::scenes(&s.call("GetSceneList", None)?);
    let active = |v: Value| v.get("outputActive").and_then(Value::as_bool).unwrap_or(false);
    let recording = active(s.call("GetRecordStatus", None)?);
    let streaming = active(s.call("GetStreamStatus", None)?);
    let inputs = proto::audio_inputs(&s.call("GetInputList", None)?);
    Ok(ObsState { status: "ok".into(), message: None, version, scenes, current, recording, streaming, inputs })
}

/// Executa um comando numa sessão aberta.
pub fn run_in(s: &mut Session, cmd: ObsCmd, scene: Option<&str>, input: Option<&str>) -> Result<(), ObsError> {
    let data = match cmd {
        ObsCmd::SetScene => Some(json!({ "sceneName": scene.map(str::trim).filter(|n| !n.is_empty()).ok_or_else(|| ObsError::Other(tr!("escolha a cena", "choose the scene").into()))? })),
        ObsCmd::ToggleMute => Some(json!({ "inputName": input.map(str::trim).filter(|n| !n.is_empty()).ok_or_else(|| ObsError::Other(tr!("escolha a fonte de áudio", "choose the audio source").into()))? })),
        _ => None,
    };
    match s.call(cmd.request(), data) {
        // Iniciar o que já está rodando / parar o que já parou: já está como o usuário quer.
        Err(ObsError::Request(proto::OUTPUT_RUNNING, _)) if matches!(cmd, ObsCmd::StartRecord | ObsCmd::StartStream) => Ok(()),
        Err(ObsError::Request(proto::OUTPUT_NOT_RUNNING, _)) if matches!(cmd, ObsCmd::StopRecord | ObsCmd::StopStream) => Ok(()),
        r => r.map(|_| ()),
    }
}

#[cfg(not(feature = "qa"))]
fn with_session<T>(f: impl FnOnce(&mut Session) -> Result<T, ObsError>) -> Result<T, ObsError> {
    let mut s = Session::open(&load_settings())?;
    let r = f(&mut s);
    s.close();
    r
}

/// Estado atual (nunca falha: o erro vira status). Chame numa thread bloqueante.
pub fn state() -> ObsState {
    #[cfg(feature = "qa")]
    return fake::state();
    #[cfg(not(feature = "qa"))]
    with_session(read_state).unwrap_or_else(|e| ObsState::failed(&e))
}

/// Executa a ação OBS. Chame numa thread bloqueante.
pub fn run(cmd: ObsCmd, scene: Option<&str>, input: Option<&str>) -> Result<(), String> {
    #[cfg(feature = "qa")]
    return fake::run(cmd, scene, input).map_err(|e| e.message());
    #[cfg(not(feature = "qa"))]
    with_session(|s| run_in(s, cmd, scene, input)).map_err(|e| e.message())
}

#[cfg(test)]
mod tests {
    use super::ws::testserver::*;
    use super::*;

    /// OBS de mentira na rede: Hello com senha, confere a autenticação e responde pedidos.
    fn fake_obs(password: &'static str, answers: Vec<(&'static str, Value)>) -> u16 {
        spawn(move |mut s| {
            let hello = json!({"op":0,"d":{"obsWebSocketVersion":"5.5.0","rpcVersion":1,"authentication":{"challenge":"ch","salt":"sa"}}});
            write_frame(&mut s, 0x81, hello.to_string().as_bytes());
            let (_, id) = read_frame(&mut s).unwrap();
            let id: Value = serde_json::from_slice(&id).unwrap();
            if id["d"]["authentication"] != json!(proto::auth_string(password, "sa", "ch")) {
                write_frame(&mut s, 0x88, &4009u16.to_be_bytes());
                return;
            }
            write_frame(&mut s, 0x81, json!({"op":2,"d":{"negotiatedRpcVersion":1}}).to_string().as_bytes());
            for (kind, answer) in answers {
                let Some((_, req)) = read_frame(&mut s) else { return };
                let req: Value = serde_json::from_slice(&req).unwrap();
                assert_eq!(req["d"]["requestType"], kind);
                // Um evento no meio não atrapalha a resposta.
                write_frame(&mut s, 0x81, json!({"op":5,"d":{"eventType":"X"}}).to_string().as_bytes());
                let mut resp = json!({"op":7,"d":{"requestType":kind,"requestId":req["d"]["requestId"],"requestStatus":{"result":true,"code":100}}});
                if let Some(code) = answer.get("fail").and_then(Value::as_i64) {
                    resp["d"]["requestStatus"] = json!({"result":false,"code":code,"comment":"já"});
                } else {
                    resp["d"]["responseData"] = answer;
                }
                write_frame(&mut s, 0x81, resp.to_string().as_bytes());
            }
            let _ = read_frame(&mut s);
        })
    }

    #[test]
    fn le_o_estado_completo_com_senha() {
        let port = fake_obs("segredo", vec![
            ("GetVersion", json!({"obsVersion":"31.0.0"})),
            ("GetSceneList", json!({"currentProgramSceneName":"B","scenes":[{"sceneIndex":0,"sceneName":"B"},{"sceneIndex":1,"sceneName":"A"}]})),
            ("GetRecordStatus", json!({"outputActive":true})),
            ("GetStreamStatus", json!({"outputActive":false})),
            ("GetInputList", json!({"inputs":[{"inputName":"Mic","inputKind":"wasapi_input_capture"}]})),
        ]);
        let mut s = Session::open(&Settings { port, password: "segredo".into() }).unwrap();
        let st = read_state(&mut s).unwrap();
        s.close();
        assert_eq!(st.version.as_deref(), Some("31.0.0"));
        assert_eq!(st.scenes, vec!["A", "B"]);
        assert_eq!(st.current.as_deref(), Some("B"));
        assert!(st.recording && !st.streaming);
        assert_eq!(st.inputs, vec!["Mic"]);
    }

    #[test]
    fn senha_errada_e_sem_senha() {
        let port = fake_obs("certa", vec![]);
        assert_eq!(Session::open(&Settings { port, password: "errada".into() }).err(), Some(ObsError::AuthFailed));
        let port = fake_obs("certa", vec![]);
        assert_eq!(Session::open(&Settings { port, password: String::new() }).err(), Some(ObsError::NeedPassword));
    }

    #[test]
    fn comandos_com_cena_e_iniciar_o_que_ja_roda() {
        let port = fake_obs("p", vec![
            ("SetCurrentProgramScene", json!({})),
            ("StartRecord", json!({"fail": proto::OUTPUT_RUNNING})),
            ("ToggleInputMute", json!({"fail": 600})),
        ]);
        let mut s = Session::open(&Settings { port, password: "p".into() }).unwrap();
        assert_eq!(run_in(&mut s, ObsCmd::SetScene, Some("Jogo"), None), Ok(()));
        assert_eq!(run_in(&mut s, ObsCmd::StartRecord, None, None), Ok(()));
        assert_eq!(run_in(&mut s, ObsCmd::ToggleMute, None, Some("Mic")), Err(ObsError::Request(600, "já".into())));
        // Sem cena/fonte nem chega a pedir.
        assert!(matches!(run_in(&mut s, ObsCmd::SetScene, Some("  "), None), Err(ObsError::Other(_))));
        s.close();
    }

    #[test]
    fn obs_fechado_vira_status_closed() {
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let e = Session::open(&Settings { port, password: String::new() }).err().unwrap();
        assert!(matches!(e, ObsError::Closed | ObsError::Other(_)), "{e:?}");
        assert_eq!(ObsError::Closed.status(), "closed");
        assert!(ObsState::failed(&ObsError::AuthFailed).message.unwrap().contains("senha"));
    }

    #[test]
    fn comando_le_do_json_e_debug_esconde_a_senha() {
        let c: ObsCmd = serde_json::from_str("\"toggleRecordPause\"").unwrap();
        assert_eq!(c.request(), "ToggleRecordPause");
        assert!(serde_json::from_str::<ObsCmd>("\"explode\"").is_err());
        let dbg = format!("{:?}", Settings { port: 1, password: "segredo".into() });
        assert!(!dbg.contains("segredo"));
    }
}
