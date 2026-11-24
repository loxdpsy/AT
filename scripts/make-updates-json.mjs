#!/usr/bin/env node
// Writes the Firefox update manifest (updates.json) for a signed, self-distributed .xpi.
//
// Firefox reads this file from the update_url in firefox_manifest.json:
//   https://github.com/loxdpsy/AT/releases/latest/download/updates.json
// The release workflow runs this script after a signed .xpi exists, and uploads the result
// to the GitHub release. The file always describes the newest release.
//
// usage: node scripts/make-updates-json.mjs --version 0.0.1.0 --xpi path/to/signed.xpi \
//          --repo loxdpsy/AT [--out dist/updates.json]

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => {
  if (cur.startsWith("--")) acc.push([cur.slice(2), all[i + 1]]);
  return acc;
}, []));

const version = args.version;
const xpiPath = args.xpi;
const repo = args.repo || "loxdpsy/AT";
const outPath = args.out || "dist/updates.json";

function fail(message) {
  console.error(`make-updates-json: ${message}`);
  process.exit(1);
}

if (!version || !/^\d+\.\d+\.\d+\.\d+$/.test(version)) fail("--version must be four numbers, for example 0.0.1.0");
if (!xpiPath) fail("--xpi is required");
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) fail("--repo must look like owner/name");

const manifest = JSON.parse(readFileSync("firefox_manifest.json", "utf8").replace(/^\uFEFF/, ""));
const gecko = manifest.browser_specific_settings?.gecko;
if (!gecko?.id) fail("firefox_manifest.json has no browser_specific_settings.gecko.id");
if (manifest.version !== version) fail(`firefox_manifest.json is ${manifest.version}, not ${version}`);

const xpi = readFileSync(xpiPath);
const hash = createHash("sha256").update(xpi).digest("hex");
const assetName = `atlas-translation-${version}-firefox-signed.xpi`;

const updates = {
  addons: {
    [gecko.id]: {
      updates: [
        {
          version,
          update_link: `https://github.com/${repo}/releases/download/v${version}/${assetName}`,
          update_hash: `sha256:${hash}`,
          update_info_url: `https://github.com/${repo}/releases/tag/v${version}`,
          applications: {
            gecko: { strict_min_version: gecko.strict_min_version || "140.0" },
          },
        },
      ],
    },
  },
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(updates, null, 2) + "\n");
console.log(`make-updates-json: wrote ${outPath} for ${version} (${assetName}, sha256 ${hash.slice(0, 16)}...)`);
