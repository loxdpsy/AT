// Bindings: the browser extensions that the user has allowed to use the offline translation service.
//
// The extension asks to bind (POST /api/offline/bind). The helper window shows the request, and the user decides.
// When the user allows it, the helper makes a random token and gives it to the extension once. The helper keeps
// only a SHA-256 hash of the token, in bindings.json in the helper's data folder. Each translate request must carry
// the token in an Authorization: Bearer header, and a binding can be removed in the helper window at any time.

use std::fs;
use std::path::PathBuf;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use crate::{json, sha256, store};

const FILE_NAME: &str = "bindings.json";

/// One allowed extension: a name for the list (for example "Chrome-based browser") and the hash of its token.
#[derive(Clone, Debug, PartialEq)]
pub struct Binding {
    pub name: String,
    pub hash: String,
}

/// The helper's list of bindings. The API thread and the window share it through `Shared`.
pub struct Bindings {
    path: Option<PathBuf>,
    pub items: Vec<Binding>,
}

pub type Shared = Arc<Mutex<Bindings>>;

/// A bind request from an extension, waiting for the user's answer in the window. The window sends the token back
/// through `reply` (Some) when the user allows it, or None when the user refuses.
pub struct BindRequest {
    pub name: String,
    pub origin: String,
    pub reply: Sender<Option<String>>,
}

/// The file that holds the bindings: data_dir()/bindings.json.
fn file_path() -> PathBuf {
    store::data_dir().join(FILE_NAME)
}

/// The bindings saved on disk. A missing or damaged file means no bindings (the user binds again).
pub fn load() -> Bindings {
    let path = file_path();
    let mut items = Vec::new();
    if let Ok(text) = fs::read_to_string(&path) {
        if let Ok(value) = json::parse(&text) {
            if let Some(list) = value.get("bindings").and_then(|v| v.as_array()) {
                for item in list {
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let hash = item.get("hash").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                        items.push(Binding { name, hash });
                    }
                }
            }
        }
    }
    Bindings { path: Some(path), items }
}

/// The shared copy, for the API thread and the window.
pub fn shared() -> Shared {
    Arc::new(Mutex::new(load()))
}

impl Bindings {
    /// A list that is not saved to disk. Used by the tests.
    pub fn in_memory() -> Self {
        Bindings { path: None, items: Vec::new() }
    }

    /// Saves the list. Only the names and the hashes are written.
    pub fn save(&self) -> Result<(), String> {
        let path = match &self.path {
            Some(p) => p.clone(),
            None => return Ok(()),
        };
        if let Some(folder) = path.parent() {
            fs::create_dir_all(folder).map_err(|e| format!("cannot create {}: {}", folder.display(), e))?;
        }
        let items: Vec<String> = self
            .items
            .iter()
            .map(|b| format!("{{\"name\":{},\"hash\":{}}}", json::quote(&b.name), json::quote(&b.hash)))
            .collect();
        let text = format!("{{\"bindings\":[{}]}}\n", items.join(","));
        fs::write(&path, text).map_err(|e| format!("cannot save {}: {}", path.display(), e))
    }

    /// Makes a new token for `name`, stores its hash, and returns the token. The token is shown to the extension once.
    pub fn add(&mut self, name: &str) -> Result<String, String> {
        let token = store::new_token();
        self.items.push(Binding { name: name.to_string(), hash: hash_token(&token) });
        self.save()?;
        Ok(token)
    }

    /// Removes the binding at `index`. The extension with that token is refused from then on.
    pub fn remove(&mut self, index: usize) -> Result<(), String> {
        if index < self.items.len() {
            self.items.remove(index);
            self.save()?;
        }
        Ok(())
    }

    /// Removes the binding that belongs to `token`, so that extension is refused from then on. The extension calls
    /// this when the user unbinds it. Returns false when no binding has that token.
    pub fn remove_token(&mut self, token: &str) -> bool {
        let wanted = hash_token(token);
        match self.items.iter().position(|b| b.hash == wanted) {
            Some(index) => {
                self.items.remove(index);
                let _ = self.save();
                true
            }
            None => false,
        }
    }

    /// True when the token belongs to one of the bindings.
    pub fn verify(&self, token: &str) -> bool {
        if token.is_empty() {
            return false;
        }
        let wanted = hash_token(token);
        self.items.iter().any(|b| constant_time_eq(b.hash.as_bytes(), wanted.as_bytes()))
    }
}

/// The hash the helper keeps for a token.
pub fn hash_token(token: &str) -> String {
    sha256::hex(token.as_bytes())
}

/// Compares two byte strings without stopping at the first difference.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty() -> Bindings {
        Bindings { path: None, items: Vec::new() }
    }

    #[test]
    fn a_token_is_stored_only_as_a_hash() {
        let mut b = empty();
        let token = b.add("Chrome").unwrap();
        assert_eq!(b.items.len(), 1);
        assert_ne!(b.items[0].hash, token);
        assert_eq!(b.items[0].hash, hash_token(&token));
        assert!(b.verify(&token));
    }

    #[test]
    fn a_wrong_or_empty_token_is_refused() {
        let mut b = empty();
        let _ = b.add("Firefox").unwrap();
        assert!(!b.verify("wrong"));
        assert!(!b.verify(""));
    }

    #[test]
    fn a_removed_binding_is_refused() {
        let mut b = empty();
        let token = b.add("Edge").unwrap();
        b.remove(0).unwrap();
        assert!(!b.verify(&token));
        assert!(b.items.is_empty());
    }

    #[test]
    fn constant_time_compare_checks_length_and_every_byte() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
    }
}
