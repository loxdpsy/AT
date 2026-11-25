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

**The helper window.** Start the program with no arguments (double-click it on Windows, or run `./atlas-updater-macos`
or `./atlas-updater-linux` from a terminal). It checks GitHub for a new version, then opens a page in your default
browser:

- **Update:** shows the version you have and the newest release, and installs the update in one click.
- **Folder:** where the extension lives. A new folder (empty or missing) gets a fresh copy.
- **Which browser?** Pick Chrome, Edge, Brave, Opera, Vivaldi, Comet, Iopera or Firefox. Firefox links to the
  Firefox Add-ons page. The Chromium browsers get the steps to load the folder with *Load unpacked*.

- **Offline translation:** shows the pairing code for the extension, installs the offline engine, and installs or
  removes language packs. A pack is one language pair, such as English to French, from Mozilla's tiny translation
  models. The engine is Mozilla's Bergamot engine, built by the Engine workflow and attached to each release as
  `atlas-engine-windows.exe`, `atlas-engine-macos` or `atlas-engine-linux`. See "Offline translation" below.

The page only talks to the helper on this computer, and every action needs the token in the address the helper
prints. Close the helper's window to stop it. `--serve` starts the same page without opening a browser.

**Command line** (for scripts):

```
atlas-updater --check "C:\path\to\atlas-translation"    # Windows: only report
atlas-updater "C:\path\to\atlas-translation"            # Windows: install
atlas-updater --check ~/atlas-translation               # macOS and Linux
```

The folder is the one that holds `manifest.json` of the unpacked extension. The program refuses any other folder (the window
only makes a new folder when it is empty or missing).

Needs `curl` (built in on Windows 10 and later, macOS and most Linux systems). Unzipping uses PowerShell on Windows
and `unzip` on macOS and Linux (install it with your package manager if it is missing).

## Offline translation

The helper can translate text on this computer, so the extension does not send it to a web service. The extension
uses it as the service named **Offline (desktop helper)**.

1. Open the helper window and install the offline engine (**Install the offline engine**).
2. Install one or more language packs. Each pack is 11 to 18 MB. A pack is downloaded from the catalogue in the
   program, checked against its SHA-256, and only then kept. A file that fails the check is removed, and nothing is
   left behind.
3. In the extension's options, under Translation services, turn on Offline (desktop helper), paste the pairing code
   from the helper window, and choose **Save and test**.

The engine and the packs are kept in the data folder of the helper: `%LOCALAPPDATA%\AtlasTranslation` on Windows,
`~/Library/Application Support/AtlasTranslation` on macOS, and `~/.local/share/AtlasTranslation` on Linux. Updating
the extension does not remove them.

While the helper is running, it answers translation requests on `127.0.0.1:47632`. It accepts only requests from the
extension (its origin must be `chrome-extension://` or `moz-extension://`), and only with the pairing code. The
pairing code is created once and kept in `pairing-code.txt` in the data folder. A missing pack, or a language pair the
packs do not cover, makes the extension use its next enabled service.

Mozilla's packs translate between English and one other language, so a pair such as French to German is not
available offline.

## Build from source

```
cd tools/atlas-updater
cargo test
cargo build --release
```

It has no dependencies, so it builds from the Rust standard library alone.
