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

test("the sync backs up the game host over the deploy SSH link as its own encrypted bundle", () => {
  assert.match(script, /FBRP_GAME_SSH/);
  assert.match(script, /\.ssh\/fbrp-game/);
  assert.match(script, /snapshots\/game-private-files\.tar\.gz\.enc|\$snap\/game-private-files\.tar\.gz\.enc/);
  for (const item of ["fbrp/server-data/secrets.cfg", "fbrp/server-data/server.cfg", "fbrp/txData", "fbrp/server-data/db", "fbrp/.env"]) {
    assert.ok(script.includes(item), `${item} must be captured from the game host`);
  }
});

test("the game bundle skips the pre-deploy database dumps because the database has its own snapshot", () => {
  assert.match(script, /--exclude='fbrp\/backups\/deploy'/);
});

test("an unreadable game host keeps the previous bundle and reports the sync as not fully ok", () => {
  assert.match(script, /the previous game bundle was kept/);
  assert.match(script, /result "\$game_ok" "Synced to github\.com/);
});

test("the readable server.cfg copy never carries the license key", () => {
  assert.match(script, /REPLACE_WITH_CFX_LICENSE_KEY/);
});

test("EUP packs are excluded from git add so they never become unreachable loose objects", () => {
  assert.match(script, /git add -A -- \. ":\(exclude,literal\)\$eup_path"/);
  assert.ok(script.indexOf('eup_path="server-data/resources/[eup]"') < script.indexOf("git add -A"), "eup_path must be set before the add");
});
