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

const SPAWNER_CLASSES = 'Compacts Sedans SUVs Coupes Muscle SportsClassic Sports Super Motorcycles OffRoad Industrial Utility Vans Cycles Boats Helicopters Planes Service Emergency Military Commercial Trains OpenWheel'.split(' ');

test('everyone can use the vMenu vehicle spawner for every base-game class only', () => {
  const active = read('config/permissions.cfg');
  assert.match(active, /^add_ace builtin\.everyone "vMenu\.VehicleSpawner\.Menu" allow$/m);
  for (const name of SPAWNER_CLASSES) {
    assert.match(active, new RegExp(`^add_ace builtin\\.everyone "vMenu\\.VehicleSpawner\\.${name}" allow$`, 'm'), name);
  }
  // .All is the parent of Addon, SpawnByName and the rate-limit bypasses, so it stays ungranted.
  for (const name of ['All', 'Addon', 'SpawnByName', 'BypassRateLimit', 'DisableReplacePrevious', 'WhitelistedModels.All']) {
    assert.doesNotMatch(active, new RegExp(`^add_ace [^\\n]*vMenu\\.VehicleSpawner\\.${name.replace('.', '\\.')}"[^\\n]* allow`, 'm'), name);
  }
  assert.doesNotMatch(active, /vMenu\.Everything" allow/);
  assert.doesNotMatch(active, /^add_ace group\.[^\n]*vMenu\.VehicleSpawner/m);
});

test('the bundled vMenu permission files grant the same spawner access and stay identical', () => {
  const config = read('resources/[standalone]/vMenu/config/permissions.cfg');
  assert.equal(config, read('resources/[standalone]/vMenu/config.pre-game-mount/permissions.cfg'));
  assert.match(config, /^add_ace builtin\.everyone "vMenu\.VehicleSpawner\.Menu" allow$/m);
  for (const name of SPAWNER_CLASSES) assert.match(config, new RegExp(`^add_ace builtin\\.everyone "vMenu\\.VehicleSpawner\\.${name}" allow$`, 'm'), name);
  for (const name of ['All', 'Addon', 'SpawnByName', 'BypassRateLimit', 'DisableReplacePrevious']) {
    assert.doesNotMatch(config, new RegExp(`^add_ace [^\\n]*vMenu\\.VehicleSpawner\\.${name}" allow`, 'm'), name);
  }
});

test('the F7 garage only offers personals unless the catalog is switched back on', () => {
  const main = read('resources/[fbrp]/fbrp_core/server/main.lua');
  const request = main.slice(main.indexOf("RegisterNetEvent('fbrp:vehicles:request'"), main.indexOf("RegisterNetEvent('fbrp:vehicles:spawn'"));
  const spawn = main.slice(main.indexOf("RegisterNetEvent('fbrp:vehicles:spawn'"), main.indexOf("CreateThread(function()", main.indexOf("RegisterNetEvent('fbrp:vehicles:spawn'")));
  assert.match(request, /if FBRP\.Config\.garageCatalogEnabled then\s+for _,category in ipairs\(FBRP\.VehicleCatalog\)/);
  assert.match(request, /FBRP\.Personals\.category/);
  assert.doesNotMatch(request.replace(/if FBRP\.Config\.garageCatalogEnabled then[\s\S]*?\n    end\n/, ''), /VehicleCatalog/);
  assert.match(spawn, /FBRP\.Config\.garageCatalogEnabled and FBRP\.VehicleCatalog or \{\}/);
  assert.doesNotMatch(spawn.replace('FBRP.Config.garageCatalogEnabled and FBRP.VehicleCatalog or {}', ''), /VehicleCatalog/);
  assert.match(read('resources/[fbrp]/fbrp_core/config.lua'), /garageCatalogEnabled = false,/);
});
