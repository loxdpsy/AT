# loxdpsy

**Translate web pages in real time, in your browser.**

loxdpsy translates whole pages, selected text, and documents with Google, Bing, Yandex, DeepL, or LibreTranslate.
It works on Chromium-based browsers (Chrome, Edge, Brave, Opera, Vivaldi) and on Firefox.

> loxdpsy is a modified fork of **TWP - Translate Web Pages** by **[FilipePS](https://github.com/FilipePS)**.
> Huge thanks to FilipePS and every contributor of the original project. See [NOTICE.md](NOTICE.md).

---

## Features

- **Page translation** in place, with the original text shown on hover (optional).
- **Selected text** translation from the right-click menu, the popup, or a hotkey.
- **Five translation services**
  - Google Translate (default)
  - Bing Translator
  - Yandex Translate
  - DeepL (official API, your own key)
  - LibreTranslate (your own server and key)
- **Text-to-speech** for translated text (Chromium 109+ and Firefox).
- **Per-site and per-language rules**: never translate a site or language, always translate, auto-translate links.
- **Keyboard shortcuts** for toggling, showing the original, and switching services.
- **Dark mode**, a redesigned settings page, and a new popup.
- **Light on memory**: translations are cached with a bounded in-memory cache, and finished requests are released.

## Install

### Chromium (Chrome, Edge, Brave, Opera, Vivaldi)

1. Download `loxdpsy-<version>-chromium.zip` from the [Releases](../../releases) page.
2. Unzip it. Open `chrome://extensions` (or the equivalent page in your browser), turn on **Developer mode**, and click **Load unpacked**. Select the unzipped folder.

The `.crx` file in the release is the signed package for the same version. Chrome and Edge only install `.crx` files
from the Web Store or through an enterprise policy, so use the ZIP for normal sideloading.

### Firefox

1. Download `loxdpsy-<version>-firefox.xpi` (or the signed `-signed.xpi` when there is one).
2. Open `about:addons`, click the gear icon, and choose **Install Add-on From File**.

Unsigned builds are accepted only in Firefox Developer Edition, Nightly, or ESR with `xpinstall.signatures.required` set
to `false`. The release workflow signs the XPI with addons.mozilla.org when the AMO keys are configured.

## Build from source

Requirements: Node.js 22 or newer.

```bash
npm ci
npm run check          # validates manifests, JavaScript syntax, referenced files, and locales
npm run build          # Chromium (.zip, .crx) and Firefox (.zip, .xpi) in ./build
npm run build:chromium # only Chromium
npm run build:firefox  # only Firefox
```

The CRX is signed with the PEM key in the `CRX_PRIVATE_KEY` environment variable. Keep the same key for every release, so
the extension ID does not change. Without it, a new key is generated for each build.

## Release workflows

| Workflow | What it builds | Where it goes |
| --- | --- | --- |
| `.github/workflows/chromium.yml` | `loxdpsy-<version>-chromium.zip` and `.crx` | Workflow artifact, plus the tag's release |
| `.github/workflows/firefox.yml` | `loxdpsy-<version>-firefox.zip` and `.xpi`, and a signed XPI when AMO keys are set | Workflow artifact, plus the tag's release |

Both run on **Run workflow** (manual) and on any tag that starts with `v` (for example `v9.8.2.0`).

Repository secrets used by the workflows (all optional):

- `CRX_PRIVATE_KEY`: PEM private key for the `.crx` signature. Keep it secret and back it up.
- `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`: addons.mozilla.org API credentials for signing the XPI.

## Project layout

```
manifest.json            Chromium manifest (MV3, service worker)
firefox_manifest.json    Firefox manifest (MV3, background scripts)
service_worker.js        Chromium background entry point
lib/mv3-shims.js         Small shims that let the MV2-era code run on MV3
background/              Translation services, cache, text-to-speech, background logic
contentScript/           Page translation and selected-text UI
offscreen/               Offscreen audio player used by Chromium (MV3)
options/                 Settings page
popup/                   Toolbar popup
_locales/                Interface translations
scripts/                 Build and check scripts
.github/workflows/       Release builds for Chromium and Firefox
```

## Notes and limits

- Translation services are external. Google, Bing, Yandex, DeepL, and LibreTranslate have their own terms and limits. DeepL and LibreTranslate need your own key or server.
- Yandex reads a short-lived session id from a public page. If Yandex changes that page, the service stops until the code is updated.
- Text-to-speech needs an audio-capable context. Chromium uses an offscreen document (Chromium 109+). Firefox plays directly.

## License

loxdpsy is licensed under the **Mozilla Public License 2.0**. See [LICENSE](LICENSE). The original TWP project is
also MPL-2.0 and is credited in [NOTICE.md](NOTICE.md).
