import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relative) => fs.readFileSync(path.join(root, 'server-data/resources', relative), 'utf8');

test('Q turns emergency lights back on: LVC verifies and retries the toggle', () => {
  const lvc = read('[standalone]/lvc/UTIL/cl_lvc.lua');
  assert.match(lvc, /local function EnsureSirenOn\(vehicle, serial\)/);
  assert.match(lvc, /if serial ~= siren_toggle_serial then return end/);
  assert.match(lvc, /SetVehicleLights\(vehicle, 0\)[\s\S]{0,160}SetVehicleSiren\(vehicle, true\)/);
  assert.match(lvc, /EnsureSirenOn\(veh, siren_toggle_serial\)/);
  // Every press bumps the serial, so a retry never fights a later press.
  assert.match(lvc, /siren_toggle_serial = siren_toggle_serial \+ 1\s+if lights_on then/);
});

test('a held "headlights off" never smothers the emergency light bar', () => {
  const menu = read('[standalone]/paradise_vehmenu/scripting/client.lua');
  assert.match(menu, /mode\.lights == 1 and IsVehicleSirenOn\(vehicle\)[\s\S]{0,80}SetVehicleLights\(vehicle, 0\)/);
});
