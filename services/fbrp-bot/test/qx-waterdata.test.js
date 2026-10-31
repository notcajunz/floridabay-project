import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('qx-waterdata is tracked, starts in the resource order, and has a complete client manifest', () => {
  const resource = 'server-data/resources/[fbrp]/qx-waterdata/';
  const manifest = read(`${resource}fxmanifest.lua`);
  const resources = read('server-data/config/resources.cfg');

  assert.match(resources, /^ensure qx-waterdata$/m);
  assert.match(manifest, /^shared_script 'config\.lua'$/m);
  assert.match(manifest, /^client_script 'client\.lua'$/m);
  assert.ok(fs.statSync(path.join(root, resource, 'config.lua')).size > 0);
  assert.ok(fs.statSync(path.join(root, resource, 'client.lua')).size > 0);
});

test('startup discards only an empty non-traversable qx-waterdata cache', () => {
  const startup = read('start.sh');
  assert.match(startup, /qx_water_cache=.*qx-waterdata/);
  assert.match(startup, /\[\[ -d "\$qx_water_cache" && ! -x "\$qx_water_cache" \]\]/);
  assert.match(startup, /rmdir "\$qx_water_cache"/);
  assert.doesNotMatch(startup, /rm -rf/);
});
