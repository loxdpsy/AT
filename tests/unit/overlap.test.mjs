import fs from "fs";
import vm from "vm";

// The repository root, so the tests work from any checkout.
const ROOT = new URL("../../", import.meta.url).pathname;
const src = fs.readFileSync(ROOT + "contentScript/pageTranslator.js", "utf8");
const start = src.indexOf("          function pieceOverlapsScreen(ptt) {");
const end = src.indexOf("          function bottomIsInScreen(element) {");
if (start < 0 || end < start) throw new Error("function not found");
const body = src.slice(start, end).replace(/\r/g, "");
const ctx = { innerHeight: 800 };
vm.createContext(ctx);
vm.runInContext(body + "\n;globalThis.f = pieceOverlapsScreen;", ctx);
const el = (top, bottom) => ({ getBoundingClientRect: () => ({ top, bottom }) });
const cases = [
  ["spans the whole screen (old check missed it)", { topElement: el(-2000, 3000), bottomElement: null }, true],
  ["entirely above", { topElement: el(-900, -100), bottomElement: el(-100, -10) }, false],
  ["entirely below", { topElement: el(900, 1100), bottomElement: el(1100, 1300) }, false],
  ["partly visible at bottom", { topElement: el(700, 900), bottomElement: null }, true],
  ["no top element", { topElement: null, bottomElement: null }, false],
];
let ok = true;
for (const [name, ptt, want] of cases) {
  const got = ctx.f(ptt);
  if (got !== want) ok = false;
  console.log((got === want ? "PASS " : "FAIL ") + name + " -> " + got);
}
console.log(ok ? "overlap checks passed" : "overlap checks FAILED");
