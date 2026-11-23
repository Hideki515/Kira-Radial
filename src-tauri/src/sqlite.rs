//! Leitura mínima de SQLite pela `winsqlite3.dll` que já vem no Windows 10/11
//! (sem embutir o SQLite no executável). Só leitura de um texto por consulta.

use std::ffi::{c_char, c_int, c_void, CString};
use windows::core::{s, w};
use windows::Win32::Foundation::HMODULE;
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32};

type OpenV2 = unsafe extern "system" fn(*const c_char, *mut *mut c_void, c_int, *const c_char) -> c_int;
type Close = unsafe extern "system" fn(*mut c_void) -> c_int;
type Prepare = unsafe extern "system" fn(*mut c_void, *const c_char, c_int, *mut *mut c_void, *mut *const c_char) -> c_int;
type Step = unsafe extern "system" fn(*mut c_void) -> c_int;
type ColumnText = unsafe extern "system" fn(*mut c_void, c_int) -> *const u8;
type ColumnBytes = unsafe extern "system" fn(*mut c_void, c_int) -> c_int;
type Finalize = unsafe extern "system" fn(*mut c_void) -> c_int;

const SQLITE_OK: c_int = 0;
const SQLITE_ROW: c_int = 100;
const SQLITE_OPEN_READONLY: c_int = 0x1;

struct Api {
    open: OpenV2,
    close: Close,
    prepare: Prepare,
    step: Step,
    text: ColumnText,
    bytes: ColumnBytes,
    finalize: Finalize,
}

fn api() -> Result<Api, String> {
    unsafe {
        // Só da System32 (nunca de uma pasta que alguém controle).
        let lib: HMODULE = LoadLibraryExW(w!("winsqlite3.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32)
            .map_err(|e| trf!("winsqlite3.dll indisponível: {e}", "winsqlite3.dll unavailable: {e}"))?;
        macro_rules! sym {
            ($name:expr, $t:ty) => {
                std::mem::transmute::<unsafe extern "system" fn() -> isize, $t>(
                    GetProcAddress(lib, $name).ok_or_else(|| tr!("winsqlite3.dll incompleta", "incomplete winsqlite3.dll").to_string())?,
                )
            };
        }
        Ok(Api {
            open: sym!(s!("sqlite3_open_v2"), OpenV2),
            close: sym!(s!("sqlite3_close"), Close),
            prepare: sym!(s!("sqlite3_prepare_v2"), Prepare),
            step: sym!(s!("sqlite3_step"), Step),
            text: sym!(s!("sqlite3_column_text"), ColumnText),
            bytes: sym!(s!("sqlite3_column_bytes"), ColumnBytes),
            finalize: sym!(s!("sqlite3_finalize"), Finalize),
        })
    }
}

/// Primeira coluna da primeira linha de `sql`, como texto (None = sem linhas).
pub fn query_text(db_path: &std::path::Path, sql: &str) -> Result<Option<String>, String> {
    let api = api()?;
    let path = CString::new(db_path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    let sql = CString::new(sql).map_err(|e| e.to_string())?;
    unsafe {
        let mut db: *mut c_void = std::ptr::null_mut();
        let rc = (api.open)(path.as_ptr(), &mut db, SQLITE_OPEN_READONLY, std::ptr::null());
        if rc != SQLITE_OK {
            if !db.is_null() {
                (api.close)(db);
            }
            return Err(trf!("não foi possível abrir o banco (código {rc})", "couldn't open the database (code {rc})"));
        }
        let mut stmt: *mut c_void = std::ptr::null_mut();
        let rc = (api.prepare)(db, sql.as_ptr(), -1, &mut stmt, std::ptr::null_mut());
        let out = if rc != SQLITE_OK {
            Err(trf!("consulta inválida (código {rc})", "invalid query (code {rc})"))
        } else if (api.step)(stmt) == SQLITE_ROW {
            let p = (api.text)(stmt, 0);
            let n = (api.bytes)(stmt, 0).max(0) as usize;
            Ok(if p.is_null() { None } else { Some(String::from_utf8_lossy(std::slice::from_raw_parts(p, n)).into_owned()) })
        } else {
            Ok(None)
        };
        if !stmt.is_null() {
            (api.finalize)(stmt);
        }
        (api.close)(db);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn banco_inexistente_da_erro_sem_travar() {
        let p = std::env::temp_dir().join("kira-nao-existe-xyz.db");
        assert!(query_text(&p, "SELECT 1").is_err());
    }
}
