"use strict";

// The version and name come from the installed manifest, so they always match the build.
const manifest = chrome.runtime.getManifest();
document.getElementById("appName").textContent = manifest.name;
document.getElementById("appVersion").textContent = manifest.version;
document.title = "About " + manifest.name;
