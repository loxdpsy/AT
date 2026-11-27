"use strict";

chrome.tabs.query({
  active: true,
  currentWindow: true
}, tabs => {
  // A popup opened where there is no tab, or a tab with no address (chrome:// pages, for example), has no URL to check.
  const url = tabs[0] && typeof tabs[0].url === "string" ? tabs[0].url.toLowerCase() : "";
  if (url.startsWith("file:") && url.endsWith(".pdf")) {
    window.location = "popup-translate-document.html";
  }
});
chrome.runtime.sendMessage({
  action: "getTabMimeType"
}, mimeType => {
  checkedLastError();
  if (typeof mimeType === "string" && mimeType.toLowerCase() === "application/pdf") {
    window.location = "popup-translate-document.html";
  }
});
