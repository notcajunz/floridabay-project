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

test('door locks are only editable by staff on duty and honour ownership', () => {
  const server = read('server/propertydoors.lua');
  assert.match(server, /s\.staffDuty/);
  assert.match(server, /organization_members WHERE discord_id/);
  assert.match(server, /fbrp:economy:reload/);
  const client = read('client/propertydoors.lua');
  assert.match(client, /AddDoorToSystem/);
  assert.ok(!/SetEntityCoords|StartPlayerTeleport/.test(client), 'no teleports');
});

test('property spots and unlock-to-enter are wired through economy and doors', () => {
  const economy = read('server/economy.lua');
  assert.match(economy, /property_points/);
  assert.match(economy, /workPoint\(property\)/);
  assert.ok(read('server/database.lua').includes('migrations/076_property_points.sql'));
  const doors = read('server/propertydoors.lua');
  assert.match(doors, /fbrp:doors:toggle/);
  assert.match(doors, /RegisterCommand\('propset'/);
  const client = read('client/propertydoors.lua');
  assert.match(client, /Unlock the property doors/);
  assert.ok(!/keys\[key\] == true or openNow/.test(client), 'keys must not bypass the lock');
});

test('the command of a gang or business can place spots, and the third eye offers world actions', () => {
  const doors = read('server/propertydoors.lua');
  assert.match(doors, /local function isCommand/);
  assert.match(doors, /m\.manager,r\.can_roster/);
  assert.match(doors, /canEdit\(src, prop\)/);
  const eye = read('client/interactions.lua');
  for (const id of ['w_repair', 'w_work', 'w_hub', 'w_serve', 'w_door', 'w_plate']) assert.ok(eye.includes(id), id);
  const ui = fs.readFileSync(path.join(core, 'web/app.js'), 'utf8');
  assert.ok(ui.includes('w_repair:'));
});

test('leaving noclip never forces anyone invisible', () => {
  const tags = read('client/tags.lua');
  assert.ok(!/SetEntityVisible\(vehicle, false/.test(tags), 'own vehicle must not be hidden by fbrp');
  assert.match(tags, /wasNoclipActive and not noclipActive/);
  assert.match(tags, /ResetEntityAlpha\(ped\)/);
});

test('staff need Community Manager or above to edit any property', () => {
  const doors = read('server/propertydoors.lua');
  assert.match(doors, /hasStaffGroupAtLeast\(source, 'community_manager'\)/);
  assert.match(read('server/main.lua'), /hasStaffGroupAtLeast = hasStaffGroupAtLeast/);
});
