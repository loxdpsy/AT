// Writes the language pack catalogue for the offline engine: tools/atlas-updater/src/packs.json.
//
// The packs are the Firefox translation models in mozilla/firefox-translations-models (tiny architecture).
// Each pack file is a Git LFS object. This script reads the LFS pointer files (SHA-256 and size of each file) from a
// shallow clone, so nothing large is downloaded. The catalogue pins the commit, so the same files are always used.
//
// Usage: node scripts/make-pack-catalogue.mjs [--repo <clone folder>]
//   Without --repo, the repository is cloned into a temporary folder (needs git and network).
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "tools", "atlas-updater", "src", "packs.json");
const SOURCE = "https://github.com/mozilla/firefox-translations-models";
const REPO_PATH = "mozilla/firefox-translations-models";
const ARCHITECTURE = "tiny";
const args = process.argv.slice(2);
const repoIndex = args.indexOf("--repo");

function git(cwd, gitArgs, env = {}) {
  const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`git ${gitArgs.join(" ")} failed: ${(result.stderr || "").trim()}`);
  return result.stdout.trim();
}

let repo = repoIndex >= 0 ? path.resolve(args[repoIndex + 1]) : null;
if (!repo) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "ftm-"));
  repo = path.join(temp, "repo");
  // Pointers only: LFS objects are not downloaded by the clone.
  git(temp, ["clone", "--depth", "1", SOURCE, repo], { GIT_LFS_SKIP_SMUDGE: "1" });
}
const commit = git(repo, ["rev-parse", "HEAD"]);

// An LFS pointer: "version ...", "oid sha256:<64 hex>", "size <bytes>".
function parsePointer(text) {
  const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(text);
  const size = /^size (\d+)$/m.exec(text);
  if (!oid || !size) return null;
  return { sha256: oid[1], size: Number(size[1]) };
}

const modelsDir = path.join(repo, "models", ARCHITECTURE);
const packs = [];
for (const pair of (await readdir(modelsDir)).sort()) {
  const dir = path.join(modelsDir, pair);
  if (!(await stat(dir)).isDirectory()) continue;
  if (!/^[a-z]{2}[a-z]{2}$/.test(pair)) throw new Error(`Unexpected pair folder name: ${pair}`);
  const files = [];
  for (const name of (await readdir(dir)).sort()) {
    // Only the three model files. metadata.json and anything else are not needed to translate.
    if (!/^(model\..+\.intgemm\.alphas\.bin|vocab\..+\.spm|lex\.50\.50\..+\.s2t\.bin)\.gz$/.test(name)) continue;
    const pointer = parsePointer(await readFile(path.join(dir, name), "utf8"));
    if (!pointer) throw new Error(`${pair}/${name} is not an LFS pointer. Is the clone complete?`);
    files.push({
      name,
      sha256: pointer.sha256,
      size: pointer.size,
      url: `https://media.githubusercontent.com/media/${REPO_PATH}/${commit}/models/${ARCHITECTURE}/${pair}/${name}`,
    });
  }
  const kinds = files.map(f => f.name.split(".")[0]).sort().join(",");
  if (kinds !== "lex,model,vocab") throw new Error(`${pair} has the wrong files: ${kinds}`);
  packs.push({
    pair,
    from: pair.slice(0, 2),
    to: pair.slice(2, 4),
    bytes: files.reduce((sum, f) => sum + f.size, 0),
    files,
  });
}

const catalogue = { source: SOURCE, commit, architecture: ARCHITECTURE, packs };
await writeFile(out, JSON.stringify(catalogue, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, out)}: ${packs.length} language packs from ${commit.slice(0, 12)}.`);
