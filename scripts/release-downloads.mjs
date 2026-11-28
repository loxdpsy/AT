// Writes the download part of a GitHub release's notes, and SHA256SUMS.txt for every file in the release.
// Usage: node scripts/release-downloads.mjs --dist dist --version 0.0.2.7 --repo owner/name [--store-submitted true|false]
// The notes go to stdout. The checksum file is written to <dist>/SHA256SUMS.txt, so the release step uploads it
// with the other files (it uses dist/*). A file that is not recognised still gets a checksum, under "Other files".
import { createHash } from "crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

// Platforms the release does not build yet. They are named in the table, so nobody looks for them in vain.
export const NOT_BUILT_YET = {
  Windows: "Windows ARM64 is not built yet.",
  macOS: "Intel Macs are not built yet.",
  Linux: "Linux ARM64 and the .deb and .rpm packages are not built yet.",
};

const GROUP_ORDER = ["Windows", "macOS", "Linux", "Browser extension", "Other files"];

// The first rule that matches a file name gives its group and its description.
const RULES = [
  [/^atlas-updater-windows-setup\.exe$/, "Windows", "Setup (installer), x64"],
  [/^atlas-updater-windows\.exe$/, "Windows", "Portable, x64 (no offline engine: use the Setup)"],
  [/^atlas-updater-macos\.dmg$/, "macOS", "DMG, Apple Silicon"],
  [/^atlas-updater-linux\.AppImage$/, "Linux", "AppImage, x64"],
  [/-chromium\.crx$/, "Browser extension", "Chromium: self-hosted package (.crx, Chromium 109 or newer)"],
  [/-chromium\.zip$/, "Browser extension", "Chrome Web Store package (.zip)"],
  [/-edge\.zip$/, "Browser extension", "Microsoft Edge Add-ons package (.zip)"],
  [/-firefox-signed\.xpi$/, "Browser extension", "Firefox: signed add-on (.xpi), self-hosted"],
  [/-firefox\.xpi$/, "Browser extension", "Firefox: unsigned add-on (.xpi), Firefox will not install it"],
  [/-firefox\.zip$/, "Browser extension", "Firefox: add-on files (.zip)"],
  [/^updates\.json$/, "Browser extension", "Firefox update manifest (updates.json)"],
];

export function describe(name) {
  for (const [pattern, group, label] of RULES) {
    if (pattern.test(name)) return { group, label };
  }
  return { group: "Other files", label: "File" };
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sizeText(bytes) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

// Reads every file in the folder (except an older SHA256SUMS.txt) and returns the release's files, sorted by name.
export function releaseFiles(dist) {
  return readdirSync(dist)
    .filter(name => name !== "SHA256SUMS.txt" && statSync(path.join(dist, name)).isFile())
    .sort()
    .map(name => {
      const bytes = readFileSync(path.join(dist, name));
      return { name, bytes: bytes.length, sha256: sha256(bytes), ...describe(name) };
    });
}

// The checksum file in the format of `sha256sum`: "<hash>  <name>", one file per line.
export function checksumText(files) {
  return files.map(f => `${f.sha256}  ${f.name}`).join("\n") + "\n";
}

// The Downloads part of the release notes (Markdown).
export function downloadsMarkdown(files, { version, repo, storeSubmitted }) {
  const base = `https://github.com/${repo}/releases/download/v${version}`;
  const link = f => `[${f.label}](${base}/${encodeURIComponent(f.name)})`;
  const lines = [];
  lines.push("## Download based on your OS", "");
  lines.push("| OS | Download |", "| --- | --- |");
  for (const group of ["Windows", "macOS", "Linux"]) {
    const items = files.filter(f => f.group === group).map(link);
    const cell = [...items, NOT_BUILT_YET[group]].join(" · ");
    lines.push(`| ${group} | ${cell} |`);
  }
  lines.push("| Android | Not in this release. The helper is a desktop program, and Chrome for Android does not run extensions. Firefox for Android installs Atlas Translation from addons.mozilla.org. |");
  const browser = files.filter(f => f.group === "Browser extension").map(link);
  lines.push(`| Browser extension | ${browser.length ? browser.join(" · ") : "No package in this release."} |`);
  lines.push("");

  lines.push("## Files and SHA-256", "");
  for (const group of GROUP_ORDER) {
    const items = files.filter(f => f.group === group);
    if (!items.length) continue;
    lines.push(`**${group}**`, "");
    for (const f of items) {
      lines.push(`- [**${f.name}**](${base}/${encodeURIComponent(f.name)}): ${f.label}, ${sizeText(f.bytes)}  `);
      lines.push(`  \`sha256:${f.sha256}\``);
    }
    lines.push("");
  }
  lines.push(`All checksums: [SHA256SUMS.txt](${base}/SHA256SUMS.txt). On Linux or macOS, run \`sha256sum -c SHA256SUMS.txt\` in the download folder. On Windows, run \`certutil -hashfile <file> SHA256\` and compare the value with the list above.`, "");

  lines.push("## Stores", "");
  lines.push("- **Chrome Web Store:** upload `atlas-translation-" + version + "-chromium.zip`.");
  lines.push("- **Microsoft Edge Add-ons:** the same package as Chromium, submitted automatically when the Edge secrets are set.");
  if (files.some(f => /-firefox-signed\.xpi$/.test(f.name))) {
    lines.push("- **Firefox, self-hosted:** the signed `.xpi` opens in Firefox. Firefox then updates it from `updates.json` in this release. Firefox for Android installs from addons.mozilla.org only.");
  } else {
    lines.push("- **Firefox:** install from addons.mozilla.org. This release has no signed `.xpi`, so self-hosted installs and updates are not available for it.");
  }
  lines.push(storeSubmitted
    ? "- **Firefox store:** submitted to addons.mozilla.org for review with this release. It appears in the store after Mozilla approves it. The store file is not attached here."
    : "- **Firefox store:** not submitted in this run. The store file is not attached to the release.");
  lines.push("");

  lines.push("## Helper (atlas-updater)", "");
  lines.push("The helper installs the extension, the offline engine and the language packs. The Windows setup file, the Linux AppImage and the macOS DMG include the offline engine. The portable Windows program does not, so use the setup file. See tools/atlas-updater/README.md.", "");
  return lines.join("\n");
}

// Does the whole job for one release folder. Returns the Markdown and the checksum text, and writes SHA256SUMS.txt.
export function buildRelease(dist, options) {
  const files = releaseFiles(dist);
  const sums = checksumText(files);
  writeFileSync(path.join(dist, "SHA256SUMS.txt"), sums);
  return { markdown: downloadsMarkdown(files, options), sums, files };
}

function argValue(args, name) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const dist = argValue(args, "--dist") ?? "dist";
  const version = argValue(args, "--version");
  const repo = argValue(args, "--repo");
  if (!version || !repo) {
    console.error("usage: release-downloads.mjs --dist <folder> --version <version> --repo <owner/name> [--store-submitted true|false]");
    process.exit(2);
  }
  const { markdown } = buildRelease(dist, {
    version,
    repo,
    storeSubmitted: argValue(args, "--store-submitted") === "true",
  });
  process.stdout.write(markdown);
}
