// The tab-message helper (lib/checkedLastError.js): a message to a closed tab must not throw or leave an unchecked error,
// and the background and popup code must send through it.
import fs from "fs";
import vm from "vm";
import assert from "assert";

const ROOT = new URL("../../", import.meta.url).pathname;
const src = fs.readFileSync(ROOT + "lib/checkedLastError.js", "utf8");

function makeContext({ lastError, throws } = {}) {
  const calls = [];
  const listeners = {};
  const ctx = {
    console,
    chrome: {
      runtime: { lastError },
      tabs: {
        sendMessage: (...args) => {
          calls.push(args);
          if (throws) throw new Error(throws);
          const callback = args[args.length - 1];
          if (typeof callback === "function") callback("reply");
        },
      },
    },
    self: {
      addEventListener: (type, fn) => {
        listeners[type] = fn;
      },
    },
  };
  ctx.self.chrome = ctx.chrome;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx, calls, listeners };
}

// No tab id (an empty tab list): nothing is sent.
{
  const { ctx, calls } = makeContext();
  ctx.twpSendToTab(undefined, { action: "x" });
  ctx.twpSendToTab(null, { action: "x" });
  assert.strictEqual(calls.length, 0, "no tab id, no message");
}

// A normal send passes a callback, so Chrome does not report an unchecked error, and the reply reaches the caller.
{
  const { ctx, calls } = makeContext();
  let reply = null;
  ctx.twpSendToTab(7, { action: "x" }, r => (reply = r));
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], 7);
  assert.strictEqual(typeof calls[0][2], "function", "a callback is always passed");
  assert.strictEqual(reply, "reply", "the caller gets the reply");
}

// The four-argument form (a frame option) keeps its options object.
{
  const { ctx, calls } = makeContext();
  ctx.twpSendToTab(7, { action: "y" }, { frameId: 0 }, () => {});
  assert.deepStrictEqual(calls[0][2], { frameId: 0 }, "options are passed through");
  assert.strictEqual(typeof calls[0][3], "function");
}

// A tab that closed (Chrome throws, or reports the error): the call does not throw and nothing is left unchecked.
{
  const { ctx } = makeContext({ throws: "No tab with id: 5." });
  assert.doesNotThrow(() => ctx.twpSendToTab(5, { action: "x" }));
}
{
  const { ctx, calls } = makeContext({ lastError: { message: "No tab with id: 5." } });
  let reply = "unset";
  ctx.twpSendToTab(5, { action: "x" }, r => (reply = r));
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(reply, "reply");
}

// The page-level filter for the two expected browser errors. Other errors are not touched.
{
  const { listeners } = makeContext();
  const suppressed = [];
  const fake = type => event => {
    let prevented = false;
    event.preventDefault = () => (prevented = true);
    listeners[type](event);
    return prevented;
  };
  assert.ok(fake("error")({ error: new Error("No tab with id: 576660373.") }), "no tab id is suppressed");
  assert.ok(fake("error")({ error: new Error("Uncaught Error: Extension context invalidated.") }), "context invalidated is suppressed");
  assert.ok(fake("unhandledrejection")({ reason: new Error("Error: No tab with id: 1.") }), "rejection is suppressed");
  assert.ok(!fake("error")({ error: new TypeError("Cannot read properties of undefined (reading 'toLowerCase')") }), "other errors are shown");
  assert.ok(!fake("unhandledrejection")({ reason: new Error("something else") }), "other rejections are shown");
  suppressed.push(1);
}

// Background and popup code send through the helper, never through chrome.tabs.sendMessage directly.
{
  const files = [
    "background/background.js",
    "background/translationService.js",
    "popup/popup.js",
    "popup/old-popup.js",
    "popup/improve-translation.js",
  ];
  for (const file of files) {
    const text = fs.readFileSync(ROOT + file, "utf8");
    assert.ok(!text.includes("chrome.tabs.sendMessage("), file + " calls chrome.tabs.sendMessage directly");
  }
}

console.log("all tab message checks passed");
