# Atlas Translation

**Translate web pages in real time, in your browser.**

Atlas Translation translates whole pages, selected text, and documents with Google, Bing, Yandex, DeepL, or LibreTranslate.
It works on Chromium-based browsers (Chrome 109+, Edge, Brave, Opera, Vivaldi) and on Firefox.

> Atlas Translation is a modified fork of **TWP - Translate Web Pages** by **[FilipePS](https://github.com/FilipePS)**.
> Huge thanks to FilipePS and every contributor of the original project. See [NOTICE.md](NOTICE.md).

---

## Official listings

Atlas Translation is published in four places. Install it only from these:

| Store | Browser | Where |
| --- | --- | --- |
| Firefox Add-ons (addons.mozilla.org) | Firefox on desktop | *Atlas Translation*, once approved by Mozilla |
| Chrome Web Store | Chrome, Brave, Opera, Vivaldi | *Atlas Translation*, once published |
| Microsoft Edge Add-ons | Microsoft Edge | *Atlas Translation*, once certified |
| Firefox for Android | Firefox for Android | Same listing as Firefox Add-ons. Search for *Atlas Translation*. |

Other extensions with a similar name are not Atlas Translation. Store links will be added here once the listings are live.

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
- **Update check** script that uses the GitHub API and respects the rate limit (see *Checking for updates*).
- **Per-site and per-language rules**: never translate a site or language, always translate, auto-translate links.
- **Keyboard shortcuts** for toggling, showing the original, and switching services.
- **Dark mode**, a redesigned settings page, and a new popup.
- **Light on memory**: translations are cached with a bounded in-memory cache, and finished requests are released.

## Install

### Chromium (Chrome 109+, Edge, Brave, Opera, Vivaldi)

Chromium 109 or newer is required. Text-to-speech uses the offscreen document API, which Chromium added in version 109.

1. Download `atlas-translation-<version>-chromium.zip` from the [Releases](../../releases) page.
2. Unzip it. Open `chrome://extensions` (or the equivalent page in your browser), turn on **Developer mode**, and click **Load unpacked**. Select the unzipped folder.

The `.crx` file in the release is the signed package for the same version. Chrome and Edge only install `.crx` files
from the Web Store or through an enterprise policy, so use the ZIP for normal sideloading.

### Firefox

1. Download `atlas-translation-<version>-firefox.xpi` (or the signed `-signed.xpi` when there is one).
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

Pushing a version tag builds both packages and publishes one GitHub release. The tag must match the version in `manifest.json`
(for example `v9.8.1.0`). The release notes come from the matching section in `CHANGELOG.md`.

```bash
git tag v9.8.1.0
git push origin v9.8.1.0
```

| Workflow | What it does |
| --- | --- |
| `release.yml` | Runs on a `v*` tag. Builds both packages, submits Firefox to AMO, and publishes the GitHub release with all files. |
| `chromium.yml` | Builds the Chromium ZIP and CRX. Also runs by hand from the Actions tab. |
| `firefox.yml` | Builds the Firefox ZIP and XPI. Turn on **submit** when you run it by hand to submit to AMO. |
| `update-check.yml` | Runs weekly and writes the update check to the run summary. |

Every build writes a summary to its run page (**Actions → run → Summary**): versions, file sizes, SHA-256 checksums,
lint output, and the AMO submission log. A failed AMO submission does not stop the GitHub release.

Store uploads (Chrome Web Store, Edge Add-ons, addons.mozilla.org) are described in `docs/store-publishing.md`.

Repository secrets used by the workflows (all optional):

- `CRX_PRIVATE_KEY`: PEM private key for the `.crx` signature. Keep it secret and back it up.
- `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`: addons.mozilla.org API credentials for signing the XPI.

### Release secrets

The release workflows read these secrets. Add them in **Settings → Secrets and variables → Actions → New repository secret**
(or with the GitHub CLI, shown below). Never commit them, and never paste them into an issue or a chat.

| Secret | Needed for | Where the value comes from |
| --- | --- | --- |
| `CRX_PRIVATE_KEY` | Chromium `.crx` signing. **Required**: the Chromium workflow fails without it. | Generate it once (below). Keep a backup copy: losing it changes the extension ID for every user. |
| `AMO_JWT_ISSUER` | Signing the Firefox `.xpi` | addons.mozilla.org → **Developer Hub** → **Tools** → **Manage API Keys** (you need a Firefox Account). Use the *JWT issuer* value. |
| `AMO_JWT_SECRET` | Signing the Firefox `.xpi` | Same page: the *JWT secret* is shown once when you generate the key. |

Create the Chromium key (one time, on your own computer):

```bash
openssl genrsa -out atlas-translation-key.pem 2048
# Store it as a secret. The workflow reads the PEM text.
gh secret set CRX_PRIVATE_KEY < atlas-translation-key.pem
# Keep atlas-translation-key.pem in a password manager, then delete the local copy.
```

Store the Firefox keys the same way:

```bash
gh secret set AMO_JWT_ISSUER --body "<issuer value from AMO>"
gh secret set AMO_JWT_SECRET --body "<secret value from AMO>"
```

**Firefox auto-publish, step by step**

1. The first version has to be uploaded by hand, so AMO creates the listing: download the `atlas-translation-firefox` artifact from a *Firefox build* run, then on addons.mozilla.org choose **Submit a New Add-on** and upload `atlas-translation-<version>-firefox.xpi`. Choose **On this site** (listed), then fill in the name, summary, description, category, and license (MPL-2.0).
2. Add `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` as secrets (below).
3. From then on, pushing a tag such as `v9.8.2.0` signs the XPI with the `listed` channel and submits it to AMO. AMO's review decides when it becomes public, usually within days. Set the repository variable `AMO_CHANNEL` to `unlisted` if you want self-distribution (signed immediately, not in the store).
4. Bump the `version` in `manifest.json` (and `firefox_manifest.json`) before each tag. AMO rejects a version number that already exists.

Firefox signing also needs the add-on ID in `firefox_manifest.json` to belong to your AMO account. This fork uses its own ID, so
the first upload creates the add-on under your account. If you change the ID later, you must sign with the new one too.

### Checking for updates

`npm run update:check` queries the GitHub API for the latest release of `loxdpsy/twp` and compares it with the version in
`manifest.json`. It checks the API rate limit first (`GET /rate_limit`, which does not use up the quota) and skips the lookups when
too few requests remain. Add `--upstream` to also check FilipePS's project. Set `GITHUB_TOKEN` to raise the limit from
60 to 5,000 requests per hour. The **Update check** workflow runs this every Monday and writes the result to the run summary.

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
scripts/                 Build, check, and update-check scripts
.github/workflows/       Release builds for Chromium and Firefox, and the weekly update check
```

## Notes and limits

- Translation services are external. Google, Bing, Yandex, DeepL, and LibreTranslate have their own terms and limits. DeepL and LibreTranslate need your own key or server.
- Yandex reads a short-lived session id from a public page. If Yandex changes that page, the service stops until the code is updated.
- Text-to-speech needs an audio-capable context. Chromium uses an offscreen document (Chromium 109+). Firefox plays directly.

## License

Atlas Translation is licensed under the **Mozilla Public License 2.0**. See [LICENSE](LICENSE). The original TWP project is
also MPL-2.0 and is credited in [NOTICE.md](NOTICE.md).
