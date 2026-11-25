# Changelog

## Unreleased

Not released yet. Changes after 0.0.2.1 will be listed here.

## 0.0.2.1

- Offline translation (desktop helper): a new service, "Offline (desktop helper)", translates on this computer with no text sent to a web service. The Atlas helper (atlas-updater) runs an offline engine built from Mozilla's Bergamot (the engine Firefox uses) and serves it to the extension on 127.0.0.1. Set it up in Options, under Translation services: open the helper, install a language pack in its window, then paste the pairing code from the helper window and choose Save and test.
- Offline translation: the helper's Offline section lists the language packs (each pack is an English pair from Mozilla's tiny models, 11 to 18 MB), installs and removes them, and installs the engine from the newest release. Each pack file is checked against its SHA-256 before it is kept, and nothing is left behind when a check fails. The packs and the engine are stored in the user's data folder, so updating the extension does not remove them.
- Offline translation: when the helper is not running, or the language pack for the pair is not installed, the next enabled service translates the text. Those cases do not count as failures, so the service is not put on cooldown for them.
- Offline translation: once it is set up, Offline is listed in the page translation and text translation choices in Options. The text-selection bubble and the text translation popup have no Offline button yet; choose it in Options.
- Restore from file: a blank pairing code in a backup keeps the code saved on this device, and Offline is turned off when no code is saved, the same as Groq and DeepL.
- Release workflow: the offline engine is built for Windows, macOS and Linux and attached to each release as atlas-engine-windows.exe, atlas-engine-macos and atlas-engine-linux. A failed engine build stops the publish job, the same as the helper.
- Restore from file works on Chrome, Edge and Firefox. On Chrome and Edge, 0.0.2.0 stopped with "browser.commands.update is not a function" after the file was chosen. Restore and Reset to defaults no longer call that function on Chromium.
- Chromium and Edge: the signed build carries its public key in the manifest, so the unpacked zip has the same extension ID as the CRX. Settings are stored per extension ID, so a copy loaded from the 0.0.2.0 zip keeps its own settings. Use Restore from file to move them.
- Restore from file: a blank Groq or DeepL key in a backup keeps the key saved on this device.
- Restore from file: Groq or DeepL is turned off when no key is saved, and the translators move to Google. A backup from 0.0.1.9 restores as it is, without its key.
- Helper window: starting atlas-updater with no arguments opens a page in your browser. It checks for a new version when it opens, installs it in one click, and shows the steps for Chrome, Edge, Brave, Opera, Vivaldi, Comet, Iopera and Firefox. Firefox links to the Firefox Add-ons page. Chromium browsers load the extension from its folder (Load unpacked), because they do not allow the helper to add it.
- Updates: a helper program, atlas-updater (tools/atlas-updater), installs the newest release into an unpacked copy of the extension. It is written in Rust and runs on Windows, macOS and Linux. Every release attaches the three programs.
- Restore from file no longer fails on Chromium when the browser has no shortcut update call. The shortcut keys are set in chrome://extensions/shortcuts there.
- Reset to defaults has the same fix.
- Updates: the Reload extension button reloads Atlas Translation from its folder after the new zip is extracted over it. Chromium cannot install a newer unpacked copy by itself.
- Options: an open settings page says once that it must be refreshed after the extension is reloaded, instead of showing many errors.
- Translation: when a service fails (Google, Bing, Yandex, DeepL, Groq or LibreTranslate), the text is translated by the next enabled service that supports the language. A service that fails three times in a row is skipped for five minutes, then tried again. Google and Bing use endpoints that are not official APIs, so this keeps pages translating when one of them breaks. Before, a failed request left the text untranslated.
- Czech: the "extension has been updated" message showed the extension name where the version belongs. It now shows the version.
- Translators: `npm run locales:check` lists the messages each language is missing, and any placeholder that differs from English. The unit tests fail if a language has a placeholder problem.
- The 36 messages added for the update check, the CAPTCHA notice, Groq and the toolbar icon style are not translated yet in any of the 40 languages. Those languages show English for them until they are translated.
- Popup: the translate icon is the brand in the header. The Atlas wordmark and the duplicate icon are removed.
- Popup: tap the service badge to switch the service that translates the page to the next enabled one. It is the same switch as the hotkey.
- Popup: one Settings button, the gear in the header. The gear at the bottom of the menu and the More options item are removed.
- Popup: the language bar works when the small label inside Original is tapped.
- Groq: the default model is now openai/gpt-oss-20b. Groq shut down llama-3.3-70b-versatile on 16 August 2026 for free and developer tiers. Settings that name a retired Groq model are switched to its replacement when they load or are restored, so older backups keep working.
- Restore from file accepts backups from older versions. Unknown keys are ignored, and the Groq model is migrated as above.
- New logo: the Atlas Translation icon (the blue and grey translate cards) replaces the old icon set in the toolbar, the extension icons, the options page, the store logo, and the README. The old swap icon and the old icon generator script are removed.
- Popup: the Atlas translate icon (the SVG, with the Atlas mark in place of the A) sits beside the service badge, and it switches to the translated version while the page is translated.
- Release workflow: a version that is already published (tag and GitHub release both exist) is reported as done and is not published again. It no longer fails.
- Popup: the DeepL and Groq marks are smaller so they fit the badge.
- Options: the Services checkboxes no longer touch the edge of the card, and each has a gap from its name.
- Translation cache: lookups answer from memory after a translation is added, concurrent lookups for the same text share one database read, and the memory copy keeps only the newest entries.

## 0.0.2.0

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.
- Groq and DeepL: the popup shows a notice while the page text is sent to that service.

### Differences compared to version 0.0.1.9

- Added: DeepL quota and Groq usage in the popup, and the official Atlas logo, which turns blue while a page is translated.
- Changed: one popup with the options list always shown. The simple interface is removed.

### Full Release Notes

* **Added:**
  * The popup header shows the official Atlas logo, and a badge with the logo of the service that translates the page: Google, Yandex, Bing, DeepL or Groq. The logo turns blue while the page is translated, the same as the toolbar icon.
  * **DeepL:** the popup shows the characters used and your plan's limit.
  * **Groq:** the popup shows the approximate tokens used, counted from the answers Groq returns while the extension runs.
* **Changes:**
  * The site and language rules, the page actions, More options and About are always shown in the popup. The gear is at the top right and at the bottom right of the list. The simple interface and its *Select popup interface style* setting are removed.
  * The service badge is a label, not a switch. Choose the service in *Settings → Services*.

**Full comparison:** [v0.0.1.9...v0.0.2.0](https://github.com/loxdpsy/AT/compare/v0.0.1.9...v0.0.2.0)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this work).

## 0.0.1.9

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.
- Groq and DeepL: the popup shows a notice while the page text is sent to that service.

### Differences compared to version 0.0.1.4

- Added: a Groq (AI) translator with your own API key, and a Firefox toolbar icon colour setting.
- Fixed: Chinese pages with large blocks (#922), and auto-translate after a site or page language change (#934).

### Full Release Notes

* **Added:**
  * **Groq (AI)** translator. Add your own Groq API key in *Settings → Services*, then choose Groq for pages or selected text. The key is stored in the extension and is sent only to Groq.
  * Firefox toolbar icon colour in *Settings → Style*: follow the theme, black, white, or blue. Firefox only.
  * The GitHub Firefox build is signed by addons.mozilla.org as an **unlisted** add-on when a release runs with *submit_amo* on. It is never listed publicly.
  * The popup shows a notice while the page service is **Groq** or **DeepL**, because the page text is sent to that service.
* **Changes:**
  * The toolbar popup shows every option on one page. The More and Less paging is removed. The gear icon opens Settings.
  * Builds and releases run the unit tests (`npm test`) first. Edge is submitted only after the checks pass. A release stops before its version commit and tag when CHANGELOG.md has no section for that version.
  * The ⋮ options menu has an icon for each row. It holds the site and language rules, the page actions, More options, and About. Display options stay in Settings.
* **Fixed:**
  * Chinese pages: large blocks that cover the screen are translated (issue #922).
  * Auto-translate runs again after a site or page language change (issue #934).
  * The DeepL button appears in the show-translated panel when DeepL is enabled.
  * Page translation starts faster: cache reads run together instead of one by one.
  * Right-to-left pages also flip for Dari (prs) and Sindhi (sd).

**Full comparison:** [v0.0.1.4...v0.0.1.9](https://github.com/loxdpsy/AT/compare/v0.0.1.4...v0.0.1.9)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this work).

## 0.0.1.4

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.
- The Yandex and captcha fixes are not yet checked against the live Yandex service.

### Differences compared to version 0.0.1.3

- Added: update notice for zip and crx installs (Chromium and Edge), and a *translate every language* setting.
- Added: a popup options menu with site, page, and app items.
- Added: a Yandex captcha dialog on the page, instead of a new tab.
- Fixed: Yandex session id, new-tab retry for unknown languages, and the translation bar language label.

### Full Release Notes

* **Added:**
  * Popup options menu: *Never translate this site*, *Always translate this site*, *Never translate this language*, *Choose another language*, *Open in Google Translate*, *Translate PDF*, and *About*.
  * Update notice: the extension checks GitHub once a day and shows a banner when a newer release exists. Chrome and Edge do not update zip or crx installs, so this is the only notice. Firefox is skipped.
  * Setting: *Translate every language except the ones in Never translate this language* (off by default).
  * *Always translate this site* in the mobile menu.
  * Right-to-left pages: when the translation is in a right-to-left language (ar, he, fa, ur, ps, sd, ug, yi, dv, ckb), the page is flipped to right-to-left. The page returns to its original direction when translation is turned off.
  * Yandex captcha dialog: the captcha is shown on the page. *Open in a small window* and *Translate again* are the fallbacks.
* **Changes:**
  * The options menu is a panel above the page content, not an overlay. It closes on Escape, an outside click, or the button. Display options (selected-text button and hover translation) stay in Settings.
  * The GitHub Firefox build in this release is unsigned. From the next release on, it is signed by addons.mozilla.org as an unlisted add-on and is never listed publicly.
  * When no extension theme colour applies, the Firefox toolbar icon gets an outline in the opposite colour, so it stays visible on light and dark toolbars.
  * Firefox store submission reads `AMO_LISTING_READY` from a repository variable or a secret.
* **Fixed:**
  * Yandex: the session id is read with a tolerant pattern, and a warning is logged when it is not found.
  * The translation bar shows the real page language. It falls back to the page language attribute, then to Chrome's language detection. The label stays empty while unknown, and the language rows are hidden.
  * A new tab with an unknown language is checked again up to two times before it gives up.
  * An update notice for a release that is not newer than the installed version no longer shows.
  * Site items in the popup options menu are disabled on pages without a web host (chrome:// and file://).
* **Updated:**
  * Five captcha messages and the update notice text are in English only for now. Other languages fall back to English until they are translated.

**Full comparison:** [v0.0.1.3...v0.0.1.4](https://github.com/loxdpsy/AT/compare/v0.0.1.3...v0.0.1.4)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this release's commits).

## 0.0.1.3

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.

### Differences compared to version 0.0.1.2

- Fixed: Edge waits when an earlier submission is still in review, instead of failing.
- Fixed: Firefox never reports success for a failed upload, and names an AMO IP block in the job summary.

### Full Release Notes

* **Changes:**
  * The README version badge syncs daily with the latest release.
  * The release job stages every file that the version sync changes.
* **Fixed:**
  * Edge: waits instead of failing when an earlier submission is still in review.
  * Firefox: never reports success for a failed upload. An AMO IP block is named in the job summary.

**Full comparison:** [v0.0.1.2...v0.0.1.3](https://github.com/loxdpsy/AT/compare/v0.0.1.2...v0.0.1.3)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this release's commits).

## 0.0.1.2

**Important information**

- Atlas Translation is a fork of TWP - Translate Web Pages by FilipePS. It is not the official TWP extension.

### Differences compared to version 0.0.1.1

- Added: separate GitHub and store listings for Firefox, each with its own add-on ID.
- Added: the About page is translated into every locale, with a thanks line and credit links.
- Fixed: the Edge package is named on releases, and the popup menu no longer breaks AMO's review.

### Full Release Notes

* **Added:**
  * Firefox: separate GitHub and store listings, each with its own add-on ID. The GitHub and store versions are published in one release.
  * About is a section of the settings page, with the sidebar. It is translated into every locale, with a thanks line and credit links.
  * Popup options menu: a themed list instead of a native select. About opens directly.
  * Edge: the package is named on releases.
* **Changes:**
  * README: Firefox is installed from the GitHub release only.
  * AMO metadata uses only tags that AMO accepts.
* **Fixed:**
  * The popup menu check mark is built with DOM calls, because AMO flags `innerHTML`.
  * Services page layout.
  * "Extension context invalidated" errors in the selection script are stopped.
  * Edge: the upload URL is built from the Location header.

**Full comparison:** [v0.0.1.1...v0.0.1.2](https://github.com/loxdpsy/AT/compare/v0.0.1.1...v0.0.1.2)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this release's commits).

## 0.0.1.1

Firefox self-hosting. This version is the first one that can be installed outside addons.mozilla.org and update itself.

**Added**

- Firefox `update_url` pointing to `updates.json` on the latest release. Installed copies check it for newer versions.
- Each release that is signed for AMO also publishes a signed `atlas-translation-<version>-firefox-signed.xpi` and `updates.json`.

**Changed**

- A listed AMO submission sends a build without `update_url`, because AMO rejects that key on listed add-ons.

**Fixed**

- The toolbar popup's options menu is readable in light and dark mode.
- The source-language label sits inside the Original button.

## 0.0.1.0

First release of Atlas Translation. The version numbers start again at 0.0.1.0. The 9.8.x entries below are the TWP fork history.

**Added**

- Firefox self-hosting: a signed `-firefox-signed.xpi` on each release, with automatic updates from `updates.json` (see the README).
- Theme switcher: System, Light, or Dark, in *Style → Theme*. The choice applies to the settings page and the popup.
- An About page with a "More from Etherealmber" section, showing Atlas Commerce, its Android app, and its desktop app.
- Edge Add-ons automatic submission. The release workflow uploads the Chromium package and submits it when the `EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, and `EDGE_API_KEY` secrets are set.
- A README section on security and privacy: what is sent, what is stored, and why each permission is needed.
- An About page with the installed version, credits, license, and links. It is reachable from the popup's options menu and from Settings.
- `npm run version:sync -- <version>` sets the version in every file that states it, and `npm run check` fails when they differ.

**Changed**

- The settings page and the popup use Chrome's settings look (light and dark) in every browser.
- New icon: the Atlas sunburst with a translation badge (two arrows). It is easier to read at small sizes.
- The side pages (translate text, change language, improve translation, translate PDF, old popup) use the same Chrome look and theme as the popup.
- The popup has tighter spacing, hover states on each option, and lighter type.

**Fixed**

- The popup and side pages no longer inject their own hard-coded dark styles, which clashed with the theme.
- The README version badge and the package version fields are kept in step.

## 9.8.1.0

**Important information**

Atlas Translation is a fork of **TWP - Translate Web Pages** by FilipePS. It is not the official TWP extension. The official Atlas Translation listings are Firefox Add-ons, the Chrome Web Store, Microsoft Edge Add-ons, and Firefox for Android. The original author and
license are credited in NOTICE.md and LICENSE. The changes below are relative to the TWP 9.8.1.0 base this fork started from.

**Added**

- DeepL translation through the official DeepL API. Use your own API key in the settings. Free keys end in `:fx`.
- Chromium 109 or newer, and Firefox, both on Manifest V3.
- Update check: `npm run update:check` queries the GitHub API and respects the rate limit.
- Release workflows: Chromium ZIP and CRX, Firefox ZIP and XPI, and an automatic Firefox submission to addons.mozilla.org.

**Changed**

- Renamed to Atlas Translation (short name ATL), with a new icon built from the Atlas Commerce sunburst and a translation badge. The Firefox add-on ID is new, so this build installs next to the original TWP.
- Settings page and popup use the Atlas Commerce colour theme (zinc neutrals, near-black accent). The settings cards are arranged in a bento-style grid.
- Settings page redesigned, with an improved dark mode.
- Translation and text-to-speech requests send no cookies.
- Bing and Yandex translation services rewritten.
- Donation links (Patreon, PayPal, Coinpayments) and their buttons removed.
- Interface text updated in all 41 languages: donation strings removed and the name changed to Atlas Translation.

**Fixed**

- Yandex: a session ID that Yandex rejects is discarded, and a new one is fetched on the next request.
- Memory: translation and audio caches have fixed limits, and the per-tab MIME type map is cleared when a tab closes.

**Known limits**

- Yandex and Bing were not checked against the live services for this release. Please report problems in the issue tracker.
- Text-to-speech on Chromium needs version 109 or newer.

## Upstream base

Base version inherited from TWP. See the upstream project for its history: https://github.com/FilipePS/Traduzir-paginas-web

## Contributors

Thank you to everyone who built and tested Atlas Translation.

- **FilipePS** (Filipe Pereira Silva): original author and maintainer of TWP - Translate Web Pages. This fork is built on that work. See [NOTICE.md](NOTICE.md).
- **loxdpsy** and **loxdpsy-dev**: maintainers of this fork. They wrote the Atlas rename, the settings and popup design, the release workflows, and most of the changes in the notes above.
- **Haytam**: the initial commit of this repository.
- **arena-agent**: AI coding agent, co-author on many commits of this fork.
- **The translators** of TWP's interface languages. Many of the interface translations come from the original project.
- **Everyone who reported issues** on TWP and on this fork. The fixes listed above started as their reports.
