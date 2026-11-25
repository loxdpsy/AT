// atlas-updater: installs the newest Atlas Translation release into an unpacked copy of the extension.
//
// Chromium and Edge never update an unpacked copy (one loaded from the GitHub zip) by themselves. This tool does
// the work the browser cannot: it downloads the newest chromium zip from GitHub, checks it against GitHub's SHA-256,
// and copies it over the folder you point it at. Then you click "Reload extension" in the Updates section of Settings.
//
// Usage:
//   atlas-updater                 open the helper window (the browser picker, updates and install)
//   atlas-updater --serve         start the helper window without opening a browser
//   atlas-updater [--check] <folder>
//     <folder>  the folder with manifest.json of the unpacked Atlas Translation
//     --check   only report whether a newer release exists
//
// It stores nothing and sends nothing except the request to api.github.com and the zip download from github.com.

mod api;
mod browsers;
mod engine;
mod json;
mod packs;
mod sha256;
mod store;
mod web;

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

// The release the helper installs from. While Atlas Translation publishes prereleases, that is the newest one in the list
// that is not a draft (GitHub lists releases newest first). /releases/latest skips prereleases, so it is used only when
// INCLUDE_PRERELEASES is false. Set it to false at launch, when the releases are no longer prereleases.
const RELEASES_API: &str = "https://api.github.com/repos/loxdpsy/AT/releases?per_page=10";
const LATEST_RELEASE_API: &str = "https://api.github.com/repos/loxdpsy/AT/releases/latest";
const INCLUDE_PRERELEASES: bool = true;
const EXTENSION_NAME: &str = "Atlas Translation";

struct Release {
    version: String,
    zip_name: String,
    zip_url: String,
    sha256_hex: String,
}

fn main() {
    if let Err(message) = run() {
        eprintln!("Error: {}", message);
        std::process::exit(1);
    }
}

fn usage() -> String {
    "Usage: atlas-updater [--serve] | atlas-updater [--check] <folder>\n  no arguments  open the helper window\n  --serve       start the helper window without opening a browser\n  <folder>      the folder with manifest.json of the unpacked Atlas Translation\n  --check       only report whether a newer release exists".to_string()
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        // Started by a double click: the helper window opens in the browser.
        return web::serve(true);
    }
    if args.iter().any(|a| a.as_str() == "--serve") {
        return web::serve(false);
    }
    let check_only = args.iter().any(|a| a.as_str() == "--check");
    let folder_args: Vec<&String> = args.iter().filter(|a| a.as_str() != "--check").collect();
    if folder_args.len() != 1 {
        return Err(usage());
    }
    let folder = PathBuf::from(folder_args[0]);

    let installed = read_installed_version(&folder)?;
    println!("Installed: {} {} in {}", EXTENSION_NAME, installed, folder.display());

    let release = fetch_latest_release()?;
    if !is_newer(&release.version, &installed) {
        println!("You have the latest version ({}). Nothing to install.", installed);
        return Ok(());
    }
    println!("Newer version available: {} (installed {}).", release.version, installed);
    if check_only {
        println!("Run without --check to install it.");
        return Ok(());
    }

    install(&folder, &release)?;
    println!("Installed {} in {}.", release.version, folder.display());
    println!("Next: open Atlas Translation's Settings in your browser, and click \"Reload extension\" in the Updates section.");
    Ok(())
}

/// The version from manifest.json, after checking that the folder is really Atlas Translation.
fn read_installed_version(folder: &Path) -> Result<String, String> {
    let manifest_path = folder.join("manifest.json");
    let text = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("cannot read {}: {}. Give the folder that holds manifest.json.", manifest_path.display(), e))?;
    let manifest = json::parse(&text).map_err(|e| format!("{} is not valid JSON: {}", manifest_path.display(), e))?;
    let name = manifest.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if name != EXTENSION_NAME {
        return Err(format!(
            "{} is not the Atlas Translation folder (its manifest name is \"{}\"). Nothing was changed.",
            folder.display(),
            name
        ));
    }
    manifest
        .get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "manifest.json has no version".to_string())
}

/// The release that the helper installs from, as GitHub's JSON. See INCLUDE_PRERELEASES.
fn newest_release_json() -> Result<json::Value, String> {
    if !INCLUDE_PRERELEASES {
        let body = curl_text(LATEST_RELEASE_API)?;
        return json::parse(&body).map_err(|e| format!("GitHub sent an unexpected answer: {}", e));
    }
    let body = curl_text(RELEASES_API)?;
    let list = json::parse(&body).map_err(|e| format!("GitHub sent an unexpected answer: {}", e))?;
    let releases = list.as_array().ok_or("GitHub sent an unexpected answer: no release list")?;
    releases
        .iter()
        .find(|r| !matches!(r.get("draft"), Some(json::Value::Bool(true))))
        .cloned()
        .ok_or_else(|| "no release has been published yet".to_string())
}

fn fetch_latest_release() -> Result<Release, String> {
    let release = newest_release_json()?;

    let tag = release
        .get("tag_name")
        .and_then(|v| v.as_str())
        .ok_or("the latest release has no tag_name")?;
    let version = tag.trim_start_matches(|c: char| c == 'v' || c == 'V').to_string();
    let zip_name = format!("atlas-translation-{}-chromium.zip", version);

    let assets = release
        .get("assets")
        .and_then(|v| v.as_array())
        .ok_or("the latest release has no assets")?;
    let asset = assets
        .iter()
        .find(|a| a.get("name").and_then(|v| v.as_str()) == Some(zip_name.as_str()))
        .ok_or_else(|| format!("release {} has no {}", version, zip_name))?;

    let zip_url = asset
        .get("browser_download_url")
        .and_then(|v| v.as_str())
        .ok_or("the zip has no download link")?
        .to_string();
    let digest = asset
        .get("digest")
        .and_then(|v| v.as_str())
        .ok_or("GitHub gives no SHA-256 for the zip, so it will not be installed")?;
    let sha256_hex = digest
        .strip_prefix("sha256:")
        .ok_or("the zip checksum is not SHA-256, so it will not be installed")?
        .to_lowercase();

    Ok(Release { version, zip_name, zip_url, sha256_hex })
}

/// True when version a is newer than version b. Compares the numeric parts, so 0.0.2.10 is newer than 0.0.2.9.
fn is_newer(a: &str, b: &str) -> bool {
    let x = version_parts(a);
    let y = version_parts(b);
    for i in 0..x.len().max(y.len()) {
        let p = x.get(i).copied().unwrap_or(0);
        let q = y.get(i).copied().unwrap_or(0);
        if p != q {
            return p > q;
        }
    }
    false
}

fn version_parts(v: &str) -> Vec<u64> {
    v.trim_start_matches(|c: char| c == 'v' || c == 'V')
        .split('.')
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

fn install(folder: &Path, release: &Release) -> Result<(), String> {
    let work = std::env::temp_dir().join(format!("atlas-updater-{}", std::process::id()));
    let _ = fs::remove_dir_all(&work);
    fs::create_dir_all(&work).map_err(|e| format!("cannot create {}: {}", work.display(), e))?;
    let result = install_from(folder, release, &work);
    // Remove the download and the unpacked files whether or not the install worked.
    let _ = fs::remove_dir_all(&work);
    result
}

fn install_from(folder: &Path, release: &Release, work: &Path) -> Result<(), String> {
    let zip_path = work.join(&release.zip_name);
    let unpacked = work.join("unpacked");

    println!("Downloading {} ...", release.zip_name);
    download(&release.zip_url, &zip_path)?;

    let bytes = fs::read(&zip_path).map_err(|e| format!("cannot read the download: {}", e))?;
    if sha256::hex(&bytes) != release.sha256_hex {
        return Err("the download does not match GitHub's SHA-256. Nothing was changed. Try again later.".to_string());
    }
    println!("Checksum OK.");

    extract(&zip_path, &unpacked)?;
    let unpacked_version = read_installed_version(&unpacked)?;
    if unpacked_version != release.version {
        return Err(format!(
            "the zip holds version {}, but the release is {}. Nothing was changed.",
            unpacked_version, release.version
        ));
    }

    copy_tree(&unpacked, folder)
}

/// Downloads with curl, which ships with Windows 10 and later, macOS and most Linux systems.
fn download(url: &str, dest: &Path) -> Result<(), String> {
    let status = Command::new("curl")
        .args(["-fsSL", "--retry", "3", "--retry-delay", "5", "--max-time", "300", "-o"])
        .arg(dest)
        .arg(url)
        .status()
        .map_err(|e| format!("cannot run curl ({}). Install curl, then try again.", e))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("the download failed ({}). Check your internet connection.", url))
    }
}

fn curl_text(url: &str) -> Result<String, String> {
    let output = Command::new("curl")
        .args([
            "-fsSL",
            "--retry",
            "3",
            "--retry-delay",
            "5",
            "--max-time",
            "60",
            "-H",
            "Accept: application/vnd.github+json",
            "-H",
            "User-Agent: atlas-updater",
            url,
        ])
        .output()
        .map_err(|e| format!("cannot run curl ({}). Install curl, then try again.", e))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!("could not reach GitHub. {}", detail));
    }
    String::from_utf8(output.stdout).map_err(|_| "GitHub sent text that is not UTF-8".to_string())
}

/// Unzips with PowerShell on Windows and with unzip on macOS and Linux.
fn extract(zip: &Path, dest: &Path) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("cannot create {}: {}", dest.display(), e))?;
    let status = if cfg!(windows) {
        let script = format!(
            "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
            zip.display().to_string().replace('\'', "''"),
            dest.display().to_string().replace('\'', "''")
        );
        Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script.as_str()])
            .status()
    } else {
        Command::new("unzip").arg("-q").arg("-o").arg(zip).arg("-d").arg(dest).status()
    };
    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(_) => Err("could not unzip the download".to_string()),
        Err(e) => Err(format!(
            "cannot unzip the download ({}). On Linux, install the unzip package, then try again.",
            e
        )),
    }
}

/// Copies every file from one folder tree into another, replacing files with the same name. Nothing is deleted.
fn copy_tree(from: &Path, to: &Path) -> Result<(), String> {
    let entries = fs::read_dir(from).map_err(|e| format!("cannot read {}: {}", from.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("cannot read {}: {}", from.display(), e))?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        let kind = entry.file_type().map_err(|e| format!("cannot read {}: {}", src.display(), e))?;
        if kind.is_dir() {
            fs::create_dir_all(&dst).map_err(|e| format!("cannot create {}: {}", dst.display(), e))?;
            copy_tree(&src, &dst)?;
        } else if kind.is_file() {
            fs::copy(&src, &dst).map_err(|e| format!("cannot write {}: {} (is the browser or another program using it?)", dst.display(), e))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions_numerically() {
        assert!(is_newer("0.0.2.1", "0.0.2.0"));
        assert!(is_newer("0.0.2.10", "0.0.2.9"));
        assert!(is_newer("v0.1.0.0", "0.0.9.9"));
        assert!(!is_newer("0.0.2.0", "0.0.2.0"));
        assert!(!is_newer("0.0.2.0", "0.0.2.1"));
    }

    #[test]
    fn version_parts_ignores_a_v_prefix() {
        assert_eq!(version_parts("v0.0.2.1"), vec![0, 0, 2, 1]);
    }
}
