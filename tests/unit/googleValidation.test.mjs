// Tests Google result validation (#1078, part 5). Loads the real lib/languages.js, background/serviceHealth.js and
// background/translationService.js into one sandbox. Google's XMLHttpRequest is replaced by a fake that answers each
// request with the reply the test sets. The translation cache is a fake that records what is written.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const settings = { enabledServices: ["google"], customServices: [], useAlternativeService: "no", textTranslatorService: "google", pageTranslatorService: "google" };
const cacheWrites = [];
const cacheStore = new Map();
const fake = { replies: [], requests: [] };

// Each call to send() is answered with the next reply (a function of the request body) or with the last one.
class FakeXHR {
  open(method, url) { this.url = url; }
  setRequestHeader() {}
  send(body) {
    fake.requests.push(body);
    const reply = fake.replies.length > 1 ? fake.replies.shift() : fake.replies[0];
    queueMicrotask(() => {
      this.status = 200;
      this.response = reply(body);
      this.onload();
    });
  }
}

const ctx = {
  console: { log() {}, info() {}, warn() {}, error() {} },
  setTimeout, clearTimeout, AbortController, Date: { now: () => 1_000_000_000_000 }, Promise, JSON, Map, Set, Array, Error, TypeError, Object, String, Number, RegExp,
  fetch: async () => { throw new TypeError("no network in the test"); },
  XMLHttpRequest: FakeXHR,
  window: {}, navigator: {}, location: {},
  chrome: {
    i18n: { getUILanguage: () => "en", getMessage: () => "" },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { onMessage: { addListener() {} }, lastError: null },
    tabs: { sendMessage() {}, query: async () => [] },
  },
  twpConfig: {
    get: key => settings[key],
    set: (key, value) => { settings[key] = value; },
    onReady: fn => fn(),
  },
  translationCache: {
    get: async (service, from, to, text) => cacheStore.get([service, from, to, text].join("|")) || null,
    set: async (service, from, to, text, translated, detected) => {
      cacheWrites.push({ text, translated, detected });
      cacheStore.set([service, from, to, text].join("|"), { translatedText: translated, detectedLanguage: detected });
    },
    remove: async () => {},
  },
};
vm.createContext(ctx);
for (const file of ["lib/languages.js", "background/serviceHealth.js", "background/translationService.js"]) {
  vm.runInContext(fs.readFileSync(ROOT + file, "utf8"), ctx, { filename: file });
}
const svc = vm.runInContext("translationService", ctx);
const translate = (from, to, text) => svc.translateSingleText("google", from, to, text, true);

const LONG = "The quick brown fox jumps over the lazy dog while the farmer watches from the old wooden gate near the river bank.";
assert.ok(LONG.length >= 80 && LONG.split(" ").length >= 8, "the test text is long enough for the unchanged rule");

// Google's answer for one text: the <b> part is the translation, the <i> part is the original.
const single = (translated, original) => `<pre><b>${translated}</b><i>${original}</i></pre>`;

// 1. A translation that is empty for a text with words is not accepted.
fake.replies = [() => single("", "hello")];
await assert.rejects(translate("en", "fr", "hello"), "an empty translation is rejected");
assert.ok(!cacheWrites.some(w => w.text.includes("hello")), "an empty translation is not cached");

// 2. A usable translation is accepted and cached.
fake.replies = [() => single("bonjour", "hello")];
assert.strictEqual(await svc.translateSingleText("google", "en", "fr", "hello2", false), "bonjour", "a usable translation is returned");
assert.ok(cacheWrites.some(w => w.text.includes("hello2")), "a usable result is cached");

// 3. In a batch of two rows, the bad row fails alone: the good row is cached with its result.
// Each inner array is one row, so [["one"], ["two"]] is two rows in one request.
fake.replies = [() => [["<b>uno</b><i>one</i>", "en"], ["<b></b><i>two</i>", "en"]]];
cacheWrites.length = 0;
const batch = svc.translateHTML("google", "en", "es", [["one"], ["two"]], false, false);
await assert.rejects(batch, "a batch with an empty row is rejected as a whole");
assert.ok(cacheWrites.some(w => w.text.includes("one")), "the healthy row of the batch is still cached");
assert.ok(!cacheWrites.some(w => w.text.includes("two")), "the empty row of the batch is not cached");

// 4. A long text that a known foreign source language returned unchanged is not accepted.
fake.replies = [() => [[`<b>${LONG}</b><i>${LONG}</i>`, "en"]]];
await assert.rejects(translate("en", "fr", LONG), "an unchanged long text from a known foreign language is rejected");

// 5. The same unchanged text is accepted when the source language is the target, when the language is unknown, or when the text is short.
fake.replies = [() => [[`<b>${LONG}</b><i>${LONG}</i>`, "fr"]]];
assert.strictEqual(await translate("fr", "fr", LONG + " "), LONG, "a target-language result is accepted");
fake.replies = [() => [[`<b>${LONG}</b><i>${LONG}</i>`, "und"]]];
assert.strictEqual(await translate("auto", "fr", LONG + "  "), LONG, "an unknown-language result is accepted");
fake.replies = [() => [["<b>short</b><i>short</i>", "en"]]];
assert.strictEqual(await translate("en", "fr", "short"), "short", "a short unchanged text is accepted");

// 6. A cache entry that is empty is fetched again instead of being used.
cacheStore.set(["google", "en", "fr", "cached words"].join("|"), { translatedText: "<pre><b></b><i>cached words</i></pre>", detectedLanguage: "en" });
fake.requests.length = 0;
fake.replies = [() => single("mots en cache", "cached words")];
assert.strictEqual(await translate("en", "fr", "cached words"), "mots en cache", "an empty cache entry is replaced by a fresh result");
assert.ok(fake.requests.length >= 1, "the empty cache entry caused a request");

console.log("google validation checks passed");
