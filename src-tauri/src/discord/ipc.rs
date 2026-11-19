//! Protocolo do RPC local do Discord (named pipe `\\.\pipe\discord-ipc-N`).
//! Cada quadro = opcode (u32 LE) + tamanho (u32 LE) + JSON. Sem estado: fácil de testar.
// Na Kira de teste (feature qa) só o Discord falso é usado: o real fica sem chamadas.
#![cfg_attr(feature = "qa", allow(dead_code))]

use serde_json::Value;
use std::io::{Read, Write};

pub const OP_HANDSHAKE: u32 = 0;
pub const OP_FRAME: u32 = 1;
pub const OP_CLOSE: u32 = 2;
pub const OP_PING: u32 = 3;
pub const OP_PONG: u32 = 4;

/// Maior quadro aceito (as respostas reais têm poucos KB): evita alocar lixo de um pipe estranho.
pub const MAX_FRAME: usize = 1 << 20;

pub fn encode(op: u32, payload: &Value) -> Vec<u8> {
    let body = payload.to_string().into_bytes();
    let mut out = Vec::with_capacity(8 + body.len());
    out.extend_from_slice(&op.to_le_bytes());
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    out
}

/// Lê um quadro inteiro. Erro se o pipe fechou, o tamanho passa do limite ou o JSON é inválido.
pub fn read_frame(r: &mut impl Read) -> Result<(u32, Value), String> {
    let mut head = [0u8; 8];
    r.read_exact(&mut head).map_err(|e| trf!("conexão com o Discord encerrada ({e})", "connection to Discord closed ({e})"))?;
    let op = u32::from_le_bytes([head[0], head[1], head[2], head[3]]);
    let len = u32::from_le_bytes([head[4], head[5], head[6], head[7]]) as usize;
    if len > MAX_FRAME {
        return Err(trf!("quadro do Discord grande demais ({len} bytes)", "Discord frame too large ({len} bytes)"));
    }
    if op > OP_PONG {
        return Err(trf!("opcode desconhecido do Discord: {op}", "unknown Discord opcode: {op}"));
    }
    let mut body = vec![0u8; len];
    r.read_exact(&mut body).map_err(|e| trf!("conexão com o Discord encerrada ({e})", "connection to Discord closed ({e})"))?;
    let v = serde_json::from_slice(&body).map_err(|e| trf!("resposta inválida do Discord: {e}", "invalid response from Discord: {e}"))?;
    Ok((op, v))
}

/// Canal com o Discord: o pipe de verdade ou, nos testes e na Kira de teste, um Discord falso.
pub trait Transport: Send {
    fn send(&mut self, op: u32, payload: &Value) -> Result<(), String>;
    fn recv(&mut self) -> Result<(u32, Value), String>;
}

/// Qualquer fluxo de bytes (o pipe é um `File`).
pub struct Stream<T>(pub T);

impl<T: Read + Write + Send> Transport for Stream<T> {
    fn send(&mut self, op: u32, payload: &Value) -> Result<(), String> {
        self.0
            .write_all(&encode(op, payload))
            .and_then(|_| self.0.flush())
            .map_err(|e| trf!("conexão com o Discord encerrada ({e})", "connection to Discord closed ({e})"))
    }
    fn recv(&mut self) -> Result<(u32, Value), String> {
        read_frame(&mut self.0)
    }
}

/// Abre o pipe do Discord (`<base>-0` a `<base>-9`; o Discord usa o primeiro livre).
pub fn open_pipe(base: &str) -> Result<Stream<std::fs::File>, String> {
    for i in 0..10 {
        let path = format!(r"\\.\pipe\{base}-{i}");
        if let Ok(f) = std::fs::OpenOptions::new().read(true).write(true).open(&path) {
            return Ok(Stream(f));
        }
    }
    Err(super::closed().into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::Cursor;

    #[test]
    fn ida_e_volta() {
        let v = json!({"cmd": "GET_VOICE_SETTINGS", "nonce": "1"});
        let bytes = encode(OP_FRAME, &v);
        assert_eq!(&bytes[..4], &1u32.to_le_bytes());
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()) as usize, bytes.len() - 8);
        assert_eq!(read_frame(&mut Cursor::new(bytes)).unwrap(), (OP_FRAME, v));
    }

    #[test]
    fn quadro_truncado_ou_vazio_e_erro() {
        let bytes = encode(OP_FRAME, &json!({"a": 1}));
        assert!(read_frame(&mut Cursor::new(&bytes[..bytes.len() - 2])).is_err());
        assert!(read_frame(&mut Cursor::new(&bytes[..5])).is_err());
        assert!(read_frame(&mut Cursor::new(Vec::<u8>::new())).is_err());
    }

    #[test]
    fn tamanho_acima_do_limite_nao_aloca() {
        let mut b = OP_FRAME.to_le_bytes().to_vec();
        b.extend_from_slice(&u32::MAX.to_le_bytes());
        let e = read_frame(&mut Cursor::new(b)).unwrap_err();
        assert!(e.contains("grande demais"), "{e}");
    }

    #[test]
    fn opcode_desconhecido_e_json_invalido() {
        let mut b = 9u32.to_le_bytes().to_vec();
        b.extend_from_slice(&2u32.to_le_bytes());
        b.extend_from_slice(b"{}");
        assert!(read_frame(&mut Cursor::new(b)).unwrap_err().contains("opcode"));
        let mut b = OP_FRAME.to_le_bytes().to_vec();
        b.extend_from_slice(&3u32.to_le_bytes());
        b.extend_from_slice(b"{x}");
        assert!(read_frame(&mut Cursor::new(b)).unwrap_err().contains("inválida"));
    }

    #[test]
    fn pipe_inexistente_vira_discord_fechado() {
        let e = open_pipe("kira-teste-pipe-que-nao-existe").err().unwrap();
        assert_eq!(e, crate::discord::closed());
    }
}
