//! OBS de mentira (Kira de teste e testes): três cenas, uma fonte de áudio e o estado de
//! gravação/transmissão em memória. Nunca toca na rede nem no OBS de verdade.

use super::{ObsCmd, ObsError, ObsState};
use std::sync::Mutex;

struct Fake {
    current: String,
    recording: bool,
    paused: bool,
    streaming: bool,
    muted: bool,
    virtual_cam: bool,
    replays: u32,
}

pub const SCENES: [&str; 3] = ["Cena QA 1", "Cena QA 2", "Cena QA 3"];
pub const INPUT: &str = "Mic QA";

static STATE: Mutex<Option<Fake>> = Mutex::new(None);

fn with<T>(f: impl FnOnce(&mut Fake) -> T) -> T {
    let mut g = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let st = g.get_or_insert_with(|| Fake {
        current: SCENES[0].into(),
        recording: false,
        paused: false,
        streaming: false,
        muted: false,
        virtual_cam: false,
        replays: 0,
    });
    f(st)
}

pub fn state() -> ObsState {
    with(|f| ObsState {
        status: "ok".into(),
        message: None,
        version: Some("QA".into()),
        scenes: SCENES.iter().map(|s| s.to_string()).collect(),
        current: Some(f.current.clone()),
        recording: f.recording,
        streaming: f.streaming,
        inputs: vec![INPUT.into()],
    })
}

pub fn run(cmd: ObsCmd, scene: Option<&str>, input: Option<&str>) -> Result<(), ObsError> {
    with(|f| {
        match cmd {
            ObsCmd::SetScene => {
                let s = scene.unwrap_or("").trim();
                if !SCENES.contains(&s) {
                    return Err(ObsError::Request(600, format!("No source was found by the name of `{s}`.")));
                }
                f.current = s.into();
            }
            ObsCmd::ToggleRecord => {
                f.recording = !f.recording;
                f.paused = false;
            }
            ObsCmd::StartRecord => f.recording = true,
            ObsCmd::StopRecord => f.recording = false,
            ObsCmd::ToggleRecordPause => {
                if !f.recording {
                    return Err(ObsError::Request(501, String::new()));
                }
                f.paused = !f.paused;
            }
            ObsCmd::ToggleStream => f.streaming = !f.streaming,
            ObsCmd::StartStream => f.streaming = true,
            ObsCmd::StopStream => f.streaming = false,
            ObsCmd::ToggleMute => {
                if input.map(str::trim) != Some(INPUT) {
                    return Err(ObsError::Request(600, String::new()));
                }
                f.muted = !f.muted;
            }
            ObsCmd::SaveReplay => f.replays += 1,
            ObsCmd::ToggleVirtualCam => f.virtual_cam = !f.virtual_cam,
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fake_troca_cena_e_grava() {
        run(ObsCmd::SetScene, Some("Cena QA 2"), None).unwrap();
        assert_eq!(state().current.as_deref(), Some("Cena QA 2"));
        assert!(run(ObsCmd::SetScene, Some("Outra"), None).is_err());
        assert!(run(ObsCmd::ToggleMute, None, Some("Outro")).is_err());
        run(ObsCmd::StartRecord, None, None).unwrap();
        assert!(state().recording);
        run(ObsCmd::StopRecord, None, None).unwrap();
        assert!(!state().recording);
    }
}
