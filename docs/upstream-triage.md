# Upstream triage: FilipePS/Traduzir-paginas-web

Snapshot taken on 2026-11-24. Upstream had **390 open issues** and **19 open pull requests**. This fork's base is
version **9.8.1.0**, but upstream's latest release is **10.2.1.0** (2026-08-16). Upstream fixes from the 10.x releases are
therefore not in this branch yet. Porting them is the largest remaining task.

## What this branch changes for upstream issues

| Upstream issue | Status here |
| --- | --- |
| #973 Requests to Google TTS leak cookies | **Fixed.** Translation and TTS XHR requests send no cookies (`withCredentials=false`, Firefox `mozAnon`). The fetch shim uses `credentials: "omit"`. |
| #995, #1077 Yandex stopped working | **Partly.** A SID that Yandex rejects is now discarded, so the next request fetches a new one. The endpoint itself could not be tested from the build sandbox, which cannot reach Yandex. |
| #1028, #953 Chromium drops Manifest V2 | **Fixed.** The extension is Manifest V3 on Chromium and Firefox. |
| #914 Donate button does not work | **Removed.** The donation UI and the Patreon/PayPal links are gone. |
| #1058, #904 Edge store / future on Chrome and Edge | **Partly.** The Chromium build works on Edge. There is no store listing. |
| #1034 page_action replaces the bookmark star (Firefox) | **Likely fixed.** The MV3 code uses `action`, not `pageAction`. Not tested in Firefox. |
| #981 Firefox translation stops after 7 days, settings lost | **Unverified.** Persistent settings and the new background code need a real Firefox test. |
| #933 Firefox memory grows with Sidebery | **Partly.** Caches are bounded (translation cache 2,000 entries, TTS 40 clips). |

## Not addressed in this branch

- **#1040 Google 400 Bad Request (Content-Type).** It could not be reproduced here because `translate.googleapis.com` is not reachable from the sandbox.
- **#1059 All engines fail on some sites (Firefox Android).** Needs a device test.
- **#1025 Settings not persistent.** Needs a browser test.
- **#1004, #930 "Always translate this site" missing on mobile.** Not checked.
- **#946 "Always translate" checkbox in the simple popup.** Not checked.
- **#979, #992, #1060, #1061 Icon and dark-theme problems.** The icon assets need redesign.
- **#1069, #1031, #862 Image translation.** New feature.
- **#870, #907, #1029 LLM services (ChatGPT, OpenRouter).** New feature.
- **#1048 Firefox Translations (offline Bergamot) engine**, PR open upstream.

## Open upstream pull requests (not ported)

- #1078 Dynamic translation recovery, Google failures, protected identifiers
- #1075 Viewport detection for oversized elements
- #1066, #1065 X (Twitter) expanded posts and link text
- #1064 Translation exclusion actions in the selection menu
- #1063 Custom dictionary input and list updates
- #1062 Whitespace preservation during page translation
- #1048 Firefox Translations (Bergamot) offline engine
- #1047 Hotkey to toggle hover translation per tab
- #1029 OpenRouter translation service (MV3 branch)
- #1006 Option to disable page title translation
- #998 Kagi support
- #980 Revamped settings page (already redone in this fork)
- #945 DeepLX service
- #907 LLM translation feature

The next step is to port the bug-fix PRs (#1062, #1063, #1065, #1066, #1075, #1078) after the fork is rebased on 10.2.1.0.
