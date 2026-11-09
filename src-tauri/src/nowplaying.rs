//! "Tocando agora": música/vídeo em reprodução no Windows (Spotify, navegador, etc.),
//! pela API de controles de mídia do sistema (GlobalSystemMediaTransportControls).
//! O front pede o estado ao abrir o menu e a cada 2 s enquanto ele está aberto.

use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    /// App de origem (ex.: "Spotify.exe", "MSEdge").
    pub app: String,
    pub playing: bool,
    /// Capa como data URL (JPEG/PNG), se houver.
    pub thumb: Option<String>,
}

/// Status da API (GlobalSystemMediaTransportControlsSessionPlaybackStatus): 4 = Playing.
pub fn is_playing(status: i32) -> bool {
    status == 4
}

/// Nome curto do app a partir do AppUserModelId ("Spotify.exe", "Microsoft.ZuneMusic_8wek...!App").
pub fn app_name(aumid: &str) -> String {
    let base = aumid.split('!').next().unwrap_or(aumid);
    let base = base.split('_').next().unwrap_or(base);
    base.rsplit(['\\', '/']).next().unwrap_or(base).trim_end_matches(".exe").to_string()
}

/// Capa da última faixa lida (evita reler a imagem a cada 2 s).
static THUMB_CACHE: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);

/// Limite da capa (bytes): capas maiores são ignoradas.
const MAX_THUMB: u32 = 512 * 1024;

fn read_thumb(props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties) -> Option<String> {
    use windows::Storage::Streams::DataReader;
    let stream = props.Thumbnail().ok()?.OpenReadAsync().ok()?.get().ok()?;
    let size = stream.Size().ok()? as u32;
    if size == 0 || size > MAX_THUMB {
        return None;
    }
    let mime = stream.ContentType().map(|s| s.to_string()).unwrap_or_default();
    let mime = if mime.starts_with("image/") { mime } else { "image/jpeg".into() };
    let reader = DataReader::CreateDataReader(&stream).ok()?;
    reader.LoadAsync(size).ok()?.get().ok()?;
    let mut buf = vec![0u8; size as usize];
    reader.ReadBytes(&mut buf).ok()?;
    Some(format!("data:{mime};base64,{}", crate::orb::base64(&buf)))
}

/// Mídia atual; `None` se nada estiver tocando/pausado em nenhum app.
pub fn current() -> Option<NowPlaying> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Manager;
    let session = Manager::RequestAsync().ok()?.get().ok()?.GetCurrentSession().ok()?;
    let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
    let title = props.Title().map(|s| s.to_string()).unwrap_or_default();
    if title.trim().is_empty() {
        return None;
    }
    let artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
    let playing = session
        .GetPlaybackInfo()
        .and_then(|i| i.PlaybackStatus())
        .map(|s| is_playing(s.0))
        .unwrap_or(false);
    let app = session.SourceAppUserModelId().map(|s| app_name(&s.to_string())).unwrap_or_default();
    let key = format!("{title}\u{1f}{artist}");
    let thumb = {
        let mut cache = THUMB_CACHE.lock().unwrap();
        match cache.as_ref() {
            Some((k, t)) if *k == key => t.clone(),
            _ => {
                let t = read_thumb(&props);
                *cache = Some((key, t.clone()));
                t
            }
        }
    };
    Some(NowPlaying { title, artist, app, playing, thumb })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_tocando() {
        assert!(is_playing(4));
        assert!(!is_playing(5)); // Paused
        assert!(!is_playing(0));
    }

    #[test]
    fn nome_do_app() {
        assert_eq!(app_name("Spotify.exe"), "Spotify");
        assert_eq!(app_name("Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic"), "Microsoft.ZuneMusic");
        assert_eq!(app_name("MSEdge"), "MSEdge");
        assert_eq!(app_name(r"C:\Program Files\VLC\vlc.exe"), "vlc");
    }

    #[test]
    fn leitura_real_nao_falha() {
        // Pode não haver mídia: só garante que a chamada volta sem pânico.
        let _ = current();
    }
}
