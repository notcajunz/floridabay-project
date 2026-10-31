import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const res = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server-data/resources/[fbrp]');
const read = (file) => fs.readFileSync(path.join(res, file), 'utf8');

test('everyone released from prison spawns at the prison gate spot', () => {
  const spot = 'vector4(1857.0015, 2600.5117, 45.6720, 288.8060)';
  assert.ok(read('fbrp_jail/config.lua').includes(`DefaultRelease = { label = 'the prison gate', coords = ${spot} }`));
  assert.match(read('fbrp_jail/config.lua'), /JailConfig\.ReleaseSpots = \{\}/);
  assert.ok(read('fbrp_core/config_systems.lua').includes(`release = ${spot}`));
});
