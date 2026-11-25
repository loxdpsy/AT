// Writes the language pack catalogue for the offline engine: tools/atlas-updater/src/packs.json.
//
// The packs are Firefox's translation models, as Remote Settings lists them (collection "translations-models").
// Firefox ships a copy of those records in its source tree (services/settings/dumps/main/translations-models.json).
// The script reads that copy at a pinned Firefox commit, so the same files are always used. Each file's SHA-256 and
// size come from its record, and the file itself is downloaded from Remote Settings' attachment server.
//
// For each language pair the newest record version is used: base models (version 2.x) where Mozilla has them,
// otherwise the tiny models (version 1.x). A pair needs English on one side, two-letter language codes, and exactly one
// model, one shortlist (lex) and one vocabulary file. Other pairs are listed in the output, so nothing is dropped
// without a message.
//
// Usage: node scripts/make-pack-catalogue.mjs [--commit <Firefox commit>] [--dump <records file>]
//   --commit  the Firefox commit to read the records from (default: the commit pinned below)
//   --dump    a local copy of translations-models.json, instead of downloading it
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "tools", "atlas-updater", "src", "packs.json");
const FIREFOX_REPO = "mozilla-firefox/firefox";
const DUMP_PATH = "services/settings/dumps/main/translations-models.json";
const PINNED_COMMIT = "f33206f51700b26b30677ad6e29ac8d0ba891f73";
const RECORDS_URL = "https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records";
const ATTACHMENTS = "https://firefox-settings-attachments.cdn.mozilla.net/";

const args = process.argv.slice(2);
const argValue = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const commit = argValue("--commit") || PINNED_COMMIT;
const dumpFile = argValue("--dump");
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`not a full commit id: ${commit}`);

async function loadRecords() {
  let text;
  if (dumpFile) {
    text = await readFile(dumpFile, "utf8");
  } else {
    const url = `https://api.github.com/repos/${FIREFOX_REPO}/contents/${DUMP_PATH}?ref=${commit}`;
    const response = await fetch(url, { headers: { Accept: "application/vnd.github.raw" } });
    if (!response.ok) throw new Error(`cannot download ${url}: HTTP ${response.status}`);
    text = await response.text();
  }
  const data = JSON.parse(text).data;
  if (!Array.isArray(data)) throw new Error("the records file has no data list");
  return data;
}

const records = await loadRecords();
const STABLE = /^[12]\.\d+$/;
const LANGUAGE = /^[a-z]{2}$/;
const FILE_NAME = {
  model: /^model\.[a-z]{4}\.intgemm\.alphas\.bin$/,
  lex: /^lex\.50\.50\.[a-z]{4}\.s2t\.bin$/,
  vocab: /^vocab\.[a-z]{4}\.spm$/,
};
const versionKey = v => v.split(".").map(Number);

// Group the records by language pair.
const byPair = new Map();
for (const record of records) {
  if (!record.fromLang || !record.toLang) continue;
  const key = `${record.fromLang} ${record.toLang}`;
  if (!byPair.has(key)) byPair.set(key, []);
  byPair.get(key).push(record);
}

const packs = [];
const skipped = [];
for (const [languages, pairRecords] of [...byPair].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
  const [from, to] = languages.split(" ");
  const pair = from + to;
  if (!LANGUAGE.test(from) || !LANGUAGE.test(to)) {
    skipped.push(`${from}-${to}: a language code is not two letters`);
    continue;
  }
  if (from !== "en" && to !== "en") {
    continue; // Not English on either side: the offline service cannot use it.
  }
  if (!/^[a-z]{4}$/.test(pair)) continue;
  const stable = pairRecords.filter(r => STABLE.test(r.version));
  if (!stable.length) {
    skipped.push(`${from}-${to}: no stable version`);
    continue;
  }
  const best = stable.reduce((a, b) => {
    const ka = versionKey(a.version);
    const kb = versionKey(b.version);
    return kb[0] > ka[0] || (kb[0] === ka[0] && kb[1] > ka[1]) ? b : a;
  }).version;
  const current = stable.filter(r => r.version === best);
  const kinds = current.map(r => r.fileType).sort().join(",");
  if (kinds !== "lex,model,vocab") {
    skipped.push(`${from}-${to}: version ${best} has ${kinds || "no files"}`);
    continue;
  }
  const files = [];
  for (const type of ["model", "lex", "vocab"]) {
    const record = current.find(r => r.fileType === type);
    const attachment = record.attachment;
    if (!FILE_NAME[type].test(record.name) || record.name !== attachment.filename) {
      throw new Error(`${pair}: unexpected file name ${record.name}`);
    }
    // Some records repeat the hash at the top level, and some do not. The attachment's hash is always there.
    if (!/^[0-9a-f]{64}$/.test(attachment.hash) || (record.hash !== undefined && record.hash !== attachment.hash)) {
      throw new Error(`${pair}/${record.name}: the hash is missing or does not match the attachment`);
    }
    if (!attachment.location.startsWith("main-workspace/")) {
      throw new Error(`${pair}/${record.name}: unexpected attachment location ${attachment.location}`);
    }
    files.push({
      name: record.name,
      sha256: attachment.hash,
      size: attachment.size,
      url: ATTACHMENTS + attachment.location,
    });
  }
  packs.push({
    pair,
    from,
    to,
    version: best,
    bytes: files.reduce((sum, f) => sum + f.size, 0),
    files,
  });
}

const catalogue = { source: RECORDS_URL, commit, packs };
await writeFile(out, JSON.stringify(catalogue, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, out)}: ${packs.length} language packs from Firefox ${commit.slice(0, 12)}.`);
for (const line of skipped) console.log(`  skipped ${line}`);
