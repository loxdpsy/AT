//! The text of the helper's window and tray, in the language chosen in Settings.
//!
//! English is the source. Each string is written in English in the code, wrapped in `tr("...")`, and the English text
//! is the key. A language has one JSON file in `i18n/`, which maps each English text to its translation. A text with no
//! translation (or a language with no file) is shown in English, so a missing translation never leaves a gap.

use std::sync::Mutex;

use crate::json::{self, Value};

/// The languages that have a translation file, by code (as in `_locales`, with `_` between the parts).
const FILES: &[(&str, &str)] = &[
    ("ar", include_str!("../i18n/ar.json")),
    ("es", include_str!("../i18n/es.json")),
    ("fr", include_str!("../i18n/fr.json")),
    ("hi", include_str!("../i18n/hi.json")),
    ("zh_CN", include_str!("../i18n/zh_CN.json")),
];

/// The translation table of the chosen language. None means English.
static ACTIVE: Mutex<Option<Value>> = Mutex::new(None);

/// Chooses the language: "system" follows the computer, a code such as "fr" or "zh-CN" picks that language.
pub fn set_language(setting: &str) {
    let wanted = if setting.is_empty() || setting == "system" {
        sys_locale::get_locale().unwrap_or_default()
    } else {
        setting.to_string()
    };
    let table = find(&wanted).and_then(|text| json::parse(text).ok());
    *ACTIVE.lock().unwrap_or_else(|p| p.into_inner()) = table;
}

/// The translation file for a language tag, if there is one. A region must match exactly (zh-TW does not use the
/// zh_CN file). A bare language code uses the file of that language.
fn find(tag: &str) -> Option<&'static str> {
    let tag = tag.replace('-', "_");
    if let Some((_, text)) = FILES.iter().find(|(code, _)| code.eq_ignore_ascii_case(&tag)) {
        return Some(text);
    }
    if tag.contains('_') {
        return None;
    }
    FILES
        .iter()
        .find(|(code, _)| code.split('_').next().unwrap_or("").eq_ignore_ascii_case(&tag))
        .map(|(_, text)| *text)
}

/// The text to show for an English source text.
pub fn tr(source: &str) -> String {
    let guard = ACTIVE.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(table) = guard.as_ref() {
        if let Some(text) = table.get(source).and_then(Value::as_str) {
            if !text.is_empty() {
                return text.to_string();
            }
        }
    }
    source.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_translation_file_is_valid_json_with_text_values() {
        for (code, text) in FILES {
            let value = json::parse(text).unwrap_or_else(|e| panic!("{} is not valid JSON: {}", code, e));
            assert!(value.get("Cancel").is_some() || value.get("Quit").is_some(), "{} has no translations", code);
        }
    }

    #[test]
    fn languages_are_found_by_code_and_region() {
        assert!(find("fr").is_some());
        assert!(find("fr-CA").is_none(), "a region with no file is English");
        assert!(find("zh-CN").is_some());
        assert!(find("zh_CN").is_some());
        assert!(find("zh-TW").is_none(), "Traditional Chinese has no file yet");
        assert!(find("en").is_none());
        assert!(find("xx").is_none());
    }
}
