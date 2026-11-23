//! Mensagens do obs-websocket 5.x (puro, sem rede): autenticação, Identify, pedidos e respostas.

use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// Código de fechamento do OBS para senha errada.
pub const CLOSE_AUTH_FAILED: u16 = 4009;
/// Código de resposta "saída já está rodando/parada" (iniciar o que já está iniciado).
pub const OUTPUT_RUNNING: i64 = 500;
pub const OUTPUT_NOT_RUNNING: i64 = 501;

fn b64_sha256(s: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(Sha256::digest(s.as_bytes()))
}

/// Autenticação do obs-websocket 5: base64(sha256(base64(sha256(senha + salt)) + challenge)).
pub fn auth_string(password: &str, salt: &str, challenge: &str) -> String {
    b64_sha256(&format!("{}{challenge}", b64_sha256(&format!("{password}{salt}"))))
}

#[derive(Debug, PartialEq)]
pub enum HelloError {
    NotHello,
    NeedPassword,
}

/// Resposta ao Hello (op 0): o Identify (op 1), com a autenticação se o OBS pedir.
/// Sem inscrição em eventos: a Kira só pergunta e manda.
pub fn identify(hello: &Value, password: Option<&str>) -> Result<Value, HelloError> {
    if hello.get("op").and_then(Value::as_i64) != Some(0) {
        return Err(HelloError::NotHello);
    }
    let mut d = json!({ "rpcVersion": 1, "eventSubscriptions": 0 });
    if let Some(auth) = hello.pointer("/d/authentication") {
        let pw = password.filter(|p| !p.is_empty()).ok_or(HelloError::NeedPassword)?;
        let salt = auth.get("salt").and_then(Value::as_str).unwrap_or("");
        let challenge = auth.get("challenge").and_then(Value::as_str).unwrap_or("");
        d["authentication"] = json!(auth_string(pw, salt, challenge));
    }
    Ok(json!({ "op": 1, "d": d }))
}

pub fn request(kind: &str, id: &str, data: Option<Value>) -> Value {
    let mut d = json!({ "requestType": kind, "requestId": id });
    if let Some(data) = data {
        d["requestData"] = data;
    }
    json!({ "op": 6, "d": d })
}

/// Resposta (op 7) ao pedido `id`: Some(Ok(dados)) / Some(Err((código, comentário))).
/// Outras mensagens (eventos, respostas de outros pedidos) → None.
pub fn response(msg: &Value, id: &str) -> Option<Result<Value, (i64, String)>> {
    if msg.get("op").and_then(Value::as_i64) != Some(7) || msg.pointer("/d/requestId").and_then(Value::as_str) != Some(id) {
        return None;
    }
    let st = msg.pointer("/d/requestStatus")?;
    if st.get("result").and_then(Value::as_bool) == Some(true) {
        Some(Ok(msg.pointer("/d/responseData").cloned().unwrap_or(Value::Null)))
    } else {
        let code = st.get("code").and_then(Value::as_i64).unwrap_or(0);
        let comment = st.get("comment").and_then(Value::as_str).unwrap_or("").to_string();
        Some(Err((code, comment)))
    }
}

/// Cenas na ordem em que o OBS mostra (de cima para baixo) e a cena atual.
pub fn scenes(data: &Value) -> (Vec<String>, Option<String>) {
    let mut list: Vec<(i64, String)> = data
        .get("scenes")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|s| Some((s.get("sceneIndex").and_then(Value::as_i64).unwrap_or(0), s.get("sceneName")?.as_str()?.to_string())))
                .collect()
        })
        .unwrap_or_default();
    // O OBS devolve do índice 0 (a de baixo) para cima.
    list.sort_by_key(|s| std::cmp::Reverse(s.0));
    let current = data.get("currentProgramSceneName").and_then(Value::as_str).map(str::to_string);
    (list.into_iter().map(|s| s.1).collect(), current)
}

/// Fontes de áudio (microfone, áudio da área de trabalho, captura de app) da lista de fontes.
pub fn audio_inputs(data: &Value) -> Vec<String> {
    data.get("inputs")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter(|i| {
                    let k = i.get("inputKind").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
                    k.contains("wasapi") || k.contains("audio") || k.contains("pulse") || k.contains("alsa") || k.contains("jack")
                })
                .filter_map(|i| i.get("inputName").and_then(Value::as_str).map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn autenticacao_do_exemplo_oficial() {
        // Exemplo da documentação do obs-websocket 5 (protocol.md).
        assert_eq!(
            auth_string("supersecretpassword", "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=", "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY="),
            "1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4="
        );
    }

    #[test]
    fn identify_com_e_sem_senha() {
        let open = json!({"op":0,"d":{"obsWebSocketVersion":"5.5.0","rpcVersion":1}});
        assert_eq!(identify(&open, None).unwrap(), json!({"op":1,"d":{"rpcVersion":1,"eventSubscriptions":0}}));
        let locked = json!({"op":0,"d":{"rpcVersion":1,"authentication":{"challenge":"c","salt":"s"}}});
        assert_eq!(identify(&locked, None), Err(HelloError::NeedPassword));
        assert_eq!(identify(&locked, Some("")), Err(HelloError::NeedPassword));
        let id = identify(&locked, Some("pw")).unwrap();
        assert_eq!(id["d"]["authentication"], json!(auth_string("pw", "s", "c")));
        assert_eq!(identify(&json!({"op":2}), None), Err(HelloError::NotHello));
    }

    #[test]
    fn pedido_e_resposta() {
        assert_eq!(request("ToggleRecord", "1", None), json!({"op":6,"d":{"requestType":"ToggleRecord","requestId":"1"}}));
        assert_eq!(request("SetCurrentProgramScene", "2", Some(json!({"sceneName":"A"})))["d"]["requestData"]["sceneName"], "A");
        let ok = json!({"op":7,"d":{"requestId":"2","requestStatus":{"result":true,"code":100},"responseData":{"x":1}}});
        assert_eq!(response(&ok, "2"), Some(Ok(json!({"x":1}))));
        assert_eq!(response(&ok, "3"), None);
        assert_eq!(response(&json!({"op":5,"d":{}}), "2"), None);
        let bad = json!({"op":7,"d":{"requestId":"4","requestStatus":{"result":false,"code":600,"comment":"No source"}}});
        assert_eq!(response(&bad, "4"), Some(Err((600, "No source".into()))));
        let no_data = json!({"op":7,"d":{"requestId":"5","requestStatus":{"result":true,"code":100}}});
        assert_eq!(response(&no_data, "5"), Some(Ok(Value::Null)));
    }

    #[test]
    fn cenas_na_ordem_do_obs_e_fontes_de_audio() {
        let d = json!({"currentProgramSceneName":"Jogo","scenes":[
            {"sceneIndex":0,"sceneName":"Fim"},{"sceneIndex":2,"sceneName":"Início"},{"sceneIndex":1,"sceneName":"Jogo"},{"sceneIndex":3}
        ]});
        assert_eq!(scenes(&d), (vec!["Início".into(), "Jogo".into(), "Fim".into()], Some("Jogo".into())));
        assert_eq!(scenes(&json!({})), (vec![], None));
        let i = json!({"inputs":[
            {"inputName":"Mic","inputKind":"wasapi_input_capture"},
            {"inputName":"Desktop","inputKind":"wasapi_output_capture"},
            {"inputName":"Discord","inputKind":"wasapi_process_output_capture"},
            {"inputName":"Câmera","inputKind":"dshow_input"},
            {"inputName":"Texto","inputKind":"text_gdiplus_v3"}
        ]});
        assert_eq!(audio_inputs(&i), vec!["Mic", "Desktop", "Discord"]);
    }
}
