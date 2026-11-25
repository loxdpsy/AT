#!/usr/bin/env node
// Keeps the version the same everywhere it is written:
//   manifest.json, firefox_manifest.json, package.json, package-lock.json (top level and packages[""]),
//   and the version badge at the top of README.md.
//
// Usage:
//   node scripts/sync-version.mjs              print each version; exit 1 if they differ (npm run version:check)
//   node scripts/sync-version.mjs 9.8.2.0      set every file to 9.8.2.0 (npm run version:sync -- 9.8.2.0)
//
// Chrome accepts 1 to 4 numeric parts separated by dots, so that is the only format allowed.
// The release workflows call this script, and `npm run check` runs the consistency check.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION_RE = /^\d+(\.\d+){0,3}$/;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JSON_FILES = ["manifest.json", "firefox_manifest.json", "package.json", "package-lock.json"];
export const README_BADGE = /(img\.shields\.io\/badge\/version-)[^-\s)]+(-)/;

// Returns [{ file, where, version }] for every place a version is written.
export async function readVersions() {
  const found = [];
  for (const file of JSON_FILES) {
    const obj = JSON.parse(await readFile(path.join(root, file), "utf8"));
    found.push({ file, where: "version", version: obj.version });
    if (obj.packages && obj.packages[""]) {
      found.push({ file, where: 'packages[""].version', version: obj.packages[""].version });
    }
  }
  const readme = await readFile(path.join(root, "README.md"), "utf8");
  const badge = readme.match(README_BADGE);
  found.push({ file: "README.md", where: "version badge", version: badge ? badge[0].split("version-")[1].split("-")[0] : undefined });
  return found;
}

export async function setVersion(version) {
  for (const file of JSON_FILES) {
    const full = path.join(root, file);
    const raw = await readFile(full, "utf8");
    const crlf = raw.includes("\r\n");
    const obj = JSON.parse(raw);
    obj.version = version;
    if (obj.packages && obj.packages[""]) obj.packages[""].version = version;
    let out = JSON.stringify(obj, null, 2) + "\n";
    if (crlf) out = out.replace(/\n/g, "\r\n");
    await writeFile(full, out);
  }
  const readmePath = path.join(root, "README.md");
  const readme = await readFile(readmePath, "utf8");
  if (!README_BADGE.test(readme)) throw new Error("README.md has no version badge (img.shields.io/badge/version-...)");
  await writeFile(readmePath, readme.replace(README_BADGE, `$1${version}$2`));
}

async function changelogHasVersion(version) {
  const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
  return changelog.includes(`## ${version}\n`) || changelog.includes(`## ${version}\r\n`);
}

// Used by npm run check. Returns a list of problems (empty when everything agrees).
export async function versionProblems() {
  const found = await readVersions();
  const values = new Set(found.map(f => f.version));
  if (values.size === 1 && !values.has(undefined)) return [];
  return found.map(f => `${f.file} (${f.where}): ${f.version ?? "missing"}`);
}

async function main() {
  const requested = process.argv[2];
  if (requested) {
    if (!VERSION_RE.test(requested)) {
      console.error(`Invalid version "${requested}". Use 1 to 4 numbers separated by dots, for example 9.8.2.0.`);
      process.exit(1);
    }
    await setVersion(requested);
    console.log(`All version fields set to ${requested}.`);
    if (!(await changelogHasVersion(requested))) {
      console.warn(`warning: CHANGELOG.md has no "## ${requested}" section yet. The release notes need one.`);
    }
  }
  const found = await readVersions();
  for (const f of found) console.log(`${f.file.padEnd(22)} ${f.where.padEnd(24)} ${f.version ?? "missing"}`);
  const problems = await versionProblems();
  if (problems.length) {
    console.error("\nVersions differ. Run: npm run version:sync -- <version>");
    process.exit(1);
  }
  console.log("\nAll versions match.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}
