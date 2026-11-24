//! Controle do Discord pelo RPC local: microfone (mudo), fone (ensurdecer) e os dispositivos
//! de entrada/saída DO DISCORD (não os do Windows).
//!
//! Precisa de um app do próprio usuário no portal de desenvolvedores (Client ID + Secret): os
//! escopos de voz só funcionam para o dono do app. As credenciais ficam cifradas (secrets.rs).
//!
//! Uma única thread (criada na primeira chamada) guarda a conexão: sem leitura em segundo
//! plano e sem polling — parada, não gasta nada. Cada chamada espera no máximo alguns segundos.

pub mod auth;
pub mod client;
#[cfg(any(test, feature = "qa"))]
pub mod fake;
pub mod ipc;
pub mod secrets;

use auth::TokenApi;
use client::{Client, RpcError};
use ipc::Transport;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

/// "Discord fechado" no idioma atual (comparado em `status`).
pub fn closed() -> &'static str {
    tr!("O Discord não está aberto.", "Discord isn't open.")
}
/// "Não conectado" no idioma atual (comparado em `status`).
pub fn not_connected() -> &'static str {
    tr!("Conecte o Discord em Configurações → Discord.", "Connect Discord in Settings → Discord.")
}
fn timeout_msg() -> &'static str {
    tr!("O Discord não respondeu a tempo.", "Discord didn't respond in time.")
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiscordCmd {
    ToggleMute,
    Mute,
    Unmute,
    ToggleDeafen,
    Deafen,
    Undeafen,
    SetInput,
    SetOutput,
    /// Sai do canal de voz em que está (SELECT_VOICE_CHANNEL com channel_id nulo).
    LeaveVoice,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Device {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct DeviceList {
    pub current: String,
    pub devices: Vec<Device>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Voice {
    /// Microfone mudo (o Discord também conta como mudo quando está ensurdecido).
    pub mute: bool,
    pub deaf: bool,
    pub input: DeviceList,
    pub output: DeviceList,
    /// Canal de voz em que está agora (nome); None = fora de canal ou não deu para ler.
    pub channel: Option<String>,
}

/// Resposta para o menu e as Configurações: nunca é erro, para o submenu explicar o que houve.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VoiceState {
    /// "ok", "notConnected", "closed" ou "error".
    pub status: &'static str,
    pub message: Option<String>,
    pub voice: Option<Voice>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub configured: bool,
    pub client_id: Option<String>,
    pub user: Option<String>,
}

fn devices(v: &Value) -> DeviceList {
    DeviceList {
        current: v["device_id"].as_str().unwrap_or("default").to_string(),
        devices: v["available_devices"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|d| Some(Device { id: d["id"].as_str()?.to_string(), name: d["name"].as_str().unwrap_or("?").to_string() }))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

pub fn parse_voice(v: &Value) -> Voice {
    let deaf = v["deaf"].as_bool().unwrap_or(false);
    Voice { mute: v["mute"].as_bool().unwrap_or(false) || deaf, deaf, input: devices(&v["input"]), output: devices(&v["output"]), channel: None }
}

/// Resposta do GET_SELECTED_VOICE_CHANNEL: null fora de canal; sem nome (DM) = "Chamada".
pub fn parse_channel(v: &Value) -> Option<String> {
    if !v.is_object() {
        return None;
    }
    let name = v["name"].as_str().map(str::trim).unwrap_or("");
    Some(if name.is_empty() { tr!("Chamada", "Call").to_string() } else { name.to_string() })
}

/// Argumentos do SET_VOICE_SETTINGS para mudo/ensurdecer, a partir do estado atual.
/// Tirar o mudo (ou alternar estando ensurdecido) desfaz os dois, como o botão do Discord.
pub fn voice_args(cmd: DiscordCmd, mute: bool, deaf: bool) -> Option<Value> {
    Some(match cmd {
        DiscordCmd::ToggleMute if mute || deaf => json!({"mute": false, "deaf": false}),
        DiscordCmd::ToggleMute | DiscordCmd::Mute => json!({"mute": true}),
        DiscordCmd::Unmute => json!({"mute": false, "deaf": false}),
        DiscordCmd::ToggleDeafen => json!({"deaf": !deaf}),
        DiscordCmd::Deafen => json!({"deaf": true}),
        DiscordCmd::Undeafen => json!({"deaf": false}),
        DiscordCmd::SetInput | DiscordCmd::SetOutput | DiscordCmd::LeaveVoice => return None,
    })
}

/// Dispositivo pelo id; se o id mudou, pelo nome (como em audio::pick).
pub fn pick<'a>(list: &'a [Device], id: Option<&str>, name: Option<&str>) -> Option<&'a Device> {
    let low = |s: &str| s.trim().to_lowercase();
    id.and_then(|id| list.iter().find(|d| d.id == id))
        .or_else(|| name.and_then(|n| list.iter().find(|d| low(&d.name) == low(n))))
}

/// De onde vem o Discord (o de verdade ou o falso) e onde ficam as credenciais.
pub struct Env {
    pub open: Box<dyn Fn() -> Result<Box<dyn Transport>, String> + Send>,
    pub tokens: Box<dyn TokenApi>,
    pub secrets_path: PathBuf,
}

pub struct Service {
    env: Env,
    client: Option<Client>,
}

impl Service {
    pub fn new(env: Env) -> Self {
        Service { env, client: None }
    }

    fn refresh(&self, s: &mut secrets::Secrets) -> Result<(), String> {
        let t = auth::refresh(&*self.env.tokens, &s.client_id, &s.client_secret, &s.refresh_token)?;
        s.access_token = t.access_token;
        if !t.refresh_token.is_empty() {
            s.refresh_token = t.refresh_token;
        }
        s.expires_at = secrets::now_secs() + t.expires_in;
        secrets::save_to(&self.env.secrets_path, s)
    }

    /// Conexão autenticada (abre e autentica se preciso; renova o token vencido).
    fn session(&mut self) -> Result<&mut Client, String> {
        if self.client.is_none() {
            let mut sec = secrets::load_from(&self.env.secrets_path).ok_or(not_connected())?;
            let mut c = Client::new((self.env.open)()?);
            c.handshake(&sec.client_id).map_err(|e| e.text())?;
            if sec.needs_refresh(secrets::now_secs()) {
                self.refresh(&mut sec)?;
            }
            let auth = |c: &mut Client, token: &str| c.command("AUTHENTICATE", json!({ "access_token": token }));
            match auth(&mut c, &sec.access_token) {
                Ok(_) => {}
                // Token recusado (revogado/vencido antes da hora): renova uma vez.
                Err(RpcError::Rpc { .. }) => {
                    self.refresh(&mut sec)?;
                    auth(&mut c, &sec.access_token).map_err(|e| e.text())?;
                }
                Err(e) => return Err(e.text()),
            }
            self.client = Some(c);
        }
        Ok(self.client.as_mut().expect("sessão recém-criada"))
    }

    /// Roda `f` na sessão; se o pipe caiu (Discord reiniciado), reconecta e tenta mais uma vez.
    fn with_session<T>(&mut self, mut f: impl FnMut(&mut Client) -> Result<T, RpcError>) -> Result<T, String> {
        for attempt in 0..2 {
            let c = self.session()?;
            match f(c) {
                Ok(v) => return Ok(v),
                Err(RpcError::Closed(m)) => {
                    self.client = None;
                    if attempt == 1 {
                        return Err(m);
                    }
                }
                Err(e) => {
                    // 4006 = sessão perdeu a autenticação: a próxima chamada autentica de novo.
                    if matches!(e, RpcError::Rpc { code: 4006, .. }) {
                        self.client = None;
                    }
                    return Err(e.text());
                }
            }
        }
        unreachable!()
    }

    pub fn voice(&mut self) -> Result<Voice, String> {
        self.with_session(|c| c.command("GET_VOICE_SETTINGS", json!({}))).map(|v| parse_voice(&v))
    }

    /// Canal de voz atual; falha ao ler (ex.: escopo) = como se estivesse fora (só esconde o "Sair").
    pub fn channel(&mut self) -> Option<String> {
        self.with_session(|c| c.command("GET_SELECTED_VOICE_CHANNEL", json!({}))).ok().and_then(|v| parse_channel(&v))
    }

    pub fn voice_state(&mut self) -> VoiceState {
        match self.voice().map(|mut v| {
            v.channel = self.channel();
            v
        }) {
            Ok(v) => VoiceState { status: "ok", message: None, voice: Some(v) },
            Err(m) => VoiceState {
                status: if m == not_connected() { "notConnected" } else if m == closed() { "closed" } else { "error" },
                message: Some(m),
                voice: None,
            },
        }
    }

    pub fn run(&mut self, cmd: DiscordCmd, device_id: Option<&str>, device_name: Option<&str>) -> Result<(), String> {
        let args = match cmd {
            DiscordCmd::LeaveVoice => {
                return self.with_session(|c| c.command("SELECT_VOICE_CHANNEL", json!({ "channel_id": null }))).map(|_| ());
            }
            DiscordCmd::Mute | DiscordCmd::Unmute | DiscordCmd::Deafen | DiscordCmd::Undeafen => {
                voice_args(cmd, false, false).expect("comando de voz")
            }
            DiscordCmd::ToggleMute | DiscordCmd::ToggleDeafen => {
                let v = self.voice()?;
                voice_args(cmd, v.mute, v.deaf).expect("comando de voz")
            }
            DiscordCmd::SetInput | DiscordCmd::SetOutput => {
                let v = self.voice()?;
                let (key, list) = if cmd == DiscordCmd::SetInput { ("input", &v.input) } else { ("output", &v.output) };
                let d = pick(&list.devices, device_id, device_name).ok_or_else(|| {
                    trf!("dispositivo não encontrado no Discord: {}", "device not found in Discord: {}", device_name.or(device_id).unwrap_or("?"))
                })?;
                json!({ key: { "device_id": d.id } })
            }
        };
        self.with_session(|c| c.command("SET_VOICE_SETTINGS", args.clone())).map(|_| ())
    }

    /// Autoriza a Kira no Discord (o Discord mostra o pedido) e guarda as credenciais.
    pub fn connect(&mut self, client_id: &str, client_secret: &str) -> Result<String, String> {
        let id = client_id.trim();
        let secret = client_secret.trim();
        if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
            return Err(tr!("O Client ID tem só números (copie em General Information no portal do Discord).", "The Client ID is only digits (copy it from General Information in the Discord portal).").into());
        }
        if secret.is_empty() {
            return Err(tr!("Informe o Client Secret (OAuth2 → Reset Secret no portal do Discord).", "Enter the Client Secret (OAuth2 → Reset Secret in the Discord portal).").into());
        }
        self.client = None;
        let mut c = Client::new((self.env.open)()?);
        c.handshake(id).map_err(|e| e.text())?;
        let code = c
            .command("AUTHORIZE", json!({ "client_id": id, "scopes": auth::SCOPES }))
            .map_err(|e| match e {
                RpcError::Rpc { message, .. } => trf!("autorização não concluída no Discord: {message}", "authorization not completed in Discord: {message}"),
                e => e.text(),
            })?["code"]
            .as_str()
            .map(str::to_string)
            .ok_or(tr!("o Discord não devolveu o código de autorização", "Discord didn't return the authorization code"))?;
        let t = auth::exchange_code(&*self.env.tokens, id, secret, &code)?;
        let data = c.command("AUTHENTICATE", json!({ "access_token": t.access_token })).map_err(|e| e.text())?;
        let user = data["user"]["global_name"].as_str().or(data["user"]["username"].as_str()).unwrap_or("?").to_string();
        secrets::save_to(
            &self.env.secrets_path,
            &secrets::Secrets {
                client_id: id.into(),
                client_secret: secret.into(),
                access_token: t.access_token,
                refresh_token: t.refresh_token,
                expires_at: secrets::now_secs() + t.expires_in,
                user: Some(user.clone()),
            },
        )?;
        self.client = Some(c);
        Ok(user)
    }

    pub fn disconnect(&mut self) {
        self.client = None;
        let _ = std::fs::remove_file(&self.env.secrets_path);
    }

    pub fn status(&self) -> Status {
        match secrets::load_from(&self.env.secrets_path) {
            Some(s) => Status { configured: true, client_id: Some(s.client_id), user: s.user },
            None => Status { configured: false, client_id: None, user: None },
        }
    }
}

// --- Thread única com a conexão ---

#[cfg(feature = "qa")]
fn default_env() -> Env {
    // Kira de teste: Discord falso, nunca o do usuário.
    let state: fake::Shared = Default::default();
    Env {
        open: Box::new(move || Ok(Box::new(fake::FakeDiscord::open(&state)?) as Box<dyn Transport>)),
        tokens: Box::new(fake::FakeTokens),
        secrets_path: secrets::path(),
    }
}

#[cfg(not(feature = "qa"))]
fn default_env() -> Env {
    Env {
        open: Box::new(|| Ok(Box::new(ipc::open_pipe("discord-ipc")?) as Box<dyn Transport>)),
        tokens: Box::new(auth::WinHttp),
        secrets_path: secrets::path(),
    }
}

type Job = Box<dyn FnOnce(&mut Service) + Send>;
static WORKER: OnceLock<mpsc::Sender<Job>> = OnceLock::new();

fn worker() -> &'static mpsc::Sender<Job> {
    WORKER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<Job>();
        std::thread::Builder::new()
            .name("discord".into())
            .spawn(move || {
                let mut svc = Service::new(default_env());
                for job in rx {
                    job(&mut svc);
                }
            })
            .expect("thread do Discord");
        tx
    })
}

/// Pedido que ainda vale a pena executar: quem pediu continua esperando.
/// (Um mudo pedido durante um "Conectar" demorado não pode ser aplicado minutos depois.)
pub fn still_wanted(deadline: Instant, now: Instant) -> bool {
    now < deadline
}

/// Executa na thread do Discord e espera até `timeout`.
fn call<T: Send + 'static>(timeout: Duration, f: impl FnOnce(&mut Service) -> T + Send + 'static) -> Result<T, String> {
    let (tx, rx) = mpsc::channel();
    let deadline = Instant::now() + timeout;
    worker()
        .send(Box::new(move |s| {
            if still_wanted(deadline, Instant::now()) {
                let _ = tx.send(f(s));
            }
        }))
        .map_err(|_| timeout_msg().to_string())?;
    rx.recv_timeout(timeout).map_err(|_| timeout_msg().to_string())
}

const OP_TIMEOUT: Duration = Duration::from_secs(4);
/// Conectar espera o usuário clicar em "Autorizar" no Discord.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(180);

pub fn run(cmd: DiscordCmd, device_id: Option<&str>, device_name: Option<&str>) -> Result<(), String> {
    let (id, name) = (device_id.map(str::to_string), device_name.map(str::to_string));
    call(OP_TIMEOUT, move |s| s.run(cmd, id.as_deref(), name.as_deref()))?
}

pub fn voice_state() -> VoiceState {
    call(OP_TIMEOUT, |s| s.voice_state())
        .unwrap_or_else(|m| VoiceState { status: "error", message: Some(m), voice: None })
}

pub fn connect(client_id: String, client_secret: String) -> Result<String, String> {
    call(CONNECT_TIMEOUT, move |s| s.connect(&client_id, &client_secret))?
}

pub fn disconnect() -> Result<(), String> {
    call(OP_TIMEOUT, |s| s.disconnect())
}

pub fn status() -> Result<Status, String> {
    call(OP_TIMEOUT, |s| s.status())
}

#[cfg(test)]
mod tests {
    use super::*;
    use fake::{FakeDiscord, FakeState, FakeTokens, Shared};
    use std::sync::{Arc, Mutex};

    struct T {
        svc: Service,
        state: Shared,
        dir: PathBuf,
    }
    impl Drop for T {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    fn setup(name: &str) -> T {
        let dir = std::env::temp_dir().join(format!("kira-discord-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let state: Shared = Arc::new(Mutex::new(FakeState::default()));
        let st = state.clone();
        let svc = Service::new(Env {
            open: Box::new(move || Ok(Box::new(FakeDiscord::open(&st)?) as Box<dyn Transport>)),
            tokens: Box::new(FakeTokens),
            secrets_path: dir.join("discord.bin"),
        });
        T { svc, state, dir }
    }

    fn connected(name: &str) -> T {
        let mut t = setup(name);
        assert_eq!(t.svc.connect(" 123456 ", " s ").unwrap(), "kira-teste");
        t
    }

    #[test]
    fn sem_credenciais_pede_para_conectar() {
        let mut t = setup("sem");
        assert_eq!(t.svc.voice().unwrap_err(), not_connected());
        assert_eq!(t.svc.voice_state().status, "notConnected");
        assert!(!t.svc.status().configured);
    }

    #[test]
    fn conectar_valida_campos_e_guarda_cifrado() {
        let mut t = setup("conectar");
        assert!(t.svc.connect("abc", "s").unwrap_err().contains("só números"));
        assert!(t.svc.connect("1", "").unwrap_err().contains("Secret"));
        t.svc.connect("123456", "segredo").unwrap();
        let raw = std::fs::read(t.dir.join("discord.bin")).unwrap();
        assert!(!raw.windows(7).any(|w| w == b"segredo"));
        assert_eq!(t.svc.status(), Status { configured: true, client_id: Some("123456".into()), user: Some("kira-teste".into()) });
        let cmds = t.state.lock().unwrap().commands.clone();
        assert_eq!(cmds, ["AUTHORIZE", "AUTHENTICATE"]);
    }

    #[test]
    fn alterna_mudo_e_ensurdecer() {
        let mut t = connected("alterna");
        t.svc.run(DiscordCmd::ToggleMute, None, None).unwrap();
        assert!(t.state.lock().unwrap().mute);
        t.svc.run(DiscordCmd::ToggleMute, None, None).unwrap();
        assert!(!t.state.lock().unwrap().mute);
        t.svc.run(DiscordCmd::ToggleDeafen, None, None).unwrap();
        let v = t.svc.voice().unwrap();
        assert!(v.deaf && v.mute, "ensurdecido conta como mudo");
        // Tirar o mudo estando ensurdecido desfaz os dois.
        t.svc.run(DiscordCmd::ToggleMute, None, None).unwrap();
        let s = t.state.lock().unwrap();
        assert!(!s.deaf && !s.mute);
    }

    #[test]
    fn le_o_canal_e_sai_dele() {
        let mut t = connected("canal");
        assert_eq!(t.svc.voice_state().voice.unwrap().channel.as_deref(), Some("Geral QA"));
        t.svc.run(DiscordCmd::LeaveVoice, None, None).unwrap();
        assert_eq!(t.state.lock().unwrap().channel, None);
        assert_eq!(t.svc.voice_state().voice.unwrap().channel, None);
        assert!(t.state.lock().unwrap().commands.contains(&"SELECT_VOICE_CHANNEL".to_string()));
        // Sair de novo, já fora: não é erro.
        t.svc.run(DiscordCmd::LeaveVoice, None, None).unwrap();
        assert_eq!(parse_channel(&json!(null)), None);
        assert_eq!(parse_channel(&json!({"id": "1", "name": "  "})).as_deref(), Some("Chamada"));
        let cmd: DiscordCmd = serde_json::from_value(json!("leaveVoice")).unwrap();
        assert_eq!(cmd, DiscordCmd::LeaveVoice);
    }

    #[test]
    fn troca_dispositivos_por_id_ou_nome() {
        let mut t = connected("dispositivos");
        t.svc.run(DiscordCmd::SetInput, Some("mic-2"), None).unwrap();
        t.svc.run(DiscordCmd::SetOutput, Some("id-velho"), Some("headset earphone (ARCTIS)")).unwrap();
        let v = t.svc.voice().unwrap();
        assert_eq!((v.input.current.as_str(), v.output.current.as_str()), ("mic-2", "out-2"));
        assert_eq!(v.input.devices.len(), 3);
        assert!(t.svc.run(DiscordCmd::SetInput, Some("x"), Some("Sumiu")).unwrap_err().contains("Sumiu"));
    }

    #[test]
    fn discord_fechado_e_reaberto() {
        let mut t = connected("fechado");
        t.state.lock().unwrap().closed = true;
        assert_eq!(t.svc.voice().unwrap_err(), closed());
        assert_eq!(t.svc.voice_state().status, "closed");
        // Reaberto: reconecta e autentica sozinho com o token guardado.
        t.state.lock().unwrap().closed = false;
        t.svc.run(DiscordCmd::Mute, None, None).unwrap();
        assert!(t.state.lock().unwrap().mute);
    }

    #[test]
    fn token_vencido_e_renovado() {
        let mut t = connected("renova");
        let p = t.dir.join("discord.bin");
        let mut s = secrets::load_from(&p).unwrap();
        s.access_token = "token-revogado".into();
        s.expires_at = 0;
        secrets::save_to(&p, &s).unwrap();
        t.svc.client = None;
        t.svc.run(DiscordCmd::Deafen, None, None).unwrap();
        assert_eq!(secrets::load_from(&p).unwrap().access_token, fake::FAKE_TOKEN);
        assert!(t.state.lock().unwrap().deaf);
    }

    #[test]
    fn desconectar_apaga_credenciais() {
        let mut t = connected("desconectar");
        t.svc.disconnect();
        assert!(!t.dir.join("discord.bin").exists());
        assert_eq!(t.svc.voice().unwrap_err(), not_connected());
    }

    #[test]
    fn pedido_vencido_na_fila_e_descartado() {
        let now = Instant::now();
        assert!(still_wanted(now + Duration::from_secs(1), now));
        assert!(!still_wanted(now, now));
        assert!(!still_wanted(now, now + Duration::from_secs(5)));
    }

    #[test]
    fn argumentos_de_voz() {
        use DiscordCmd::*;
        assert_eq!(voice_args(ToggleMute, false, false), Some(json!({"mute": true})));
        assert_eq!(voice_args(ToggleMute, true, false), Some(json!({"mute": false, "deaf": false})));
        assert_eq!(voice_args(ToggleMute, true, true), Some(json!({"mute": false, "deaf": false})));
        assert_eq!(voice_args(ToggleDeafen, true, true), Some(json!({"deaf": false})));
        assert_eq!(voice_args(ToggleDeafen, false, false), Some(json!({"deaf": true})));
        assert_eq!(voice_args(Unmute, false, false), Some(json!({"mute": false, "deaf": false})));
        assert_eq!(voice_args(SetInput, false, false), None);
        assert_eq!(voice_args(LeaveVoice, false, false), None);
    }

    #[test]
    fn le_configuracoes_de_voz_tolerando_campos_faltando() {
        let v = parse_voice(&json!({"mute": false, "deaf": true, "input": {"device_id": "a", "available_devices": [{"id": "a", "name": "A"}, {"name": "sem id"}]}}));
        assert!(v.mute && v.deaf);
        assert_eq!(v.input.devices, vec![Device { id: "a".into(), name: "A".into() }]);
        assert_eq!(v.output, DeviceList { current: "default".into(), devices: vec![] });
    }

    #[test]
    fn comando_do_discord_na_config() {
        let a: crate::actions::Action = serde_json::from_value(json!({"type": "discord", "cmd": "setOutput", "deviceId": "x", "deviceName": "Fone"})).unwrap();
        assert!(matches!(a, crate::actions::Action::Discord { cmd: DiscordCmd::SetOutput, .. }));
        let a: crate::actions::Action = serde_json::from_value(json!({"type": "discord", "cmd": "toggleDeafen"})).unwrap();
        assert!(matches!(a, crate::actions::Action::Discord { cmd: DiscordCmd::ToggleDeafen, device_id: None, .. }));
    }
}
