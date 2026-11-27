"use strict";

// Talks to the Atlas Helper through its native messaging host (com.atlas.helper). Used by the extension's background
// page (to start the helper with the browser) and by the Options page (to read and change the setting that the helper
// keeps). The host answers one JSON message and the port closes. Nothing is installed here.
(function () {
  const HOST_NAME = "com.atlas.helper";

  /** Sends one message to the helper and resolves with its answer. Rejects when the helper is not installed or does not answer. */
  function sendToHelper(message) {
    return new Promise((resolve, reject) => {
      let port;
      try {
        port = chrome.runtime.connectNative(HOST_NAME);
      } catch (e) {
        reject(e);
        return;
      }
      let answered = false;
      port.onMessage.addListener(reply => {
        answered = true;
        port.disconnect();
        resolve(reply);
      });
      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (!answered) {
          answered = true;
          reject(new Error(error && error.message ? error.message : "The helper did not answer. Is it installed and connected?"));
        }
      });
      port.postMessage(message);
    });
  }

  const api = { sendToHelper };
  if (typeof self !== "undefined") self.twpHelperPort = api;
  if (typeof window !== "undefined") window.twpHelperPort = api;
})();
