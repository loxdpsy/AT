#!/usr/bin/env node
// Sets the extension version in manifest.json and firefox_manifest.json.
// Used by the release workflows, so you can build and test any version without a manual edit.
//
// Usage: node scripts/set-version.mjs 9.8.2.0
// Chrome accepts 1 to 4 numeric parts separated by dots, so that is the only format allowed.

import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
if (!version || !/^\d+(\.\d+){0,3}$/.test(version)) {
  console.error(`Invalid version "${version ?? ""}". Use 1 to 4 numbers separated by dots, for example 9.8.2.0.`);
  process.exit(1);
}

for (const file of ["manifest.json", "firefox_manifest.json"]) {
  const text = await readFile(file, "utf8");
  // Replace only the top-level "version" key (the first match), keeping the file's formatting.
  const updated = text.replace(/"version"\s*:\s*"[^"]*"/, `"version": "${version}"`);
  if (updated === text && !text.includes(`"version": "${version}"`)) {
    console.error(`Could not find a "version" key in ${file}.`);
    process.exit(1);
  }
  await writeFile(file, updated);
  console.log(`${file}: version ${version}`);
}
