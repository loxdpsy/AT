// Tests the update notice (background/updateCheck.js). Loads the real file into a sandbox with a fake GitHub.
// Checks: prereleases are found (the newest release list, not /releases/latest), drafts are skipped, the "what is new"
// bullets come from the release notes and stop at the download list, and a rate limit is handled.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const stored = {};
const requests = [];
let answer = null; // { status, body } set by each test

const ctx = {
  console: { log() {}, info() {}, warn() {}, error() {} },
  setTimeout, clearTimeout, Date, Promise, JSON, Array, Object, String, Number, Math, Error, TypeError, RegExp,
  navigator: { userAgent: "Mozilla/5.0 Chrome/140.0 Safari/537.36" },
  fetch: async url => {
    requests.push(String(url));
    return { status: answer.status, ok: answer.status >= 200 && answer.status < 300, json: async () => answer.body };
  },
  chrome: {
    alarms: { get: (name, cb) => cb(undefined), create() {}, onAlarm: { addListener() {} } },
    runtime: {
      onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} },
      getManifest: () => ({ version: "0.0.2.5" }), lastError: null,
    },
    storage: {
      local: {
        get: (key, cb) => cb({}),
        set: (obj, cb) => { Object.assign(stored, obj); if (cb) cb(); },
      },
    },
  },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + "background/updateCheck.js", "utf8"), ctx, { filename: "background/updateCheck.js" });
const update = vm.runInContext("twpUpdateCheck", ctx);
// Arrays made inside the sandbox have another prototype, so they are copied before deepStrictEqual.
const plain = value => JSON.parse(JSON.stringify(value));

// Version comparison
assert.ok(update.isNewer("0.0.2.10", "0.0.2.9"), "0.0.2.10 is newer than 0.0.2.9");
assert.ok(update.isNewer("v0.0.2.6", "0.0.2.5"), "a leading v is ignored");
assert.ok(!update.isNewer("0.0.2.5", "0.0.2.5"), "the same version is not newer");

// Bullets: wrapped lines join the bullet; a paragraph ends the wrap; the download list is not included
assert.deepStrictEqual(
  plain(update.bulletsFrom("- First change.\n  continued here.\n* Second change.\n\nA paragraph.\n  not a continuation.\n\n## Downloads\n\n- **Chrome Web Store:** file.zip")),
  ["First change. continued here.", "Second change."],
  "bullets"
);
assert.deepStrictEqual(plain(update.bulletsFrom(null)), [], "no notes");

// A newer prerelease is found. The draft is skipped, and the zip and the notes come from the release.
answer = {
  status: 200,
  body: [
    { tag_name: "v0.0.2.6", draft: true, html_url: "draft", assets: [], body: "- Draft only." },
    {
      tag_name: "v0.0.2.6",
      draft: false,
      prerelease: true,
      html_url: "https://example.test/release",
      assets: [{ name: "atlas-translation-0.0.2.6-chromium.zip", browser_download_url: "https://example.test/zip" }],
      body: "- A new feature.\n  It wraps here.\n\n## Downloads\n\n- **Helper:** atlas-updater",
    },
  ],
};
let result = await update.check(true);
assert.ok(requests.at(-1).endsWith("/releases?per_page=10"), "the list of releases is read, prereleases included");
assert.strictEqual(result.status, "newer");
assert.strictEqual(result.latest.version, "0.0.2.6");
assert.strictEqual(result.latest.zipUrl, "https://example.test/zip");
assert.deepStrictEqual(plain(result.latest.notes), ["A new feature. It wraps here."]);
assert.deepStrictEqual(plain(stored.updateCheck.latest.notes), ["A new feature. It wraps here."], "the notes are stored for the Options page");

// The same version as installed: no notice
answer = { status: 200, body: [{ tag_name: "v0.0.2.5", draft: false, html_url: "x", assets: [], body: "- Old." }] };
result = await update.check(true);
assert.strictEqual(result.status, "current");
assert.strictEqual(stored.updateCheck.latest, null, "no notice when the version is the same");

// No release at all
answer = { status: 200, body: [] };
result = await update.check(true);
assert.strictEqual(result.status, "none");

// GitHub is rate limiting
answer = { status: 403, body: {} };
result = await update.check(true);
assert.strictEqual(result.status, "rate-limited");

console.log("update notice checks passed");
