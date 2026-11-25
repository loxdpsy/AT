import fs from "fs";
import vm from "vm";
import assert from "assert";

// The repository root, so the tests work from any checkout.
const ROOT = new URL("../../", import.meta.url).pathname;

// Load the Cache class from background/translationCache.js in a sandbox, with a fake IndexedDB.
let src = fs.readFileSync(ROOT + "background/translationCache.js", "utf8");
src = src.replace(/\n  return translationCache;\n\}\(\);\s*$/, "\n  globalThis.__Cache = Cache;\n  return translationCache;\n}();");
const ctx = {
  console, setTimeout, Promise, Map, JSON, Object, Array, String, Number, Set, Error, TypeError, WeakSet,
  Uint8Array, crypto: globalThis.crypto, TextEncoder,
  chrome: {
    runtime: { onMessage: { addListener() {} }, sendMessage() {}, getManifest: () => ({ version: "0" }) },
    storage: { local: { get: (k, cb) => cb && cb({}), set: () => {}, remove: () => {} } },
    alarms: { create() {}, onAlarm: { addListener() {} } }
  },
  twpConfig: { get: () => 0, onReady: () => Promise.resolve(), onChanged: () => {} },
  indexedDB: { open() { return {}; }, deleteDatabase() { return {}; } },
  self: {}, importScripts() {}, navigator: {}
};
ctx.globalThis = ctx;
vm.createContext(ctx);
try { vm.runInContext(src, ctx); } catch (e) { /* only globals that the cache does not use may be missing */ }
const Cache = ctx.__Cache;
assert.ok(Cache, "Cache class not exposed from translationCache.js");

// A fake IndexedDB store that counts reads.
function fakeDb(store, counter) {
  return {
    transaction() {
      return {
        objectStore() {
          return {
            get(key) {
              counter.reads++;
              const req = {};
              setTimeout(() => { req.result = store.get(key); req.onsuccess && req.onsuccess({}); }, 5);
              return req;
            },
            put(data) {
              store.set(data.key, data);
              const req = {};
              setTimeout(() => req.onsuccess && req.onsuccess({}), 1);
              return req;
            }
          };
        }
      };
    }
  };
}

{
  const store = new Map(), counter = { reads: 0 };
  const c = new Cache("google", "en", "fr"); c.db = fakeDb(store, counter);
  assert.equal(await c.query("hello"), null, "a miss returns nothing");
  assert.equal(counter.reads, 1, "a miss reads the database once");
  await c.add("hello", "bonjour", "en");
  const r = await c.query("hello");
  assert.ok(r && r.translatedText === "bonjour", "the added entry is found");
  assert.equal(counter.reads, 1, "after add, the lookup answers from memory");
}

{
  const store = new Map(), counter = { reads: 0 };
  const c = new Cache("google", "en", "fr"); c.db = fakeDb(store, counter);
  await c.add("world", "monde", "en");
  c.cache.clear(); // forget memory, keep IndexedDB
  const before = counter.reads;
  const results = await Promise.all([c.query("world"), c.query("world"), c.query("world"), c.query("world")]);
  assert.equal(counter.reads - before, 1, "four concurrent lookups share one database read");
  assert.ok(results.every(x => x && x.translatedText === "monde"), "all four get the translation");
  assert.equal(c.inFlight.size, 0, "the shared read is removed from inFlight when done");
}

{
  const store = new Map(), counter = { reads: 0 };
  const saved = Cache.MAX_MEMORY_ENTRIES; Cache.MAX_MEMORY_ENTRIES = 3;
  const c = new Cache("google", "en", "fr"); c.db = fakeDb(store, counter);
  for (const t of ["a", "b", "c", "d", "e"]) await c.add(t, t.toUpperCase(), "en");
  assert.equal(c.cache.size, 3, "memory is bounded to MAX_MEMORY_ENTRIES");
  assert.equal([...c.cache.values()].map(v => v.originalText).join(), "c,d,e", "the newest entries are kept");
  Cache.MAX_MEMORY_ENTRIES = saved;
}
