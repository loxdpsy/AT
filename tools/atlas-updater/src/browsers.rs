// The browsers the helper window offers, and what each one needs to get Atlas Translation.
//
// Chromium browsers (Chrome, Edge, Brave, Opera, Vivaldi, Comet, Iopera) load an unpacked copy from a folder.
// The helper cannot add it for them, so the guide tells the user the three clicks. Firefox installs from the
// Firefox Add-ons store, and the helper only links to it.

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
