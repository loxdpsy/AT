// Points git at the hooks in .githooks (pre-commit and pre-push run the checks).
// Runs from "npm install" (the prepare script). Does nothing outside a git checkout.
import { spawnSync } from "child_process";
const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
if (inside.status === 0) {
  spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
}
