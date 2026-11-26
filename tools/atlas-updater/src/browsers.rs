// The browsers the helper window offers, and what each one needs to get Atlas Translation.
//
// Chromium browsers (Chrome, Edge, Brave, Opera, Vivaldi, Comet, Iopera) load an unpacked copy from a folder.
// The helper cannot add it for them, so the guide tells the user the three clicks. Firefox installs from the
// Firefox Add-ons store, and the helper only links to it.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Where Firefox installs Atlas Translation from.
pub const FIREFOX_STORE_URL: &str = "https://addons.mozilla.org/en-US/firefox/addon/atlas-translation/";

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Chromium,
    Firefox,
}

pub struct Browser {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: Kind,
    /// The address of the page where the browser manages extensions.
    pub extensions_url: &'static str,
    /// An extra step for this browser, or an empty string.
    pub note: &'static str,
}

pub const BROWSERS: &[Browser] = &[
    Browser { id: "chrome", name: "Google Chrome", kind: Kind::Chromium, extensions_url: "chrome://extensions", note: "" },
    Browser { id: "edge", name: "Microsoft Edge", kind: Kind::Chromium, extensions_url: "edge://extensions", note: "" },
    Browser { id: "brave", name: "Brave", kind: Kind::Chromium, extensions_url: "brave://extensions", note: "" },
    Browser { id: "opera", name: "Opera", kind: Kind::Chromium, extensions_url: "opera://extensions", note: "" },
    Browser { id: "vivaldi", name: "Vivaldi", kind: Kind::Chromium, extensions_url: "vivaldi://extensions", note: "" },
    Browser {
        id: "comet",
        name: "Comet",
        kind: Kind::Chromium,
        extensions_url: "chrome://extensions",
        note: "If that address does not open, find Extensions in the browser menu.",
    },
    Browser {
        id: "iopera",
        name: "Iopera",
        kind: Kind::Chromium,
        extensions_url: "chrome://extensions",
        note: "If that address does not open, find Extensions in the browser menu.",
    },
    Browser { id: "firefox", name: "Firefox", kind: Kind::Firefox, extensions_url: "about:addons", note: "" },
];

/// What the window shows for one browser.
pub struct Guide {
    pub name: String,
    pub steps: Vec<String>,
    /// A page to open or copy, or None.
    pub link: Option<String>,
    /// True when the Chromium steps need the unpacked folder, and no folder is chosen yet.
    pub needs_folder: bool,
}

/// The steps for one browser. `folder` is the unpacked copy's folder, or an empty string when none is chosen.
pub fn guide(browser: &Browser, folder: &str) -> Guide {
    match browser.kind {
        Kind::Firefox => Guide {
            name: browser.name.to_string(),
            steps: vec![
                "Open the Firefox Add-ons page (the button below) and click Add to Firefox.".to_string(),
                "Confirm the install. Firefox then keeps Atlas Translation up to date by itself.".to_string(),
                "The helper does not copy files for Firefox, so the update section does not apply to it.".to_string(),
            ],
            link: Some(FIREFOX_STORE_URL.to_string()),
            needs_folder: false,
        },
        Kind::Chromium => {
            let needs_folder = folder.is_empty();
            let mut steps = vec![format!("Open {} in {}.", browser.extensions_url, browser.name)];
            if !browser.note.is_empty() {
                steps.push(browser.note.to_string());
            }
            steps.push("Turn on Developer mode (the switch at the top right).".to_string());
            if needs_folder {
                steps.push("Install the update first (Update section), then load its folder with Load unpacked.".to_string());
            } else {
                steps.push(format!("Click Load unpacked and choose this folder: {}", folder));
            }
            Guide { name: browser.name.to_string(), steps, link: None, needs_folder }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn firefox_points_to_the_store() {
        let firefox = BROWSERS.iter().find(|b| b.id == "firefox").unwrap();
        let g = guide(firefox, "");
        assert_eq!(g.link.as_deref(), Some("https://addons.mozilla.org/en-US/firefox/addon/atlas-translation/"));
        assert!(!g.needs_folder);
    }

    #[test]
    fn chromium_steps_name_the_folder() {
        let comet = BROWSERS.iter().find(|b| b.id == "comet").unwrap();
        let g = guide(comet, "C:\\Atlas Translation");
        assert!(g.steps.iter().any(|s| s.contains("C:\\Atlas Translation")));
        assert!(g.steps.iter().any(|s| s.contains("Load unpacked")));
        assert!(g.link.is_none());
    }

    #[test]
    fn chromium_without_a_folder_asks_for_the_update_first() {
        let chrome = BROWSERS.iter().find(|b| b.id == "chrome").unwrap();
        let g = guide(chrome, "");
        assert!(g.needs_folder);
        assert!(g.steps.iter().any(|s| s.contains("Install the update first")));
    }

    #[test]
    fn every_browser_has_a_unique_id() {
        for (i, a) in BROWSERS.iter().enumerate() {
            for b in &BROWSERS[i + 1..] {
                assert_ne!(a.id, b.id);
            }
        }
    }
}

/// The program of a browser installed on this computer, or None. Comet and Iopera are not looked for yet.
pub fn find_program(browser: &Browser) -> Option<PathBuf> {
    candidates(browser.id).into_iter().find(|p| p.is_file())
}

/// Where each browser keeps its program, for the systems the helper runs on.
fn candidates(id: &str) -> Vec<PathBuf> {
    if cfg!(target_os = "windows") {
        let roots: Vec<PathBuf> = ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]
            .iter()
            .filter_map(|key| std::env::var_os(key).map(PathBuf::from))
            .collect();
        let relative: &[&str] = match id {
            "chrome" => &["Google\\Chrome\\Application\\chrome.exe"],
            "edge" => &["Microsoft\\Edge\\Application\\msedge.exe"],
            "brave" => &["BraveSoftware\\Brave-Browser\\Application\\brave.exe"],
            "vivaldi" => &["Vivaldi\\Application\\vivaldi.exe"],
            "firefox" => &["Mozilla Firefox\\firefox.exe"],
            _ => &[],
        };
        let mut out = Vec::new();
        for root in &roots {
            for rel in relative {
                out.push(root.join(rel));
            }
        }
        out
    } else if cfg!(target_os = "macos") {
        let apps: &[&str] = match id {
            "chrome" => &["Google Chrome.app"],
            "edge" => &["Microsoft Edge.app"],
            "brave" => &["Brave Browser.app"],
            "opera" => &["Opera.app"],
            "vivaldi" => &["Vivaldi.app"],
            "firefox" => &["Firefox.app"],
            _ => &[],
        };
        apps.iter().map(|app| PathBuf::from("/Applications").join(app)).collect()
    } else {
        let names: &[&str] = match id {
            "chrome" => &["google-chrome", "google-chrome-stable", "chromium"],
            "edge" => &["microsoft-edge"],
            "brave" => &["brave-browser"],
            "opera" => &["opera"],
            "vivaldi" => &["vivaldi"],
            "firefox" => &["firefox"],
            _ => &[],
        };
        let dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
        let mut out = Vec::new();
        for dir in &dirs {
            for name in names {
                out.push(dir.join(name));
            }
        }
        out
    }
}

/// Opens `url` in a new window of an installed browser. On macOS the app is opened by its path with `open`.
pub fn open_in_browser(program: &Path, url: &str) -> bool {
    let mut command = if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg("-a").arg(program).arg(url);
        c
    } else {
        let mut c = Command::new(program);
        c.arg(url);
        c
    };
    command.stdin(std::process::Stdio::null());
    crate::autostart::quiet(command).spawn().is_ok()
}
