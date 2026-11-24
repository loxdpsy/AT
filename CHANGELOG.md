# Changelog

## 9.8.1.0

**Important information**

loxdpsy is a fork of **TWP - Translate Web Pages** by FilipePS. It is not the official TWP extension. The original author and
license are credited in NOTICE.md and LICENSE. The changes below are relative to the TWP 9.8.1.0 base this fork started from.

**Added**

- DeepL translation through the official DeepL API. Use your own API key in the settings. Free keys end in `:fx`.
- Chromium 109 or newer, and Firefox, both on Manifest V3.
- Update check: `npm run update:check` queries the GitHub API and respects the rate limit.
- Release workflows: Chromium ZIP and CRX, Firefox ZIP and XPI, and an automatic Firefox submission to addons.mozilla.org.

**Changed**

- Renamed to loxdpsy. The Firefox add-on ID is new, so this build installs next to the original TWP.
- Settings page redesigned, with an improved dark mode.
- Translation and text-to-speech requests send no cookies.
- Bing and Yandex translation services rewritten.
- Donation links (Patreon, PayPal, Coinpayments) and their buttons removed.
- Interface text updated in all 41 languages: donation strings removed and the name changed to loxdpsy.

**Fixed**

- Yandex: a session ID that Yandex rejects is discarded, and a new one is fetched on the next request.
- Memory: translation and audio caches have fixed limits, and the per-tab MIME type map is cleared when a tab closes.

**Known limits**

- Yandex and Bing were not checked against the live services for this release. Please report problems in the issue tracker.
- Text-to-speech on Chromium needs version 109 or newer.

## Upstream base

Base version inherited from TWP. See the upstream project for its history: https://github.com/FilipePS/Traduzir-paginas-web
