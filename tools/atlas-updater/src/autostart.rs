// Starts the helper when the user logs in, in the background (no window, no terminal).
//   Windows: a value in the Run key of the current user's registry.
//   macOS:   a LaunchAgent in ~/Library/LaunchAgents.
//   Linux:   a desktop entry in ~/.config/autostart (XDG autostart).
// The helper starts with --serve, which does not open a browser window.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
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

/// True when the helper starts at login.
pub fn is_enabled() -> bool {
    if cfg!(windows) {
        let mut command = Command::new("reg");
        command.args(["query", RUN_KEY, "/v", VALUE_NAME]);
        quiet(command).output().map(|o| o.status.success()).unwrap_or(false)
    } else if cfg!(target_os = "macos") {
        launch_agent_path().map(|p| p.is_file()).unwrap_or(false)
    } else {
        desktop_path().map(|p| p.is_file()).unwrap_or(false)
    }
}

/// Turns starting at login on or off.
pub fn set_enabled(on: bool) -> Result<(), String> {
    if cfg!(windows) {
        set_windows(on)
    } else if cfg!(target_os = "macos") {
        set_macos(on)
    } else {
        set_linux(on)
    }
}

fn set_windows(on: bool) -> Result<(), String> {
    let output = if on {
        let exe = program()?;
        // The value is the command line: the program, then --serve. Quotes keep a path with spaces working.
        let command_line = format!("\"{}\" --serve", exe.display());
        quiet(Command::new("reg"))
            .args(["add", RUN_KEY, "/v", VALUE_NAME, "/t", "REG_SZ", "/d", command_line.as_str(), "/f"])
            .output()
    } else {
        quiet(Command::new("reg")).args(["delete", RUN_KEY, "/v", VALUE_NAME, "/f"]).output()
    };
    let output = output.map_err(|e| format!("cannot change the Windows startup list: {}", e))?;
    if output.status.success() || (!on && !is_enabled()) {
        Ok(())
    } else {
        Err(format!("cannot change the Windows startup list: {}", String::from_utf8_lossy(&output.stderr).trim()))
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
        "[Desktop Entry]\nType=Application\nName=Atlas Translation Helper\nComment=Runs the Atlas Translation helper in the background\nExec=\"{}\" --serve\nX-GNOME-Autostart-enabled=true\nTerminal=false\n",
        exe.display()
    );
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("cannot create {}: {}", parent.display(), e))?;
    }
    fs::write(&path, entry).map_err(|e| format!("cannot write {}: {}", path.display(), e))
}
