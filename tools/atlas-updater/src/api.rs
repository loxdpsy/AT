// The offline translation service for the browser extension.
//
// The helper listens on 127.0.0.1:47632 only, a fixed port the extension knows. It answers:
//   GET  /api/offline/ping                  what is installed (no secret)
//   POST /api/offline/translate              {"pairing": "<code>", "pair": "enfr", "texts": ["..."]}
//
// Only extension pages may call it: the Origin must be chrome-extension:// or moz-extension://, and the Host must be
// this computer. Translation also needs the pairing code, which the helper window shows. A web page cannot read the
// answers either, because no Access-Control-Allow-Origin header is sent for any other origin.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;

use crate::engine::{self, Engine};
use crate::json;
use crate::packs;
use crate::store;

pub const PORT: u16 = 47632;
/// The most a request body may be. A page is translated in batches, so this is generous.
const MAX_BODY: usize = 4 * 1024 * 1024;
/// The most texts in one request.
const MAX_TEXTS: usize = 500;

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

/// Starts the service in the background. Fails when the port is in use.
pub fn serve(engine: Arc<Engine>, pairing: String) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", PORT)).map_err(|e| {
        format!(
            "the offline translation port {} is in use ({}). Close the other program that uses it, then start the helper again.",
            PORT, e
        )
    })?;
    thread::spawn(move || {
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                let engine = Arc::clone(&engine);
                let pairing = pairing.clone();
                thread::spawn(move || handle(&mut stream, &engine, &pairing));
            }
        }
    });
    Ok(())
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
        let mut header = String::new();
        let n = reader.read_line(&mut header).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }
        if let Some((k, v)) = header.split_once(':') {
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

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        502 => "Bad Gateway",
        _ => "Internal Server Error",
    }
}

fn send(stream: &mut TcpStream, status: u16, origin: Option<&str>, body: &str) {
    let mut head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n",
        status,
        reason(status),
        body.len()
    );
    if let Some(origin) = origin {
        head.push_str(&format!(
            "Access-Control-Allow-Origin: {}\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nVary: Origin\r\n",
            origin
        ));
    }
    head.push_str("\r\n");
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body.as_bytes());
}

fn error_body(message: &str) -> String {
    format!("{{\"ok\":false,\"message\":{}}}", json::quote(message))
}

/// The extension origins are the only pages that may use the service.
fn is_extension_origin(origin: &str) -> bool {
    origin.starts_with("chrome-extension://") || origin.starts_with("moz-extension://")
}

fn handle(stream: &mut TcpStream, engine: &Engine, pairing: &str) {
    let request = match read_request(stream) {
        Ok(r) => r,
        Err(message) => return send(stream, 400, None, &error_body(&message)),
    };
    let host_ok = request
        .header("host")
        .map_or(false, |h| h == format!("127.0.0.1:{}", PORT) || h == format!("localhost:{}", PORT));
    if !host_ok {
        return send(stream, 403, None, &error_body("forbidden"));
    }
    let origin = request.header("origin").map(str::to_string);
    if let Some(o) = &origin {
        if !is_extension_origin(o) {
            return send(stream, 403, None, &error_body("only the Atlas Translation extension may use this service"));
        }
    }
    let allow = origin.as_deref();
    match (request.method.as_str(), request.path.as_str()) {
        ("OPTIONS", _) => send(stream, 204, allow, ""),
        ("GET", "/api/offline/ping") => {
            let body = ping_body();
            send(stream, 200, allow, &body)
        }
        ("POST", "/api/offline/translate") => {
            let (status, body) = translate_request(&request.body, engine, pairing);
            send(stream, status, allow, &body)
        }
        _ => send(stream, 404, allow, &error_body("not found")),
    }
}

fn ping_body() -> String {
    let installed: Vec<String> = match packs::catalogue() {
        Ok(cat) => cat
            .packs
            .iter()
            .filter(|p| packs::is_installed_in(&store::packs_dir(), p))
            .map(|p| json::quote(&p.pair))
            .collect(),
        Err(_) => Vec::new(),
    };
    format!(
        "{{\"ok\":true,\"name\":\"Atlas Translation helper\",\"version\":{},\"engine\":{},\"packs\":[{}]}}",
        json::quote(env!("CARGO_PKG_VERSION")),
        engine::find_binary().is_some(),
        installed.join(",")
    )
}

/// Returns the HTTP status and the JSON body for a translate request.
fn translate_request(body: &str, engine: &Engine, pairing: &str) -> (u16, String) {
    let value = match json::parse(body) {
        Ok(v) => v,
        Err(_) => return (400, error_body("the request is not valid JSON")),
    };
    let code = value.get("pairing").and_then(|v| v.as_str()).unwrap_or("");
    if code != pairing {
        return (403, error_body("the pairing code is wrong. Copy it again from the helper window."));
    }
    let pair = value.get("pair").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let texts: Vec<String> = match value.get("texts").and_then(|v| v.as_array()) {
        Some(items) => {
            if items.len() > MAX_TEXTS {
                return (400, error_body("too many texts in one request"));
            }
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                match item.as_str() {
                    Some(s) => out.push(s.to_string()),
                    None => return (400, error_body("every text must be a string")),
                }
            }
            out
        }
        None => return (400, error_body("texts must be a list")),
    };
    let catalogue = match packs::catalogue() {
        Ok(c) => c,
        Err(e) => return (500, error_body(&e)),
    };
    let pack = match packs::find(&catalogue, &pair) {
        Some(p) => p,
        None => return (400, error_body("this language pair is not available offline")),
    };
    if !packs::is_installed_in(&store::packs_dir(), pack) {
        return (409, error_body(&format!("the {} language pack is not installed in the helper", pair)));
    }
    let binary = match engine::find_binary() {
        Some(b) => b,
        None => return (409, error_body("the offline engine is not installed in the helper")),
    };
    if texts.is_empty() {
        return (200, "{\"ok\":true,\"translations\":[]}".to_string());
    }
    match engine.translate(&binary, &store::packs_dir().join(&pair), &pair, &texts) {
        Ok(translations) => {
            let quoted: Vec<String> = translations.iter().map(|t| json::quote(t)).collect();
            (200, format!("{{\"ok\":true,\"translations\":[{}]}}", quoted.join(",")))
        }
        Err(e) => (502, error_body(&e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_extension_origins_are_allowed() {
        assert!(is_extension_origin("chrome-extension://abcdefghijklmnop"));
        assert!(is_extension_origin("moz-extension://1234-5678"));
        assert!(!is_extension_origin("https://example.com"));
        assert!(!is_extension_origin("null"));
    }

    #[test]
    fn a_wrong_pairing_code_is_refused_before_anything_else() {
        let engine = Engine::new();
        let (status, body) = translate_request(r#"{"pairing":"wrong","pair":"enfr","texts":["hi"]}"#, &engine, "right");
        assert_eq!(status, 403);
        assert!(body.contains("pairing code"));
    }

    #[test]
    fn a_request_must_be_well_formed() {
        let engine = Engine::new();
        assert_eq!(translate_request("not json", &engine, "x").0, 400);
        assert_eq!(translate_request(r#"{"pairing":"x","pair":"enfr"}"#, &engine, "x").0, 400);
        assert_eq!(translate_request(r#"{"pairing":"x","pair":"enfr","texts":[1]}"#, &engine, "x").0, 400);
    }

    #[test]
    fn a_pair_that_is_not_in_the_catalogue_is_refused() {
        let engine = Engine::new();
        let (status, _) = translate_request(r#"{"pairing":"x","pair":"../etc","texts":["hi"]}"#, &engine, "x");
        assert_eq!(status, 400);
    }

    #[test]
    fn the_port_is_fixed() {
        assert_eq!(PORT, 47632);
    }
}
