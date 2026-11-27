"use strict";

// Starts the Atlas Helper when the browser starts. The helper's own setting decides whether it really starts: the
// Settings window and the Options page (Services, Offline) both change that setting (lib/helperPort.js). This runs only
// when this browser is connected to the helper (a binding token is saved), so nothing is sent to a helper that was
// never installed here.
(function () {
  function startHelper() {
    twpConfig.onReady().then(() => {
      if (!String(twpConfig.get("offlineHelperToken") || "").trim()) return;
      self.twpHelperPort.sendToHelper({ action: "start" }).catch(() => {
        // The helper is not installed or the browser refused the host. Nothing else to do.
      });
    });
  }

  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(startHelper);
})();
