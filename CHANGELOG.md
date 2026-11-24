# Changelog

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
