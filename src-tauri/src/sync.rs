//! Sincronizar a configuração entre computadores por uma pasta que o próprio usuário já
//! sincroniza (OneDrive, Dropbox, Google Drive, pasta de rede...). A Kira só lê e grava um
//! arquivo nela; quem leva o arquivo de um PC ao outro é o serviço do usuário.
//!
//! Regra: vale a versão mais nova. A que perde vira um backup (Configurações → Backup), nos
//! dois sentidos. A posição do ícone e "iniciar com o Windows" são de cada PC (não viajam).
//! A escolha da pasta fica fora da config (sync.json), para não ser sobrescrita pela outra.

use crate::config::{self, Config};
use crate::lock::LockExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

pub const SHARED_NAME: &str = "kira-radial-config.json";
/// Com que frequência olhar se o arquivo da pasta mudou (só a data do arquivo: custo ~zero).
const CHECK_SECS: u64 = 15;

/// Preferências locais da sincronização (sync.json, ao lado da config).
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Local {
    pub enabled: bool,
    pub folder: String,
    /// `savedAt` da última versão enviada ou recebida (a "nossa" versão na pasta).
    pub last_stamp: u64,
    /// Quando sincronizou pela última vez (ms) e de qual PC veio a versão.
    pub last_sync: u64,
    pub last_machine: String,
}

/// O arquivo na pasta compartilhada.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub saved_at: u64,
    pub machine: String,
    pub config: Value,
}

/// O que a tela de Configurações mostra.
#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    pub folder: String,
    pub last_sync: u64,
    pub last_machine: String,
    pub error: Option<String>,
}

static LOCK: Mutex<()> = Mutex::new(());
static ERROR: Mutex<Option<String>> = Mutex::new(None);
/// Geração do vigia: ao religar, o antigo vê a geração mudar e para (nunca dois ao mesmo tempo).
static GEN: AtomicU64 = AtomicU64::new(0);

fn local_path() -> PathBuf {
    config::config_dir().join("sync.json")
}

pub fn load_local() -> Local {
    fs::read_to_string(local_path()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn save_local(l: &Local) -> Result<(), String> {
    fs::create_dir_all(config::config_dir()).map_err(|e| e.to_string())?;
    fs::write(local_path(), serde_json::to_string_pretty(l).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn shared_path(folder: &str) -> PathBuf {
    Path::new(folder).join(SHARED_NAME)
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn machine() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "?".into())
}

/// A versão da pasta é de outra gravação, mais nova que a nossa última?
pub fn remote_is_newer(remote_saved_at: u64, last_stamp: u64) -> bool {
    remote_saved_at > last_stamp
}

/// Config recebida com o que é de cada PC mantido como está aqui.
pub fn merge_local(mut remote: Config, local: &Config) -> Config {
    remote.launcher.orb.x = local.launcher.orb.x;
    remote.launcher.orb.y = local.launcher.orb.y;
    remote.launcher.orb.hidden = local.launcher.orb.hidden;
    remote.launcher.orb.docked = local.launcher.orb.docked;
    remote.behavior.autostart = local.behavior.autostart;
    remote
}

pub fn read_envelope(folder: &str) -> Result<Option<Envelope>, String> {
    match fs::read_to_string(shared_path(folder)) {
        Ok(t) => serde_json::from_str(&t).map(Some).map_err(|e| trf!("arquivo da sincronização inválido: {e}", "invalid sync file: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Grava na pasta de forma atômica (temporário + rename: o serviço de nuvem nunca vê metade).
pub fn write_envelope(folder: &str, env: &Envelope) -> Result<(), String> {
    let path = shared_path(folder);
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_string_pretty(env).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn set_error(e: Option<String>) {
    if let Some(m) = &e {
        crate::perf::log_level(crate::perf::Level::Warn, "rust", &format!("sincronização: {m}"));
    }
    *ERROR.lock_ok() = e;
}

pub fn status() -> Status {
    let l = load_local();
    Status { enabled: l.enabled, folder: l.folder, last_sync: l.last_sync, last_machine: l.last_machine, error: ERROR.lock_ok().clone() }
}

/// Envia a config salva agora. Se a da pasta mudou desde a nossa última e vai ser
/// substituída, ela vira um backup aqui antes (nada se perde).
pub fn push(config: &Config) {
    let _g = LOCK.lock_ok();
    let mut l = load_local();
    if !l.enabled || l.folder.is_empty() {
        return;
    }
    let r = (|| -> Result<(), String> {
        if let Some(remote) = read_envelope(&l.folder)? {
            if remote_is_newer(remote.saved_at, l.last_stamp) {
                crate::backup::store(&serde_json::to_string_pretty(&remote.config).map_err(|e| e.to_string())?)?;
            }
        }
        let env = Envelope { saved_at: now_ms(), machine: machine(), config: serde_json::to_value(config).map_err(|e| e.to_string())? };
        write_envelope(&l.folder, &env)?;
        l.last_stamp = env.saved_at;
        l.last_sync = env.saved_at;
        l.last_machine = env.machine;
        save_local(&l)
    })();
    set_error(r.err());
}

/// Olha a pasta: se há versão mais nova, aplica (a local vira backup ao salvar).
/// Devolve true se trocou a config. Nunca chamar da thread principal (espera por ela):
/// só do vigia, da thread de abertura e de spawn_blocking.
pub fn pull(app: &AppHandle) -> bool {
    // 1) Ler e conferir o arquivo da pasta (pode ser lento: disco de rede/nuvem), sem nada
    //    que espere a thread principal enquanto a trava está presa.
    let prepared = {
        let _g = LOCK.lock_ok();
        let l = load_local();
        if !l.enabled || l.folder.is_empty() {
            return false;
        }
        (|| -> Result<Option<(Envelope, Config)>, String> {
            let Some(remote) = read_envelope(&l.folder)? else { return Ok(None) };
            if !remote_is_newer(remote.saved_at, l.last_stamp) {
                return Ok(None);
            }
            let text = serde_json::to_string(&remote.config).map_err(|e| e.to_string())?;
            let incoming = config::parse(&text).map_err(|e| trf!("config da pasta recusada: {e}", "config in the folder rejected: {e}"))?;
            Ok(Some((remote, incoming)))
        })()
    };
    let (remote, incoming) = match prepared {
        Ok(Some(x)) => x,
        Ok(None) => {
            set_error(None);
            return false;
        }
        Err(e) => {
            set_error(Some(e));
            return false;
        }
    };
    // 2) Aplicar na thread principal, onde o Salvar também roda: os dois nunca se cruzam
    //    (antes, aplicar aqui segurando a trava travava com um Salvar no mesmo instante).
    let (tx, rx) = std::sync::mpsc::channel();
    let main_app = app.clone();
    let queued = app.run_on_main_thread(move || {
        let _ = tx.send(apply_pulled(&main_app, remote, incoming));
    });
    let r = match queued {
        Ok(()) => rx.recv().unwrap_or_else(|_| Err("a aplicação da config foi cancelada".into())),
        Err(e) => Err(e.to_string()),
    };
    match r {
        Ok(changed) => {
            set_error(None);
            if changed {
                let _ = app.emit("sync:pulled", ());
            }
            changed
        }
        Err(e) => {
            set_error(Some(e));
            false
        }
    }
}

/// Na thread principal: confere de novo (um Salvar pode ter enviado uma versão mais nova
/// entre a leitura e agora) e aplica.
fn apply_pulled(app: &AppHandle, remote: Envelope, incoming: Config) -> Result<bool, String> {
    let _g = LOCK.lock_ok();
    let mut l = load_local();
    if !l.enabled || !remote_is_newer(remote.saved_at, l.last_stamp) {
        return Ok(false);
    }
    let local = app.state::<crate::menu::AppState>().config();
    crate::commands::apply_config(app, merge_local(incoming, &local))?;
    l.last_stamp = remote.saved_at;
    l.last_sync = now_ms();
    l.last_machine = remote.machine;
    save_local(&l)?;
    Ok(true)
}

/// Liga/desliga ou troca a pasta. Ao ligar: se a pasta já tem uma versão mais nova que a
/// config deste PC, ela vale (a daqui vira backup); senão, a daqui é enviada.
pub fn configure(app: &AppHandle, enabled: bool, folder: String) -> Result<Status, String> {
    let folder = folder.trim().to_string();
    if enabled {
        if folder.is_empty() || !Path::new(&folder).is_dir() {
            return Err(tr!("Escolha uma pasta que exista (ex.: dentro do OneDrive).", "Pick a folder that exists (e.g. inside OneDrive).").into());
        }
        if Path::new(&folder).starts_with(config::config_dir()) {
            return Err(tr!("Escolha uma pasta fora da pasta de dados da Kira.", "Pick a folder outside Kira's data folder.").into());
        }
    }
    {
        let _g = LOCK.lock_ok();
        let mut l = load_local();
        let changed_folder = l.folder != folder;
        l.enabled = enabled;
        l.folder = folder.clone();
        if changed_folder {
            // Pasta nova: a "nossa" versão lá é a data da config local (quem for mais novo vale).
            l.last_stamp = fs::metadata(config::config_path())
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
        }
        save_local(&l)?;
    }
    set_error(None);
    if enabled && !pull(app) && ERROR.lock_ok().is_none() {
        // Nada mais novo na pasta: envia a daqui (cria o arquivo na primeira vez).
        push(&app.state::<crate::menu::AppState>().config());
    }
    start(app);
    Ok(status())
}

/// (Re)inicia o vigia da pasta conforme o sync.json.
pub fn start(app: &AppHandle) {
    let my_gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let l = load_local();
    if !l.enabled || l.folder.is_empty() {
        return;
    }
    let app = app.clone();
    let _ = std::thread::Builder::new().name("sync".into()).spawn(move || {
        let mut seen: Option<std::time::SystemTime> = None;
        while GEN.load(Ordering::SeqCst) == my_gen {
            let folder = load_local().folder;
            let modified = fs::metadata(shared_path(&folder)).and_then(|m| m.modified()).ok();
            if modified.is_some() && modified != seen {
                seen = modified;
                pull(&app);
            }
            for _ in 0..CHECK_SECS {
                if GEN.load(Ordering::SeqCst) != my_gen {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_secs(1));
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mais_nova_vence() {
        assert!(remote_is_newer(2000, 1000));
        assert!(!remote_is_newer(1000, 1000), "a nossa própria gravação não volta");
        assert!(!remote_is_newer(500, 1000));
    }

    #[test]
    fn o_que_e_de_cada_pc_nao_viaja() {
        let mut local = Config::default_config();
        local.launcher.orb.x = Some(111);
        local.launcher.orb.y = Some(222);
        local.behavior.autostart = true;
        let mut remote = Config::default_config();
        remote.launcher.orb.x = Some(5);
        remote.behavior.autostart = false;
        remote.hotkey.accelerator = "Ctrl+Alt+K".into();
        let m = merge_local(remote, &local);
        assert_eq!((m.launcher.orb.x, m.launcher.orb.y, m.behavior.autostart), (Some(111), Some(222), true));
        assert_eq!(m.hotkey.accelerator, "Ctrl+Alt+K", "o resto vem da outra");
    }

    #[test]
    fn envelope_ida_e_volta_e_arquivo_ausente() {
        let dir = std::env::temp_dir().join(format!("kira-sync-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let folder = dir.to_string_lossy().to_string();
        assert!(read_envelope(&folder).unwrap().is_none());
        let env = Envelope { saved_at: 42, machine: "PC-A".into(), config: serde_json::to_value(Config::default_config()).unwrap() };
        write_envelope(&folder, &env).unwrap();
        let back = read_envelope(&folder).unwrap().unwrap();
        assert_eq!((back.saved_at, back.machine.as_str()), (42, "PC-A"));
        assert!(config::parse(&serde_json::to_string(&back.config).unwrap()).is_ok());
        assert!(!shared_path(&folder).with_extension("json.tmp").exists());
        fs::write(shared_path(&folder), "{ quebrado").unwrap();
        assert!(read_envelope(&folder).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
