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
- Text recognition (OCR) models, PP-OCRv4 detector and recogniser (Chinese and English), from PaddleOCR (PaddlePaddle
  Authors, Apache-2.0), packaged as ONNX by RapidOCR (RapidAI, Apache-2.0; `rapidocr_onnxruntime` 1.4.4 on PyPI). The
  helper downloads that wheel, checks its SHA-256 and takes the two model files out of it. The character list is read
  from the model's metadata. The RapidOCR and PaddleOCR licences apply; the wheel's direction classifier is not used.
- Read-aloud voices (the helper's list is `tools/atlas-updater/src/voices.json`; the helper downloads them from the
  k2-fsa sherpa-onnx release, `tts-models`, and checks each SHA-256):
  - Supertonic 3, Supertone Inc.: model under the BigScience Open RAIL-M licence, with use restrictions the user accepts
    before the download. Sample code MIT.
  - Kokoro v1.1 (English and Chinese), hexgrad: Apache-2.0.
  - Piper voices, from the rhasspy/piper-voices model cards: John (US, public domain, LibriVox recordings), Joe (US,
    CC0), Sam (US, Apache-2.0), Cori (UK, CC BY 4.0, from the Hi-Fi Multi-Speaker English TTS dataset, NVIDIA, and the
    LibriVox reader Cori Samuel). Attribution for Cori: "Cori Samuel, LibriVox; Hi-Fi TTS, NVIDIA, CC BY 4.0".
  - Kitten nano 0.2 (English), KittenML: Apache-2.0, as declared on the Hugging Face model card
    (`license: apache-2.0`). Code: KittenML/KittenTTS, Apache-2.0.
  - Phoneme data (`espeak-ng-data/`): the sherpa-onnx Piper and Kokoro archives contain it. It comes from espeak-ng,
    licensed GPL-3.0 (full text in [LICENSES/GPL-3.0.txt](LICENSES/GPL-3.0.txt)). The helper downloads the archives
    unchanged from k2-fsa and does not modify the data. The source of espeak-ng is at
    <https://github.com/espeak-ng/espeak-ng>. Kitten nano's archive has not been checked for this data yet.
  - The Piper voices come from the same sherpa-onnx release as the other voices, so the runtime and the checksums come
    from one place. The espeak-ng data is the same whichever source is used.
  - All licence texts used by these parts are in [LICENSES/](LICENSES/README.md).

- pdf.js 4.10.38 (Apache License 2.0, Mozilla). In `lib/pdfjs/`: the minified library, its worker and the CJK
  character maps, unchanged. It reads the text of PDF files for the Translator page. The licence text is in
  `lib/pdfjs/LICENSE`.
