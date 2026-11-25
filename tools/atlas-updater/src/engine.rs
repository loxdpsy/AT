// The offline engine: runs atlas-engine (tools/atlas-engine) and translates texts through it.
//
// Each language pair runs in its own atlas-engine process. A process starts the first time its pair is needed and is
// kept for later requests. At most MAX_RUNNING are kept. A process that fails or does not answer in time is stopped,
// and the next request starts it again.
//
// The protocol is one line per text, in base64, both ways (see atlas-engine.cpp).

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use crate::json;
use crate::sha256;
use crate::store;

const MAX_RUNNING: usize = 2;
const READY_TIMEOUT: Duration = Duration::from_secs(120);
const REPLY_TIMEOUT: Duration = Duration::from_secs(60);
const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn base64_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let v = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[((v >> 18) & 63) as usize] as char);
        out.push(ALPHABET[((v >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { ALPHABET[((v >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[(v & 63) as usize] as char } else { '=' });
    }
    out
}

/// None when the input has a character that is not base64.
pub fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    let mut buffer: u32 = 0;
    let mut bits: u32 = 0;
    for c in input.bytes() {
        if c == b'=' {
            break;
        }
        if c == b'\r' || c == b'\n' || c == b' ' {
            continue;
        }
        let value = ALPHABET.iter().position(|&a| a == c)? as u32;
        buffer = (buffer << 6) | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buffer >> bits) & 0xFF) as u8);
        }
    }
    Some(out)
}

/// The name of the engine program for this computer in a GitHub release. None when there is no engine for it.
pub fn engine_asset_name() -> Option<&'static str> {
    if cfg!(windows) {
        Some("atlas-engine-windows.exe")
    } else if cfg!(target_os = "macos") {
        Some("atlas-engine-macos")
    } else if cfg!(target_os = "linux") {
        Some("atlas-engine-linux")
    } else {
        None
    }
}

/// Downloads the engine for this computer from the latest release, checks it against the SHA-256 that GitHub gives for
/// the file, and installs it in the helper's data folder. Returns the release version.
pub fn install_from_latest_release() -> Result<String, String> {
    let asset = engine_asset_name().ok_or("there is no offline engine for this computer")?;
    let body = super::curl_text(super::LATEST_RELEASE_API)?;
    let release = json::parse(&body).map_err(|e| format!("GitHub sent an unexpected answer: {}", e))?;
    let tag = release.get("tag_name").and_then(|v| v.as_str()).ok_or("the latest release has no tag_name")?;
    let version = tag.trim_start_matches(|c: char| c == 'v' || c == 'V').to_string();
    let assets = release.get("assets").and_then(|v| v.as_array()).ok_or("the latest release has no assets")?;
    let found = assets
        .iter()
        .find(|a| a.get("name").and_then(|v| v.as_str()) == Some(asset))
        .ok_or_else(|| format!("release {} has no {} yet. Try again after the next release.", version, asset))?;
    let url = found
        .get("browser_download_url")
        .and_then(|v| v.as_str())
        .ok_or("the offline engine has no download link")?
        .to_string();
    let digest = found
        .get("digest")
        .and_then(|v| v.as_str())
        .ok_or("GitHub gives no SHA-256 for the offline engine, so it will not be installed")?;
    let expected = digest
        .strip_prefix("sha256:")
        .ok_or("the offline engine checksum is not SHA-256, so it will not be installed")?
        .to_lowercase();

    let folder = store::data_dir().join("engine");
    fs::create_dir_all(&folder).map_err(|e| format!("cannot create {}: {}", folder.display(), e))?;
    let partial = folder.join(format!("{}.part", store::engine_file_name()));
    if let Err(e) = super::download(&url, &partial) {
        let _ = fs::remove_file(&partial);
        return Err(format!("the offline engine could not be downloaded: {}", e));
    }
    let bytes = fs::read(&partial).map_err(|e| format!("cannot read {}: {}", partial.display(), e))?;
    if sha256::hex(&bytes) != expected {
        let _ = fs::remove_file(&partial);
        return Err("the SHA-256 check of the offline engine failed. Nothing was installed.".to_string());
    }
    let target = store::installed_engine();
    let _ = fs::remove_file(&target);
    fs::rename(&partial, &target).map_err(|e| format!("cannot save {}: {}", target.display(), e))?;
    make_executable(&target)?;
    Ok(version)
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o755))
        .map_err(|e| format!("cannot make the engine runnable: {}", e))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// The engine program: the copy the helper installed, or one next to the helper program.
pub fn find_binary() -> Option<PathBuf> {
    let installed = store::installed_engine();
    if installed.is_file() {
        return Some(installed);
    }
    let beside = std::env::current_exe().ok()?.parent()?.join(store::engine_file_name());
    if beside.is_file() {
        return Some(beside);
    }
    None
}

struct Running {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<Result<String, String>>,
}

pub struct Engine {
    running: Mutex<HashMap<String, Running>>,
}

impl Engine {
    pub fn new() -> Engine {
        Engine { running: Mutex::new(HashMap::new()) }
    }

    /// Translates the texts with the pack of one language pair. Returns one translation per text, in order.
    pub fn translate(&self, binary: &Path, pack_dir: &Path, pair: &str, texts: &[String]) -> Result<Vec<String>, String> {
        let mut running = self.running.lock().map_err(|_| "the offline engine lock is broken".to_string())?;
        if !running.contains_key(pair) {
            if running.len() >= MAX_RUNNING {
                let oldest = running.keys().next().cloned();
                if let Some(name) = oldest {
                    if let Some(mut stopped) = running.remove(&name) {
                        stop(&mut stopped);
                    }
                }
            }
            let started = start(binary, pack_dir)?;
            running.insert(pair.to_string(), started);
        }
        let outcome = match running.get_mut(pair) {
            Some(process) => exchange(process, texts),
            None => Err("the offline engine did not start".to_string()),
        };
        if outcome.is_err() {
            if let Some(mut broken) = running.remove(pair) {
                stop(&mut broken);
            }
        }
        outcome
    }

    /// Stops every running engine process (called when the helper stops).
    pub fn stop_all(&self) {
        if let Ok(mut running) = self.running.lock() {
            for (_, mut process) in running.drain() {
                stop(&mut process);
            }
        }
    }
}

fn start(binary: &Path, pack_dir: &Path) -> Result<Running, String> {
    let mut child = Command::new(binary)
        .arg(pack_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("cannot start the offline engine ({}): {}", binary.display(), e))?;
    let stdin = child.stdin.take().ok_or("the offline engine has no input")?;
    let stdout = child.stdout.take().ok_or("the offline engine has no output")?;
    let (sender, lines) = mpsc::channel();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(text) => {
                    if sender.send(Ok(text)).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    let _ = sender.send(Err(e.to_string()));
                    break;
                }
            }
        }
        // The end of the output closes the channel, which the reader sees as "stopped".
    });
    let mut running = Running { child, stdin, lines };
    match running.lines.recv_timeout(READY_TIMEOUT) {
        Ok(Ok(line)) if line == "ready" => Ok(running),
        Ok(Ok(line)) => {
            stop(&mut running);
            Err(format!("the offline engine did not start: {}", line))
        }
        Ok(Err(e)) => {
            stop(&mut running);
            Err(format!("the offline engine did not start: {}", e))
        }
        Err(_) => {
            stop(&mut running);
            Err("the offline engine did not say it was ready in time".to_string())
        }
    }
}

fn exchange(process: &mut Running, texts: &[String]) -> Result<Vec<String>, String> {
    let mut out = Vec::with_capacity(texts.len());
    for text in texts {
        writeln!(process.stdin, "{}", base64_encode(text.as_bytes()))
            .and_then(|_| process.stdin.flush())
            .map_err(|e| format!("the offline engine stopped: {}", e))?;
        match process.lines.recv_timeout(REPLY_TIMEOUT) {
            Ok(Ok(line)) => {
                let bytes = base64_decode(&line).ok_or("the offline engine sent a bad reply")?;
                let translated = String::from_utf8(bytes).map_err(|_| "the offline engine sent text that is not UTF-8".to_string())?;
                out.push(translated);
            }
            Ok(Err(e)) => return Err(format!("the offline engine stopped: {}", e)),
            Err(RecvTimeoutError::Timeout) => return Err("the offline engine took too long to answer".to_string()),
            Err(RecvTimeoutError::Disconnected) => return Err("the offline engine stopped".to_string()),
        }
    }
    Ok(out)
}

fn stop(running: &mut Running) {
    let _ = running.child.kill();
    let _ = running.child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard_examples() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn base64_round_trips_any_text() {
        for text in ["", "Hello, world", "Bonjour\nle monde", "Čeština: žluťoučký kůň", "emoji 🙂 and tabs\t"] {
            let encoded = base64_encode(text.as_bytes());
            assert_eq!(base64_decode(&encoded).unwrap(), text.as_bytes());
        }
    }

    #[test]
    fn every_platform_has_an_engine_name_in_the_release() {
        let name = engine_asset_name().expect("a name for this computer");
        assert!(name.starts_with("atlas-engine-"));
    }

    #[test]
    fn base64_refuses_characters_outside_the_alphabet() {
        assert!(base64_decode("Zm9v!").is_none());
    }

    #[cfg(unix)]
    #[test]
    fn an_engine_that_is_not_there_is_an_error_not_a_hang() {
        let engine = Engine::new();
        let result = engine.translate(Path::new("/nonexistent/atlas-engine"), Path::new("/tmp"), "enfr", &["hi".to_string()]);
        assert!(result.is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_fake_engine_is_talked_to_line_by_line() {
        // A shell script that says "ready", then answers each line with the same line, in upper case.
        let dir = std::env::temp_dir().join(format!("atlas-engine-fake-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("fake-engine.sh");
        std::fs::write(&script, "#!/bin/sh\necho ready\nwhile IFS= read -r line; do echo \"$line\"; done\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();

        let engine = Engine::new();
        let texts = vec!["Hello".to_string(), "two\nlines".to_string(), String::new()];
        let out = engine.translate(&script, &dir, "enfr", &texts).expect("the fake engine answers");
        assert_eq!(out, texts);
        engine.stop_all();
        let _ = std::fs::remove_dir_all(&dir);
    }
}
