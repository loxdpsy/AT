// The helper's own settings, kept as plain key=value lines in the data folder (settings.txt).
// experimental: show the experimental options and the developer tools. Off by default.
// setup_answered: the browsers the user already answered the first-run setup question for.
// welcomed: the welcome page was finished (Done). It shows again only from Settings.
// theme: "system", "light" or "dark". The window follows the operating system unless the user picks one.
// text_size: "normal" or "large". Large scales the whole window up.
// keep_in_tray: closing the window keeps the helper running in the tray. Off means closing quits it.
// download_connections: how many connections a download uses at once (1 to 8). Each file is split into parts over them.

use std::path::PathBuf;

use crate::store;
use crate::transfer::{DEFAULT_CONNECTIONS, MAX_CONNECTIONS, MIN_CONNECTIONS};

pub struct Settings {
    pub experimental: bool,
    pub answered: Vec<String>,
    pub welcomed: bool,
    pub theme: String,
    pub text_size: String,
    pub keep_in_tray: bool,
    pub download_connections: usize,
    /// Start the helper in the tray when the browser starts (the browser asks through its native messaging host).
    pub start_with_browser: bool,
}

fn path() -> PathBuf {
    store::data_dir().join("settings.txt")
}

pub fn load() -> Settings {
    let text = std::fs::read_to_string(path()).unwrap_or_default();
    let mut settings = Settings {
        experimental: false,
        answered: Vec::new(),
        welcomed: false,
        theme: "system".to_string(),
        text_size: "normal".to_string(),
        keep_in_tray: true,
        download_connections: DEFAULT_CONNECTIONS,
        start_with_browser: false,
    };
    for line in text.lines() {
        if let Some((key, value)) = line.split_once('=') {
            match key.trim() {
                "experimental" => settings.experimental = value.trim() == "true",
                "welcomed" => settings.welcomed = value.trim() == "true",
                "theme" => settings.theme = value.trim().to_string(),
                "text_size" => settings.text_size = value.trim().to_string(),
                "keep_in_tray" => settings.keep_in_tray = value.trim() != "false",
                "download_connections" => {
                    settings.download_connections = value.trim().parse::<usize>().unwrap_or(DEFAULT_CONNECTIONS).clamp(MIN_CONNECTIONS, MAX_CONNECTIONS)
                }
                "start_with_browser" => settings.start_with_browser = value.trim() == "true",
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
    let text = format!(
        "experimental={}\nsetup_answered={}\nwelcomed={}\ntheme={}\ntext_size={}\nkeep_in_tray={}\ndownload_connections={}\nstart_with_browser={}\n",
        settings.experimental,
        settings.answered.join(","),
        settings.welcomed,
        settings.theme,
        settings.text_size,
        settings.keep_in_tray,
        settings.download_connections,
        settings.start_with_browser
    );
    std::fs::write(path(), text).map_err(|e| format!("cannot save the settings: {}", e))
}
