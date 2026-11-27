// MV3 service worker entry point for Atlas Translation (Chromium).
// lib/mv3-shims.js bridges the MV2-era APIs; the original background files follow.

importScripts("lib/mv3-shims.js");

// The original background files.
importScripts(
  "lib/polyfill.js",
  "lib/checkedLastError.js",
  "lib/stuff.js",
  "lib/languages.js",
  "lib/config.js",
  "lib/platformInfo.js",
  "lib/i18n.js",
  "background/translationCache.js",
  "background/serviceHealth.js",
  "background/translationService.js",
  "background/updateCheck.js",
  "lib/helperPort.js",
  "background/helperLaunch.js",
  "lib/audioPlayer.js",
  "background/textToSpeech.js",
  "background/background.js"
);