import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('third eye uses Left Alt with screen-space player targeting', () => {
  const client = read('server-data/resources/[fbrp]/fbrp_core/client/interactions.lua');
  const web = read('server-data/resources/[fbrp]/fbrp_core/web/app.js');
  assert.match(client, /RegisterKeyMapping\('\+thirdEye',[^\n]*'LMENU'\)/);
  assert.match(client, /GetScreenCoordFromWorldCoord/);
  assert.match(client, /HasEntityClearLosToEntity/);
  assert.match(client, /type='thirdEyeTarget'/);
  assert.match(web, /data\.type === "thirdEyeTarget"/);
  assert.match(read('server-data/config/voice.cfg'), /voice_defaultRadio "CAPITAL"/);
});

test('cuffs and zip ties have props, tools, and application/removal animations', () => {
  const client = read('server-data/resources/[fbrp]/fbrp_core/client/interactions.lua');
  const server = read('server-data/resources/[fbrp]/fbrp_core/server/main.lua');
  const config = read('server-data/resources/[fbrp]/fbrp_core/config.lua');
  assert.match(client, /p_cs_cuffs_02_s/);
  assert.match(client, /prop_cs_cable_tie_01/);
  assert.match(client, /mp_arrest_paired/);
  assert.match(client, /a_uncuff/);
  assert.match(client, /IsPedShooting/);
  assert.match(client, /GetPedLastWeaponImpactCoord/);
  assert.match(client, /TriggerServerEvent\('fbrp:restraints:cuffsShot'/);
  assert.doesNotMatch(client, /ShootSingleBulletBetweenCoords/);
  assert.match(server, /BLADED_WEAPONS/);
  assert.match(server, /RegisterNetEvent\('fbrp:restraints:cuffsShot'/);
  assert.match(config, /id\s*=\s*'cutziptie'/);
  assert.doesNotMatch(config, /id\s*=\s*'shootcuffs'/);
});

test('jail and community service clear replicated restraint state', () => {
  const server = read('server-data/resources/[fbrp]/fbrp_core/server/justice.lua');
  const client = read('server-data/resources/[fbrp]/fbrp_core/client/justice.lua');
  assert.ok((server.match(/state:set\('fbrp:restrained', nil, true\)/g) || []).length >= 2);
  assert.ok((server.match(/TriggerClientEvent\('fbrp:restraints:clear'/g) || []).length >= 2);
  assert.ok((client.match(/TriggerEvent\('fbrp:restraints:clear'\)/g) || []).length >= 2);
});

test('crash damage, partial repair, and engine health HUD stay wired together', () => {
  const vehicles = read('server-data/resources/[fbrp]/fbrp_core/client/vehicles.lua');
  const economy = read('server-data/resources/[fbrp]/fbrp_core/client/economy.lua');
  const html = read('server-data/resources/[fbrp]/fbrp_core/web/index.html');
  const web = read('server-data/resources/[fbrp]/fbrp_core/web/app.js');
  assert.match(vehicles, /RegisterCommand\('repair'/);
  assert.match(vehicles, /health\+175\.0/);
  assert.match(vehicles, /SetVehicleUndriveable\(vehicle,true\)/);
  assert.match(vehicles, /engineHealth=engineHealth/);
  assert.match(economy, /RegisterCommand\('mechanicrepair'/);
  assert.match(economy, /SetVehicleEngineHealth\(vehicle, 1000\.0\)/);
  assert.match(html, /id="engine-health-bar"/);
  assert.match(web, /car\.engineHealth/);
});

test('full mechanic repair is public and supports the spaced command', () => {
  const client = read('server-data/resources/[fbrp]/fbrp_core/client/economy.lua');
  const server = read('server-data/resources/[fbrp]/fbrp_core/server/economy.lua');
  assert.match(client, /RegisterCommand\('mechanicrepair', mechanicRepair/);
  assert.match(client, /RegisterCommand\('mechanic',[\s\S]*'repair'[\s\S]*mechanicRepair\(\)/);
  const repairHandler = server.slice(server.indexOf("RegisterNetEvent('fbrp:economy:repair'"), server.indexOf("RegisterNetEvent('fbrp:economy:serve'"));
  assert.doesNotMatch(repairHandler, /if not property then return/);
  assert.match(repairHandler, /Vehicle fully repaired/);
});

test('all existing and new tags use an unconditional strong bold pass', () => {
  const tags = read('server-data/resources/[fbrp]/fbrp_core/client/tags.lua');
  const styles = read('server-data/resources/[fbrp]/fbrp_core/web/styles.css');
  assert.match(tags, /local BOLD_PASSES =/);
  assert.match(tags, /for _, offset in ipairs\(BOLD_PASSES\) do/);
  assert.match(tags, /EndTextCommandDisplayText\(x \+ offset\[1\], y \+ offset\[2\]\)/);
  assert.match(styles, /#hud-headtag, #hud-gangtag \{ font-weight: 800; \}/);
  assert.match(styles, /\.gta-head, \.gta-sub \{ font: 800/);
  assert.match(styles, /\.tag-row \.name \{[^\n]*font: 800/);
});
