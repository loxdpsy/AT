// Read-aloud voices: the choices in voices.json and the voices that speak one language. A voice is a sherpa-onnx
// archive (.tar.bz2) from the k2-fsa release. Unpacking an archive and the read-aloud window are not built yet. This
// module lists the choices, so an install can take "every voice for this language" as one job, with its total size.
#![allow(dead_code)]

use crate::json;

const CATALOGUE_TEXT: &str = include_str!("voices.json");

/// Every voice download must come from this release. The helper refuses any other address.
const TRUSTED_PREFIX: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/";

#[derive(Debug, Clone, PartialEq)]
pub struct Voice {
    pub id: String,
    pub name: String,
    /// Language codes the voice speaks, for example "en" or "ja".
    pub languages: Vec<String>,
    pub file: String,
    pub url: String,
    pub bytes: u64,
    /// The SHA-256 of the archive, in lowercase hex. The download is refused when it does not match.
    pub sha256: String,
    pub licence: String,
    pub licence_url: String,
    /// True when the licence has terms the user must accept before the download (for example use restrictions).
    pub accept_licence: bool,
    /// The voice used for its languages when the user has not chosen another.
    pub default: bool,
}

fn text(value: &json::Value, key: &str) -> Result<String, String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| format!("the voice catalogue has no \"{}\"", key))
}

fn number(value: &json::Value, key: &str) -> Result<u64, String> {
    match value.get(key) {
        Some(json::Value::Number(n)) if *n > 0.0 && n.fract() == 0.0 => Ok(*n as u64),
        _ => Err(format!("the voice catalogue has no positive number \"{}\"", key)),
    }
}

fn flag(value: &json::Value, key: &str) -> bool {
    matches!(value.get(key), Some(json::Value::Bool(true)))
}

/// Reads the voice list. A voice with a download from another address, or a checksum that is not 64 hex digits, is an error.
pub fn parse_catalogue(source: &str) -> Result<Vec<Voice>, String> {
    let root = json::parse(source)?;
    let items = root
        .get("voices")
        .and_then(|v| v.as_array())
        .ok_or("the voice catalogue has no \"voices\" list")?;
    let mut voices = Vec::new();
    for item in items {
        let id = text(item, "id")?;
        let languages: Vec<String> = item
            .get("languages")
            .and_then(|v| v.as_array())
            .ok_or_else(|| format!("voice {} has no \"languages\" list", id))?
            .iter()
            .filter_map(|l| l.as_str().map(|s| s.to_lowercase()))
            .collect();
        let url = text(item, "url")?;
        if !url.starts_with(TRUSTED_PREFIX) {
            return Err(format!("voice {} is not downloaded from the sherpa-onnx release", id));
        }
        let sha256 = text(item, "sha256")?;
        if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(format!("voice {} has no SHA-256 checksum", id));
        }
        voices.push(Voice {
            name: text(item, "name")?,
            languages,
            file: text(item, "file")?,
            url,
            bytes: number(item, "bytes")?,
            sha256: sha256.to_lowercase(),
            licence: text(item, "licence")?,
            licence_url: text(item, "licenceUrl")?,
            accept_licence: flag(item, "acceptLicence"),
            default: flag(item, "default"),
            id,
        });
    }
    Ok(voices)
}

/// The built-in voice list (voices.json).
pub fn catalogue() -> Result<Vec<Voice>, String> {
    parse_catalogue(CATALOGUE_TEXT)
}

/// The voices that speak a language, the default first. A regional code matches its main language: "zh-CN" is "zh".
pub fn voices_for<'a>(voices: &'a [Voice], language: &str) -> Vec<&'a Voice> {
    let wanted = language.split('-').next().unwrap_or("").to_lowercase();
    let mut found: Vec<&Voice> = voices
        .iter()
        .filter(|v| v.languages.iter().any(|l| *l == wanted))
        .collect();
    found.sort_by_key(|v| !v.default);
    found
}

/// The total download size of some voices, in bytes. Shown before an install.
pub fn total_bytes(voices: &[&Voice]) -> u64 {
    voices.iter().map(|v| v.bytes).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_catalogue_parses_and_every_download_is_from_the_sherpa_release() {
        let voices = catalogue().expect("voices.json must parse");
        assert!(voices.len() >= 2);
        assert!(voices.iter().all(|v| v.url.starts_with(TRUSTED_PREFIX)));
        assert!(voices.iter().all(|v| v.sha256.len() == 64));
    }

    #[test]
    fn english_gets_every_voice_that_speaks_it_with_the_default_first() {
        let voices = catalogue().unwrap();
        let english = voices_for(&voices, "en");
        assert_eq!(english.len(), 2);
        assert!(english[0].default);
        assert_eq!(total_bytes(&english), english.iter().map(|v| v.bytes).sum::<u64>());
    }

    #[test]
    fn arabic_gets_the_voice_that_speaks_it_and_chinese_gets_kokoro() {
        let voices = catalogue().unwrap();
        let arabic = voices_for(&voices, "ar");
        assert_eq!(arabic.len(), 1);
        assert_eq!(arabic[0].id, "supertonic-3");
        let chinese = voices_for(&voices, "zh-CN");
        assert_eq!(chinese.len(), 1);
        assert_eq!(chinese[0].id, "kokoro-v1.1-zh-int8");
    }

    #[test]
    fn a_download_from_another_address_is_refused() {
        let text = r#"{"voices":[{"id":"x","name":"x","languages":["en"],"file":"x.tar.bz2","url":"https://example.com/x.tar.bz2","bytes":10,"sha256":"0000000000000000000000000000000000000000000000000000000000000000","licence":"MIT","licenceUrl":"https://example.com","acceptLicence":false,"default":true}]}"#;
        assert!(parse_catalogue(text).is_err());
    }

    #[test]
    fn a_checksum_that_is_not_sha256_is_refused() {
        let text = r#"{"voices":[{"id":"x","name":"x","languages":["en"],"file":"x.tar.bz2","url":"https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/x.tar.bz2","bytes":10,"sha256":"abc","licence":"MIT","licenceUrl":"https://example.com","acceptLicence":false,"default":true}]}"#;
        assert!(parse_catalogue(text).is_err());
    }
}
