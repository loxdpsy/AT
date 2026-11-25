// The site key for "never translate" and "always translate": a web page is its hostname, and a local file
// (file://) is its own address, so that "never translate" on one file does not cover every local file.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = p => fs.readFileSync(ROOT + p, "utf8");
const languagesSrc = read("lib/languages.js");
const configSrc = read("lib/config.js");

const storage = {};
const local = {
  get(keys, cb) { cb && cb(JSON.parse(JSON.stringify(storage))); },
  set(obj, cb) { Object.assign(storage, JSON.parse(JSON.stringify(obj))); cb && cb(); },
  remove(k, cb) { delete storage[k]; cb && cb(); }
};
const ctx = {
  console, Map, Set, JSON, Object, Array, String, Number, Promise, setTimeout, structuredClone, URL,
  chrome: {
    runtime: { getManifest: () => ({ version: "0.0.2.2", name: "Atlas Translation" }), reload() {} },
    storage: { local, sync: local, onChanged: { addListener() {} } },
    i18n: { getAcceptLanguages: cb => cb(["en"]) },
    tabs: {}, extension: {}
  }
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(languagesSrc, ctx);
vm.runInContext(configSrc, ctx);
const siteKeyOf = vm.runInContext("twpConfig.siteKeyOf", ctx);

const cases = [
  ["https://www.example.com/a/b?c=1#d", "www.example.com"],
  ["http://example.org/", "example.org"],
  ["file:///home/user/Documents/page.html", "file:///home/user/Documents/page.html"],
  ["file:///home/user/Documents/page.html?x=1#top", "file:///home/user/Documents/page.html"],
  ["file:///C:/Users/me/page.htm", "file:///C:/Users/me/page.htm"],
  ["chrome://settings/", ""],
  ["about:blank", ""],
  [undefined, ""],
  ["not a url", ""]
];
for (const [url, expected] of cases) {
  assert.equal(siteKeyOf(url), expected, `siteKeyOf(${url})`);
}
// Two different local files get two different keys.
assert.notEqual(siteKeyOf("file:///a/one.html"), siteKeyOf("file:///a/two.html"));
console.log("ok   siteKeyOf: web pages by hostname, local files by address, others empty");

// The background answers the content scripts with the same key, and the context menu uses it.
const background = read("background/background.js");
assert.match(background, /sendResponse\(twpConfig\.siteKeyOf\(sender\.tab\.url\)\)/, "getTabHostName uses siteKeyOf");
assert.match(background, /const siteKey = twpConfig\.siteKeyOf\(tab\.url\);\s*\n\s*if \(siteKey\) twpConfig\.addSiteToNeverTranslate\(siteKey\);/, "context menu uses siteKeyOf and skips empty keys");
assert.ok(!/new URL\(tab\.url\)\.hostname/.test(background), "no hostname-only lookup left in the background");
console.log("ok   background: content scripts and the context menu use the site key");

// The popup's menu uses the same key, so its Never translate button is enabled on local files.
const popup = read("popup/popup.js");
assert.match(popup, /function hostnameOf\(url\) \{\s*\n\s*return twpConfig\.siteKeyOf\(url\);/, "popup hostnameOf delegates to siteKeyOf");
assert.match(popup, /isOn\("neverTranslateSites", host\), host !== ""\)/, "the site buttons are enabled when there is a key");
console.log("ok   popup: the site menu uses the same key");
