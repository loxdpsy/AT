"use strict";

// Avoid outputting the error message "Receiving end does not exist" in the Console.
function checkedLastError() {
  chrome.runtime.lastError;
}

// Sends a message to a tab from the background or a popup, and never throws. The tab may have closed while the message
// was on its way, or there may be no tab at all (an empty tab list). A callback is always passed, so Chrome does not
// turn the failure into an uncaught promise error, and the last error is read so that it is not reported as unchecked.
function twpSendToTab(tabId, message, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = undefined;
  }
  if (typeof tabId !== "number") return;
  const done = response => {
    void chrome.runtime.lastError;
    if (typeof callback === "function") callback(response);
  };
  try {
    if (options === undefined) {
      chrome.tabs.sendMessage(tabId, message, done);
    } else {
      chrome.tabs.sendMessage(tabId, message, options, done);
    }
  } catch (e) {
    // The tab is gone, or the extension was reloaded. There is nothing to do.
  }
}

// Two errors come from the browser and are not bugs in a page or a script:
// - "Extension context invalidated": the extension was reloaded or updated while this page was open. Reloading the
//   page fixes it.
// - "No tab with id": the tab closed while a message was waiting for it.
// They are not shown as uncaught errors. Other errors are left alone.
(function () {
  if (typeof self === "undefined" || typeof self.addEventListener !== "function") return;
  const expected = /Extension context invalidated|No tab with id/;
  function isExpected(value) {
    const text = value && typeof value === "object" ? value.message : value;
    return typeof text === "string" && expected.test(text);
  }
  self.addEventListener("error", event => {
    if (isExpected(event.error) || isExpected(event.message)) event.preventDefault();
  });
  self.addEventListener("unhandledrejection", event => {
    if (isExpected(event.reason)) event.preventDefault();
  });
})();
