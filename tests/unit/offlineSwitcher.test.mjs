// The Offline button in the text translation switchers: it must be in the page, hidden until Offline is enabled
// (enabledServices includes "offline"), selectable, and cleared when another service is chosen.
import fs from "fs";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = p => fs.readFileSync(ROOT + p, "utf8");

const bubbleSelection = read("contentScript/translateSelected.js");
const bubblePage = read("contentScript/showTranslated.js");
const popupText = read("popup/popup-translate-text.js");
const popupHtml = read("popup/popup-translate-text.html");

// Each switcher has an Offline item, an element lookup and a selected-state branch.
for (const [name, text] of [["translateSelected.js", bubbleSelection], ["showTranslated.js", bubblePage], ["popup-translate-text.js", popupText]]) {
  assert.match(text, /getElementById\("sOffline"\)|sOffline = document\.getElementById\("sOffline"\)/, `${name}: sOffline lookup`);
  assert.match(text, /currentTextTranslatorService = "offline";/, `${name}: click sets the service`);
  assert.match(text, /sOffline\.classList\.add\("selected"\)/, `${name}: selected state`);
  assert.match(text, /"offline"\) \{|case "offline":/, `${name}: selected state branch`);
}
assert.match(popupHtml, /id="sOffline" hidden/, "popup-translate-text.html: Offline item starts hidden");
assert.match(bubbleSelection, /<li title="Offline \(desktop helper\)" id="sOffline" hidden>/, "translateSelected.js: Offline item starts hidden");
assert.match(bubblePage, /<li title="Offline \(desktop helper\)" id="sOffline" hidden>/, "showTranslated.js: Offline item starts hidden");

// Shown only when Offline is enabled (startup and the settings listener in the selection bubble and popup).
assert.match(bubbleSelection, /enabledServices\.includes\("offline"\)\) \{\n\s+sOffline\.removeAttribute\("hidden"\);/, "translateSelected.js: shown when enabled");
assert.match(bubblePage, /enabledServicesNow\.includes\("offline"\)\) sOffline\.removeAttribute\("hidden"\)/, "showTranslated.js: shown when enabled");
assert.match(popupText, /enabledServices\.includes\("offline"\)\) \{\n\s+sOffline\.removeAttribute\("hidden"\);/, "popup-translate-text.js: shown when enabled");

// Every other switcher button also clears Offline, so only one stays selected.
for (const [name, text] of [["translateSelected.js", bubbleSelection], ["showTranslated.js", bubblePage], ["popup-translate-text.js", popupText]]) {
  const clears = (text.match(/sOffline\.classList\.remove\("selected"\);/g) || []).length;
  assert.ok(clears >= 4, `${name}: Offline is cleared by the other buttons (${clears})`);
}

console.log("offlineSwitcher.test.mjs: all assertions passed");
