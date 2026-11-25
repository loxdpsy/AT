"use strict";

// Update notice for Atlas Translation installed from a zip or crx file (not from a store).
// Chrome and Edge update only the copies they got from a store, so a copy loaded from the GitHub zip never updates by itself.
// Once a day this asks GitHub for the latest release. When it is newer, the popup and the About page say so and link to the zip.
// The request carries no personal data. Firefox updates itself (update_url), so nothing here runs in Firefox.

const twpUpdateCheck = (function () {
  const REPO = "loxdpsy/AT";
  const ALARM = "twpUpdateCheck";
  const STATE_KEY = "updateCheck";
  const PERIOD_MINUTES = 24 * 60;
  const RATE_LIMIT_WAIT_MS = 6 * 60 * 60 * 1000;

  function isFirefox() {
    return /Firefox\//.test(navigator.userAgent);
  }

  // "0.0.1.10" -> [0, 0, 1, 10]. Returns true when version a is newer than version b.
  function isNewer(a, b) {
    const x = String(a).replace(/^v/i, "").split(".").map(part => parseInt(part, 10) || 0);
    const y = String(b).replace(/^v/i, "").split(".").map(part => parseInt(part, 10) || 0);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const diff = (x[i] || 0) - (y[i] || 0);
      if (diff) return diff > 0;
    }
    return false;
  }

  function readState() {
    return new Promise(resolve => chrome.storage.local.get(STATE_KEY, result => resolve(result[STATE_KEY] || {})));
  }
  function writeState(state) {
    return new Promise(resolve => chrome.storage.local.set({ [STATE_KEY]: state }, resolve));
  }

  // Asks GitHub for the latest release and stores the result. Returns a status for the About page.
  // force: set by the "Check now" button. It runs even when the daily check is off or waiting after a rate limit.
  async function check(force = false) {
    if (isFirefox()) return { status: "skipped" };
    const state = await readState();
    if (state.enabled === false && !force) return { status: "disabled" };
    if (!force && state.retryAt && Date.now() < state.retryAt) return { status: "waiting" };

    let release;
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
        cache: "no-store"
      });
      if (response.status === 403 || response.status === 429) {
        await writeState({ ...state, checkedAt: Date.now(), error: "rate-limited", retryAt: Date.now() + RATE_LIMIT_WAIT_MS });
        return { status: "rate-limited" };
      }
      if (response.status === 404) {
        // No published release yet.
        await writeState({ ...state, checkedAt: Date.now(), error: "", retryAt: 0, latest: null });
        return { status: "none" };
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      release = await response.json();
    } catch (error) {
      await writeState({ ...state, checkedAt: Date.now(), error: "offline" });
      return { status: "offline" };
    }

    const version = String(release.tag_name || "").replace(/^v/i, "");
    const current = chrome.runtime.getManifest().version;
    const zip = (release.assets || []).find(asset => asset.name === `atlas-translation-${version}-chromium.zip`);
    const latest = {
      version,
      zipUrl: zip ? zip.browser_download_url : release.html_url,
      pageUrl: release.html_url
    };
    const newer = isNewer(version, current);
    await writeState({ ...state, checkedAt: Date.now(), error: "", retryAt: 0, current, latest: newer ? latest : null });
    return { status: newer ? "newer" : "current", current, latest: newer ? latest : null };
  }

  function ensureAlarm() {
    chrome.alarms.get(ALARM, alarm => {
      void chrome.runtime.lastError;
      if (!alarm) {
        chrome.alarms.create(ALARM, { delayInMinutes: 5, periodInMinutes: PERIOD_MINUTES });
      }
    });
  }

  if (!isFirefox()) {
    chrome.alarms.onAlarm.addListener(alarm => {
      if (alarm.name === ALARM) check();
    });
    chrome.runtime.onInstalled.addListener(ensureAlarm);
    chrome.runtime.onStartup.addListener(ensureAlarm);
    ensureAlarm();
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (!request || request.action !== "checkForUpdates") return false;
      check(true).then(sendResponse, () => sendResponse({ status: "offline" }));
      return true;
    });
  }

  return { check };
})();
