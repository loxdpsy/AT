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
  vm.runInContext(block + "\n;globalThis.__api={isRightToLeftLanguage,languageNeedsAutoTranslate};", ctx);
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

// The page keeps its own direction when translated into a right-to-left language. Flipping the whole page moved
// English punctuation (the "?" of a headline) to the wrong side. Each translated block takes its direction from its text.
c = makeContext(cfg({ target: "ar" }), { htmlDir: null, computedDir: "ltr" });
assert.strictEqual(c.__api.applyPageDirection, undefined, "no whole-page flip function");
assert.strictEqual(c.attrs.dir ?? null, null, "Arabic target: the page dir attribute is not set");
const ruleMatch = src.match(/\.twp-rtl-text \{[^}]*\}/);
assert.ok(ruleMatch, "RTL block rule found");
assert.ok(/unicode-bidi: plaintext/.test(ruleMatch[0]), "block direction comes from its text");
assert.ok(!/direction: rtl/.test(ruleMatch[0]), "block is not forced to rtl");
console.log("all helper checks passed");
