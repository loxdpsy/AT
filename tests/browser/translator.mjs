// Browser test for the Translator page's PDF tab (translator/translator.html, translator/pdf-translate.mjs), run in a real
// Chromium with the real pdf.js from lib/pdfjs. The chrome.* APIs are stood in: the test records each message sent to the
// background, and answers "translateTextOnly" with a fake translation (T[...] around each paragraph).
// Checks: the PDF is read into paragraphs, the request uses the offline-only message (no other service), the paragraphs are
// shown, and a pair without English is refused.
// Run with: CHROME_PATH=/path/to/chromium node translator.mjs   (from tests/browser, after npm ci)
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import assert from "assert";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const chromePath = process.env.CHROME_PATH;
if (!chromePath) {
  console.error("CHROME_PATH is not set. Point it at a Chrome or Chromium binary.");
  process.exit(2);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".pdf": "application/pdf", ".svg": "image/svg+xml", ".bcmap": "application/octet-stream" };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  const file = path.join(root, urlPath);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const store = { targetLanguage: "fr", textTranslatorService: "google", pageTranslatorService: "google", enabledServices: ["google", "offline"], uiLanguage: "en" };
const stub = `(() => {
  const store = ${JSON.stringify(store)};
  window.__listeners = [];
  window.__messages = [];
  const ev = () => ({ addListener(fn) { window.__listeners.push(fn); }, removeListener() {}, hasListener() { return false; } });
  const cb = (fn, ...a) => { if (typeof fn === "function") fn(...a); };
  window.chrome = {
    runtime: {
      id: "browser-test", lastError: undefined,
      getURL: p => location.origin + (p.startsWith("/") ? p : "/" + p),
      getManifest: () => ({ version: "0.0.2.7", name: "Atlas Translation", commands: {} }),
      sendMessage: (msg, callback) => {
        window.__messages.push(msg);
        if (msg && msg.action === "translateText") {
          const result = msg.sourceArray.map(text => "T[" + text + "]");
          setTimeout(() => cb(callback, result), 0);
          return;
        }
        if (msg && msg.action === "translateTextOnly") {
          const result = msg.sourceArray.map(text => "T[" + text + "]");
          setTimeout(() => cb(callback, { results: result }), 0);
          return;
        }
        cb(callback, undefined);
      },
      onMessage: ev(), connect: () => ({ onMessage: ev(), onDisconnect: ev(), postMessage() {} }),
    },
    storage: {
      local: { get: (k, c) => cb(c, JSON.parse(JSON.stringify(store))), set: (o, c) => { Object.assign(store, o); cb(c); }, remove: (k, c) => cb(c) },
      sync: { get: (k, c) => cb(c, {}), set: (o, c) => cb(c) },
      onChanged: ev(),
    },
    i18n: { getUILanguage: () => "en-US", getAcceptLanguages: c => cb(c, ["en"]), getMessage: () => "" },
    tabs: { query: (q, c) => cb(c, []), create() {}, getCurrent: c => cb(c, undefined), remove() {} },
    extension: { isAllowedFileSchemeAccess: c => cb(c, false), inIncognitoContext: false },
    commands: { getAll: c => cb(c, []), onCommand: ev() },
    contextMenus: { create() {}, removeAll: c => cb(c), onClicked: ev() },
    permissions: { contains: (p, c) => cb(c, true), request: (p, c) => cb(c, true) },
  };
})();`;

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

async function openPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.evaluateOnNewDocument(stub);
  await page.goto(base + "/translator/translator.html", { waitUntil: "load" });
  await page.waitForFunction(() => window.__listeners.length > 0, { timeout: 10000 });
  await page.click("#tabPdf");
  return { page, errors };
}

const results = [];
async function check(name, fn) {
  const { page, errors } = await openPage();
  try {
    await fn(page);
    if (errors.length) throw new Error("page errors: " + errors.join("; "));
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  } finally {
    await page.close();
  }
}

const fixture = path.join(root, "tests/fixtures/sample-text.pdf");

await check("a PDF file is read into paragraphs and translated through the offline-only message", async page => {
  const input = await page.$("#pdfFile");
  await input.uploadFile(fixture);
  await page.select("#pdfSource", "en");
  await page.select("#pdfTarget", "fr");
  await page.click("#btnPdfTranslate");
  await page.waitForFunction(() => document.querySelectorAll("#pdfResult p").length > 0, { timeout: 30000 });
  const paragraphs = await page.$$eval("#pdfResult p", els => els.map(el => el.textContent));
  assert.deepEqual(paragraphs, [
    "T[Atlas Translation test document]",
    "T[The quick brown fox jumps over the lazy dog. It keeps going on the next line of the same paragraph.]",
    "T[A second paragraph starts after a larger gap. Hyphenated words are joined when the next line goes on in lower case.]"
  ]);
  const messages = await page.evaluate(() => window.__messages.filter(m => m && m.action && m.action.startsWith("translate")));
  assert.ok(messages.length >= 1, "a translation request was sent");
  for (const m of messages) {
    assert.strictEqual(m.action, "translateTextOnly", "only the offline-only message is used");
    assert.strictEqual(m.translationService, "offline");
    assert.strictEqual(m.sourceLanguage, "en");
    assert.strictEqual(m.targetLanguage, "fr");
  }
  const shown = await page.$eval("#pdfActions", el => !el.hidden);
  assert.ok(shown, "copy and download buttons are shown");
});

await check("a pair without English is refused before anything is sent", async page => {
  await page.evaluate(() => { window.__messages.length = 0; });
  await page.$eval("#pdfFile", () => {});
  await (await page.$("#pdfFile")).uploadFile(fixture);
  await page.select("#pdfSource", "fr");
  await page.select("#pdfTarget", "de");
  await page.click("#btnPdfTranslate");
  await page.waitForFunction(() => document.getElementById("pdfStatus").textContent.includes("English on one side"), { timeout: 5000 });
  const sent = await page.evaluate(() => window.__messages.filter(m => m && m.action === "translateTextOnly").length);
  assert.strictEqual(sent, 0);
});

await check("the text tab translates as you type, saves an item and keeps a history", async page => {
  await page.click("#tabText");
  await page.type("#input", "Good morning");
  await page.waitForFunction(() => document.getElementById("output").textContent === "T[Good morning]", { timeout: 5000 });
  await page.click("#btnSave");
  const saved = await page.$$eval("#savedList .itemSource", els => els.map(el => el.textContent));
  assert.deepEqual(saved, ["Good morning"], "the translation is saved");
  const history = await page.$$eval("#historyList .itemSource", els => els.map(el => el.textContent));
  assert.deepEqual(history, ["Good morning"], "the translation is in the history");
  // Clearing the history keeps the saved item
  await page.click("#tabHistory");
  await page.click("#btnClearHistory");
  const savedAfter = await page.$$eval("#savedList .itemSource", els => els.length);
  const historyAfter = await page.$$eval("#historyList .itemSource", els => els.length);
  assert.strictEqual(savedAfter, 1, "saved items stay after Clear history");
  // History lists every item. After Clear history, the only item left is the saved one.
  const historyKept = await page.$$eval("#historyList .itemSource", els => els.map(el => el.textContent));
  assert.strictEqual(historyAfter, 1, "unsaved items are cleared");
  assert.deepEqual(historyKept, ["Good morning"], "the saved item is the one left");
});

await browser.close();
server.close();
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `${failed} failed` : "translator page checks passed");
process.exit(failed ? 1 : 0);
