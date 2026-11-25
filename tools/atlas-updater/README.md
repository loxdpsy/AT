# atlas-updater

A small helper that installs the newest Atlas Translation release into the unpacked copy of the extension
(the copy you load with "Load unpacked" after unzipping the GitHub release).

Chrome, Edge and Brave never update an unpacked copy by themselves. This helper does the copy step:

1. Asks GitHub for the latest release.
2. If it is newer than the copy in your folder, downloads the Chromium zip.
3. Checks the zip against the SHA-256 that GitHub publishes for it. A mismatch changes nothing.
4. Copies the new files over your folder. Nothing is deleted.

Then, in the browser, open Atlas Translation's Settings and click **Reload extension** (Updates section).

## Get the program

Every release attaches the three programs to its GitHub release: `atlas-updater-windows.exe`, `atlas-updater-macos`
and `atlas-updater-linux`. Between releases, each build is an artifact of the **Updater** workflow run in GitHub Actions
(Actions tab, then the newest run), under the same names without `.exe`.

The programs are not code-signed. Windows may show a SmartScreen warning (choose **More info**, then **Run anyway**).
On macOS, run `xattr -d com.apple.quarantine ./atlas-updater-macos` once, and on Linux and macOS run `chmod +x ./atlas-updater-linux` (or `./atlas-updater-macos`).

## Use

```
atlas-updater --check "C:\path\to\atlas-translation"    # Windows: only report
atlas-updater "C:\path\to\atlas-translation"            # Windows: install
atlas-updater --check ~/atlas-translation               # macOS and Linux
```

The folder is the one that holds `manifest.json` of the unpacked extension. The program refuses any other folder.

Needs `curl` (built in on Windows 10 and later, macOS and most Linux systems). Unzipping uses PowerShell on Windows
and `unzip` on macOS and Linux (install it with your package manager if it is missing).

## Build from source

```
cd tools/atlas-updater
cargo test
cargo build --release
```

It has no dependencies, so it builds from the Rust standard library alone.
