// Runs every tests/unit/*.test.mjs file in its own Node process. Exits 1 if any file fails.
// Run it with: npm test
import { readdirSync } from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "unit");
const files = readdirSync(dir).filter(name => name.endsWith(".test.mjs")).sort();
let failed = 0;
for (const name of files) {
  const run = spawnSync(process.execPath, [path.join(dir, name)], { encoding: "utf8" });
  if (run.status === 0) {
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    process.stdout.write(run.stdout || "");
    process.stderr.write(run.stderr || "");
  }
}
if (failed) {
  console.log(`${failed} unit test file(s) failed.`);
  process.exit(1);
}
console.log(`All ${files.length} unit test files passed.`);
