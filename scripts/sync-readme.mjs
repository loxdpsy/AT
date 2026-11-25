#!/usr/bin/env node
// Keeps the version badge at the top of README.md equal to the latest published GitHub release.
//
// The release workflow already writes the badge when it makes a version. This check also catches releases
// made by hand (a tag pushed without the workflow), so the daily readme-sync workflow runs it.
// It changes only the version badge. The release date, issues, pull requests, and license badges are
// live shields.io badges that read GitHub directly, so they never need syncing.
//
// Usage:
//   node scripts/sync-readme.mjs          set the badge to the target version (writes README.md)
//   node scripts/sync-readme.mjs --check  exit 1 when the badge is out of date, and change nothing
//
// Target: the latest published release. When there is no release yet, the version in manifest.json.
// Uses GITHUB_REPOSITORY (set in Actions) and GITHUB_TOKEN or GH_TOKEN when set. GET /rate_limit runs
// first and does not count against the quota, like scripts/check-update.mjs.

import { readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION_RE, README_BADGE } from "./sync-version.mjs";

const API = "https://api.github.com";
const TIMEOUT_MS = 15000;
const MIN_REMAINING = 10;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = process.env.GITHUB_REPOSITORY || "loxdpsy/AT";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const check = process.argv.includes("--check");

async function github(pathname) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "atlas-translation-readme-sync" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(API + pathname, { headers, signal: controller.signal });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

// Returns the tag of the latest published release without the leading "v", or null when there is none yet.
async function latestReleaseVersion() {
  const limits = await github("/rate_limit");
  if (limits.status !== 200 || !limits.body) throw new Error(`rate limit check failed with HTTP ${limits.status}`);
  const core = limits.body.resources.core;
  if (core.remaining < MIN_REMAINING) throw new Error(`only ${core.remaining} GitHub API requests left. Try again after the reset time.`);
  const res = await github(`/repos/${repo}/releases/latest`);
  if (res.status === 404) return null;
  if (res.status !== 200 || !res.body) throw new Error(`releases/latest returned HTTP ${res.status}`);
  return String(res.body.tag_name || "").replace(/^v/i, "");
}

async function main() {
  const readmePath = path.join(root, "README.md");
  const readme = await readFile(readmePath, "utf8");
  const badge = readme.match(README_BADGE);
  if (!badge) throw new Error("README.md has no version badge (img.shields.io/badge/version-...)");
  const current = badge[0].split("version-")[1].split("-")[0];

  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")).version;
  const release = await latestReleaseVersion();
  const target = release || manifest;
  if (!VERSION_RE.test(target)) throw new Error(`target version "${target}" is not a valid version`);

  const lines = [
    `Repository: ${repo}`,
    `README version badge: ${current}`,
    `Latest published release: ${release ?? "none yet"}`,
    `manifest.json: ${manifest}`,
    `Target: ${target}`,
  ];

  let result;
  if (current === target) {
    lines.push("Result: the README badge is up to date.");
    result = "up-to-date";
  } else if (check) {
    lines.push(`Result: the README badge is out of date (${current} -> ${target}). Run node scripts/sync-readme.mjs to fix it.`);
    result = "out-of-date";
    process.exitCode = 1;
  } else {
    await writeFile(readmePath, readme.replace(README_BADGE, `$1${target}$2`));
    lines.push(`Result: README badge changed from ${current} to ${target}.`);
    result = "changed";
  }

  for (const line of lines) console.log(line);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `result=${result}\nversion=${target}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, "## README sync\n\n```\n" + lines.join("\n") + "\n```\n");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error("README sync failed:", error.name === "AbortError" ? "request timed out" : error.message);
    process.exitCode = 2;
  });
}
