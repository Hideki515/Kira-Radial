//! Dispositivos de saída de áudio: listagem (MMDevice API) e troca do padrão
//! (interface COM IPolicyConfig — não documentada, mas usada pelo próprio Windows
//! e por ferramentas como SoundSwitch/EarTrumpet há mais de uma década).

use serde::Serialize;
use windows::core::{GUID, PCWSTR};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
use windows::Win32::Media::Audio::{
    eCommunications, eConsole, eMultimedia, eRender, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
    DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::StructuredStorage::{PropVariantClear, PropVariantToBSTR};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED, STGM_READ,
};

#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

const CLSID_POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

#[allow(non_snake_case)]
mod policy {
    use windows::core::{interface, IUnknown, IUnknown_Vtbl, HRESULT, PCWSTR};
    use windows::Win32::Media::Audio::ERole;

    /// Vtable na ordem exata do Windows; só `SetDefaultEndpoint` é chamado.
    #[interface("f8679f50-850a-41cf-9c72-430f290290c8")]
    pub unsafe trait IPolicyConfig: IUnknown {
        fn GetMixFormat(&self, id: PCWSTR, format: *mut *mut core::ffi::c_void) -> HRESULT;
        fn GetDeviceFormat(&self, id: PCWSTR, default: i32, format: *mut *mut core::ffi::c_void) -> HRESULT;
        fn ResetDeviceFormat(&self, id: PCWSTR) -> HRESULT;
        fn SetDeviceFormat(&self, id: PCWSTR, endpoint: *mut core::ffi::c_void, mix: *mut core::ffi::c_void) -> HRESULT;
        fn GetProcessingPeriod(&self, id: PCWSTR, default: i32, default_period: *mut i64, min_period: *mut i64) -> HRESULT;
        fn SetProcessingPeriod(&self, id: PCWSTR, period: *mut i64) -> HRESULT;
        fn GetShareMode(&self, id: PCWSTR, mode: *mut core::ffi::c_void) -> HRESULT;
        fn SetShareMode(&self, id: PCWSTR, mode: *mut core::ffi::c_void) -> HRESULT;
        fn GetPropertyValue(&self, id: PCWSTR, fx_store: i32, key: *const core::ffi::c_void, value: *mut core::ffi::c_void) -> HRESULT;
        fn SetPropertyValue(&self, id: PCWSTR, fx_store: i32, key: *const core::ffi::c_void, value: *mut core::ffi::c_void) -> HRESULT;
        fn SetDefaultEndpoint(&self, id: PCWSTR, role: ERole) -> HRESULT;
        fn SetEndpointVisibility(&self, id: PCWSTR, visible: i32) -> HRESULT;
    }

    /// Os métodos gerados pelo macro são privados a este módulo.
    pub fn set_default_endpoint(p: &IPolicyConfig, id: PCWSTR, role: ERole) -> HRESULT {
        unsafe { p.SetDefaultEndpoint(id, role) }
    }
}
use policy::IPolicyConfig;

/// Inicializa COM na thread atual enquanto viver; desfaz no Drop se fomos nós que inicializamos.
struct ComGuard(bool);

impl ComGuard {
    fn new() -> Result<Self, String> {
        let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if hr == RPC_E_CHANGED_MODE {
            // Thread já está em MTA: COM utilizável, mas não é nossa para desfazer.
            return Ok(ComGuard(false));
        }
        hr.ok().map_err(|e| format!("falha ao inicializar COM: {e}"))?;
        Ok(ComGuard(true)) // S_OK ou S_FALSE: ambos exigem CoUninitialize
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            unsafe { CoUninitialize() };
        }
    }
}

fn enumerator() -> Result<IMMDeviceEnumerator, String> {
    unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
        .map_err(|e| format!("falha ao acessar os dispositivos de áudio: {e}"))
}

fn device_id(d: &IMMDevice) -> windows::core::Result<String> {
    unsafe {
        let p = d.GetId()?;
        let s = p.to_string().unwrap_or_default();
        CoTaskMemFree(Some(p.0 as *const _));
        Ok(s)
    }
}

fn device_name(d: &IMMDevice) -> windows::core::Result<String> {
    unsafe {
        let store = d.OpenPropertyStore(STGM_READ)?;
        let mut pv = store.GetValue(&PKEY_Device_FriendlyName)?;
        let r = PropVariantToBSTR(&pv).map(|b| b.to_string());
        let _ = PropVariantClear(&mut pv);
        r
    }
}

fn list_outputs_inner() -> Result<Vec<AudioDevice>, String> {
    let _com = ComGuard::new()?;
    let en = enumerator()?;
    let err = |e: windows::core::Error| format!("falha ao listar dispositivos de áudio: {e}");
    unsafe {
        // Sem dispositivo padrão (nenhuma saída ativa) não é erro: apenas nenhum marcado.
        let default_id = en
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .ok()
            .and_then(|d| device_id(&d).ok());
        let coll = en.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE).map_err(err)?;
        let n = coll.GetCount().map_err(err)?;
        let mut out = Vec::with_capacity(n as usize);
        for i in 0..n {
            let d = coll.Item(i).map_err(err)?;
            let id = device_id(&d).map_err(err)?;
            let name = device_name(&d).unwrap_or_else(|_| id.clone());
            let is_default = default_id.as_deref() == Some(id.as_str());
            out.push(AudioDevice { id, name, is_default });
        }
        Ok(out)
    }
}

/// Saídas de áudio ativas. Inicializa COM por conta própria: chame numa thread bloqueante.
pub fn list_outputs() -> Result<Vec<AudioDevice>, String> {
    // Thread dedicada: não interfere no modelo COM de quem chamou.
    std::thread::spawn(list_outputs_inner)
        .join()
        .map_err(|_| "falha ao listar dispositivos de áudio".to_string())?
}

fn set_default_inner(id: &str) -> Result<(), String> {
    let _com = ComGuard::new()?;
    let config: IPolicyConfig = unsafe { CoCreateInstance(&CLSID_POLICY_CONFIG_CLIENT, None, CLSCTX_ALL) }
        .map_err(|e| format!("falha ao acessar a configuração de áudio do Windows: {e}"))?;
    let wide = windows::core::HSTRING::from(id);
    for role in [eConsole, eMultimedia, eCommunications] {
        policy::set_default_endpoint(&config, PCWSTR(wide.as_ptr()), role)
            .ok()
            .map_err(|e| format!("falha ao trocar a saída de áudio: {e}"))?;
    }
    Ok(())
}

/// Torna `id` a saída padrão (console, multimídia e comunicações).
pub fn set_default(id: &str) -> Result<(), String> {
    let id = id.to_string();
    std::thread::spawn(move || set_default_inner(&id))
        .join()
        .map_err(|_| "falha ao trocar a saída de áudio".to_string())?
}

/// Escolhe o dispositivo pelo id; se não existir mais (ex.: driver reinstalado), pelo nome.
pub fn pick<'a>(devices: &'a [AudioDevice], id: Option<&str>, name: Option<&str>) -> Option<&'a AudioDevice> {
    let id = id.map(str::trim).filter(|s| !s.is_empty());
    let name = name.map(str::trim).filter(|s| !s.is_empty());
    id.and_then(|id| devices.iter().find(|d| d.id == id)).or_else(|| {
        name.and_then(|n| {
            let n = n.to_lowercase();
            devices.iter().find(|d| d.name.trim().to_lowercase() == n)
        })
    })
}

/// Próximo dispositivo após o padrão atual (dá a volta). Sem padrão conhecido, o primeiro.
pub fn next_in_cycle(devices: &[AudioDevice]) -> Option<&AudioDevice> {
    if devices.is_empty() {
        return None;
    }
    let i = devices.iter().position(|d| d.is_default).map(|i| (i + 1) % devices.len()).unwrap_or(0);
    Some(&devices[i])
}

/// Executa a ação "audioOutput".
pub fn run(cycle: bool, id: Option<&str>, name: Option<&str>) -> Result<(), String> {
    let devices = list_outputs()?;
    let target = if cycle {
        next_in_cycle(&devices).ok_or_else(|| "Nenhum dispositivo de saída de áudio ativo.".to_string())?
    } else {
        pick(&devices, id, name).ok_or_else(|| {
            let label = name.or(id).unwrap_or("");
            format!("Dispositivo de áudio \"{label}\" não encontrado.")
        })?
    };
    if target.is_default {
        return Ok(());
    }
    set_default(&target.id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dev(id: &str, name: &str, def: bool) -> AudioDevice {
        AudioDevice { id: id.into(), name: name.into(), is_default: def }
    }

    #[test]
    fn escolhe_por_id_e_depois_por_nome() {
        let ds = vec![dev("a", "Alto-falantes (Realtek)", true), dev("b", "Headset (HyperX)", false)];
        assert_eq!(pick(&ds, Some("b"), Some("x")).unwrap().id, "b");
        assert_eq!(pick(&ds, Some("sumiu"), Some("headset (hyperx)")).unwrap().id, "b");
        assert_eq!(pick(&ds, None, Some(" Alto-falantes (Realtek) ")).unwrap().id, "a");
        assert!(pick(&ds, Some("sumiu"), Some("outro")).is_none());
        assert!(pick(&ds, Some(""), Some("")).is_none());
    }

    #[test]
    fn ciclo_da_a_volta() {
        let ds = vec![dev("a", "A", false), dev("b", "B", false), dev("c", "C", true)];
        assert_eq!(next_in_cycle(&ds).unwrap().id, "a");
        let ds = vec![dev("a", "A", true), dev("b", "B", false)];
        assert_eq!(next_in_cycle(&ds).unwrap().id, "b");
        let ds = vec![dev("a", "A", false), dev("b", "B", false)];
        assert_eq!(next_in_cycle(&ds).unwrap().id, "a");
        assert!(next_in_cycle(&[]).is_none());
    }

    /// Só lê a lista (não muda o padrão). Rode com `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn lista_saidas_desta_maquina() {
        let ds = list_outputs().unwrap();
        for d in &ds {
            println!("{} {} [{}]", if d.is_default { "*" } else { " " }, d.name, d.id);
        }
        assert!(ds.iter().filter(|d| d.is_default).count() <= 1);
    }
}
