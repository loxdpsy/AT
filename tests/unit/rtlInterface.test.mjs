// Right-to-left interface (roadmap #638): the popup and options pages take their direction from the interface language.
// Web pages are never changed, because lib/i18n.js is also loaded into them.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const i18nSrc = fs.readFileSync(ROOT + "lib/i18n.js", "utf8");

function run({ protocol, uiLanguage = "default", browserLanguage = "en-US" }) {
  const documentElement = { dir: "" };
  const ctx = {
    console,
    document: { documentElement, querySelectorAll: () => [] },
    location: { protocol },
    chrome: {
      i18n: { getUILanguage: () => browserLanguage },
      runtime: { getURL: p => p }
    },
    twpConfig: {
      onReady: () => {},
      get: name => (name === "uiLanguage" ? uiLanguage : undefined),
      onChanged: () => {}
    },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    Promise
  };
  vm.createContext(ctx);
  vm.runInContext(i18nSrc, ctx);
  // updateUiMessages sets the direction before it loads the messages. The messages file is an empty object here.
  vm.runInContext("twpI18n.updateUiMessages()", ctx);
  return documentElement.dir;
}

// Extension pages: the chosen interface language decides.
assert.equal(run({ protocol: "chrome-extension:", uiLanguage: "ar" }), "rtl", "Arabic is right to left");
assert.equal(run({ protocol: "moz-extension:", uiLanguage: "fa" }), "rtl", "Persian is right to left");
assert.equal(run({ protocol: "chrome-extension:", uiLanguage: "he" }), "rtl", "Hebrew is right to left");
assert.equal(run({ protocol: "chrome-extension:", uiLanguage: "ckb" }), "rtl", "Central Kurdish is right to left");
assert.equal(run({ protocol: "chrome-extension:", uiLanguage: "pt_BR" }), "ltr", "Portuguese is left to right");
assert.equal(run({ protocol: "chrome-extension:", uiLanguage: "en" }), "ltr", "English is left to right");
console.log("ok   extension pages: direction from the interface language");

// Default: the browser's language decides.
assert.equal(run({ protocol: "chrome-extension:", uiLanguage: "default", browserLanguage: "ar-EG" }), "rtl", "default follows the browser (Arabic)");
assert.equal(run({ protocol: "chrome-extension:", uiLanguage: "default", browserLanguage: "de" }), "ltr", "default follows the browser (German)");
console.log("ok   default interface language follows the browser");

// Web pages: nothing is set, even for an Arabic interface language.
assert.equal(run({ protocol: "https:", uiLanguage: "ar" }), "", "https pages are not changed");
assert.equal(run({ protocol: "http:", uiLanguage: "ar" }), "", "http pages are not changed");
assert.equal(run({ protocol: "file:", uiLanguage: "ar" }), "", "file pages are not changed");
console.log("ok   web pages and local files are never changed");
