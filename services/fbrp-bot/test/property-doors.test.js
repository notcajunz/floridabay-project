import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.resolve(here, '../../../server-data/resources/[fbrp]/fbrp_core');
const read = (relative) => fs.readFileSync(path.join(core, relative), 'utf8');

test('property door locks are loaded by the resource and its migration is applied', () => {
  const manifest = read('fxmanifest.lua');
  assert.ok(manifest.includes("'server/propertydoors.lua'"));
  assert.ok(manifest.includes("'client/propertydoors.lua'"));
  assert.ok(read('server/database.lua').includes('migrations/074_property_doors.sql'));
  const sql = read('migrations/074_property_doors.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS property_doors/);
  assert.ok(!/--.*[;'"]/.test(sql), 'migration comments must not contain semicolons or quotes');
});

test('doors lock one at a time for the owning organization, never as a whole property', () => {
  const server = read('server/propertydoors.lua');
  assert.match(server, /organization_members WHERE discord_id/);
  assert.match(server, /fbrp:economy:reload/);
  assert.match(server, /RegisterNetEvent\('fbrp:doors:toggle', function\(model, x, y, z\)/);
  assert.ok(!/RegisterCommand\('proplock'|RegisterCommand\('propopen'/.test(server), 'no property-wide lock commands');
  assert.ok(!/s\.staffDuty then return true end/.test(server), 'staff on duty do not hold property keys');
  const client = read('client/propertydoors.lua');
  assert.match(client, /AddDoorToSystem/);
  assert.match(client, /type = 'doorPrompt'/);
  assert.ok(!/Unlock the property doors/.test(client), 'no lock-everything prompt');
  assert.ok(!/SetEntityCoords|StartPlayerTeleport/.test(client), 'no teleports');
  assert.ok(!/keys\[key\] == true or openNow/.test(client), 'keys must not bypass the lock');
  const ui = fs.readFileSync(path.join(core, 'web/propmenu.js'), 'utf8');
  assert.match(ui, /Unlocked/);
  assert.match(ui, /Locked/);
});

test('a bought property does nothing until DevOps marks it set up', () => {
  const economy = read('server/economy.lua');
  assert.match(economy, /org_properties WHERE setup_status='ready'/);
  const doors = read('server/propertydoors.lua');
  assert.match(doors, /ready=row\.org_id ~= nil and row\.setup_status == 'ready'/);
  assert.match(doors, /if not prop\.ready then return S\.notify/);
  assert.ok(read('server/database.lua').includes('migrations/083_property_setup.sql'));
  const sql = read('migrations/083_property_setup.sql');
  assert.match(sql, /setup_status VARCHAR\(10\) NOT NULL DEFAULT 'ready'/);
  assert.match(sql, /SET DEFAULT 'pending'/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS station_doors/);
  assert.ok(!/--.*[;'"]/.test(sql), 'migration comments must not contain semicolons or quotes');
});

test('property spots, doors and stations are edited in a menu by Dev Manager and above', () => {
  const economy = read('server/economy.lua');
  assert.match(economy, /property_points/);
  assert.match(economy, /workPoint\(property\)/);
  assert.ok(read('server/database.lua').includes('migrations/076_property_points.sql'));
  const doors = read('server/propertydoors.lua');
  assert.ok(!/RegisterCommand\('propset'/.test(doors), 'no propset chat command');
  assert.ok(!/local function isCommand|can_roster/.test(doors), 'gang and business command cannot edit properties');
  assert.match(doors, /devops_members m JOIN devops_ranks r/);
  assert.match(doors, /local DEV_MANAGER_LEVEL = 5/);
  assert.match(doors, /local function canManageProperties\(source\) return isDevManager\(source\) end/);
  for (const event of ['setpoint', 'clearpoint']) {
    const handler = doors.slice(doors.indexOf(`'fbrp:propmenu:${event}'`));
    assert.match(handler.slice(0, 900), /canManageProperties\(src\)/, event);
  }
  const edit = doors.slice(doors.indexOf("'fbrp:doors:edit'"));
  assert.match(edit.slice(0, 600), /canManageProperties\(src\)/);
  const client = read('client/propertydoors.lua');
  assert.ok(!/RegisterCommand\('propdoors'/.test(client), 'no propdoors chat command');
  assert.match(client, /RegisterCommand\('propmenu'/);
  assert.match(client, /RegisterNUICallback\('propmenuAction'/);
  const manifest = read('fxmanifest.lua');
  assert.ok(manifest.includes("'web/propmenu.js'") && manifest.includes("'web/propmenu.css'"));
  const html = read('web/index.html');
  assert.ok(html.includes('propmenu.js') && html.includes('propmenu.css'));
  const eye = read('client/interactions.lua');
  for (const id of ['w_repair', 'w_work', 'w_facilities', 'w_serve', 'w_door', 'w_plate']) assert.ok(eye.includes(id), id);
  const ui = fs.readFileSync(path.join(core, 'web/app.js'), 'utf8');
  assert.ok(ui.includes('w_repair:'));
});

test('police station doors are added by Executive Management and above and only clocked-in law enforcement use them', () => {
  const doors = read('server/propertydoors.lua');
  assert.match(doors, /label='Executive Management'/);
  assert.match(doors, /local function canManageStations\(source\) return isDevManager\(source\) or isExecutiveManagement\(source\) end/);
  assert.match(doors, /s\.org\.type == 'leo'/);
  assert.match(doors, /Only law enforcement on duty can use this door/);
  assert.match(doors, /fbrp:stationdoors:add/);
  const add = doors.slice(doors.indexOf("'fbrp:stationdoors:add'"));
  assert.match(add.slice(0, 500), /canManageStations\(src\)/);
  const remove = doors.slice(doors.indexOf("'fbrp:stationdoors:remove'"));
  assert.match(remove.slice(0, 500), /canManageStations\(src\)/);
  assert.match(doors, /This door cannot be breached/);
});

test('leaving noclip never forces anyone invisible', () => {
  const tags = read('client/tags.lua');
  assert.ok(!/SetEntityVisible\(vehicle, false/.test(tags), 'own vehicle must not be hidden by fbrp');
  assert.match(tags, /wasNoclipActive and not noclipActive/);
  assert.match(tags, /ResetEntityAlpha\(ped\)/);
});

test('nothing is assumed about a property and locked doors can be breached', () => {
  const economy = read('server/economy.lua');
  assert.ok(!/return near\(coords, property, property\.radius\)/.test(economy), 'no radius fallback');
  assert.ok(!/or points\.terminal or points\.stash or property/.test(economy), 'work point has no property fallback');
  const eco = read('client/economy.lua');
  assert.ok(!/kind = 'all', x = property\.x/.test(eco), 'no combined spot at the listed coordinates');
  const doors = read('client/propertydoors.lua');
  assert.ok(!/return nearestProp\(at\.x/.test(doors), 'doors only belong to placed door spots');
  assert.match(doors, /AddExplosion/);
  const server = read('server/propertydoors.lua');
  assert.match(server, /fbrp:doors:breachPlanted/);
  assert.match(server, /property\.breach/);
  assert.match(read('client/interactions.lua'), /w_breach/);
});

test('placing a spot previews it and only saves after confirmation', () => {
  const server = read('server/propertydoors.lua');
  assert.match(server, /fbrp:propset:preview/);
  const setpoint = server.slice(server.indexOf("'fbrp:propmenu:setpoint'"), server.indexOf("'fbrp:propmenu:clearpoint'"));
  assert.ok(!/INSERT INTO property_points/.test(setpoint), 'choosing a spot must not save');
  assert.match(server, /RegisterNetEvent\('fbrp:propset:confirm'/);
  assert.match(read('client/propertydoors.lua'), /Confirm.*Cancel/);
});

test('a bar is a placeable spot and the organization site says DevOps sets properties up', () => {
  assert.match(read('server/propertydoors.lua'), /bar=true/);
  assert.match(read('server/economy.lua'), /points\.bar/);
  assert.match(read('client/economy.lua'), /bar = \{ color/);
  const portal = fs.readFileSync(path.resolve(here, '../web/orgs/orgs.js'), 'utf8');
  for (const word of ['door, door2, door3', 'terminal', 'bar', 'stash', 'armory', 'wardrobe', 'Pending from DevOps', 'DevOps sets every property up']) assert.ok(portal.includes(word), word);
  assert.ok(!portal.includes('/propset'), 'leaders are no longer told to place spots themselves');
});
