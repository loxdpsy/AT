#!/usr/bin/env node
// Checks GitHub for a newer release of Atlas Translation (and optionally the upstream TWP project).
//
// Usage:
//   node scripts/check-update.mjs                    # loxdpsy/AT
//   node scripts/check-update.mjs --upstream         # also FilipePS/Traduzir-paginas-web
//   node scripts/check-update.mjs --min-remaining 20 # stop early when the API budget is low
//   node scripts/check-update.mjs --fail-if-newer    # exit 1 when a newer release exists
//
// Uses GITHUB_TOKEN or GH_TOKEN when set (5,000 requests/hour instead of 60). The token is never printed.
// Rate limit: GET /rate_limit does not count against the core quota, so it runs first and
// decides whether the release lookups are safe to make.

import { readFile, appendFile } from "node:fs/promises";

const API = "https://api.github.com";
const LOCAL_REPO = "loxdpsy/AT";
const UPSTREAM_REPO = "FilipePS/Traduzir-paginas-web";
const TIMEOUT_MS = 15000;

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const minRemaining = Number(option("--min-remaining", "10"));
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const repos = [LOCAL_REPO];
if (flag("--upstream")) repos.push(UPSTREAM_REPO);

/** Parses "v9.8.1.0" or "9.8.1.0" into numbers for comparison. */
function parseVersion(text) {
  return String(text || "").replace(/^v/i, "").split(".").map(part => parseInt(part, 10) || 0);
}
/** Returns 1 when a > b, -1 when a < b, 0 when equal. */
function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function github(pathname) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "atlas-translation-update-check" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(API + pathname, { headers, signal: controller.signal });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    return {
      status: response.status,
      body,
      remaining: Number(response.headers.get("x-ratelimit-remaining")),
      reset: Number(response.headers.get("x-ratelimit-reset")) || 0,
      retryAfter: Number(response.headers.get("retry-after")) || 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

function resetText(epochSeconds) {
  return epochSeconds ? new Date(epochSeconds * 1000).toISOString() : "unknown";
}

async function main() {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const localVersion = manifest.version;
  const lines = [];
  const log = line => { console.log(line); lines.push(line); };

  log(`Local version: ${localVersion}`);
  log(`Authenticated: ${token ? "yes" : "no (60 requests/hour)"}`);

  // 1. Rate limit (free call).
  const limits = await github("/rate_limit");
  if (limits.status !== 200 || !limits.body) {
    log(`Rate limit check failed with HTTP ${limits.status}. Nothing was checked.`);
    return finish(lines, 2);
  }
  const core = limits.body.resources.core;
  log(`API budget: ${core.remaining}/${core.limit} requests left, resets at ${resetText(core.reset)}`);
  if (core.remaining < minRemaining) {
    log(`Only ${core.remaining} requests left (minimum ${minRemaining}). Skipping release lookups to keep the budget.`);
    return finish(lines, 0);
  }

  // 2. Latest release for each repository.
  let newer = false;
  for (const repo of repos) {
    const res = await github(`/repos/${repo}/releases/latest`);
    if (res.status === 404) {
      log(`${repo}: no published releases yet.`);
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      const wait = res.retryAfter ? `retry after ${res.retryAfter}s` : `resets at ${resetText(res.reset)}`;
      log(`${repo}: rate limited (HTTP ${res.status}), ${wait}.`);
      return finish(lines, 2);
    }
    if (res.status !== 200 || !res.body) {
      log(`${repo}: unexpected HTTP ${res.status}.`);
      return finish(lines, 2);
    }
    const latest = res.body.tag_name;
    const cmp = compareVersions(latest, localVersion);
    const verdict = cmp > 0 ? "NEWER release available" : cmp === 0 ? "up to date" : "local build is newer";
    log(`${repo}: latest ${latest} (${res.body.published_at}), ${verdict}`);
    log(`  ${res.body.html_url}`);
    if (cmp > 0 && repo === LOCAL_REPO) newer = true;
  }

  // 3. Machine-readable result for other steps.
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `newer=${newer}\n`);
  }
  return finish(lines, flag("--fail-if-newer") && newer ? 1 : 0);
}

async function finish(lines, code) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, "## Update check\n\n```\n" + lines.join("\n") + "\n```\n");
  }
  process.exitCode = code;
}

main().catch(error => {
  console.error("Update check failed:", error.name === "AbortError" ? "request timed out" : error.message);
  process.exitCode = 2;
});
