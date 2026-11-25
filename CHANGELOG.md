# Changelog

## Unreleased

Not released yet. These changes are in the branch and will appear in the next version.

### Full Release Notes

* **Added:**
  * **Groq (AI)** translator. Add your own Groq API key in *Settings → Services*, then choose Groq for pages or selected text. The key is stored in the extension and is sent only to Groq.
  * Firefox toolbar icon colour in *Settings → Style*: follow the theme, black, white, or blue. Firefox only.
  * The GitHub Firefox build is signed by addons.mozilla.org as an **unlisted** add-on when a release runs with *submit_amo* on. It is never listed publicly.
* **Changes:**
  * The toolbar popup shows every option on one page. The More and Less paging is removed. The gear icon opens Settings.
* **Fixed:**
  * Chinese pages: large blocks that cover the screen are translated (issue #922).
  * Auto-translate runs again after a site or page language change (issue #934).
  * The DeepL button appears in the show-translated panel when DeepL is enabled.
  * Page translation starts faster: cache reads run together instead of one by one.

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this work). The full comparison is added when this work is released.

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
* **Changed:**
  * The options menu is a panel above the page content, not an overlay. It closes on Escape, an outside click, or the button. Display options (selected-text button and hover translation) stay in Settings.
  * The GitHub Firefox build is unsigned and is never sent to addons.mozilla.org.
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

### Differences compared to version 0.0.1.2

- Fixed: Edge waits when an earlier submission is still in review, instead of failing.
- Fixed: Firefox never reports success for a failed upload, and names an AMO IP block in the job summary.

### Full Release Notes

* **Changed:**
  * The README version badge syncs daily with the latest release.
  * The release job stages every file that the version sync changes.
* **Fixed:**
  * Edge: waits instead of failing when an earlier submission is still in review.
  * Firefox: never reports success for a failed upload. An AMO IP block is named in the job summary.

**Full comparison:** [v0.0.1.2...v0.0.1.3](https://github.com/loxdpsy/AT/compare/v0.0.1.2...v0.0.1.3)

**Thanks** to @loxdpsy (maintainer) and arena-agent (AI coding agent, co-author on this release's commits).

## 0.0.1.2

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
* **Changed:**
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
