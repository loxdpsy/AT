// Tests for background/serviceHealth.js (the health and fallback rules for the translation services).
// The file is a plain script, so it is loaded into a sandbox the same way the service worker loads it.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const src = fs.readFileSync(ROOT + "background/serviceHealth.js", "utf8");
const ctx = { console, Map, Promise, Error, Array, Date };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const { createServiceHealth, runWithServiceFallback } = ctx;

// Arrays made inside the sandbox belong to another realm, so compare plain copies.
const plain = x => JSON.parse(JSON.stringify(x));

function clock(start = 1000) {
  let t = start;
  return { now: () => t, advance: ms => { t += ms; } };
}

// A breaker opens after 3 failures in a row, and not before.
{
  const c = clock();
  const h = createServiceHealth({ failuresBeforeCooldown: 3, cooldownMs: 60000, now: c.now });
  h.recordFailure("google");
  h.recordFailure("google");
  assert.strictEqual(h.isHealthy("google"), true, "two failures are not enough");
  h.recordFailure("google");
  assert.strictEqual(h.isHealthy("google"), false, "the third failure opens the breaker");
  assert.strictEqual(h.isHealthy("bing"), true, "other services are not affected");
}

// After the cooldown the service is tried again; a success closes the breaker; a failure reopens it at once.
{
  const c = clock();
  const h = createServiceHealth({ failuresBeforeCooldown: 3, cooldownMs: 60000, now: c.now });
  for (let i = 0; i < 3; i++) h.recordFailure("yandex");
  c.advance(59999);
  assert.strictEqual(h.isHealthy("yandex"), false, "still cooling down");
  c.advance(1);
  assert.strictEqual(h.isHealthy("yandex"), true, "cooldown over: tried again");
  h.recordFailure("yandex");
  assert.strictEqual(h.isHealthy("yandex"), false, "one failure after the cooldown reopens it");
  c.advance(60000);
  h.recordSuccess("yandex");
  assert.strictEqual(h.isHealthy("yandex"), true, "a success closes it");
  h.recordFailure("yandex");
  h.recordFailure("yandex");
  assert.strictEqual(h.isHealthy("yandex"), true, "the count started again after the success");
}

// order(): healthy services first, the order kept inside each group, nothing dropped
{
  const c = clock();
  const h = createServiceHealth({ failuresBeforeCooldown: 1, cooldownMs: 1000, now: c.now });
  h.recordFailure("google");
  assert.deepStrictEqual(plain(h.order(["google", "bing", "yandex"])), ["bing", "yandex", "google"]);
  assert.deepStrictEqual(plain(h.order([])), []);
}

// runWithServiceFallback: the first working service answers; failures are recorded and reported
{
  const c = clock();
  const h = createServiceHealth({ failuresBeforeCooldown: 3, cooldownMs: 60000, now: c.now });
  const tried = [];
  const errors = [];
  const run = async name => {
    tried.push(name);
    if (name === "google") throw new Error("google down");
    return `translated by ${name}`;
  };
  const out = await runWithServiceFallback(["google", "bing", "yandex"], h, run, (e, name) => errors.push(name));
  assert.deepStrictEqual(plain(out), { result: "translated by bing", service: "bing" });
  assert.deepStrictEqual(plain(tried), ["google", "bing"], "yandex is not tried after bing works");
  assert.deepStrictEqual(plain(errors), ["google"]);
}

// A service that failed three times is skipped next time, so it is not tried first again
{
  const c = clock();
  const h = createServiceHealth({ failuresBeforeCooldown: 3, cooldownMs: 60000, now: c.now });
  const run = async name => { if (name === "google") throw new Error("down"); return name; };
  for (let i = 0; i < 3; i++) await runWithServiceFallback(["google", "bing"], h, run);
  const tried = [];
  const out = await runWithServiceFallback(["google", "bing"], h, async name => { tried.push(name); return name; });
  assert.deepStrictEqual(plain(tried), ["bing"], "google is in its cooldown");
  assert.strictEqual(out.service, "bing");
}

// When every service fails, the last error is thrown (the caller then reports the failure as before)
{
  const h = createServiceHealth();
  await assert.rejects(
    runWithServiceFallback(["google", "bing"], h, async name => { throw new Error(name + " failed"); }),
    /bing failed/
  );
}

// With no candidates, the error says that no service is enabled
{
  const h = createServiceHealth();
  await assert.rejects(runWithServiceFallback([], h, async () => "x"), /No translation service is enabled/);
}

console.log("serviceHealth.test.mjs: all assertions passed");
