import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverData = path.resolve(here, '../../../server-data');
const read = (relative) => fs.readFileSync(path.join(serverData, relative), 'utf8');

test('vMenu.Everything expands without NoClip or voice chat permissions', () => {
  const source = read('resources/[fbrp]/fbrp_core/config_vmenu.lua');
  const everything = source.slice(source.indexOf('FBRP.VmenuEverything'), source.indexOf('FBRP.VmenuVoicePermissions'));
  const names = [...everything.matchAll(/'(vMenu\.[A-Za-z0-9_.]+)'/g)].map((m) => m[1]);
  assert.ok(names.length > 250, 'the expansion should cover the whole vMenu permission set');
  assert.ok(names.includes('vMenu.OnlinePlayers.Kick'));
  assert.ok(names.includes('vMenu.PlayerOptions.Menu'));
  for (const blocked of ['vMenu.Everything', 'vMenu.NoClip', 'vMenu.Dev']) assert.ok(!names.includes(blocked), blocked);
  assert.deepEqual(names.filter((name) => name.startsWith('vMenu.VoiceChat')), []);
  assert.equal(new Set(names).size, names.length, 'no duplicate permissions');
});

test('every vMenu permission is either expanded or deliberately withheld', () => {
  const cfg = read('resources/[standalone]/vMenu/config/permissions.cfg');
  const all = new Set([...cfg.matchAll(/vMenu\.[A-Za-z0-9_.]+/g)].map((m) => m[0]));
  const source = read('resources/[fbrp]/fbrp_core/config_vmenu.lua');
  const expanded = new Set([...source.slice(source.indexOf('FBRP.VmenuEverything'), source.indexOf('FBRP.VmenuVoicePermissions')).matchAll(/'(vMenu\.[A-Za-z0-9_.]+)'/g)].map((m) => m[1]));
  for (const name of all) {
    const withheld = name === 'vMenu.Everything' || name === 'vMenu.NoClip' || name === 'vMenu.Dev' || name.startsWith('vMenu.VoiceChat');
    assert.ok(expanded.has(name) !== withheld, `${name} must be ${withheld ? 'withheld' : 'expanded'}`);
  }
});

test('vMenu voice chat is denied everywhere and no longer granted', () => {
  const active = read('config/permissions.cfg');
  for (const ace of ['Menu', 'All', 'Enable', 'ShowSpeaker', 'StaffChannel']) {
    assert.match(active, new RegExp(`add_ace builtin\\.everyone "vMenu\\.VoiceChat\\.${ace}" deny`));
  }
  assert.doesNotMatch(active, /vMenu\.VoiceChat\.\w+" allow/);
  const bundled = read('resources/[standalone]/vMenu/config/permissions.cfg');
  assert.doesNotMatch(bundled, /^add_ace [^\n]*vMenu\.VoiceChat[^\n]*allow/m);
  assert.match(read('resources/[fbrp]/fbrp_core/fxmanifest.lua'), /config_vmenu\.lua/);
});

test('the client gate removes the wildcard and voice permissions and polices noclip', () => {
  const gate = read('resources/[fbrp]/fbrp_core/client/vmenu_gate.lua');
  assert.match(gate, /data\.Everything = false/);
  assert.match(gate, /data\.NoClip = allowed/);
  assert.match(gate, /FBRP\.VmenuVoicePermissions/);
  assert.match(gate, /fbrp:vmenu:unauthorizedNoclip/);
  const voice = [...read('resources/[fbrp]/fbrp_core/config_vmenu.lua').matchAll(/'(VC\w+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(voice, ['VCAll', 'VCEnable', 'VCMenu', 'VCShowSpeaker', 'VCStaffChannel']);
});
