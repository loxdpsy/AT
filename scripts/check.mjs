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

console.log("Rust helper (tools/atlas-updater)");
{
  const crate = path.join(root, "tools", "atlas-updater");
  const src = path.join(crate, "src");
  const rsFiles = [];
  const collectRs = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await collectRs(full);
      else if (entry.name.endsWith(".rs")) rsFiles.push(full);
    }
  };
  await collectRs(src);
  let rustProblems = 0;
  const rustFail = message => {
    rustProblems++;
    fail(message);
  };
  for (const file of rsFiles) {
    const text = await readFile(file, "utf8");
    const rel = path.relative(root, file);
    // include_str!("x") and include_bytes!("x") must point at a file that exists, relative to the source file.
    for (const match of text.matchAll(/include_(?:str|bytes)!\("([^"]+)"\)/g)) {
      const target = path.resolve(path.dirname(file), match[1]);
      if (!(await stat(target).then(() => true, () => false))) rustFail(`${rel} includes a missing file: ${match[1]}`);
    }
    // "mod name;" must have a matching file: name.rs or name/mod.rs, next to the file (or in its folder for main.rs).
    const isRoot = path.basename(file) === "main.rs" || path.basename(file) === "lib.rs" || path.basename(file) === "mod.rs";
    const moduleDir = isRoot ? path.dirname(file) : path.join(path.dirname(file), path.basename(file, ".rs"));
    for (const match of text.matchAll(/^\s*(?:pub\s+)?mod\s+([a-z_][a-z0-9_]*)\s*;/gm)) {
      const candidates = [path.join(path.dirname(file), match[1] + ".rs"), path.join(moduleDir, match[1] + ".rs"), path.join(moduleDir, match[1], "mod.rs")];
      let found = false;
      for (const candidate of candidates) if (await stat(candidate).then(() => true, () => false)) found = true;
      if (!found) rustFail(`${rel} declares mod ${match[1]} but there is no ${match[1]}.rs`);
    }
  }
  if (!rustProblems) ok(`${rsFiles.length} Rust source files: module and include paths resolve`);

  // Compile check (no dependencies, so no network). Needs cargo. In CI cargo must be there; locally it may be skipped.
  const probe = spawnSync("cargo", ["--version"], { encoding: "utf8" });
  if (probe.error || probe.status !== 0) {
    if (process.env.CI) fail("cargo is not installed, so the Rust helper cannot be checked");
    else console.log("  skip  cargo is not installed; the Rust compile check was skipped (CI runs it)");
  } else {
    const result = spawnSync("cargo", ["check", "--all-targets", "--quiet"], { cwd: crate, encoding: "utf8" });
    if (result.status !== 0) fail("cargo check failed: " + (result.stderr || result.stdout).trim().split("\n").slice(0, 6).join(" | "));
    else ok(`cargo check passed (${probe.stdout.trim()})`);
  }
}

console.log("Versions");
const versionIssues = await versionProblems();
if (versionIssues.length) fail("version fields differ: " + versionIssues.join("; "));
else ok("manifests, package files and README badge agree");

console.log("Changelog");
{
  // The release notes are the "## <version>" section of CHANGELOG.md. A release without it publishes with no notes.
  const manifestVersion = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")).version;
  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  const hasSection = changelog.split(/\r?\n/).some(line => line.trim() === "## " + manifestVersion);
  if (hasSection) ok(`CHANGELOG.md has a section for ${manifestVersion}`);
  else fail(`CHANGELOG.md has no "## ${manifestVersion}" section. Add it before releasing, so the release has notes.`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll checks passed.");
