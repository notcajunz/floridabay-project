import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const dir = "server-data/resources/[fbrp]/fbrp_airstrike";

test("fbrp_airstrike is ensured and ships a manifest, attribution and GPL notice", () => {
  assert.match(read("server-data/config/resources.cfg"), /^ensure fbrp_airstrike$/m);
  const manifest = read(`${dir}/fxmanifest.lua`);
  for (const file of ["config.lua", "client.lua", "server.lua"]) assert.ok(manifest.includes(`'${file}'`), file);
  assert.match(manifest, /dependencies \{[^}]*'fbrp_core'/);
  const notice = read(`${dir}/NOTICE.md`);
  assert.match(notice, /mikrolai\/FIVEM-Airstrike/);
  assert.match(notice, /GPL|General Public License/);
});

test("the strike is authorised on the server for Executive Management and above only", () => {
  const server = read(`${dir}/server.lua`);
  assert.match(server, /IsStaffOnDuty/);
  assert.match(server, /GetStaffRank/);
  assert.match(server, /FROM ace_groups/);
  assert.match(server, /rank\.rank\) or -1\) < need/);
  assert.match(server, /not need/);
  assert.match(server, /RegisterNetEvent\('fbrp_airstrike:request'/);
  const authAt = server.indexOf("authorize(src)");
  const executeAt = server.indexOf("fbrp_airstrike:execute");
  assert.ok(authAt > 0 && executeAt > authAt);
  assert.doesNotMatch(read(`${dir}/client.lua`), /TriggerServerEvent\('fbrp_airstrike:execute/);
  assert.match(read(`${dir}/config.lua`), /RankName\s*=\s*'executive_management'/);
});

test("light, medium and heavy strikes keep the reference aircraft and rocket weapon", () => {
  const config = read(`${dir}/config.lua`);
  for (const key of ["light", "medium", "heavy"]) assert.match(config, new RegExp(`\\b${key} = \\{`));
  assert.match(config, /VEHICLE_WEAPON_SPACE_ROCKET/);
  assert.match(config, /bombushka/);
  assert.equal((config.match(/model = 'lazer'/g) || []).length, 6);
  const client = read(`${dir}/client.lua`);
  for (const call of ["TaskVehicleDriveToCoord", "ShootSingleBulletBetweenCoords", "AddExplosion", "NetworkExplodeVehicle", "GetFirstBlipInfoId(8)", "chat:addSuggestion"]) {
    assert.ok(client.includes(call), call);
  }
});

test("salvos are capped so the networked event pools (fire, projectile, explosion) cannot overflow", () => {
  const config = read(`${dir}/config.lua`);
  const cap = Number(config.match(/MaxRocketsPerAircraft\s*=\s*(\d+)/)[1]);
  assert.ok(cap <= 30, "cap too high");
  assert.match(read(`${dir}/client.lua`), /#out > cfg\.MaxRocketsPerAircraft/);
  for (const m of config.matchAll(/interval = (\d+)/g)) assert.ok(Number(m[1]) >= 100, "rockets fired too fast");
});

test("the inbound warning goes only to players within the configured radius of the target", () => {
  const server = read(`${dir}/server.lua`);
  assert.match(read(`${dir}/config.lua`), /WarningRadius\s*=\s*150\.0/);
  assert.match(server, /<= cfg\.WarningRadius/);
  assert.match(server, /TriggerClientEvent\('fbrp_airstrike:warn', tonumber\(id\), kind\)/);
  const client = read(`${dir}/client.lua`);
  const execute = client.slice(client.indexOf("'fbrp_airstrike:execute'"));
  assert.doesNotMatch(execute, /notifyAdv\(/);
});
