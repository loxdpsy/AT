// The offline engine as a library: atlas_engine.dll on Windows, libatlas_engine.so on Linux and libatlas_engine.dylib
// on macOS. Its C interface is tools/atlas-engine/include/atlas_engine.h. The helper loads the library into its own
// process and translates with it, so no engine program runs. When the library is missing, does not load, or has
// another interface version, engine.rs runs the engine program instead.
//
// On Windows a library that is in use cannot be replaced, so a newly installed library takes effect after the helper
// restarts.

use std::collections::HashMap;
use std::ffi::{c_char, c_int, c_void, CString};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;

use libloading::Library;

use crate::store;

/// The interface version the helper was built for (ATLAS_ENGINE_API_VERSION in atlas_engine.h).
const API_VERSION: c_int = 1;
/// The size of the error buffer that the library writes into.
const ERROR_SIZE: usize = 512;

type VersionFn = unsafe extern "C" fn() -> c_int;
type OpenFn = unsafe extern "C" fn(*const c_char, *mut c_char, usize) -> *mut c_void;
type TranslateFn =
    unsafe extern "C" fn(*mut c_void, *const c_char, usize, *mut *mut c_char, *mut usize, *mut c_char, usize) -> c_int;
type FreeTextFn = unsafe extern "C" fn(*mut c_char);
type CloseFn = unsafe extern "C" fn(*mut c_void);

/// The loaded library and its functions. It stays loaded until the helper exits.
struct Lib {
    _library: Library,
    open: OpenFn,
    translate: TranslateFn,
    free_text: FreeTextFn,
    close: CloseFn,
}

// The functions are plain C functions. The library locks each handle itself while it translates.
unsafe impl Send for Lib {}
unsafe impl Sync for Lib {}

static LIB: OnceLock<Option<Lib>> = OnceLock::new();
static PACKS: OnceLock<Mutex<HashMap<PathBuf, Arc<Pack>>>> = OnceLock::new();

/// The library file for this computer. None when there is no library for it.
pub fn library_file_name() -> Option<&'static str> {
    if cfg!(windows) {
        Some("atlas_engine.dll")
    } else if cfg!(target_os = "macos") {
        Some("libatlas_engine.dylib")
    } else if cfg!(target_os = "linux") {
        Some("libatlas_engine.so")
    } else {
        None
    }
}

/// The library the helper installed, or one next to the helper program.
fn library_path() -> Option<PathBuf> {
    let file = library_file_name()?;
    let installed = store::data_dir().join("engine").join(file);
    if installed.is_file() {
        return Some(installed);
    }
    let beside = std::env::current_exe().ok()?.parent()?.join(file);
    if beside.is_file() {
        return Some(beside);
    }
    None
}

fn load() -> Result<Lib, String> {
    let path = library_path().ok_or("the engine library is not installed")?;
    // SAFETY: the library is the engine built from tools/atlas-engine. Each function is called with the arguments of
    // its interface in atlas_engine.h, and the interface version is checked before any other function is used.
    unsafe {
        let library = Library::new(&path).map_err(|e| format!("{}: {}", path.display(), e))?;
        let version = *library.get::<VersionFn>(b"atlas_engine_api_version\0").map_err(|e| e.to_string())?;
        let found = version();
        if found != API_VERSION {
            return Err(format!("the library has interface {}, the helper needs {}", found, API_VERSION));
        }
        let open = *library.get::<OpenFn>(b"atlas_engine_open\0").map_err(|e| e.to_string())?;
        let translate = *library.get::<TranslateFn>(b"atlas_engine_translate\0").map_err(|e| e.to_string())?;
        let free_text = *library.get::<FreeTextFn>(b"atlas_engine_free_text\0").map_err(|e| e.to_string())?;
        let close = *library.get::<CloseFn>(b"atlas_engine_close\0").map_err(|e| e.to_string())?;
        Ok(Lib { _library: library, open, translate, free_text, close })
    }
}

fn lib() -> Option<&'static Lib> {
    LIB.get_or_init(|| load().ok()).as_ref()
}

/// The text of a NUL-terminated error buffer.
fn error_text(buffer: &[c_char]) -> String {
    let end = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    let bytes: Vec<u8> = buffer[..end].iter().map(|&c| c as u8).collect();
    String::from_utf8_lossy(&bytes).into_owned()
}

/// One engine object of the library. Only the thread that took it out of the pack's list uses it.
struct Handle(*mut c_void);

// SAFETY: a handle is moved between threads only while it is in the pack's list, and it is used by one thread at a time.
unsafe impl Send for Handle {}

/// A language pack opened in the library. Several handles can translate at once, one per running piece of text.
pub struct Pack {
    lib: &'static Lib,
    dir: CString,
    idle: Mutex<Vec<Handle>>,
}

/// The open pack of a folder, or None when the library is not usable for it (the caller then runs the program).
pub fn pack(dir: &Path) -> Option<Arc<Pack>> {
    let lib = lib()?;
    let cache = PACKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut packs = cache.lock().ok()?;
    if let Some(found) = packs.get(dir) {
        return Some(found.clone());
    }
    let dir_c = CString::new(dir.to_string_lossy().into_owned()).ok()?;
    let pack = Arc::new(Pack { lib, dir: dir_c, idle: Mutex::new(Vec::new()) });
    // Load one engine now. A pack that the library cannot load is found here, and the program is used instead.
    let first = pack.take_handle().ok()?;
    pack.give_back(first);
    packs.insert(dir.to_path_buf(), pack.clone());
    Some(pack)
}

impl Pack {
    fn take_handle(&self) -> Result<Handle, String> {
        if let Some(handle) = self.idle.lock().map_err(|_| "the engine lock is broken")?.pop() {
            return Ok(handle);
        }
        let mut error = [0 as c_char; ERROR_SIZE];
        // SAFETY: the directory is NUL-terminated and the error buffer has ERROR_SIZE bytes.
        let handle = unsafe { (self.lib.open)(self.dir.as_ptr(), error.as_mut_ptr(), ERROR_SIZE) };
        if handle.is_null() {
            return Err(error_text(&error));
        }
        Ok(Handle(handle))
    }

    fn give_back(&self, handle: Handle) {
        if let Ok(mut idle) = self.idle.lock() {
            idle.push(handle);
        }
    }

    fn translate_one(&self, text: &str) -> Result<String, String> {
        let handle = self.take_handle()?;
        let mut out: *mut c_char = std::ptr::null_mut();
        let mut out_len: usize = 0;
        let mut error = [0 as c_char; ERROR_SIZE];
        // SAFETY: the handle is one this library opened and has not closed. The output pointers are valid. A buffer the
        // library returns is copied and then freed with atlas_engine_free_text.
        let status = unsafe {
            (self.lib.translate)(
                handle.0,
                text.as_ptr() as *const c_char,
                text.len(),
                &mut out,
                &mut out_len,
                error.as_mut_ptr(),
                ERROR_SIZE,
            )
        };
        let result = if status == 0 {
            let copy = if out.is_null() {
                String::new()
            } else {
                // SAFETY: on success the library set out to out_len bytes followed by a NUL.
                let bytes = unsafe { std::slice::from_raw_parts(out as *const u8, out_len) };
                String::from_utf8_lossy(bytes).into_owned()
            };
            if !out.is_null() {
                // SAFETY: out came from atlas_engine_translate and is freed once.
                unsafe { (self.lib.free_text)(out) };
            }
            Ok(copy)
        } else {
            Err(error_text(&error))
        };
        self.give_back(handle);
        result
    }

    /// Translates the pieces, `workers` at a time. Returns one translation per piece, in order.
    pub fn translate_all(&self, pieces: &[String], workers: usize) -> Result<Vec<String>, String> {
        if pieces.is_empty() {
            return Ok(Vec::new());
        }
        let workers = workers.min(pieces.len()).max(1);
        let chunk = (pieces.len() + workers - 1) / workers;
        let results: Vec<Result<Vec<String>, String>> = thread::scope(|scope| {
            let jobs: Vec<_> = pieces
                .chunks(chunk)
                .map(|part| {
                    scope.spawn(move || {
                        part.iter().map(|piece| self.translate_one(piece)).collect::<Result<Vec<String>, String>>()
                    })
                })
                .collect();
            jobs.into_iter()
                .map(|job| job.join().unwrap_or_else(|_| Err("the engine stopped while translating".to_string())))
                .collect()
        });
        let mut out = Vec::with_capacity(pieces.len());
        for result in results {
            out.extend(result?);
        }
        Ok(out)
    }
}

impl Drop for Pack {
    fn drop(&mut self) {
        let lib = self.lib;
        if let Ok(idle) = self.idle.get_mut() {
            for handle in idle.drain(..) {
                // SAFETY: the handle is idle, so no thread uses it, and it is closed once.
                unsafe { (lib.close)(handle.0) };
            }
        }
    }
}
