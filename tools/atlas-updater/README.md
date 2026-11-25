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
or `./atlas-updater-linux` from a terminal). The helper opens its own native window (drawn with egui, not a browser page), and puts an icon in the
tray (Windows and Linux) or the menu bar (macOS). It checks GitHub for a new version, then shows:

- **Update:** shows the version you have and the newest release, and installs the update in one click.
- **Folder:** where the extension lives. A new folder (empty or missing) gets a fresh copy.
- **Which browser?** Pick Chrome, Edge, Brave, Opera, Vivaldi, Comet, Iopera or Firefox. Firefox links to the
  Firefox Add-ons page. The Chromium browsers get the steps to load the folder with *Load unpacked*.

- **Offline translation:** installs the offline engine, installs or
  removes language packs. A pack is one language pair, such as English to French, from Mozilla's translation models
  (the base models where Mozilla has them, otherwise the tiny ones). The files come from Firefox's Remote Settings. The engine is Mozilla's Bergamot engine, built by the Engine workflow and attached to each release as
  `atlas-engine-windows.exe`, `atlas-engine-macos` or `atlas-engine-linux`. See "Offline translation" below.

- **Start at login:** starts the helper in the tray when you log in, with no window. The entry is the Windows Run key,
  a LaunchAgent on macOS, or an autostart file on Linux.

The window is a native app: it opens no web page and listens on no network port. Only the offline service listens, on
`127.0.0.1:47632`, for extension pages (see "Offline translation").
Closing the window keeps the helper in the tray. Choose **Quit** in the tray menu to stop it. `--serve` starts the
helper in the tray only, with no window, and clicking the tray icon opens the window.

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
2. Install one or more language packs. Each pack is about 37 MB. A pack is downloaded from the catalogue in the
   program, checked against its SHA-256, and only then kept. A file that fails the check is removed, and nothing is
   left behind.
3. In the extension's options, under Translation services, turn on Offline (desktop helper) and choose **Bind this
   browser**. The helper window asks you to allow it (Allow or Deny). Nothing is sent until you allow it.

The engine and the packs are kept in the data folder of the helper: `%LOCALAPPDATA%\AtlasTranslation` on Windows,
`~/Library/Application Support/AtlasTranslation` on macOS, and `~/.local/share/AtlasTranslation` on Linux. Updating
the extension does not remove them.

While the helper is running, it answers translation requests on `127.0.0.1:47632`. It accepts only requests from the
extension (its origin must be `chrome-extension://` or `moz-extension://`), and only with a token. The helper gives the
token once, when you allow a bind; it keeps only a SHA-256 hash of it, in `bindings.json` in the data folder. Each
binding is listed under **Connections** in the helper window, and removing it refuses that browser from then on. A
missing pack, or a language pair the packs do not cover, makes the extension use its next enabled service.

Mozilla's packs translate between English and one other language, so a pair such as French to German is not
available offline.

## Build from source

```
cd tools/atlas-updater
cargo test
cargo build --release
```

It needs Rust 1.92 or later. The window uses `eframe` (egui, with the OpenGL backend) and the tray icon uses
`tray-icon`. The window and the tray icon use the logo in `icons/atlas-logo.png`. No web view or GTK library is needed.
