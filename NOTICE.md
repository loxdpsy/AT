# Notice and credits

**Atlas Translation** is a modified fork of **TWP - Translate Web Pages**.

- Original project: <https://github.com/FilipePS/Traduzir-paginas-web>
- Original author and maintainer: **FilipePS** (Filipe Pereira Silva). The original code, the translation
  engine design, and the many interface translations come from this project. Thank you.
- License: [Mozilla Public License 2.0](LICENSE). The original copyright notices are kept in the source
  files. Changes in this fork are also released under MPL-2.0.

## What this fork changes

- Google, Bing, Yandex, DeepL (official API) and LibreTranslate translation services.
- Manifest V3 for Chromium and Firefox, with a service worker and an offscreen document for audio.
- Redesigned settings page and popup.
- Donation and sponsor links removed. Brand renamed to Atlas Translation.
- Build workflows that produce Chromium (.zip and .crx) and Firefox (.zip and .xpi) packages.

Translation services are external. Their APIs and terms belong to their owners (Google, Microsoft,
Yandex, DeepL, LibreTranslate). Use your own DeepL or LibreTranslate key when you need one.

## Third-party code
- Read-aloud voices (planned, not yet in the helper). The helper's voice catalogue is `tools/atlas-updater/src/voices.json`.
  Supertonic 3 (Supertone Inc.): model under the BigScience Open RAIL-M licence with use restrictions. Sample code MIT.
  Kokoro v1.1-zh (hexgrad): Apache-2.0. Both are in the sherpa-onnx voice release (k2-fsa, Apache-2.0).
  Open question before shipping: the sherpa-onnx build may use espeak-ng (GPL-3.0) for phonemes.

- pdf.js 4.10.38 (Apache License 2.0, Mozilla). In `lib/pdfjs/`: the minified library, its worker and the CJK
  character maps, unchanged. It reads the text of PDF files for the Translator page. The licence text is in
  `lib/pdfjs/LICENSE`.
