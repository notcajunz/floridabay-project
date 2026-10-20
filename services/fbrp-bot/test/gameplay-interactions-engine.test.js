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

test('RealisticVehicleFailure drives engine damage, /repair, and the engine health HUD', () => {
  const vehicles = read('server-data/resources/[fbrp]/fbrp_core/client/vehicles.lua');
  const failure = read('server-data/resources/[fbrp]/fbrp_core/client/vehicle_failure.lua');
  const manifest = read('server-data/resources/[fbrp]/fbrp_core/fxmanifest.lua');
  const economy = read('server-data/resources/[fbrp]/fbrp_core/client/economy.lua');
  const html = read('server-data/resources/[fbrp]/fbrp_core/web/index.html');
  const web = read('server-data/resources/[fbrp]/fbrp_core/web/app.js');
  assert.match(manifest, /client\/vehicle_failure\.lua/);
  assert.match(failure, /RegisterCommand\('repair'/);
  assert.match(failure, /cascadingFailureThreshold/);
  assert.match(failure, /SetVehicleUndriveable\(vehicle,true\)/);
  assert.doesNotMatch(vehicles, /RegisterCommand\('repair'/);
  assert.doesNotMatch(vehicles, /deadEngines/);
  assert.match(vehicles, /engineHealth=engineHealth/);
  assert.match(economy, /RegisterCommand\('mechanicrepair'/);
  assert.match(economy, /SetVehicleEngineHealth\(vehicle, 1000\.0\)/);
  assert.match(html, /id="engine-health-bar"/);
  assert.match(web, /car\.engineHealth/);
});

test('unbelted crashes fling the occupant forward with scaled damage, and punches are weakened', () => {
  const vehicles = read('server-data/resources/[fbrp]/fbrp_core/client/vehicles.lua');
  const medical = read('server-data/resources/[fbrp]/fbrp_core/client/medical.lua');
  assert.match(vehicles, /local function ejectFromVehicle/);
  assert.match(vehicles, /TaskLeaveVehicle\(ped,vehicle,16\)/);
  assert.match(vehicles, /SetEntityVelocity\(ped,fling\.x,fling\.y,fling\.z\)/);
  assert.match(vehicles, /SetEntityHealth\(ped,math\.max\(0,GetEntityHealth\(ped\)-damage\)\)/);
  assert.match(medical, /SetWeaponDamageModifier\(unarmed/);
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

test('bulletproof personals keep their glass in the frame', () => {
  const personals = read('server-data/resources/[fbrp]/fbrp_core/client/personals.lua');
  assert.match(personals, /SetVehicleWindowsCanBreak\(vehicle, not on\)/);
  assert.match(personals, /FixVehicleWindow\(vehicle, window\)/);
});

test('bulletproof glass stays processed so bullets stop at it, and every pane is re-sealed each frame', () => {
  const personals = read('server-data/resources/[fbrp]/fbrp_core/client/personals.lua');
  assert.match(personals, /SetDontProcessVehicleGlass\(vehicle, false\)/);
  assert.doesNotMatch(personals, /SetDontProcessVehicleGlass\(vehicle, on\)/);
  assert.match(personals, /Wait\(any and 0 or 500\)/);
});

test('Wraith ARS radar is installed and limited to LEO vehicles through fbrp_core', () => {
  const player = read('server-data/resources/[fbrp]/wk_wars2x/cl_player.lua');
  const emergency = read('server-data/resources/[fbrp]/fbrp_core/client/emergency_vehicles.lua');
  const cfg = read('server-data/config/phone.cfg');
  const config = read('server-data/resources/[fbrp]/wk_wars2x/config.lua');
  assert.match(cfg, /^ensure wk_wars2x$/m);
  assert.match(player, /exports\.fbrp_core:IsLeoVehicle/);
  assert.doesNotMatch(player, /GetVehicleClass\( PLY\.veh \) == 18/);
  assert.match(emergency, /exports\('IsLeoVehicle'/);
  assert.match(emergency, /if personalId\(vehicle\) then return false end/);
  assert.doesNotMatch(config, /key_lock = "l"/); // L is the vehicle lock key
});

test('mgmt_team members are clocked into staff automatically when their session is ready', () => {
  const main = read('server-data/resources/[fbrp]/fbrp_core/server/main.lua');
  assert.match(main, /local AUTO_CLOCKIN_GROUP = 'mgmt_team'/);
  assert.match(main, /TriggerEvent\('fbrp:playerReady', source\)\n\s+autoClockInStaff\(source\)/);
  assert.match(main, /local function clockInStaff\(source\)/);
  assert.match(main, /RegisterCommand\('clockin'[\s\S]*clockInStaff\(source\)/);
  assert.match(main, /auto=true, group=AUTO_CLOCKIN_GROUP/);
});
