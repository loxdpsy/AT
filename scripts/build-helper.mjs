// Builds the atlas-updater helper for this computer and puts it in the output folder under its release name:
//   atlas-updater-windows.exe, atlas-updater-macos or atlas-updater-linux.
// It also prints the SHA-256 of the program, so a download can be checked.
// Needs Rust (cargo). The crate has no dependencies, so no network is needed.
// Usage: node scripts/build-helper.mjs [--no-test] [--out <folder>]
//   --no-test   skip "cargo test" (the release job runs the tests in its own step)
//   --out       where the program is written (default build/helper)
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const crate = path.join(root, "tools", "atlas-updater");
const args = process.argv.slice(2);
const noTest = args.includes("--no-test");
const outIndex = args.indexOf("--out");
const outDir = path.resolve(root, outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : "build/helper");

const releaseNames = { linux: "atlas-updater-linux", darwin: "atlas-updater-macos", win32: "atlas-updater-windows.exe" };
const releaseName = releaseNames[process.platform];
if (!releaseName) {
  console.error(`No helper release name for ${process.platform}.`);
  process.exit(1);
}
const built = process.platform === "win32" ? "atlas-updater.exe" : "atlas-updater";

function cargo(cargoArgs) {
  const result = spawnSync("cargo", cargoArgs, { cwd: crate, stdio: "inherit" });
  if (result.error) {
    console.error(`Cannot run cargo: ${result.error.message}. Install Rust from https://rustup.rs.`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`cargo ${cargoArgs.join(" ")} failed.`);
    process.exit(result.status ?? 1);
  }
}

if (!noTest) {
  console.log("Tests: cargo test --release");
  cargo(["test", "--release"]);
}
console.log("Build: cargo build --release");
cargo(["build", "--release"]);

await mkdir(outDir, { recursive: true });
const target = path.join(crate, "target", "release", built);
const dest = path.join(outDir, releaseName);
await copyFile(target, dest);
const sha256 = createHash("sha256").update(await readFile(dest)).digest("hex");
console.log(`Helper: ${path.relative(root, dest)}`);
console.log(`SHA-256: ${sha256}`);
