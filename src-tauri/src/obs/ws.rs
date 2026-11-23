//! Cliente WebSocket mínimo (RFC 6455) só para o servidor local do OBS: sem TLS,
//! quadros de texto com máscara, resposta a ping e leitura de quadros fragmentados.

use base64::Engine;
use std::io::{self, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/// Tamanho máximo de uma mensagem (uma lista de cenas enorme ainda cabe com folga).
const MAX_MESSAGE: usize = 8 * 1024 * 1024;

#[derive(Debug)]
pub enum WsError {
    /// Nada escutando na porta (OBS fechado ou servidor WebSocket desligado).
    Refused,
    /// O servidor fechou a conexão (código e motivo do quadro de fechamento).
    Closed(u16, String),
    Timeout,
    Protocol(String),
    Io(io::Error),
}

impl From<io::Error> for WsError {
    fn from(e: io::Error) -> Self {
        match e.kind() {
            io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut => WsError::Timeout,
            io::ErrorKind::ConnectionRefused => WsError::Refused,
            io::ErrorKind::UnexpectedEof | io::ErrorKind::ConnectionReset | io::ErrorKind::ConnectionAborted => WsError::Closed(1006, String::new()),
            _ => WsError::Io(e),
        }
    }
}

/// Pseudoaleatório simples para chave e máscara (conexão local; não é segredo).
fn rand_bytes<const N: usize>(state: &mut u64) -> [u8; N] {
    let mut out = [0u8; N];
    for b in out.iter_mut() {
        *state ^= *state << 13;
        *state ^= *state >> 7;
        *state ^= *state << 17;
        *b = (*state >> 24) as u8;
    }
    out
}

pub struct Ws {
    s: TcpStream,
    rng: u64,
}

impl Ws {
    /// Conecta em 127.0.0.1:`port` e faz o aperto de mão com o subprotocolo do OBS.
    pub fn connect(port: u16, timeout: Duration) -> Result<Ws, WsError> {
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let s = TcpStream::connect_timeout(&addr, timeout)?;
        s.set_read_timeout(Some(timeout))?;
        s.set_write_timeout(Some(timeout))?;
        let _ = s.set_nodelay(true);
        let seed = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1) | 1;
        let mut ws = Ws { s, rng: seed ^ ((std::process::id() as u64) << 32) };
        let key = base64::engine::general_purpose::STANDARD.encode(rand_bytes::<16>(&mut ws.rng));
        let req = format!(
            "GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: obswebsocket.json\r\n\r\n"
        );
        ws.s.write_all(req.as_bytes())?;
        // Lê o cabeçalho da resposta byte a byte até a linha em branco (é curto).
        let mut head = Vec::new();
        let mut b = [0u8; 1];
        while !head.ends_with(b"\r\n\r\n") {
            if head.len() > 8192 {
                return Err(WsError::Protocol("cabeçalho grande demais".into()));
            }
            if ws.s.read(&mut b)? == 0 {
                return Err(WsError::Closed(1006, String::new()));
            }
            head.push(b[0]);
        }
        let head = String::from_utf8_lossy(&head);
        let status = head.lines().next().unwrap_or("");
        if !status.split_whitespace().nth(1).is_some_and(|c| c == "101") {
            return Err(WsError::Protocol(format!("resposta inesperada: {status}")));
        }
        Ok(ws)
    }

    fn write_frame(&mut self, opcode: u8, payload: &[u8]) -> io::Result<()> {
        let mut f = Vec::with_capacity(payload.len() + 14);
        f.push(0x80 | opcode);
        match payload.len() {
            n if n < 126 => f.push(0x80 | n as u8),
            n if n <= 0xFFFF => {
                f.push(0x80 | 126);
                f.extend_from_slice(&(n as u16).to_be_bytes());
            }
            n => {
                f.push(0x80 | 127);
                f.extend_from_slice(&(n as u64).to_be_bytes());
            }
        }
        let mask = rand_bytes::<4>(&mut self.rng);
        f.extend_from_slice(&mask);
        f.extend(payload.iter().enumerate().map(|(i, b)| b ^ mask[i % 4]));
        self.s.write_all(&f)
    }

    pub fn send_text(&mut self, text: &str) -> Result<(), WsError> {
        Ok(self.write_frame(0x1, text.as_bytes())?)
    }

    /// Próxima mensagem de texto (junta fragmentos; responde a ping; fechamento vira erro).
    pub fn recv_text(&mut self) -> Result<String, WsError> {
        let mut msg: Vec<u8> = Vec::new();
        loop {
            let mut h = [0u8; 2];
            self.s.read_exact(&mut h)?;
            let fin = h[0] & 0x80 != 0;
            let opcode = h[0] & 0x0F;
            let masked = h[1] & 0x80 != 0;
            let len = match h[1] & 0x7F {
                126 => {
                    let mut e = [0u8; 2];
                    self.s.read_exact(&mut e)?;
                    u16::from_be_bytes(e) as u64
                }
                127 => {
                    let mut e = [0u8; 8];
                    self.s.read_exact(&mut e)?;
                    u64::from_be_bytes(e)
                }
                n => n as u64,
            };
            if len as usize > MAX_MESSAGE || msg.len() + len as usize > MAX_MESSAGE {
                return Err(WsError::Protocol("mensagem grande demais".into()));
            }
            let mut mask = [0u8; 4];
            if masked {
                self.s.read_exact(&mut mask)?;
            }
            let mut payload = vec![0u8; len as usize];
            self.s.read_exact(&mut payload)?;
            if masked {
                payload.iter_mut().enumerate().for_each(|(i, b)| *b ^= mask[i % 4]);
            }
            match opcode {
                0x0..=0x2 => {
                    msg.extend_from_slice(&payload);
                    if fin {
                        return String::from_utf8(msg).map_err(|_| WsError::Protocol("texto inválido".into()));
                    }
                }
                0x8 => {
                    let code = if payload.len() >= 2 { u16::from_be_bytes([payload[0], payload[1]]) } else { 1005 };
                    let reason = String::from_utf8_lossy(payload.get(2..).unwrap_or(&[])).into_owned();
                    let _ = self.write_frame(0x8, &payload[..payload.len().min(2)]);
                    return Err(WsError::Closed(code, reason));
                }
                0x9 => self.write_frame(0xA, &payload)?,
                0xA => {}
                op => return Err(WsError::Protocol(format!("opcode {op}"))),
            }
        }
    }

    /// Fecha educadamente (erros ignorados: a conexão vai embora de qualquer jeito).
    pub fn close(mut self) {
        let _ = self.write_frame(0x8, &1000u16.to_be_bytes());
    }
}

/// Servidor WebSocket de mentira para os testes (uma conexão, sem máscara).
#[cfg(test)]
pub mod testserver {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};

    pub fn read_frame(s: &mut TcpStream) -> Option<(u8, Vec<u8>)> {
        let mut h = [0u8; 2];
        s.read_exact(&mut h).ok()?;
        let len = match h[1] & 0x7F {
            126 => {
                let mut e = [0u8; 2];
                s.read_exact(&mut e).ok()?;
                u16::from_be_bytes(e) as usize
            }
            127 => {
                let mut e = [0u8; 8];
                s.read_exact(&mut e).ok()?;
                u64::from_be_bytes(e) as usize
            }
            n => n as usize,
        };
        assert!(h[1] & 0x80 != 0, "o cliente deve mascarar");
        let mut mask = [0u8; 4];
        s.read_exact(&mut mask).ok()?;
        let mut p = vec![0u8; len];
        s.read_exact(&mut p).ok()?;
        p.iter_mut().enumerate().for_each(|(i, b)| *b ^= mask[i % 4]);
        Some((h[0] & 0x0F, p))
    }

    pub fn write_frame(s: &mut TcpStream, first: u8, payload: &[u8]) {
        let mut f = vec![first];
        if payload.len() < 126 {
            f.push(payload.len() as u8);
        } else if payload.len() <= 0xFFFF {
            f.push(126);
            f.extend_from_slice(&(payload.len() as u16).to_be_bytes());
        } else {
            f.push(127);
            f.extend_from_slice(&(payload.len() as u64).to_be_bytes());
        }
        f.extend_from_slice(payload);
        s.write_all(&f).unwrap();
    }

    /// Aceita uma conexão, responde o aperto de mão e passa o socket para `serve`.
    pub fn spawn(serve: impl FnOnce(TcpStream) + Send + 'static) -> u16 {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut head = Vec::new();
            let mut b = [0u8; 1];
            while !head.ends_with(b"\r\n\r\n") {
                s.read_exact(&mut b).unwrap();
                head.push(b[0]);
            }
            let head = String::from_utf8_lossy(&head).to_string();
            assert!(head.contains("Sec-WebSocket-Protocol: obswebsocket.json"));
            s.write_all(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n").unwrap();
            serve(s);
        });
        port
    }
}

#[cfg(test)]
mod tests {
    use super::testserver::*;
    use super::*;

    #[test]
    fn eco_com_ping_fragmentos_e_mensagem_grande() {
        let big = "x".repeat(70_000);
        let big2 = big.clone();
        let port = spawn(move |mut s| {
            let (op, p) = read_frame(&mut s).unwrap();
            assert_eq!((op, p.as_slice()), (1, b"oi".as_slice()));
            write_frame(&mut s, 0x89, b"pi"); // ping no meio
            write_frame(&mut s, 0x01, b"ol"); // texto em dois pedaços
            write_frame(&mut s, 0x80, b"a");
            let (op, p) = read_frame(&mut s).unwrap();
            assert_eq!((op, p.as_slice()), (0xA, b"pi".as_slice()), "pong com o mesmo conteúdo");
            write_frame(&mut s, 0x81, big2.as_bytes());
            write_frame(&mut s, 0x88, &[0x0F, 0xA9, b'n', b'o']); // 4009 "no"
            let _ = read_frame(&mut s);
        });
        let mut ws = Ws::connect(port, Duration::from_secs(3)).unwrap();
        ws.send_text("oi").unwrap();
        assert_eq!(ws.recv_text().unwrap(), "ola");
        assert_eq!(ws.recv_text().unwrap(), big);
        match ws.recv_text() {
            Err(WsError::Closed(4009, r)) => assert_eq!(r, "no"),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn porta_sem_ninguem_e_recusada() {
        // Porta efêmera recém-liberada: nada escuta nela.
        let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        assert!(matches!(Ws::connect(port, Duration::from_secs(2)), Err(WsError::Refused | WsError::Timeout)));
    }

    #[test]
    fn aleatorio_muda_a_cada_chamada() {
        let mut st = 12345u64;
        let a = rand_bytes::<8>(&mut st);
        let b = rand_bytes::<8>(&mut st);
        assert_ne!(a, b);
    }
}
