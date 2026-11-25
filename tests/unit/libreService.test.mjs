// LibreTranslate (#278): page translation, the API key is optional, and a batch is sent one text per request.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = p => fs.readFileSync(ROOT + p, "utf8");

// Page translation: the page service list in languages.js includes libre.
assert.match(read("lib/languages.js"), /const pageTranslationServices = \["google", "bing", "yandex", "deepl", "groq", "offline", "libre"\];/, "libre is a page service");
// The popup has a logo for it, so it does not fall back to the Google logo.
assert.match(read("popup/popup.js"), /libre: \["\/icons\/icon-32\.png", "LibreTranslate", false\]/, "popup logo for libre");

// Options: the key may be empty, the URL must be http or https, and the page option appears once a server is saved.
const options = read("options/options.js");
assert.ok(!/apiKey\.length < 10/.test(options), "no minimum key length");
assert.match(options, /parsed\.protocol !== "http:" && parsed\.protocol !== "https:"/, "URL must be http or https");
assert.match(options, /option\[value="libre"\]'\)\.removeAttribute\("hidden"\);\s*\n\s*chrome\.runtime\.sendMessage\(\{\s*\n\s*action: "createLibreService"/, "option shown on save");
assert.match(options, /if \(twpConfig\.get\("customServices"\)\.find\(cs => cs\.name === "libre"\)\) \{\s*\n\s*\$\('#pageTranslatorService option\[value="libre"\]'\)/, "option shown when a server is saved");
console.log("ok   options: optional key, http(s) URL, page option");

// The service itself. Take createLibreService out of the real file and run it with a stand-in for the base Service.
const bg = read("background/translationService.js");
const start = bg.indexOf("const createLibreService = (url, apiKey) => {");
assert.ok(start > 0, "found createLibreService");
const endMarker = "}();\n  };";
const end = bg.indexOf(endMarker, start) + endMarker.length;
const source = bg.slice(start, end).replace("const createLibreService", "globalThis.createLibreService");

class FakeService {
  constructor(name, baseURL, method, cbTransform, cbParse, cbTransformResponse, cbExtra, cbBody, cbHeaders) {
    Object.assign(this, { serviceName: name, baseURL, xhrMethod: method, cbTransformRequest: cbTransform, cbParseResponse: cbParse, cbTransformResponse, cbGetExtraParameters: cbExtra, cbGetRequestBody: cbBody, cbGetExtraHeaders: cbHeaders });
    this.translationsInProgress = new Map();
  }
  // The base class gives one TranslationInfo per text, and packs several texts into one batch (up to 800 characters).
  async getRequests(sourceLanguage, targetLanguage, sourceArray2d) {
    const infos = sourceArray2d.map(arr => ({ originalText: this.cbTransformRequest(arr), requestHash: Math.random() }));
    return [[infos], infos];
  }
}
const sandbox = { Service: FakeService, URLSearchParams, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const createLibreService = sandbox.createLibreService;

(async () => {
  const noKey = createLibreService("https://lt.example.org/translate", "");
  const params = new URLSearchParams(noKey.cbGetRequestBody("en", "fr", [{ originalText: "Hello" }]));
  assert.equal(params.get("q"), "Hello");
  assert.ok(!params.has("api_key"), "no api_key when the key is empty");
  console.log("ok   service: no api_key when no key is saved");

  const withKey = createLibreService("https://lt.example.org/translate", "abc123");
  assert.equal(new URLSearchParams(withKey.cbGetRequestBody("en", "fr", [{ originalText: "Hi" }])).get("api_key"), "abc123");
  console.log("ok   service: api_key is sent when a key is saved");

  const [batches] = await noKey.getRequests("en", "fr", [["One"], ["Two"], ["Three"]]);
  assert.equal(batches.length, 3, "three texts, three requests");
  assert.ok(batches.every(r => r.length === 1), "each request holds one text");
  assert.deepEqual(batches.map(r => r[0].originalText), ["One", "Two", "Three"]);
  console.log("ok   service: a batch of page texts is sent one text per request");
})().catch(e => { console.error(e); process.exit(1); });
