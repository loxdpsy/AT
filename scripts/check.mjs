// Validates the extension before it is packed: JSON files, JavaScript syntax,
// every file referenced by the manifests and importScripts(), the locales, and that the version matches everywhere.
// Usage: npm run check
import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { versionProblems } from "./sync-version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = message => {
  failures++;
  console.error("  FAIL  " + message);
};
const ok = message => console.log("  ok    " + message);

async function exists(relPath) {
  try {
    await stat(path.join(root, relPath));
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, filter) {
  const out = [];
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(rel, filter)));
    else if (filter(rel)) out.push(rel);
  }
  return out;
}

console.log("Manifests");
const manifests = ["manifest.json", "firefox_manifest.json"];
for (const name of manifests) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(root, name), "utf8"));
  } catch (e) {
    fail(`${name} is not valid JSON: ${e.message}`);
    continue;
  }
  if (manifest.manifest_version !== 3) fail(`${name} must be manifest_version 3`);
  else ok(`${name} is valid MV3 JSON`);

  const refs = [];
  (function collect(value) {
    if (typeof value === "string") {
      if (/^https?:\/\//.test(value)) return; // URLs (for example update_url) are not files in the package
      if (/\.(js|html|css|png|webp|gif|svg|json)$/.test(value) && !value.includes("*")) refs.push(value.replace(/^\//, ""));
    } else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  })(manifest);
  for (const ref of refs) {
    if (!(await exists(ref))) fail(`${name} references a missing file: ${ref}`);
  }
  for (const background of manifest.background?.scripts ?? []) {
    if (!(await exists(background.replace(/^\//, "")))) fail(`${name} background script missing: ${background}`);
  }
  ok(`${name}: ${refs.length} referenced files checked`);
}

console.log("Service worker imports");
const sw = await readFile(path.join(root, "service_worker.js"), "utf8");
const imported = [...sw.matchAll(/"([^"]+\.js)"/g)].map(m => m[1]);
for (const file of imported) {
  if (!(await exists(file))) fail(`importScripts() file missing: ${file}`);
}
ok(`${imported.length} importScripts() files checked`);

console.log("JavaScript syntax");
const jsFiles = (await walk(".", rel => rel.endsWith(".js"))).filter(rel => !rel.startsWith("build"));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, file)], { encoding: "utf8" });
  if (result.status !== 0) fail(`${file}: ${result.stderr.trim().split("\n").slice(0, 3).join(" | ")}`);
}
ok(`${jsFiles.length} JavaScript files parsed`);

console.log("Locales");
const localeFiles = (await walk("_locales", rel => rel.endsWith("messages.json")));
for (const file of localeFiles) {
  try {
    JSON.parse(await readFile(path.join(root, file), "utf8"));
  } catch (e) {
    fail(`${file} is not valid JSON: ${e.message}`);
  }
}
ok(`${localeFiles.length} locale files parsed`);

console.log("Versions");
const versionIssues = await versionProblems();
if (versionIssues.length) fail("version fields differ: " + versionIssues.join("; "));
else ok("manifests, package files and README badge agree");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
