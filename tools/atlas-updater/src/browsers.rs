// The browsers on this computer that the helper can set Atlas Translation up in.
//
// The helper lists them the way the system does: the Windows "Default apps" list (StartMenuInternet in the registry),
// the applications on macOS that declare the web address schemes, and the desktop entries on Linux that handle web
// addresses. A browser with Firefox's engine (or a Firefox name) gets the Firefox store page. Safari and Internet
// Explorer are not supported. Every other browser is treated as Chromium-based.
//
// Chromium browsers load an unpacked copy from a folder. The helper cannot add it for them, so the guide tells the
// user the clicks. Chromium browsers do not allow a silent install of an extension from outside their store.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Where Firefox installs Atlas Translation from.
pub const FIREFOX_STORE_URL: &str = "https://addons.mozilla.org/en-US/firefox/addon/atlas-translation/";

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Chromium,
    Firefox,
}

#[derive(Clone, Debug)]
pub struct Browser {
    /// A key for this browser: the lower-case path of its program.
    pub id: String,
    pub name: String,
    pub kind: Kind,
    /// The program that starts the browser (on macOS, the application bundle).
    pub program: PathBuf,
}

impl Browser {
    /// The page where the browser manages extensions. Chromium browsers redirect chrome:// addresses to their own page.
    pub fn extensions_url(&self) -> &'static str {
        match self.kind {
            Kind::Chromium => "chrome://extensions",
            Kind::Firefox => "about:addons",
        }
    }
}

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
            name: browser.name.clone(),
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
            let mut steps = vec![
                format!("Open {} in {}.", browser.extensions_url(), browser.name),
                "If that address does not open, find Extensions in the browser menu.".to_string(),
                "Turn on Developer mode (the switch at the top right).".to_string(),
            ];
            if needs_folder {
                steps.push("Install the update first (Update section), then load its folder with Load unpacked.".to_string());
            } else {
                steps.push(format!("Click Load unpacked and choose this folder: {}", folder));
            }
            Guide { name: browser.name.clone(), steps, link: None, needs_folder }
        }
    }
}

/// The browsers installed on this computer, sorted by name. Each program appears once.
pub fn detect() -> Vec<Browser> {
    let mut found: Vec<Browser> = Vec::new();
    for (name, program) in listed_browsers() {
        let Some(kind) = classify(&name, &program) else {
            continue;
        };
        let id = program.to_string_lossy().to_lowercase();
        if found.iter().any(|b| b.id == id) {
            continue;
        }
        found.push(Browser { id, name, kind, program });
    }
    found.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    found
}

/// The browsers the system lists, as (name, program). Only the programs that exist are kept.
fn listed_browsers() -> Vec<(String, PathBuf)> {
    #[cfg(windows)]
    let listed = windows_listed();
    #[cfg(target_os = "macos")]
    let listed = macos_listed();
    #[cfg(all(unix, not(target_os = "macos")))]
    let listed = linux_listed();
    listed.into_iter().filter(|(_, program)| program.exists()).collect()
}

/// Firefox, Chromium-based, or None for a browser that is not supported (Safari, Internet Explorer, Orion).
pub fn classify(name: &str, program: &Path) -> Option<Kind> {
    let lower = name.to_lowercase();
    let file = program.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    if ["internet explorer", "iexplore", "safari", "orion"].iter().any(|word| lower.contains(word))
        || ["iexplore", "safari", "orion"].contains(&file.as_str())
    {
        return None;
    }
    let firefox_names = ["firefox", "librewolf", "waterfox", "floorp", "zen browser", "tor browser"];
    if firefox_names.iter().any(|word| lower.contains(word)) || has_firefox_engine(program) {
        return Some(Kind::Firefox);
    }
    Some(Kind::Chromium)
}

/// True when the program's folder holds Firefox's engine library.
fn has_firefox_engine(program: &Path) -> bool {
    let dir = if cfg!(target_os = "macos") {
        program.join("Contents/Frameworks")
    } else {
        match program.parent() {
            Some(parent) => parent.to_path_buf(),
            None => return false,
        }
    };
    ["XUL.framework", "xul.dll", "libxul.so"].iter().any(|file| dir.join(file).exists())
}

#[cfg(windows)]
fn windows_listed() -> Vec<(String, PathBuf)> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    let roots = [
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\Clients\\StartMenuInternet"),
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Clients\\StartMenuInternet"),
        (HKEY_CURRENT_USER, "SOFTWARE\\Clients\\StartMenuInternet"),
    ];
    let mut out = Vec::new();
    for (hive, path) in roots {
        let Ok(root) = RegKey::predef(hive).open_subkey(path) else {
            continue;
        };
        for name in root.enum_keys().flatten() {
            let Ok(command) = root.open_subkey(format!("{}\\shell\\open\\command", name)) else {
                continue;
            };
            let Ok(line) = command.get_value::<String, _>("") else {
                continue;
            };
            if let Some(program) = parse_windows_command(&line) {
                out.push((name, program));
            }
        }
    }
    out
}

/// The program of a Windows command line such as `"C:\...\chrome.exe" --single-argument %1`.
#[allow(dead_code)]
pub fn parse_windows_command(line: &str) -> Option<PathBuf> {
    let trimmed = line.trim();
    let lower = trimmed.to_ascii_lowercase();
    let end = lower.find(".exe")? + 4;
    Some(PathBuf::from(trimmed[..end].trim_start_matches('"')))
}

#[cfg(target_os = "macos")]
fn macos_listed() -> Vec<(String, PathBuf)> {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let mut out = Vec::new();
    for dir in [PathBuf::from("/Applications"), home.join("Applications")] {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let app = entry.path();
            if app.extension().and_then(|e| e.to_str()) != Some("app") {
                continue;
            }
            if let Some((name, handles_web)) = read_bundle(&app) {
                if handles_web {
                    out.push((name, app));
                }
            }
        }
    }
    out
}

/// The name of an application bundle, and whether it handles the http or https address scheme.
#[cfg(target_os = "macos")]
fn read_bundle(app: &Path) -> Option<(String, bool)> {
    let mut command = Command::new("plutil");
    command.arg("-convert").arg("json").arg("-o").arg("-").arg(app.join("Contents/Info.plist"));
    let output = crate::autostart::quiet(command).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let value = crate::json::parse(&String::from_utf8(output.stdout).ok()?).ok()?;
    let name = value
        .get("CFBundleName")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| app.file_stem().unwrap_or_default().to_string_lossy().into_owned());
    let handles_web = value.get("CFBundleURLTypes").and_then(|v| v.as_array()).map_or(false, |types| {
        types.iter().any(|t| {
            t.get("CFBundleURLSchemes")
                .and_then(|v| v.as_array())
                .map_or(false, |schemes| schemes.iter().any(|s| matches!(s.as_str(), Some("http") | Some("https"))))
        })
    });
    Some((name, handles_web))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn linux_listed() -> Vec<(String, PathBuf)> {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    let dirs = [
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
        home.join(".local/share/applications"),
        PathBuf::from("/var/lib/flatpak/exports/share/applications"),
        home.join(".local/share/flatpak/exports/share/applications"),
    ];
    let mut out = Vec::new();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&path) else {
                continue;
            };
            if let Some(found) = parse_desktop(&text) {
                out.push(found);
            }
        }
    }
    out
}

/// The name and program of a desktop entry, when it is a browser (it handles the http scheme) and is not hidden.
#[allow(dead_code)]
pub fn parse_desktop(text: &str) -> Option<(String, PathBuf)> {
    let mut name = None;
    let mut exec = None;
    let mut mime = "";
    let mut hidden = false;
    let mut in_entry = false;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_entry = line == "[Desktop Entry]";
            continue;
        }
        if !in_entry {
            continue;
        }
        if let Some(value) = line.strip_prefix("Name=") {
            name.get_or_insert(value.to_string());
        } else if let Some(value) = line.strip_prefix("Exec=") {
            exec.get_or_insert(value.to_string());
        } else if let Some(value) = line.strip_prefix("MimeType=") {
            mime = value;
        } else if line == "NoDisplay=true" {
            hidden = true;
        }
    }
    if hidden || !mime.split(';').any(|m| m == "x-scheme-handler/http") {
        return None;
    }
    Some((name?, exec_program(&exec?)?))
}

/// The program of an Exec= line: its first word, found in PATH when it is not a full path.
#[allow(dead_code)]
fn exec_program(exec: &str) -> Option<PathBuf> {
    let word = exec.split_whitespace().next()?.trim_matches('"');
    let path = PathBuf::from(word);
    if path.is_absolute() {
        return Some(path);
    }
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths).map(|dir| dir.join(word)).find(|p| p.is_file())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn firefox() -> Browser {
        Browser { id: "f".into(), name: "Firefox".into(), kind: Kind::Firefox, program: PathBuf::from("/x/firefox") }
    }

    fn chromium() -> Browser {
        Browser { id: "c".into(), name: "Comet".into(), kind: Kind::Chromium, program: PathBuf::from("/x/comet") }
    }

    #[test]
    fn firefox_points_to_the_store() {
        let g = guide(&firefox(), "");
        assert_eq!(g.link.as_deref(), Some("https://addons.mozilla.org/en-US/firefox/addon/atlas-translation/"));
        assert!(!g.needs_folder);
    }

    #[test]
    fn chromium_steps_name_the_folder() {
        let g = guide(&chromium(), "C:\\Atlas Translation");
        assert!(g.steps.iter().any(|s| s.contains("C:\\Atlas Translation")));
        assert!(g.steps.iter().any(|s| s.contains("Load unpacked")));
        assert!(g.steps.iter().any(|s| s.contains("chrome://extensions")));
        assert!(g.link.is_none());
    }

    #[test]
    fn chromium_without_a_folder_asks_for_the_update_first() {
        let g = guide(&chromium(), "");
        assert!(g.needs_folder);
        assert!(g.steps.iter().any(|s| s.contains("Install the update first")));
    }

    #[test]
    fn classify_by_name_and_engine() {
        assert_eq!(classify("Firefox", Path::new("/nope/firefox")), Some(Kind::Firefox));
        assert_eq!(classify("LibreWolf", Path::new("/nope/librewolf")), Some(Kind::Firefox));
        assert_eq!(classify("Brave", Path::new("/nope/brave")), Some(Kind::Chromium));
        assert_eq!(classify("Internet Explorer", Path::new("/nope/iexplore")), None);
        assert_eq!(classify("IEXPLORE.EXE", Path::new("C:/Program Files/Internet Explorer/iexplore.exe")), None);
        assert_eq!(classify("Safari", Path::new("/nope/Safari.app")), None);
    }

    #[test]
    fn windows_command_lines() {
        assert_eq!(
            parse_windows_command("\"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\" --single-argument %1"),
            Some(PathBuf::from("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"))
        );
        assert_eq!(parse_windows_command("C:\\Tools\\brave.exe %1"), Some(PathBuf::from("C:\\Tools\\brave.exe")));
        assert_eq!(parse_windows_command("no program here"), None);
    }

    // Desktop entries are read on Linux. Their program paths are Unix paths, which Windows does not see as absolute.
    #[cfg(unix)]
    #[test]
    fn desktop_entries_that_handle_the_web() {
        let browser = "[Desktop Entry]\nName=Chromium\nExec=/usr/bin/chromium %U\nMimeType=text/html;x-scheme-handler/http;\n";
        assert_eq!(parse_desktop(browser), Some(("Chromium".to_string(), PathBuf::from("/usr/bin/chromium"))));
        let editor = "[Desktop Entry]\nName=Editor\nExec=/usr/bin/editor %F\nMimeType=text/plain;\n";
        assert_eq!(parse_desktop(editor), None);
        let hidden = "[Desktop Entry]\nName=Old\nExec=/usr/bin/old\nMimeType=x-scheme-handler/http;\nNoDisplay=true\n";
        assert_eq!(parse_desktop(hidden), None);
    }
}
