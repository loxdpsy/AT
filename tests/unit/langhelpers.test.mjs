import fs from "fs";
import vm from "vm";
import assert from "assert";

// The repository root, so the tests work from any checkout.
const ROOT = new URL("../../", import.meta.url).pathname;

const src = fs.readFileSync(ROOT + "contentScript/pageTranslator.js", "utf8");
const start = src.indexOf("  const rightToLeftLanguages");
const end = src.indexOf("  // Requests the detection of the tab language in the background");
assert.ok(start > 0 && end > start, "helper block not found");
const block = src.slice(start, end);

function makeContext(config, { htmlDir = null, computedDir = "ltr" } = {}) {
  const attrs = { dir: htmlDir };
  const root = {
    getAttribute: n => (n in attrs ? attrs[n] : null),
    setAttribute: (n, v) => { attrs[n] = v; },
    removeAttribute: n => { delete attrs[n]; },
  };
  const ctx = {
    twpConfig: { get: k => config[k] },
    currentTargetLanguage: config.target,
    document: { documentElement: root },
    getComputedStyle: () => ({ direction: ctx.__computed }),
    __computed: computedDir,
    attrs,
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(block + "\n;globalThis.__api={isRightToLeftLanguage,languageNeedsAutoTranslate,applyPageDirection,restorePageDirection};", ctx);
  return ctx;
}

// RTL detection
const c0 = makeContext({ target: "en" });
const { isRightToLeftLanguage } = c0.__api;
for (const l of ["ar", "ar-EG", "he", "iw", "fa", "prs", "ur", "ps", "ckb", "ug", "dv", "yi", "sd"]) assert.strictEqual(isRightToLeftLanguage(l), true, l);
for (const l of ["en", "ja", "zh-TW", "ku", "fr", "", null, undefined]) assert.strictEqual(isRightToLeftLanguage(l), false, String(l));

// Auto-translate decision
const cfg = (over) => ({ target: "en", alwaysTranslateLangs: [], neverTranslateLangs: [], translateAllLanguages: "no", ...over });
let c = makeContext(cfg({ alwaysTranslateLangs: ["fr"] }));
assert.strictEqual(c.__api.languageNeedsAutoTranslate("fr"), true, "always list");
assert.strictEqual(c.__api.languageNeedsAutoTranslate("de"), false, "not listed, all-off");
assert.strictEqual(c.__api.languageNeedsAutoTranslate("en"), false, "target language never");
assert.strictEqual(c.__api.languageNeedsAutoTranslate("und"), false, "unknown never");
c = makeContext(cfg({ translateAllLanguages: "yes" }));
assert.strictEqual(c.__api.languageNeedsAutoTranslate("de"), true, "all languages on");
assert.strictEqual(c.__api.languageNeedsAutoTranslate("en"), false, "target still excluded when all on");
c = makeContext(cfg({ translateAllLanguages: "yes", neverTranslateLangs: ["de"] }));
assert.strictEqual(c.__api.languageNeedsAutoTranslate("de"), false, "never list wins over all on");
assert.strictEqual(c.__api.languageNeedsAutoTranslate("ja"), true, "other languages still translated");

// Direction flip and restore
c = makeContext(cfg({ target: "ar" }), { computedDir: "ltr" });
c.__api.applyPageDirection("ar");
assert.strictEqual(c.attrs.dir ?? null, "rtl", "LTR page flips to rtl for Arabic");
c.__api.restorePageDirection();
assert.strictEqual(c.attrs.dir ?? null, null, "absent dir attribute is removed again");

c = makeContext(cfg({ target: "en" }), { htmlDir: "rtl", computedDir: "rtl" });
c.__api.applyPageDirection("en");
assert.strictEqual(c.attrs.dir ?? null, "ltr", "RTL page flips to ltr for English");
c.__api.restorePageDirection();
assert.strictEqual(c.attrs.dir ?? null, "rtl", "original rtl attribute is put back");

c = makeContext(cfg({ target: "fr" }), { htmlDir: "ltr", computedDir: "ltr" });
c.__api.applyPageDirection("fr");
assert.strictEqual(c.attrs.dir ?? null, "ltr", "no change when direction already matches");
c.__api.restorePageDirection();
assert.strictEqual(c.attrs.dir ?? null, "ltr", "no restore side effect when nothing changed");

c = makeContext(cfg({ target: "ar" }), { computedDir: "rtl" });
c.__api.applyPageDirection("ar");
assert.strictEqual(c.attrs.dir ?? null, null, "already rtl: nothing changed");
console.log("all helper checks passed");
