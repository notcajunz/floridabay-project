import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const core = path.join(root, "server-data/resources/[fbrp]/fbrp_core");
const read = (...parts) => fs.readFileSync(path.join(...parts), "utf8");

test("headtags never draw for the local player and come from the Jaxtti-derived fbrp_tags resource", () => {
  const tags = read(root, "server-data/resources/[fbrp]/fbrp_tags/client/render.lua");
  assert.match(tags, /if player ~= mine or preview then/);
  assert.match(tags, /RegisterCommand\('selftag'/);
  assert.doesNotMatch(read(root, "server-data/resources/[fbrp]/fbrp_tags/server/main.lua"), /fbrp\.dev\.tagpreview/);
  assert.match(tags, /Player\(serverId\)\.state/);
  assert.match(tags, /'fbrp:headtag'/);
  assert.match(tags, /'fbrp:gangtag'/);
  assert.match(tags, /fbrp:noclip/);
  assert.match(tags, /RegisterCommand\('hidetags'/);
  assert.match(read(root, "server-data/resources/[fbrp]/fbrp_tags/client/functions.lua"), /function DrawTagStack/);
  assert.doesNotMatch(read(core, "client/tags.lua"), /GetPedBoneCoords|RegisterCommand\('hidetags'/);
  assert.match(read(root, "server-data/config/phone.cfg"), /^ensure fbrp_tags$/m);
});

test("fbrp_tags keeps staff tag-toggle server-validated and ID cards limited to LEO/fire duty", () => {
  const server = read(root, "server-data/resources/[fbrp]/fbrp_tags/server/main.lua");
  assert.match(server, /state\['fbrp:staffDuty'\] ~= true/);
  assert.match(server, /cfg\.badgeOrgTypes\[org\.type\]/);
  const config = read(root, "server-data/resources/[fbrp]/fbrp_tags/config.lua");
  assert.match(config, /badgeOrgTypes = \{ leo = true, fire = true \}/);
  const ui = read(root, "server-data/resources/[fbrp]/fbrp_tags/ui/script.js");
  assert.match(ui, /escapeHtml\(info\.name\)/);
});

test("F5 no longer opens third eye: the old 'interactions' command is gone", () => {
  const eye = read(core, "client/interactions.lua");
  assert.doesNotMatch(eye, /RegisterCommand\('interactions'/);
  assert.match(eye, /RegisterCommand\('thirdeyemenu'/);
  assert.match(eye, /RegisterKeyMapping\('\+thirdEye'[^\n]*'LMENU'\)/);
  assert.match(read(core, "client/main.lua"), /interactions='thirdeyemenu'/);
  for (const file of ["server-data/resources/[fbrp]/fbrp_loading/web/index.html", "server-data/resources/[fbrp]/fbrp_loading/web/assets/scripts/config.js"])
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
  assert.match(medical, /RegisterNetEvent\('fbrp:medical:died'/);
  assert.match(medical, /FBRP\.DB\.audit\([^)]*'player\.kill'/);
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

test("fbrp_chat carries the Jaxtti chat: staff rank badge, chat tag, cards and moderation on fbrp_core state", () => {
  const server = read(root, "server-data/resources/[standalone]/fbrp_chat/server/main.lua") + read(root, "server-data/resources/[standalone]/fbrp_chat/server/commands.lua");
  assert.match(server, /fbrp:chatTag/);
  assert.match(server, /core\('GetStaffRank', src\)/);
  for (const command of ["youtube", "tiktok", "twt", "twtname", "vpn", "sms", "reply", "allstaff", "mute", "unmute", "chatclear", "hidestaffrank", "leoannounce"])
    assert.match(server, new RegExp(`(RegisterCommand|advertisement|post)\\('${command}'`));
  assert.doesNotMatch(server, /RegisterCommand\('(staff|ondutystaff|panic)'/);
  assert.match(read(root, "server-data/resources/[standalone]/fbrp_chat/client/main.lua"), /RegisterCommand\('chattag'/);
  assert.match(read(core, "fxmanifest.lua"), /server_export 'GetStaffRank'/);
  assert.match(read(root, "server-data/resources/[standalone]/fbrp_chat/web/app.js"), /badgesHtml/);
});
