import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.resolve(here, '../../../server-data/resources/[fbrp]/fbrp_core');
const read = (file) => fs.readFileSync(path.join(core, file), 'utf8');

// client/vmenu_gate.lua runs in the game client, so every FBRP.* table it reads has to come from
// a shared script. Reading a server-only one made the gate error out before it could grant NoClip.
test('vMenu gate only reads FBRP tables that the client loads', () => {
  const manifest = read('fxmanifest.lua');
  const shared = manifest.match(/shared_scripts\s*\{([^}]*)\}/)[1];
  const sharedFiles = [...shared.matchAll(/'([^'@][^']*\.lua)'/g)].map((m) => m[1]);
  const defined = new Set();
  for (const file of sharedFiles) {
    for (const m of read(file).matchAll(/^FBRP\.(\w+)\s*=/gm)) defined.add(m[1]);
  }
  const used = [...read('client/vmenu_gate.lua').matchAll(/FBRP\.(\w+)/g)].map((m) => m[1]);
  assert.ok(used.length > 0);
  for (const name of used) assert.ok(defined.has(name), `FBRP.${name} is not defined by a shared script`);
});
