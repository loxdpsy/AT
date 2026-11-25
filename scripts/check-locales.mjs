// Checks the translations in _locales/<language>/messages.json against English (_locales/en).
// For translators: it lists what is missing, what is extra, and placeholders that do not match.
//
//   node scripts/check-locales.mjs               report every locale (exit 0)
//   node scripts/check-locales.mjs pl            report one locale, for example pl or pt_BR
//   node scripts/check-locales.mjs --strict      exit 1 when any locale has a problem
//   node scripts/check-locales.mjs --details     also list each missing key and placeholder problem
//   npm run locales:check
//
// What counts as a problem:
//   missing       a key in English that the locale does not have
//   extra         a key the locale has that English does not (it is never used by the extension)
//   empty         a message that is empty or only spaces
//   placeholder   a message whose placeholders differ from English:
//                 - a $NAME$ used in the text but not declared in "placeholders" (Chrome then shows it as is)
//                 - a declared placeholder that the text does not use
//                 - a $1, $2 ... count that differs from English
//
// Missing keys are not errors for the browser: Chrome falls back to English. The report says so, so a
// translator can see what is left to translate.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "_locales");
const BASE = "en";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const details = args.includes("--details");
const only = args.filter(a => !a.startsWith("--"));

// The placeholder names a message uses: $NAME$ (case-insensitive in Chrome) and $1..$9.
export function usedPlaceholders(text) {
  const named = new Set();
  const numbered = new Set();
  for (const m of text.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)\$/g)) named.add(m[1].toLowerCase());
  for (const m of text.matchAll(/\$([1-9])(?![0-9])/g)) numbered.add(m[1]);
  return { named, numbered };
}

// Compares one message with its English counterpart. Returns a list of problem strings (empty when fine).
export function placeholderProblems(base, local) {
  const problems = [];
  const declared = new Set(Object.keys(local.placeholders ?? {}).map(k => k.toLowerCase()));
  const used = usedPlaceholders(local.message ?? "");
  for (const name of used.named) {
    if (!declared.has(name)) problems.push(`$${name.toUpperCase()}$ is used but not declared`);
  }
  for (const name of declared) {
    if (!used.named.has(name)) problems.push(`${name.toUpperCase()} is declared but not used`);
  }
  const baseUsed = usedPlaceholders(base.message ?? "");
  if (baseUsed.numbered.size !== used.numbered.size) {
    problems.push(`numbered placeholders: English has ${baseUsed.numbered.size}, this has ${used.numbered.size}`);
  }
  return problems;
}

async function loadLocale(name) {
  const file = path.join(localesDir, name, "messages.json");
  return JSON.parse(await readFile(file, "utf8"));
}

export async function checkLocale(name, base) {
  const messages = await loadLocale(name);
  const report = { name, missing: [], extra: [], empty: [], placeholder: [] };
  for (const key of Object.keys(base)) {
    if (!(key in messages)) report.missing.push(key);
  }
  for (const key of Object.keys(messages)) {
    if (!(key in base)) {
      report.extra.push(key);
      continue;
    }
    const local = messages[key];
    if (!local || typeof local.message !== "string" || local.message.trim() === "") {
      report.empty.push(key);
      continue;
    }
    for (const problem of placeholderProblems(base[key], local)) {
      report.placeholder.push({ key, problem });
    }
  }
  report.problems = report.empty.length + report.placeholder.length + report.extra.length;
  return report;
}

async function main() {
  const base = await loadLocale(BASE);
  const names = (await readdir(localesDir, { withFileTypes: true }))
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
  const selected = only.length ? names.filter(n => only.includes(n)) : names;
  if (only.length && selected.length === 0) {
    console.error(`No locale named ${only.join(", ")}. Folders are: ${names.join(", ")}`);
    process.exit(2);
  }
  const reports = [];
  for (const name of selected) {
    if (name === BASE) continue;
    reports.push(await checkLocale(name, base));
  }

  const total = Object.keys(base).length;
  console.log(`English (${BASE}) has ${total} messages. Checked ${reports.length} other locales.\n`);
  console.log("locale    missing  extra  empty  placeholder");
  for (const r of reports) {
    console.log(
      `${r.name.padEnd(10)}${String(r.missing.length).padStart(7)}${String(r.extra.length).padStart(7)}` +
        `${String(r.empty.length).padStart(7)}${String(r.placeholder.length).padStart(12)}`
    );
  }

  if (details) {
    for (const r of reports) {
      if (!r.missing.length && !r.extra.length && !r.empty.length && !r.placeholder.length) continue;
      console.log(`\n${r.name}`);
      for (const key of r.missing) console.log(`  missing      ${key}`);
      for (const key of r.extra) console.log(`  extra        ${key}`);
      for (const key of r.empty) console.log(`  empty        ${key}`);
      for (const p of r.placeholder) console.log(`  placeholder  ${p.key}: ${p.problem}`);
    }
  }

  const withProblems = reports.filter(r => r.problems > 0).length;
  const missingTotal = reports.reduce((n, r) => n + r.missing.length, 0);
  console.log(
    `\n${withProblems} of ${reports.length} locales have an extra, empty or placeholder problem. ` +
      `${missingTotal} missing messages in total (Chrome shows English for those).`
  );
  if (strict && withProblems > 0) process.exit(1);
}

// Run only when started directly (the unit test imports the helpers).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
