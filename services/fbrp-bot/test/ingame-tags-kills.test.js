import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const core = path.join(root, "server-data/resources/[fbrp]/fbrp_core");
const read = (...parts) => fs.readFileSync(path.join(...parts), "utf8");

test("headtags never draw for the local player and are smaller", () => {
  const tags = read(core, "client/tags.lua");
  assert.match(tags, /player ~= PlayerId\(\) and DoesEntityExist\(ped\)/);
  assert.doesNotMatch(tags, /ped == mine or HasEntityClearLosToEntity/);
  assert.match(tags, /TAG_SCALE = 0, 0\.38/);
});

test("F5 no longer opens third eye: the old 'interactions' command is gone", () => {
  const eye = read(core, "client/interactions.lua");
  assert.doesNotMatch(eye, /RegisterCommand\('interactions'/);
  assert.match(eye, /RegisterCommand\('thirdeyemenu'/);
  assert.match(eye, /RegisterKeyMapping\('\+thirdEye'[^\n]*'LMENU'\)/);
  assert.match(read(core, "client/main.lua"), /interactions='thirdeyemenu'/);
  for (const file of ["server-data/resources/[fbrp]/fbrp_loading/web/index.html", "server-data/resources/[fbrp]/fbrp_loading/web/loading.js"])
    assert.doesNotMatch(read(root, file), /F5/);
});

test("the phone camera keeps walking available and the irrelevant apps are hidden", () => {
  const focus = read(root, "server-data/resources/[standalone]/sky_phone/source/client/focus.lua");
  assert.match(focus, /local walk = allows_game_input\(state\) and not state\.text_input_focused/);
  assert.match(focus, /game_input = walk,/);
});

test("deaths are reported to the kill log with the killer and weapon", () => {
  assert.match(read(core, "client/medical.lua"), /GetPedSourceOfDeath\(ped\)/);
  const medical = read(core, "server/medical.lua");
  assert.match(medical, /'player\.kill'/);
  assert.match(medical, /'player\.death'/);
  assert.match(medical, /logKill\(src, info\)/);
});

test("the department leaderboard is a single department-versus-department embed", () => {
  const panels = read(root, "services/deptmanager/deptbot/cogs/panels.py");
  assert.match(panels, /return \[summary\]/);
  assert.doesNotMatch(panels, /top = \[format_hours_line/);
});

test("a blacklist quarantines the member before the role sync can hand gated roles back", () => {
  const sync = read(root, "services/fbrp-bot/src/sync.js");
  assert.match(sync, /export const blacklistInFlight = new Set\(\)/);
  assert.equal((sync.match(/blacklistInFlight\.has\(member\.id\)/g) || []).length, 2, "initial and fresh quarantine checks");
  const index = read(root, "services/fbrp-bot/src/index.js");
  assert.match(index, /blacklistPending\.add\(user\.id\);\n\s+blacklistInFlight\.add\(user\.id\);/);
  assert.match(index, /blacklistInFlight\.delete\(user\.id\);[\s\S]{0,300}enforceBlacklistRoles\(again\)/);
});
