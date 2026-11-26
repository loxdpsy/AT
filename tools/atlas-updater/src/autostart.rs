// Starts the helper when the user logs in, in the background (no window, no terminal).
//   Windows: a value in the Run key of the current user's registry.
//   macOS:   a LaunchAgent in ~/Library/LaunchAgents.
//   Linux:   a desktop entry in ~/.config/autostart (XDG autostart).
// The helper starts with --serve, which does not open a browser window.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
const RUN_SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const VALUE_NAME: &str = "AtlasTranslationHelper";
const LAUNCH_AGENT_LABEL: &str = "com.atlas-translation.helper";
const DESKTOP_FILE: &str = "atlas-translation-helper.desktop";

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from)
}

fn launch_agent_path() -> Option<PathBuf> {
    home_dir().map(|h| h.join("Library").join("LaunchAgents").join(format!("{}.plist", LAUNCH_AGENT_LABEL)))
}

fn desktop_path() -> Option<PathBuf> {
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| home_dir().map(|h| h.join(".config")))?;
    Some(base.join("autostart").join(DESKTOP_FILE))
}

fn program() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("cannot find the helper program: {}", e))
}

/// A command that does not open a console window on Windows. Used for the registry calls and for the engine program.
pub fn quiet(mut command: Command) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// The Run key of the current user, opened for reading or for writing.
#[cfg(windows)]
fn run_key(write: bool) -> std::io::Result<winreg::RegKey> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};
    let flags = if write { KEY_READ | KEY_WRITE } else { KEY_READ };
    winreg::RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(RUN_SUBKEY, flags)
}

/// True when the helper starts at login.
pub fn is_enabled() -> bool {
    #[cfg(windows)]
    {
        return run_key(false).and_then(|key| key.get_value::<String, _>(VALUE_NAME)).is_ok();
    }
    #[cfg(target_os = "macos")]
    {
        return launch_agent_path().map(|p| p.is_file()).unwrap_or(false);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        desktop_path().map(|p| p.is_file()).unwrap_or(false)
    }
}

/// Turns starting at login on or off.
pub fn set_enabled(on: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        return set_windows(on);
    }
    #[cfg(target_os = "macos")]
    {
        return set_macos(on);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        set_linux(on)
    }
}

#[cfg(windows)]
fn set_windows(on: bool) -> Result<(), String> {
    let fail = |e: std::io::Error| format!("cannot change the Windows startup list: {}", e);
    let key = run_key(true).map_err(fail)?;
    if on {
        // The value is the command line: the program, then --serve. Quotes keep a path with spaces working.
        let exe = program()?;
        let command_line = format!("\"{}\" --serve", exe.display());
        key.set_value(VALUE_NAME, &command_line).map_err(fail)
    } else {
        match key.delete_value(VALUE_NAME) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(fail(e)),
        }
    }
}

fn set_macos(on: bool) -> Result<(), String> {
    let path = launch_agent_path().ok_or("cannot find your home folder")?;
    if !on {
        return match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("cannot remove {}: {}", path.display(), e)),
        };
    }
    let exe = program()?;
    let plist = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n  <key>Label</key>\n  <string>{}</string>\n  <key>ProgramArguments</key>\n  <array>\n    <string>{}</string>\n    <string>--serve</string>\n  </array>\n  <key>RunAtLoad</key>\n  <true/>\n</dict>\n</plist>\n",
        LAUNCH_AGENT_LABEL,
        exe.display()
    );
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {}", parent.display(), e))?;
    }
    fs::write(&path, plist).map_err(|e| format!("cannot write {}: {}", path.display(), e))
}

fn set_linux(on: bool) -> Result<(), String> {
    let path = desktop_path().ok_or("cannot find your home folder")?;
    if !on {
        return match fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("cannot remove {}: {}", path.display(), e)),
        };
    }
    let exe = program()?;
    let entry = format!(
        "[Desktop Entry]\nType=Application\nName=Atlas Helper\nComment=Runs the Atlas Helper in the background\nExec=\"{}\" --serve\nX-GNOME-Autostart-enabled=true\nTerminal=false\n",
        exe.display()
    );
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {}", parent.display(), e))?;
    }
    fs::write(&path, entry).map_err(|e| format!("cannot write {}: {}", path.display(), e))
}
