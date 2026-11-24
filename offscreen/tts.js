"use strict";

// Runs inside the offscreen document (Chromium MV3). The service worker has no Audio API,
// so it sends the playback commands here.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "twp-tts-play") {
    twpAudioPlayer.play(message.urls, message.rate).finally(() => sendResponse(true));
    return true;
  }
  if (message.action === "twp-tts-stop") {
    twpAudioPlayer.stop();
  } else if (message.action === "twp-tts-rate") {
    twpAudioPlayer.setRate(message.rate);
  }
  return false;
});
