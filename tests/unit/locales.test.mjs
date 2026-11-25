// Tests for scripts/check-locales.mjs. The last test is a guard: no locale may use a placeholder that
// differs from English. Missing messages are reported, but they are not failures (Chrome shows English for them).
import assert from "assert";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { usedPlaceholders, placeholderProblems, checkLocale } from "../../scripts/check-locales.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// usedPlaceholders reads $NAME$ (any case) and $1..$9
{
  const used = usedPlaceholders("Hello $NAME$, you have $1 new and $name$ and $2.");
  assert.deepStrictEqual([...used.named].sort(), ["name"]);
  assert.deepStrictEqual([...used.numbered].sort(), ["1", "2"]);
}

// A declared placeholder that the text does not use (the Czech bug): reported
{
  const en = { message: "Updated to $EXTENSION_VERSION$.", placeholders: { EXTENSION_VERSION: { content: "$1" } } };
  const badCs = { message: "Aktualizováno na $EXTENSION_NAME$.", placeholders: { EXTENSION_VERSION: { content: "$1" } } };
  const problems = placeholderProblems(en, badCs);
  assert.ok(problems.some(p => p.includes("EXTENSION_VERSION is declared but not used")), problems.join(" | "));
  assert.ok(problems.some(p => p.includes("$EXTENSION_NAME$ is used but not declared")), problems.join(" | "));
}

// A correct translation has no problems
{
  const en = { message: "Hi $NAME$ ($1)", placeholders: { NAME: { content: "$1" } } };
  const good = { message: "Ahoj $NAME$ ($1)", placeholders: { NAME: { content: "$1" } } };
  assert.deepStrictEqual(placeholderProblems(en, good), []);
}

// A numbered placeholder that is missing from the translation is reported
{
  const en = { message: "From $1 to $2" };
  const short = { message: "Od $1" };
  assert.ok(placeholderProblems(en, short).some(p => p.includes("numbered placeholders")));
}

// Every locale in the repository: no placeholder problems, no empty messages, no extra keys
{
  const base = JSON.parse(await readFile(path.join(root, "_locales", "en", "messages.json"), "utf8"));
  const { readdir } = await import("node:fs/promises");
  const names = (await readdir(path.join(root, "_locales"), { withFileTypes: true }))
    .filter(e => e.isDirectory() && e.name !== "en")
    .map(e => e.name);
  for (const name of names) {
    const report = await checkLocale(name, base);
    assert.deepStrictEqual(report.placeholder, [], `${name} has placeholder problems`);
    assert.deepStrictEqual(report.empty, [], `${name} has empty messages`);
    assert.deepStrictEqual(report.extra, [], `${name} has keys that English does not have`);
  }
}

console.log("locales.test.mjs: all assertions passed");
