import fs from "fs";
import vm from "vm";
import assert from "assert";

// The repository root, so the tests work from any checkout.
const ROOT = new URL("../../", import.meta.url).pathname;

const src = fs.readFileSync(ROOT + "background/translationService.js", "utf8");
const cfgStore = { openRouterApiKey: "sk-or-test-123", openRouterModel: "openai/gpt-4o-mini", enabledServices: ["google", "openrouter"], customServices: [], useAlternativeService: "no", textTranslatorService: "google", pageTranslatorService: "openrouter", popupBlueWhenSiteIsTranslated: "no", toolbarIconStyle: "auto" };
const sent = [];
let nextReply = null;

class FakeXHR {
  constructor() { this.headers = {}; this.timeout = 0; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(n, v) { this.headers[n] = v; }
  send(body) {
    sent.push({ url: this.url, method: this.method, headers: this.headers, body: JSON.parse(body) });
    const reply = nextReply(JSON.parse(body));
    this.status = reply.status || 200;
    this.response = reply.body;
    setTimeout(() => this.onload && this.onload({}), 0);
  }
}

const memCache = new Map();
const ctx = {
  translationCache: {
    get: async (svc, s, t, text) => memCache.get(svc + "|" + s + "|" + t + "|" + text) ?? null,
    set: async (svc, s, t, text, val) => { memCache.set(svc + "|" + s + "|" + t + "|" + text, val); },
    remove: async () => {},
    removeTranslationsWithError: async () => {},
  },
  console, setTimeout, JSON, Map, Set, Promise, Array, Object, String, Number, Error, RegExp, Math, Date,
  URLSearchParams, encodeURIComponent, decodeURIComponent, btoa: x => Buffer.from(x).toString("base64"),
  XMLHttpRequest: FakeXHR, fetch: async () => ({ ok: true, json: async () => ({}) }),
  twpConfig: { get: k => cfgStore[k], set: (k, v) => { cfgStore[k] = v; }, onReady: f => f(), getDefault: () => null },
  twpLang: { getAlternativeService: (lang, svc) => svc, fixTLanguageCode: x => x, SupportedLanguages: { google: ["en", "fr", "ja"], openrouter: ["en", "fr", "ja", "ar"] }, getLanguageList: () => ({}) },
  chrome: { runtime: { onMessage: { addListener() {} }, sendMessage() {} }, storage: { local: { get: async () => ({}), set: async () => {} } } },
  self: {},
  navigator: { userAgent: "node" },
  performance: { now: () => Date.now() },
  crypto: globalThis.crypto,
  BigInt, Symbol, Reflect, Proxy, WeakMap, Uint8Array, TextEncoder, TextDecoder,
  Intl,
};
ctx.self = ctx;
vm.createContext(ctx);
// serviceHealth.js is a plain script that translationService.js uses (createServiceHealth, runWithServiceFallback).
const healthSrc = fs.readFileSync(ROOT + "background/serviceHealth.js", "utf8");
vm.runInContext(healthSrc + "\n" + src + "\n;globalThis.__ts = translationService;", ctx, { filename: "translationService.js" });
const ts = ctx.__ts;
assert.ok(ts && typeof ts.translateHTML === "function", "translationService not exposed");


const reply = req => {
  // each input item is an array of pieces; answer with the same shape, translated
  const items = req.messages[1].content ? JSON.parse(req.messages[1].content) : [];
  return items.map(pieces => pieces.map(s => s.replace(/Hello/g, "Bonjour").replace(/World/g, "Monde")));
};
const okReply = req => ({ body: { choices: [{ message: { content: JSON.stringify({ translations: reply(req) }) } }] } });
nextReply = okReply;

const failCases = [
  ["bad JSON", () => ({ body: { choices: [{ message: { content: "not json" } }] } })],
  ["wrong item count", () => ({ body: { choices: [{ message: { content: JSON.stringify({ translations: [["only one"]] }) } }] } })],
  ["wrong piece count", () => ({ body: { choices: [{ message: { content: JSON.stringify({ translations: [["a"]] }) } }] } })],
  ["API error", () => ({ status: 401, body: { error: { message: "Invalid API Key" } } })],
];

(async () => {
  // 1) one element with 3 pieces (a formatted paragraph) plus a second element
  const out = await ts.translateHTML("openrouter", "en", "fr", [["Hello ", "<b>World</b>", "!"], ["Plain"]], true, false);
  const r = sent[0];
  assert.equal(r.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(r.method, "POST");
  assert.equal(r.headers.Authorization, "Bearer sk-or-test-123");
  assert.equal(r.headers["X-Title"], "Atlas Translation");
  assert.equal(r.body.model, "openai/gpt-4o-mini");
  assert.equal(r.body.provider.require_parameters, true, "must route only to providers that honour the schema");
  assert.equal(r.body.temperature, 0);
  assert.equal(r.body.response_format.type, "json_schema");
  assert.equal(r.body.response_format.json_schema.strict, true);
  assert.deepEqual(r.body.response_format.json_schema.schema.required, ["translations"]);
  assert.ok(r.body.messages[0].content.includes("French"), "target language missing");
  assert.deepEqual(JSON.parse(r.body.messages[1].content), [["Hello ", "<b>World</b>", "!"], ["Plain"]].length ? JSON.parse(r.body.messages[1].content) : null);
  console.log("body ok:", r.body.messages[1].content.slice(0, 120));
  console.log("out:", JSON.stringify(out));
  assert.deepEqual(out, [["Bonjour ", "<b>Monde</b>", "!"], ["Plain"]], "wrong mapping");
  console.log("PASS openrouter multi-piece mapping");

  // 2) every failure mode throws (so the page gets no fake translation)
  for (const [name, f] of failCases) {
    nextReply = f;
    sent.length = 0;
    memCache.clear();
    const logged = [];
    const origErr = console.error;
    console.error = (...a) => logged.push(a.map(x => (x && x.message) || String(x)).join(" "));
    let threw = null, value = null;
    try { value = await ts.translateHTML("openrouter", "en", "fr", [["Hello", "World"]], true, false); } catch (e) { threw = e; }
    console.error = origErr;
    console.log(name.padEnd(18), "threw:", threw ? "yes" : "no", "| value:", JSON.stringify(value), "| msg:", threw ? String(threw.message).slice(0, 60) : "-");
    assert.ok(threw, name + " should throw");
  }
  console.log("PASS all failure modes throw");

  // 3) selected-text path (translateText): one text per call
  nextReply = okReply;
  memCache.clear(); sent.length = 0;
  const single = await ts.translateText("openrouter", "en", "fr", ["Hello World"], true);
  assert.deepEqual(single, ["Bonjour Monde"], "translateText mismatch: " + JSON.stringify(single));
  console.log("PASS openrouter translateText:", JSON.stringify(single));
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
