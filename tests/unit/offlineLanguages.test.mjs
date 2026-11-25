// Tests for the Offline (desktop helper) language list in lib/languages.js. It must match the language packs in
// tools/atlas-updater/src/packs.json (the catalogue the helper installs from), and offline must never be picked as the
// alternate service for another service.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;

const sandbox = { window: {}, chrome: { i18n: { getUILanguage: () => "en" } }, console };
sandbox.twpConfig = { get: key => (key === "useAlternativeService" ? "yes" : undefined) };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(ROOT + "lib/languages.js", "utf8") + "\n;this.twpLang = twpLang;", sandbox);
const twpLang = sandbox.twpLang;

const catalogue = JSON.parse(fs.readFileSync(ROOT + "tools/atlas-updater/src/packs.json", "utf8"));
assert.ok(catalogue.packs.length > 0, "the catalogue has packs");

// Norwegian Bokmal and Nynorsk have packs, but the extension has no entry for them, so they are not offered.
const packCodes = new Set();
for (const pack of catalogue.packs) {
  packCodes.add(pack.from);
  packCodes.add(pack.to);
}
const expected = [...packCodes].filter(code => code !== "nb" && code !== "nn").sort();
const offered = [...twpLang.SupportedLanguages.offline].sort();
assert.deepStrictEqual(offered, expected, "the offline list matches the packs in packs.json");

// Every pack pairs English with one other language, so a pair without English has no pack.
for (const pack of catalogue.packs) {
  assert.ok(pack.from === "en" || pack.to === "en", `${pack.pair} is not English on one side`);
  assert.strictEqual(pack.pair, pack.from + pack.to, `${pack.pair} is named from its languages`);
}

// Offline is never the alternate for another service, even when it supports the language.
assert.notStrictEqual(twpLang.getAlternativeService("fr", "deepl", false), "offline", "deepl does not fall back to offline");
assert.strictEqual(twpLang.getAlternativeService("fr", "offline", false), "offline", "offline supports fr itself");

// Offline is a page translation service.
assert.strictEqual(twpLang.getAlternativeService("fr", "offline", true), "offline", "offline translates pages");

console.log("offlineLanguages.test.mjs: all assertions passed");
