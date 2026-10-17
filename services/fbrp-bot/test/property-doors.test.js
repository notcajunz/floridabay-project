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
