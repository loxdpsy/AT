"use strict";

// Starts the Atlas Helper when the browser starts, if the user turned on "Start the helper when the browser starts"
// (Options, Services, Offline). The extension connects to the helper's native messaging host (com.atlas.helper). The
// browser starts that host, the host starts the helper in the tray if it is not running, and then the host exits.
// Nothing is started unless the setting is on, and nothing opens a window.
(function () {
  const HOST_NAME = "com.atlas.helper";

  function startHelper() {
    twpConfig.onReady().then(() => {
      if (twpConfig.get("startHelperWithBrowser") !== "yes") return;
      let port;
      try {
        port = chrome.runtime.connectNative(HOST_NAME);
      } catch (e) {
        return;
      }
      port.onMessage.addListener(() => port.disconnect());
      port.onDisconnect.addListener(() => {
        // The helper is not installed or the browser refused the host. Nothing else to do; reading the error clears it.
        void chrome.runtime.lastError;
      });
      port.postMessage({ action: "start" });
    });
  }

  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(startHelper);
})();
