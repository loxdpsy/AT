// Browser tests for the page translator (contentScript/pageTranslator.js), run in a real Chromium.
//
// The real content scripts are loaded from the repository, in the order the manifest lists them. Only the chrome.*
// APIs are stood in: the translation request is recorded, and a fake translation (T[...] around each text) is returned.
// So the tests check what the page sends for translation and what the page shows afterwards.
//
// Run it with: npm ci && node run.mjs   (set CHROME_PATH to a Chrome or Chromium binary; CI uses the runner's Chrome)
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const chromePath = process.env.CHROME_PATH;
if (!chromePath) {
  console.error("CHROME_PATH is not set. Point it at a Chrome or Chromium binary.");
  process.exit(2);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  const file = path.join(root, urlPath === "/" ? "tests/browser/fixture.html" : urlPath);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// The stand-in for chrome.*. It runs before any page script.
const store = {
  targetLanguage: "es",
  targetLanguages: ["es"],
  pageTranslatorService: "google",
  textTranslatorService: "google",
  enabledServices: ["google"],
  translateWholeParagraphs: "no",
  translateDynamicallyCreatedContent: "no",
  uiLanguage: "en",
};
const stub = `(() => {
  const store = ${JSON.stringify(store)};
  window.__listeners = [];
  window.__translateRequests = [];
  const ev = () => ({ addListener(fn) { window.__listeners.push(fn); }, removeListener() {}, hasListener() { return false; } });
  const cb = (fn, ...a) => { if (typeof fn === "function") fn(...a); };
  window.chrome = {
    runtime: {
      id: "browser-test", lastError: undefined,
      getURL: p => location.origin + p,
      getManifest: () => ({ version: "0.0.2.5", name: "Atlas Translation", commands: {} }),
      sendMessage: (msg, callback) => {
        if (msg && msg.action === "translateHTML") {
          window.__translateRequests.push(msg.sourceArray2d);
          // Each text becomes T[text], so the test can see exactly what was sent and what was shown.
          const result = msg.sourceArray2d.map(row => row.map(text => "T[" + text.trim() + "]"));
          setTimeout(() => cb(callback, result), 0);
          return;
        }
        if (msg && msg.action === "getTabHostName") return cb(callback, "example.test");
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
    tabs: { query: (q, c) => cb(c, []), create() {}, sendMessage: (...a) => cb(a[a.length - 1]), update() {} },
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

const results = [];
async function check(name, fn) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 800 });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.evaluateOnNewDocument(stub);
  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForFunction(() => window.__listeners.length > 0, { timeout: 10000 });
  try {
    await fn(page);
    if (errors.length) throw new Error("page errors: " + errors.join("; "));
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
    console.log(`  FAIL  ${name}\n        ${e.message}`);
  } finally {
    await page.close();
  }
}

// Starts a page translation and waits until the paragraph with this id has a translation in it.
async function translateAndWait(page, id) {
  await page.evaluate(() => {
    for (const listener of window.__listeners) listener({ action: "translatePage", targetLanguage: "es" }, {}, () => {});
  });
  await page.waitForFunction(id => {
    const el = document.getElementById(id);
    return el && el.textContent.includes("T[");
  }, { timeout: 15000 }, id);
  await new Promise(resolve => setTimeout(resolve, 300));
}

const SENTENCE = "I'm starting with SDL2 and having some trouble trying to understand what an SDL_Renderer is.";

await check("#1049: the sentence around inline code is sent as one string", async page => {
  await translateAndWait(page, "code-sentence");
  const requests = await page.evaluate(() => window.__translateRequests);
  const rows = requests.flat();
  const sentence = rows.find(row => row.length === 1 && row[0].trim() === SENTENCE);
  if (!sentence) {
    throw new Error("no request row holds the whole sentence; rows sent: " + JSON.stringify(rows.filter(r => r.join("").includes("SDL"))));
  }
});

await check("#1049: the translated sentence is shown once, in one piece", async page => {
  await translateAndWait(page, "code-sentence");
  const shown = await page.evaluate(() => document.getElementById("code-sentence").textContent.trim());
  if (shown !== "T[" + SENTENCE + "]") {
    throw new Error("shown text is " + JSON.stringify(shown));
  }
});

await check("#1049: the code element stays in the page", async page => {
  await translateAndWait(page, "code-sentence");
  const count = await page.evaluate(() => document.querySelectorAll("#code-sentence code").length);
  if (count !== 1) throw new Error("expected 1 code element, found " + count);
});

await check("kbd keys: the sentence is sent as one string", async page => {
  await translateAndWait(page, "kbd-sentence");
  const shown = await page.evaluate(() => document.getElementById("kbd-sentence").textContent.trim());
  if (shown !== "T[Press Ctrl and then C to copy the selected text.]") {
    throw new Error("shown text is " + JSON.stringify(shown));
  }
});

await check("control: a paragraph without code is still translated", async page => {
  await translateAndWait(page, "plain-sentence");
  const shown = await page.evaluate(() => document.getElementById("plain-sentence").textContent.trim());
  if (shown !== "T[This paragraph has no code and is translated as before.]") {
    throw new Error("shown text is " + JSON.stringify(shown));
  }
});

await check("#1033: lines split by line breaks are all translated", async page => {
  await translateAndWait(page, "br-lines");
  await new Promise(resolve => setTimeout(resolve, 600));
  const shown = await page.evaluate(() => document.getElementById("br-lines").textContent);
  for (const line of ["Line one is here.", "Line two is here.", "Line three is here."]) {
    if (!shown.includes("T[" + line + "]")) throw new Error("not translated: " + line + "; shown: " + JSON.stringify(shown));
  }
});

await check("#922: text below the first screen is translated after scrolling", async page => {
  await page.evaluate(() => {
    for (const listener of window.__listeners) listener({ action: "translatePage", targetLanguage: "es" }, {}, () => {});
  });
  await page.evaluate(() => window.scrollTo(0, document.getElementById("below-fold").offsetTop - 50));
  await page.waitForFunction(() => document.getElementById("below-fold").textContent.includes("T["), { timeout: 15000 });
  const shown = await page.evaluate(() => document.getElementById("below-fold").textContent.trim());
  if (shown !== "T[Text far below the first screen is translated when it is reached.]") throw new Error("shown text is " + JSON.stringify(shown));
});

await check("RTL target: the page keeps its direction, and English text is not forced right to left", async page => {
  await page.evaluate(() => {
    for (const listener of window.__listeners) listener({ action: "translatePage", targetLanguage: "ar" }, {}, () => {});
  });
  await page.waitForFunction(() => document.getElementById("plain-sentence").textContent.includes("T["), { timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 300));
  const info = await page.evaluate(() => {
    const el = document.getElementById("plain-sentence");
    const style = getComputedStyle(el);
    return { root: document.documentElement.getAttribute("dir"), direction: style.direction, bidi: style.unicodeBidi };
  });
  if (info.root !== null) throw new Error("the page was flipped: dir is " + JSON.stringify(info.root));
  if (info.direction !== "ltr") throw new Error("English text was forced to " + info.direction);
  if (info.bidi !== "plaintext") throw new Error("the block does not take its direction from its text: " + info.bidi);
});

await browser.close();
server.close();
const failed = results.filter(r => !r.ok).length;
if (failed) {
  console.log(`${failed} browser test(s) failed.`);
  process.exit(1);
}
console.log(`All ${results.length} browser tests passed.`);
