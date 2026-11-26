// The helper's own settings, kept as plain key=value lines in the data folder (settings.txt).
// experimental: show the experimental options and the developer tools. Off by default.
// setup_answered: the browsers the user already answered the first-run setup question for.

use std::path::PathBuf;

use crate::store;

pub struct Settings {
    pub experimental: bool,
    pub answered: Vec<String>,
}

fn path() -> PathBuf {
    store::data_dir().join("settings.txt")
}

pub fn load() -> Settings {
    let text = std::fs::read_to_string(path()).unwrap_or_default();
    let mut settings = Settings { experimental: false, answered: Vec::new() };
    for line in text.lines() {
        if let Some((key, value)) = line.split_once('=') {
            match key.trim() {
                "experimental" => settings.experimental = value.trim() == "true",
                "setup_answered" => {
                    settings.answered = value.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
                }
                _ => {}
            }
        }
    }
    settings
}

pub fn save(settings: &Settings) -> Result<(), String> {
    let dir = store::data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create the data folder: {}", e))?;
    let text = format!("experimental={}\nsetup_answered={}\n", settings.experimental, settings.answered.join(","));
    std::fs::write(path(), text).map_err(|e| format!("cannot save the settings: {}", e))
}
