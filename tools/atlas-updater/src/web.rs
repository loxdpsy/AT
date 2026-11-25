// The helper window: a small web page served on this computer only (127.0.0.1), opened in the default browser.
//
// It needs no extra libraries. Every action is a POST to /api/... that carries a random token. The token is in the
// address the helper prints (the ?t= part), so only the window the helper opened can use the actions. The server
// also refuses requests whose Host header is not this computer's address, which stops web pages from using it.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::thread;

use crate::api;
use crate::browsers::{self, Kind, BROWSERS, FIREFOX_STORE_URL};
use crate::engine::{self, Engine};
use crate::json;
use crate::packs;
use crate::store;

/// What the window's handlers need: the tokens, the offline service's state, and the engine.
pub struct Ctx {
    pub token: String,
    pub pairing: String,
    /// Why the offline translation service is not running (for example, the port is in use). None when it runs.
    pub api_error: Option<String>,
    pub engine: Arc<Engine>,
}

const PAGE: &str = include_str!("web/ui.html");
const SCRIPT: &str = include_str!("web/app.js");
const STYLE: &str = include_str!("web/app.css");
const ICON: &[u8] = include_bytes!("../../../icons/icon-128.png");
/// Archivo, the face of the Mister Download Manager website. SIL Open Font License, see web/fonts/OFL.txt.
const FONT: &[u8] = include_bytes!("web/fonts/archivo-latin.woff2");

/// The most a request body may be. The window sends a few hundred bytes.
const MAX_BODY: usize = 16 * 1024;

const SECURITY_HEADERS: &str = "Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nCache-Control: no-store\r\n";

/// Starts the window. When `open_window` is true, the address is opened in the default browser. The offline translation
/// service starts with it, on its fixed port (see api.rs).
pub fn serve(open_window: bool) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("cannot start the helper window: {}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let token = store::new_token();
    let pairing = store::pairing_code()?;
    let engine = Arc::new(Engine::new());
    let api_error = api::serve(Arc::clone(&engine), pairing.clone()).err();
    match &api_error {
        None => println!("Offline translation: the service runs on 127.0.0.1:{}.", api::PORT),
        Some(e) => println!("Offline translation is not available: {}", e),
    }
    let url = format!("http://127.0.0.1:{}/?t={}", port, token);
    println!("Atlas Translation helper is running.");
    println!("If no window opens, copy this address into your browser:");
    println!("{}", url);
    println!("Close this window to stop the helper.");
    if open_window && !open_url(&url) {
        println!("The browser could not be opened. Copy the address above into your browser.");
    }
    let ctx = Arc::new(Ctx { token, pairing, api_error, engine });
    serve_listener(listener, ctx)
}

/// Accepts connections forever. Each request is handled on its own thread.
pub fn serve_listener(listener: TcpListener, ctx: Arc<Ctx>) -> Result<(), String> {
    for stream in listener.incoming() {
        if let Ok(mut stream) = stream {
            let ctx = Arc::clone(&ctx);
            let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
            thread::spawn(move || handle(&mut stream, port, &ctx));
        }
    }
    Ok(())
}

struct Request {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: String,
}

impl Request {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }
}

fn read_request(stream: &mut TcpStream) -> Result<Request, String> {
    let clone = stream.try_clone().map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(clone);
    let mut line = String::new();
    reader.read_line(&mut line).map_err(|e| e.to_string())?;
    let mut parts = line.trim_end().split(' ');
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("");
    let path = target.split('?').next().unwrap_or("").to_string();

    let mut headers: Vec<(String, String)> = Vec::new();
    let mut content_length = 0usize;
    loop {
        let mut h = String::new();
        let n = reader.read_line(&mut h).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        let h = h.trim_end();
        if h.is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            let key = k.trim().to_ascii_lowercase();
            let value = v.trim().to_string();
            if key == "content-length" {
                content_length = value.parse().unwrap_or(0);
            }
            headers.push((key, value));
        }
    }
    if content_length > MAX_BODY {
        return Err("the request is too large".to_string());
    }
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).map_err(|e| e.to_string())?;
    Ok(Request { method, path, headers, body: String::from_utf8_lossy(&body).to_string() })
}

fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let head = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n{}Connection: close\r\n\r\n",
        status,
        content_type,
        body.len(),
        SECURITY_HEADERS
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body);
}

fn respond_json(stream: &mut TcpStream, status: &str, body: &str) {
    respond(stream, status, "application/json; charset=utf-8", body.as_bytes());
}

fn handle(stream: &mut TcpStream, port: u16, ctx: &Ctx) {
    let request = match read_request(stream) {
        Ok(r) => r,
        Err(_) => return respond(stream, "400 Bad Request", "text/plain; charset=utf-8", b"Bad request."),
    };
    let host_ok = request
        .header("host")
        .map_or(false, |h| h == format!("127.0.0.1:{}", port) || h == format!("localhost:{}", port));
    if !host_ok {
        return respond(stream, "403 Forbidden", "text/plain; charset=utf-8", b"Forbidden.");
    }
    let path = request.path.as_str();
    match (request.method.as_str(), path) {
        ("GET", "/") => respond(stream, "200 OK", "text/html; charset=utf-8", PAGE.as_bytes()),
        ("GET", "/app.js") => respond(stream, "200 OK", "text/javascript; charset=utf-8", SCRIPT.as_bytes()),
        ("GET", "/app.css") => respond(stream, "200 OK", "text/css; charset=utf-8", STYLE.as_bytes()),
        ("GET", "/icon.png") => respond(stream, "200 OK", "image/png", ICON),
        ("GET", "/fonts/archivo-latin.woff2") => respond(stream, "200 OK", "font/woff2", FONT),
        ("POST", "/api/status")
        | ("POST", "/api/install")
        | ("POST", "/api/browser")
        | ("POST", "/api/open")
        | ("POST", "/api/packs")
        | ("POST", "/api/packs/install")
        | ("POST", "/api/packs/remove")
        | ("POST", "/api/engine/install") => {
            if request.header("x-atlas-token") != Some(ctx.token.as_str()) {
                return respond_json(
                    stream,
                    "403 Forbidden",
                    &result(false, "Open the helper window again, from the address the helper printed."),
                );
            }
            let body = match json::parse(&request.body) {
                Ok(v) => v,
                Err(_) => return respond_json(stream, "400 Bad Request", &result(false, "The request is not valid JSON.")),
            };
            let answer = match path {
                "/api/status" => status(&body),
                "/api/install" => install_route(&body),
                "/api/browser" => browser_route(&body),
                "/api/packs" => packs_status(ctx),
                "/api/packs/install" => packs_install(&body),
                "/api/packs/remove" => packs_remove(&body),
                "/api/engine/install" => engine_install(),
                _ => open_route(&body),
            };
            respond_json(stream, "200 OK", &answer);
        }
        _ => respond(stream, "404 Not Found", "text/plain; charset=utf-8", b"Not found."),
    }
}

fn result(ok: bool, message: &str) -> String {
    format!("{{\"ok\":{},\"message\":{}}}", ok, json::quote(message))
}

/// A JSON value for an optional string: the string, or null.
fn opt(value: Option<String>) -> String {
    match value {
        Some(s) => json::quote(&s),
        None => "null".to_string(),
    }
}

fn folder_of(body: &json::Value) -> String {
    body.get("folder").and_then(|v| v.as_str()).unwrap_or("").trim().to_string()
}

/// True when the folder is missing or empty, so a fresh copy can be unpacked into it.
fn is_fresh_folder(path: &Path) -> bool {
    match std::fs::read_dir(path) {
        Ok(mut entries) => entries.next().is_none(),
        Err(_) => !path.exists(),
    }
}

/// Documents/Atlas Translation in the user's home folder. The window suggests it, and the user can change it.
fn default_folder() -> String {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join("Documents").join("Atlas Translation").display().to_string()
}

fn status(body: &json::Value) -> String {
    let mut folder = folder_of(body);
    if folder.is_empty() {
        folder = default_folder();
    }
    let (latest, latest_error) = match super::fetch_latest_release() {
        Ok(release) => (Some(release.version), None),
        Err(e) => (None, Some(e)),
    };
    let fresh = is_fresh_folder(Path::new(&folder));
    let (installed, installed_error) = if fresh {
        (None, None)
    } else {
        match super::read_installed_version(Path::new(&folder)) {
            Ok(version) => (Some(version), None),
            Err(e) => (None, Some(e)),
        }
    };
    let update = match (&latest, &installed) {
        (Some(l), Some(i)) => Some(super::is_newer(l, i)),
        _ => None,
    };
    let browsers: Vec<String> = BROWSERS
        .iter()
        .map(|b| {
            format!(
                "{{\"id\":{},\"name\":{},\"firefox\":{}}}",
                json::quote(b.id),
                json::quote(b.name),
                b.kind == Kind::Firefox
            )
        })
        .collect();
    format!(
        "{{\"helperVersion\":{},\"defaultFolder\":{},\"folder\":{},\"fresh\":{},\"latest\":{},\"latestError\":{},\"installed\":{},\"installedError\":{},\"updateAvailable\":{},\"browsers\":[{}]}}",
        json::quote(&crate::app_version()),
        json::quote(&default_folder()),
        json::quote(&folder),
        fresh,
        opt(latest),
        opt(latest_error),
        opt(installed),
        opt(installed_error),
        match update {
            Some(v) => v.to_string(),
            None => "null".to_string(),
        },
        browsers.join(",")
    )
}

fn install_route(body: &json::Value) -> String {
    let folder = folder_of(body);
    if folder.is_empty() {
        return result(false, "Choose a folder first.");
    }
    let path = PathBuf::from(&folder);
    let fresh = is_fresh_folder(&path);
    let installed = if fresh {
        None
    } else {
        match super::read_installed_version(&path) {
            Ok(v) => Some(v),
            Err(e) => return result(false, &e),
        }
    };
    let release = match super::fetch_latest_release() {
        Ok(r) => r,
        Err(e) => return result(false, &e),
    };
    if let Some(v) = &installed {
        if !super::is_newer(&release.version, v) {
            return result(true, &format!("You already have the latest version ({}).", v));
        }
    }
    if fresh {
        if let Err(e) = std::fs::create_dir_all(&path) {
            return result(false, &format!("cannot create the folder: {}", e));
        }
    }
    match super::install(&path, &release) {
        Ok(()) => result(
            true,
            &format!("Installed version {} in {}. Next, reload Atlas Translation in your browser.", release.version, folder),
        ),
        Err(e) => result(false, &e),
    }
}

fn browser_route(body: &json::Value) -> String {
    let id = body.get("browser").and_then(|v| v.as_str()).unwrap_or("");
    let folder = folder_of(body);
    let browser = match BROWSERS.iter().find(|b| b.id == id) {
        Some(b) => b,
        None => return result(false, "Choose a browser from the list."),
    };
    let guide = browsers::guide(browser, &folder);
    let steps: Vec<String> = guide.steps.iter().map(|s| json::quote(s)).collect();
    format!(
        "{{\"ok\":true,\"name\":{},\"steps\":[{}],\"link\":{},\"needsFolder\":{}}}",
        json::quote(&guide.name),
        steps.join(","),
        opt(guide.link.clone()),
        guide.needs_folder
    )
}

fn open_route(body: &json::Value) -> String {
    match body.get("target").and_then(|v| v.as_str()).unwrap_or("") {
        "store" => {
            if open_url(FIREFOX_STORE_URL) {
                result(true, "Opened the Firefox Add-ons page in your default browser.")
            } else {
                result(false, "Could not open the page. Use the copy button instead.")
            }
        }
        "folder" => {
            let folder = folder_of(body);
            if folder.is_empty() {
                return result(false, "Choose a folder first.");
            }
            // Only an Atlas Translation folder is opened, so the window cannot open arbitrary paths.
            if let Err(e) = super::read_installed_version(Path::new(&folder)) {
                return result(false, &e);
            }
            if open_url(&folder) {
                result(true, "Opened the folder.")
            } else {
                result(false, "Could not open the folder.")
            }
        }
        _ => result(false, "Unknown action."),
    }
}

/// The language packs and the offline engine, for the window's Offline section.
fn packs_status(ctx: &Ctx) -> String {
    let catalogue = match packs::catalogue() {
        Ok(c) => c,
        Err(e) => return result(false, &e),
    };
    let root = store::packs_dir();
    let items: Vec<String> = catalogue
        .packs
        .iter()
        .map(|p| {
            format!(
                "{{\"pair\":{},\"from\":{},\"to\":{},\"bytes\":{},\"installed\":{}}}",
                json::quote(&p.pair),
                json::quote(&p.from),
                json::quote(&p.to),
                p.bytes,
                packs::is_installed_in(&root, p)
            )
        })
        .collect();
    format!(
        "{{\"ok\":true,\"commit\":{},\"packs\":[{}],\"engine\":{},\"pairing\":{},\"port\":{},\"apiRunning\":{},\"apiError\":{},\"dataFolder\":{},\"engineAsset\":{}}}",
        json::quote(&catalogue.commit),
        items.join(","),
        engine::find_binary().is_some(),
        json::quote(&ctx.pairing),
        api::PORT,
        ctx.api_error.is_none(),
        opt(ctx.api_error.clone()),
        json::quote(&store::data_dir().display().to_string()),
        opt(engine::engine_asset_name().map(str::to_string))
    )
}

fn pair_of(body: &json::Value) -> String {
    body.get("pair").and_then(|v| v.as_str()).unwrap_or("").trim().to_string()
}

fn packs_install(body: &json::Value) -> String {
    let pair = pair_of(body);
    let catalogue = match packs::catalogue() {
        Ok(c) => c,
        Err(e) => return result(false, &e),
    };
    let pack = match packs::find(&catalogue, &pair) {
        Some(p) => p,
        None => return result(false, "Choose a language pair from the list."),
    };
    match packs::install_into(&store::packs_dir(), pack, &catalogue.commit) {
        Ok(()) => result(true, &format!("Installed {} to {} ({} MB).", pack.from, pack.to, pack.bytes / 1_000_000)),
        Err(e) => result(false, &e),
    }
}

fn packs_remove(body: &json::Value) -> String {
    let pair = pair_of(body);
    let catalogue = match packs::catalogue() {
        Ok(c) => c,
        Err(e) => return result(false, &e),
    };
    match packs::remove_from(&store::packs_dir(), &catalogue, &pair) {
        Ok(()) => result(true, "Removed the language pack."),
        Err(e) => result(false, &e),
    }
}

fn engine_install() -> String {
    match engine::install_from_latest_release() {
        Ok(version) => result(true, &format!("Installed the offline engine ({}).", version)),
        Err(e) => result(false, &e),
    }
}

/// Opens a web address or a folder with the system's default program. Returns false when that fails.
fn open_url(target: &str) -> bool {
    let outcome = if cfg!(windows) {
        Command::new("cmd").args(["/C", "start", "", target]).status()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(target).status()
    } else {
        Command::new("xdg-open").arg(target).status()
    };
    matches!(outcome, Ok(s) if s.success())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start() -> u16 {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let ctx = Arc::new(Ctx {
            token: "test-token".to_string(),
            pairing: "pairing-test".to_string(),
            api_error: None,
            engine: Arc::new(Engine::new()),
        });
        thread::spawn(move || {
            let _ = serve_listener(listener, ctx);
        });
        port
    }

    fn send(port: u16, raw: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(raw.as_bytes()).unwrap();
        let mut out = String::new();
        stream.read_to_string(&mut out).unwrap();
        out
    }

    #[test]
    fn the_page_is_served_with_a_content_security_policy() {
        let port = start();
        let answer = send(port, &format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n\r\n", port));
        assert!(answer.starts_with("HTTP/1.1 200 OK"), "{}", answer);
        assert!(answer.contains("Content-Security-Policy"));
        assert!(answer.contains("Atlas Translation"));
    }

    #[test]
    fn actions_need_the_token() {
        let port = start();
        let answer = send(
            port,
            &format!("POST /api/status HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nContent-Length: 2\r\n\r\n{{}}", port),
        );
        assert!(answer.starts_with("HTTP/1.1 403"), "{}", answer);
    }

    #[test]
    fn a_wrong_token_is_refused() {
        let port = start();
        let answer = send(
            port,
            &format!(
                "POST /api/status HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nX-Atlas-Token: nope\r\nContent-Length: 2\r\n\r\n{{}}",
                port
            ),
        );
        assert!(answer.starts_with("HTTP/1.1 403"), "{}", answer);
    }

    #[test]
    fn other_host_names_are_refused() {
        let port = start();
        let answer = send(port, &format!("GET / HTTP/1.1\r\nHost: evil.example:{}\r\n\r\n", port));
        assert!(answer.starts_with("HTTP/1.1 403"), "{}", answer);
    }

    #[test]
    fn unknown_paths_are_not_found() {
        let port = start();
        let answer = send(port, &format!("GET /secret HTTP/1.1\r\nHost: 127.0.0.1:{}\r\n\r\n", port));
        assert!(answer.starts_with("HTTP/1.1 404"), "{}", answer);
    }

    #[test]
    fn tokens_are_long_and_differ() {
        let a = store::new_token();
        let b = store::new_token();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
    }
}
