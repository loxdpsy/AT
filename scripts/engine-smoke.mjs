// Checks a built atlas-engine with a real language pack: downloads the English to French pack from the catalogue
// (tools/atlas-updater/src/packs.json), checks every file's size and SHA-256, starts the engine, and translates two
// sentences. Fails when the download is wrong or the reply does not look like French.
// Usage: node scripts/engine-smoke.mjs <path to atlas-engine>
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const engine = process.argv[2];
if (!engine) {
  console.error("Usage: node scripts/engine-smoke.mjs <path to atlas-engine>");
  process.exit(2);
}
const catalogue = JSON.parse(await readFile(path.join(root, "tools", "atlas-updater", "src", "packs.json"), "utf8"));
const pack = catalogue.packs.find(p => p.pair === "enfr");
if (!pack) throw new Error("the catalogue has no English to French pack");

const dir = await mkdtemp(path.join(os.tmpdir(), "atlas-engine-smoke-"));
// Every file is tried, so the log shows which ones the download host refuses, not only the first.
const refused = [];
for (const file of pack.files) {
  const response = await fetch(file.url, { redirect: "follow" });
  if (!response.ok) {
    refused.push(`${file.name}: HTTP ${response.status} from ${response.url}`);
    console.log(`  FAIL  ${file.name}: HTTP ${response.status}`);
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== file.size) throw new Error(`${file.name}: size ${bytes.length}, catalogue says ${file.size}`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== file.sha256) throw new Error(`${file.name}: SHA-256 ${sha}, catalogue says ${file.sha256}`);
  await writeFile(path.join(dir, file.name), bytes);
  console.log(`  ok    ${file.name} (${bytes.length} bytes, SHA-256 checked)`);
}
if (refused.length) throw new Error(`download failed for ${refused.length} file(s):\n  ${refused.join("\n  ")}`);

const child = spawn(engine, [dir], { stdio: ["pipe", "pipe", "inherit"] });
const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
const withTimeout = (promise, what) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out: ${what}`)), 240000))]);
const ready = await withTimeout(lines.next(), "waiting for the engine to load the model");
if (ready.value !== "ready") throw new Error(`engine did not say ready: ${ready.value}`);
console.log("  ok    engine loaded the English to French model");

const sentences = ["Hello, how are you today?", "The weather is very nice in the park."];
const translations = [];
for (const sentence of sentences) {
  child.stdin.write(Buffer.from(sentence, "utf8").toString("base64") + "\n");
  const reply = await withTimeout(lines.next(), "waiting for a translation");
  const text = Buffer.from(reply.value, "base64").toString("utf8");
  translations.push(text);
  console.log(`  ok    "${sentence}" -> "${text}"`);
}
child.stdin.end();
child.kill();

const frenchHints = /\b(bonjour|comment|aujourd|temps|est|vous|le|la|parc|très|beau)\b/i;
for (const text of translations) {
  if (!text.trim() || !frenchHints.test(text)) throw new Error(`the translation does not look like French: "${text}"`);
}
console.log("Engine smoke test passed.");
