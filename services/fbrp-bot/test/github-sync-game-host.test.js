import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/github-sync.sh");
const script = fs.readFileSync(file, "utf8");

test("github-sync.sh is valid bash", () => {
  execFileSync("bash", ["-n", file]);
});

test("the single production host is backed up as one encrypted private bundle, with no SSH link", () => {
  assert.doesNotMatch(script, /FBRP_GAME_SSH|\.ssh\/fbrp-game|fbrp-split\.env|game-private-files/);
  assert.match(script, /private-files\.tar\.gz\.enc/);
  for (const item of ["server-data/secrets.cfg", "server-data/server.cfg", "txData", "server-data/db", "services/fbrp-bot/.env", "services/gangsmanager/gang_manager.db"]) {
    assert.ok(script.includes(item), `${item} must be captured`);
  }
});

test("the private bundle skips the pre-deploy database dumps because the database has its own snapshot", () => {
  assert.match(script, /--exclude='backups\/deploy'/);
});

test("the readable server.cfg copy never carries the license key", () => {
  assert.match(script, /REPLACE_WITH_CFX_LICENSE_KEY/);
});

test("EUP packs are excluded from git add so they never become unreachable loose objects", () => {
  assert.match(script, /git add -A -- \. ":\(exclude,literal\)\$eup_path"/);
  assert.ok(script.indexOf('eup_path="server-data/resources/[eup]"') < script.indexOf("git add -A"), "eup_path must be set before the add");
});
