// #1047: a shortcut (Shift+Alt+H) that turns hover translation on or off for the current tab, until the page reloads.
// #842: the options page shows the shortcut the browser really has (Chromium cannot change it from the page).
import fs from "fs";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = p => fs.readFileSync(ROOT + p, "utf8");

// Both manifests declare the command with the default key and a message.
for (const file of ["manifest.json", "firefox_manifest.json"]) {
  const manifest = JSON.parse(read(file));
  const command = manifest.commands["hotkey-toggle-hover-translation"];
  assert.ok(command, `${file}: command declared`);
  assert.equal(command.suggested_key.default, "Shift+Alt+H", `${file}: default key`);
  assert.equal(command.description, "__MSG_lblToggleHoverTranslationForTab__", `${file}: description message`);
}
const en = JSON.parse(read("_locales/en/messages.json"));
assert.ok(en.lblToggleHoverTranslationForTab && en.lblToggleHoverTranslationForTab.message, "en: description message exists");
console.log("ok   manifests: Shift+Alt+H command with a translated description");

// The background sends the action to the active tab.
const background = read("background/background.js");
assert.match(background, /command === "hotkey-toggle-hover-translation"[\s\S]*?action: "toggle-hover-translation"/, "background routes the command");
console.log("ok   background routes the command to the active tab");

// The content script: an override that wins over the saved rules, used by the timer and the listener set-up.
const hover = read("contentScript/showTranslated.js");
assert.match(hover, /let hoverOverride = null;/, "override starts unset (saved rules decide)");
assert.match(hover, /return hoverOverride !== null \? hoverOverride : showTranslatedTextWhenHoveringThisSite \|\| showTranslatedTextWhenHoveringThisLang;/, "hoverIsOn prefers the override");
assert.match(hover, /if \(hoverIsOn\(\)\) \{\s*\r?\n\s*destroy\(\);/, "mouse move uses the effective state");
assert.match(hover, /setTimeout\(\(\) => \{\s*\r?\n\s*if \(hoverIsOn\(\)\) translateThisNode\(e\.target\);\s*\r?\n\s*\}, 1250\);/, "the queued request checks hover again");
assert.match(hover, /!\(hoverIsOn\(\) \|\| translateTextOverMouseWhenPressTwice\)\) \{/, "listeners follow the effective state");
assert.match(hover, /if \(request\.action !== "toggle-hover-translation"\) return;\s*\r?\n\s*hoverOverride = !hoverIsOn\(\);\s*\r?\n\s*currentNodeOverMouse = null;\s*\r?\n\s*destroy\(\);\s*\r?\n\s*updateEventListener\(\);/, "toggle reverses the state and drops queued or showing translations");
console.log("ok   content script: override, timer check, listener follow the effective state");

// Options: the shortcut field shows the browser's current shortcut on Chromium, not the saved one.
const options = read("options/options.js");
assert.match(options, /function addHotkey\(hotkeyname, description, currentShortcut\)/, "addHotkey takes the current shortcut");
assert.match(options, /input\.value = typeof browser === "undefined" \? currentShortcut \|\| "" : twpConfig\.get\("hotkeys"\)\[hotkeyname\];/, "Chromium shows the real shortcut");
assert.match(options, /addHotkey\(result\.name, result\.description, result\.shortcut\);/, "the browser's shortcut is passed in");
console.log("ok   options: Chromium shows the browser's own shortcut");
