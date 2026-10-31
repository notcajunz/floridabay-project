import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server-data/resources/[fbrp]/fbrp_core/server/personals.lua');
const lua = fs.readFileSync(file, 'utf8');

test('a personal reached only through an organization-bound tag needs that organization on duty to spawn', () => {
  assert.match(lua, /t\.org_id,o\.name org_name FROM personal_vehicle_tags/);
  assert.match(lua, /local function tagSpawnAllowed\(source, discord, p\)/);
  assert.match(lua, /if p\.owner == discord or p\.trust\[discord\] then return true end/);
  assert.match(lua, /if not bound then return true end/);
  assert.match(lua, /orgs\[tonumber\(s\.org\.id\)\]/);
  const spawn = lua.slice(lua.indexOf('function FBRP.Personals.spawn'));
  assert.ok(spawn.indexOf('tagSpawnAllowed') > 0 && spawn.indexOf('tagSpawnAllowed') < spawn.indexOf('fbrp:vehicles:approved'));
  assert.match(lua, /Clock in as .* to spawn/);
});
