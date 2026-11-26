// Puts a version resource into the Windows program (see Cargo.toml). Windows shows it in the file's Properties.
// It does not sign the program; signing is a separate step that needs a certificate.

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    // The resource compiler is only available (and only needed) when the program is built for Windows on Windows.
    // The winresource build dependency is present only for a Windows host, so this code is compiled only there.
    #[cfg(windows)]
    windows_version_resource();
}

#[cfg(windows)]
fn windows_version_resource() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    // The package version is written as 0.0.2+5: the number after + is the build number.
    let version = std::env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "0.0.0".to_string());
    let (base, build) = match version.split_once('+') {
        Some((base, build)) => (base.to_string(), build.to_string()),
        None => (version.clone(), "0".to_string()),
    };
    let mut parts = base.split('.').map(|p| p.parse::<u64>().unwrap_or(0));
    let major = parts.next().unwrap_or(0);
    let minor = parts.next().unwrap_or(0);
    let patch = parts.next().unwrap_or(0);
    let build: u64 = build.parse().unwrap_or(0);
    let packed = (major << 48) | (minor << 32) | (patch << 16) | build;
    let dotted = format!("{}.{}.{}.{}", major, minor, patch, build);

    let mut res = winresource::WindowsResource::new();
    res.set("CompanyName", "Atlas Translation")
        .set("ProductName", "Atlas Translation Helper")
        .set("FileDescription", "Atlas Translation Helper: the window, the tray icon and the offline translation")
        .set("InternalName", "atlas-updater")
        .set("OriginalFilename", "atlas-updater.exe")
        .set("LegalCopyright", "Licensed under the Mozilla Public License 2.0")
        .set("FileVersion", &dotted)
        .set("ProductVersion", &dotted)
        .set_version_info(winresource::VersionInfo::FILEVERSION, packed)
        .set_version_info(winresource::VersionInfo::PRODUCTVERSION, packed);
    res.set_icon("assets/atlas-helper.ico");
    res.compile().expect("the Windows version information could not be written into the program");
}
