// The language packs of the offline engine.
//
// The catalogue (packs.json, written by scripts/make-pack-catalogue.mjs) lists each pack's files with their SHA-256 and
// size. A pack is a folder under store::packs_dir(), named after its pair (for example "enfr"). It holds the three model
// files exactly as the catalogue lists them (still gzipped, the engine unpacks them).
//
// Installing downloads each file to a ".part" file first. A file is moved into place only when its size and SHA-256
// match the catalogue. The marker file "installed.json" is written last. A half-finished download never counts as
// installed, and a failed one leaves no files that the engine could use.

use std::fs;
use std::path::{Path, PathBuf};

use crate::json;
use crate::sha256;

const CATALOGUE_TEXT: &str = include_str!("packs.json");
const MARKER: &str = "installed.json";

#[derive(Debug, Clone)]
pub struct PackFile {
    pub name: String,
    pub sha256: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone)]
pub struct Pack {
    pub pair: String,
    pub from: String,
    pub to: String,
    pub bytes: u64,
    pub files: Vec<PackFile>,
}

#[derive(Debug, Clone)]
pub struct Catalogue {
    pub commit: String,
    pub packs: Vec<Pack>,
}

fn text_field(value: &json::Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| format!("the language pack catalogue has no \"{}\"", key))
}

fn number_field(value: &json::Value, key: &str) -> Result<u64, String> {
    match value.get(key) {
        Some(json::Value::Number(n)) if *n >= 0.0 && n.fract() == 0.0 => Ok(*n as u64),
        _ => Err(format!("the language pack catalogue has no number \"{}\"", key)),
    }
}

/// A pair is two lowercase letters for the source language and two for the target, for example "enfr".
fn valid_pair(pair: &str) -> bool {
    pair.len() == 4 && pair.chars().all(|c| c.is_ascii_lowercase())
}

/// A file name in a pack: a gzipped file with no folder parts.
fn valid_file_name(name: &str) -> bool {
    !name.is_empty() && name.ends_with(".gz") && !name.contains('/') && !name.contains('\\') && !name.starts_with('.')
}

/// Reads a catalogue. The downloads must be https, so a catalogue cannot point the helper at another kind of address.
pub fn parse_catalogue(text: &str) -> Result<Catalogue, String> {
    let root = json::parse(text).map_err(|e| format!("the language pack catalogue is not valid JSON: {}", e))?;
    let commit = text_field(&root, "commit")?;
    let items = root
        .get("packs")
        .and_then(|v| v.as_array())
        .ok_or("the language pack catalogue has no packs")?;
    let mut packs = Vec::new();
    for item in items {
        let pair = text_field(item, "pair")?;
        if !valid_pair(&pair) {
            return Err(format!("the language pack catalogue has a bad pair name: {}", pair));
        }
        let file_items = item
            .get("files")
            .and_then(|v| v.as_array())
            .ok_or_else(|| format!("the pack {} has no files", pair))?;
        let mut files = Vec::new();
        for file in file_items {
            let name = text_field(file, "name")?;
            if !valid_file_name(&name) {
                return Err(format!("the pack {} has a bad file name: {}", pair, name));
            }
            let sha = text_field(file, "sha256")?;
            if sha.len() != 64 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(format!("the pack {} file {} has a bad SHA-256", pair, name));
            }
            let url = text_field(file, "url")?;
            if !url.starts_with("https://") {
                return Err(format!("the pack {} file {} does not use https", pair, name));
            }
            files.push(PackFile { name, sha256: sha.to_lowercase(), size: number_field(file, "size")?, url });
        }
        packs.push(Pack {
            from: text_field(item, "from")?,
            to: text_field(item, "to")?,
            bytes: number_field(item, "bytes")?,
            pair,
            files,
        });
    }
    Ok(Catalogue { commit, packs })
}

/// The catalogue built into this helper.
pub fn catalogue() -> Result<Catalogue, String> {
    parse_catalogue(CATALOGUE_TEXT)
}

pub fn find<'a>(catalogue: &'a Catalogue, pair: &str) -> Option<&'a Pack> {
    catalogue.packs.iter().find(|p| p.pair == pair)
}

/// True when every file of the pack is in the folder with the catalogue's size, and the marker was written.
pub fn is_installed_in(root: &Path, pack: &Pack) -> bool {
    let dir = root.join(&pack.pair);
    if !dir.join(MARKER).is_file() {
        return false;
    }
    pack.files
        .iter()
        .all(|f| fs::metadata(dir.join(&f.name)).map(|m| m.len() == f.size).unwrap_or(false))
}

/// Installs a pack into `root` (normally store::packs_dir()). Nothing is left behind when a file fails its check.
pub fn install_into(root: &Path, pack: &Pack, commit: &str) -> Result<(), String> {
    if !valid_pair(&pack.pair) {
        return Err(format!("{} is not a language pair", pack.pair));
    }
    let dir = root.join(&pack.pair);
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {}", dir.display(), e))?;
    let _ = fs::remove_file(dir.join(MARKER));
    for file in &pack.files {
        let target = dir.join(&file.name);
        let partial = dir.join(format!("{}.part", file.name));
        if let Err(e) = super::download(&file.url, &partial) {
            let _ = fs::remove_file(&partial);
            return Err(format!("{} could not be downloaded: {}", file.name, e));
        }
        let bytes = match fs::read(&partial) {
            Ok(b) => b,
            Err(e) => return Err(format!("cannot read {}: {}", partial.display(), e)),
        };
        if bytes.len() as u64 != file.size {
            let _ = fs::remove_file(&partial);
            return Err(format!(
                "{} is {} bytes, the catalogue says {}. Nothing was installed.",
                file.name,
                bytes.len(),
                file.size
            ));
        }
        if sha256::hex(&bytes) != file.sha256 {
            let _ = fs::remove_file(&partial);
            return Err(format!("the SHA-256 check of {} failed. Nothing was installed.", file.name));
        }
        let _ = fs::remove_file(&target);
        fs::rename(&partial, &target).map_err(|e| format!("cannot save {}: {}", target.display(), e))?;
    }
    let marker = format!("{{\"pair\":{},\"commit\":{}}}\n", json::quote(&pack.pair), json::quote(commit));
    fs::write(dir.join(MARKER), marker).map_err(|e| format!("cannot finish the install of {}: {}", pack.pair, e))
}

/// Removes an installed pack from `root`. Only a pair in the catalogue can be removed.
pub fn remove_from(root: &Path, catalogue: &Catalogue, pair: &str) -> Result<(), String> {
    if find(catalogue, pair).is_none() {
        return Err(format!("{} is not a language pack", pair));
    }
    let dir: PathBuf = root.join(pair);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("cannot remove {}: {}", dir.display(), e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("atlas-packs-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_built_in_catalogue_has_the_expected_packs() {
        let cat = catalogue().expect("packs.json must parse");
        assert_eq!(cat.commit.len(), 40);
        assert!(cat.packs.len() >= 80);
        let enfr = find(&cat, "enfr").expect("English to French is in the catalogue");
        assert_eq!((enfr.from.as_str(), enfr.to.as_str()), ("en", "fr"));
        assert_eq!(enfr.files.len(), 3);
        for pack in &cat.packs {
            assert!(pack.files.iter().any(|f| f.name.starts_with("model.")), "{} has no model", pack.pair);
            assert!(pack.files.iter().any(|f| f.name.starts_with("vocab.")), "{} has no vocab", pack.pair);
            assert!(pack.files.iter().any(|f| f.name.starts_with("lex.")), "{} has no shortlist", pack.pair);
            assert_eq!(pack.bytes, pack.files.iter().map(|f| f.size).sum::<u64>());
        }
    }

    #[test]
    fn a_bad_catalogue_is_refused() {
        let bad_pair = r#"{"commit":"x","packs":[{"pair":"../x","from":"a","to":"b","bytes":0,"files":[]}]}"#;
        assert!(parse_catalogue(bad_pair).unwrap_err().contains("bad pair"));
        let http = r#"{"commit":"x","packs":[{"pair":"enfr","from":"en","to":"fr","bytes":1,"files":[{"name":"a.gz","sha256":"0000000000000000000000000000000000000000000000000000000000000000","size":1,"url":"http://example.com/a.gz"}]}]}"#;
        assert!(parse_catalogue(http).unwrap_err().contains("https"));
        let folder = r#"{"commit":"x","packs":[{"pair":"enfr","from":"en","to":"fr","bytes":1,"files":[{"name":"../a.gz","sha256":"0000000000000000000000000000000000000000000000000000000000000000","size":1,"url":"https://example.com/a.gz"}]}]}"#;
        assert!(parse_catalogue(folder).unwrap_err().contains("bad file name"));
    }

    #[cfg(unix)]
    #[test]
    fn a_pack_installs_only_when_every_file_checks_out() {
        let source = temp("source");
        let root = temp("root");
        let content = b"not really a model, but the checks do not care";
        fs::write(source.join("model.test.gz"), content).unwrap();
        let good_hash = sha256::hex(content);
        let url = format!("file://{}", source.join("model.test.gz").display());
        let pack = |sha: &str, size: u64| Pack {
            pair: "enfr".to_string(),
            from: "en".to_string(),
            to: "fr".to_string(),
            bytes: size,
            files: vec![PackFile { name: "model.test.gz".to_string(), sha256: sha.to_string(), size, url: url.clone() }],
        };

        // A wrong checksum: nothing is installed and no file is left behind.
        let wrong = "0".repeat(64);
        assert!(install_into(&root, &pack(&wrong, content.len() as u64), "abc").is_err());
        assert!(!root.join("enfr").join("model.test.gz").exists());
        assert!(!root.join("enfr").join(MARKER).exists());

        // A wrong size is refused too.
        assert!(install_into(&root, &pack(&good_hash, 3), "abc").is_err());

        // The right file installs, and the marker is written.
        let good = pack(&good_hash, content.len() as u64);
        install_into(&root, &good, "abc123").expect("install");
        assert!(is_installed_in(&root, &good));
        assert_eq!(fs::read(root.join("enfr").join("model.test.gz")).unwrap(), content);

        // Removing it takes the folder away, and only catalogue pairs can be removed.
        let cat = Catalogue { commit: "abc123".to_string(), packs: vec![good.clone()] };
        assert!(remove_from(&root, &cat, "../etc").is_err());
        remove_from(&root, &cat, "enfr").expect("remove");
        assert!(!is_installed_in(&root, &good));
    }
}
