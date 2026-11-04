import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERMISSION_CATALOG } from '../src/permission-catalog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverData = path.resolve(here, '../../../server-data');
const read = (relative) => fs.readFileSync(path.join(serverData, relative), 'utf8');
const jsonc = (relative) => JSON.parse(read(relative).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n'));
const LEGACY = 'resources/[standalone]/vMenu';

test('upstream legacy vMenu 3.8.68 is restored with its official runtime files', () => {
  const manifest = read(`${LEGACY}/fxmanifest.lua`);
  assert.match(manifest, /name 'vMenu'/);
  assert.match(manifest, /version '3\.8\.68'/);
  assert.match(manifest, /github\.com\/TomGrobbe\/vMenu/);
  for (const file of ['MenuAPI.dll', 'Newtonsoft.Json.dll', 'vMenuClient.net.dll', 'vMenuServer.net.dll']) {
    assert.ok(fs.statSync(path.join(serverData, LEGACY, file)).size > 10000, file);
  }
});

test('legacy vMenu keeps the production keys, gameplay, weather and time settings', () => {
  const config = read('config/vmenu.cfg');
  const value = (name) => config.match(new RegExp(`^setr ${name} (.+)$`, 'm'))?.[1];
  assert.equal(value('vmenu_menu_toggle_key'), '"F1"');
  assert.equal(value('vmenu_noclip_toggle_key'), '"F2"');
  assert.equal(value('vmenu_keymapping_id'), '"FloridaBayRPF1"');
  assert.equal(value('vmenu_pvp_mode'), '1');
  assert.equal(value('vmenu_enable_weather_sync'), 'true');
  assert.equal(value('vmenu_enable_time_sync'), 'true');
  assert.equal(value('vmenu_keep_spawned_vehicles_persistent'), 'false');
  assert.equal(value('vmenu_delete_vehicle_distance'), '5.0');
  assert.match(value('vmenu_server_info_message'), /discord\.gg\/floridabay\b/);
  assert.doesNotMatch(config, /^exec @vMenu\.Enhanced/m);
});

test('the permission catalog and fbrp_core use legacy vMenu names directly', () => {
  assert.ok(PERMISSION_CATALOG.some((entry) => entry.object === 'vMenu.NoClip'));
  assert.ok(PERMISSION_CATALOG.every((entry) => !entry.object.startsWith('vMenu.Enhanced.')));
  const runtime = read('resources/[fbrp]/fbrp_core/config_vmenu.lua');
  const main = read('resources/[fbrp]/fbrp_core/server/main.lua');
  const manifest = read('resources/[fbrp]/fbrp_core/fxmanifest.lua');
  assert.match(runtime, /FBRP\.VmenuEverything = \{/);
  assert.match(read('resources/[fbrp]/fbrp_core/config.lua'), /FBRP\.VmenuVoicePermissions/);
  assert.match(runtime, /FBRP\.VmenuVoiceAces/);
  assert.match(main, /for _, object in ipairs\(FBRP\.VmenuEverything\)/);
  assert.doesNotMatch(main, /VmenuEnhanced|vMenu\.Enhanced:Permissions/);
  assert.match(manifest, /'client\/vmenu_gate\.lua'/);
  assert.doesNotMatch(manifest, /config_vmenu_enhanced|server\/vmenu_vehicles/);
  const gate = read('resources/[fbrp]/fbrp_core/client/vmenu_gate.lua');
  assert.match(gate, /data\.NoClip = allowed/);
  assert.match(gate, /data\.Everything = false/);
  assert.match(gate, /FBRP\.VmenuVoicePermissions/);
  assert.match(gate, /if data\[name\] ~= nil then data\[name\] = false end/);
  assert.match(gate, /for name in pairs\(data\)/);
  assert.doesNotMatch(gate, /MISC_OPTIONS|data\['MS' \.\./);
});

const SPAWNER_CLASSES = 'Compacts Sedans SUVs Coupes Muscle SportsClassic Sports Super Motorcycles OffRoad Industrial Utility Vans Cycles Boats Helicopters Planes Service Emergency Military Commercial Trains OpenWheel'.split(' ');

test('everyone keeps every base-game vehicle class without addon or wildcard access', () => {
  const active = read('config/permissions.cfg');
  assert.match(active, /^add_ace builtin\.everyone "vMenu\.VehicleSpawner\.Menu" allow$/m);
  for (const name of SPAWNER_CLASSES) {
    assert.match(active, new RegExp(`^add_ace builtin\\.everyone "vMenu\\.VehicleSpawner\\.${name}" allow$`, 'm'), name);
  }
  for (const name of ['All', 'Addon', 'SpawnByName', 'BypassRateLimit', 'DisableReplacePrevious']) {
    assert.doesNotMatch(active, new RegExp(`^add_ace builtin\\.everyone "vMenu\\.VehicleSpawner\\.${name}" allow$`, 'm'), name);
  }
});

test('public vMenu grants preserve the current restricted power tiers', () => {
  const active = read('config/permissions.cfg');
  const granted = new Set([...active.matchAll(/^add_ace builtin\.everyone "(vMenu[^\"]+)" allow$/gm)].map((match) => match[1]));
  assert.ok(granted.size > 130);
  for (const restricted of [
    'vMenu.PlayerOptions.Menu', 'vMenu.PlayerOptions.All', 'vMenu.VehicleOptions.All',
    'vMenu.VehicleOptions.PowerMultiplier', 'vMenu.VehicleOptions.TorqueMultiplier',
    'vMenu.VehicleOptions.Repair', 'vMenu.VehicleOptions.Freeze', 'vMenu.VehicleOptions.God',
    'vMenu.VehicleOptions.Invisible', 'vMenu.WeaponOptions.All', 'vMenu.WeaponOptions.GetAll',
    'vMenu.WeaponOptions.UnlimitedAmmo', 'vMenu.WeaponOptions.NoReload', 'vMenu.NoClip',
  ]) assert.equal(granted.has(restricted), false, restricted);
  assert.equal(granted.has('vMenu.VehicleOptions.Menu'), true);
  assert.equal(granted.has('vMenu.VehicleOptions.Engine'), true);
  assert.equal(granted.has('vMenu.VehicleOptions.BypassExtraDamage'), true);
  assert.equal(granted.has('vMenu.VehicleOptions.Colors'), true);
  assert.equal(granted.has('vMenu.WeaponOptions.Pistol'), true);
  assert.equal(granted.has('vMenu.WeaponOptions.TacticalRifle'), true);
});

test('the rollback migration carries Enhanced tiers and corrects addon-weapon ACE names', () => {
  const migration = read('resources/[fbrp]/fbrp_core/migrations/095_restore_legacy_vmenu.sql');
  for (const name of ['PlayerOptions.All', 'VehicleOptions.Engine', 'VehicleOptions.PowerMultiplier', 'VehicleOptions.Repair', 'VehicleOptions.Freeze', 'VehicleOptions.God', 'WeaponOptions.NoReload', 'WeaponOptions.UnlimitedAmmo', 'WeaponOptions.GetAll']) {
    assert.match(migration, new RegExp(`'vMenu\\.${name.replace('.', '\\.')}'`), name);
  }
  assert.match(migration, /WhitelistedModels\.weapon_[^']*', 'vMenu\.WeaponOptions\.WhitelistedModels\.'/);
  assert.match(migration, /DELETE FROM ace_entries[\s\S]*WhitelistedModels\.weapon_/);
  assert.doesNotMatch(migration, /^--.*['"`;]/m);
  const models = jsonc(`${LEGACY}/config/model-whitelists.json`);
  const whitelisted = models.whitelistedweapons;
  assert.equal(whitelisted.length, 23);
  assert.ok(whitelisted.includes('weapon_mp9a'));
  assert.ok(whitelisted.includes('weapon_xm7'));
  assert.deepEqual(models.whitelistedvehicle, []);
  assert.deepEqual(models.whitelistedpeds, []);
  const addons = JSON.parse(read(`${LEGACY}/config/addons.json`));
  assert.deepEqual(addons.vehicles, []);
  assert.deepEqual(addons.peds, []);
  assert.deepEqual(addons.weapons.sort(), [...whitelisted].sort());
  // This follows bot-only migrations 089-094 and is applied by the bot runner;
  // the in-game SQL splitter intentionally stops at 088.
  assert.doesNotMatch(read('resources/[fbrp]/fbrp_core/server/database.lua'), /095_restore_legacy_vmenu/);
});

test('the F7 garage only offers personals unless the catalog is switched back on', () => {
  const main = read('resources/[fbrp]/fbrp_core/server/main.lua');
  const request = main.slice(main.indexOf("RegisterNetEvent('fbrp:vehicles:request'"), main.indexOf("RegisterNetEvent('fbrp:vehicles:spawn'"));
  const spawn = main.slice(main.indexOf("RegisterNetEvent('fbrp:vehicles:spawn'"), main.indexOf('CreateThread(function()', main.indexOf("RegisterNetEvent('fbrp:vehicles:spawn'")));
  assert.match(request, /if FBRP\.Config\.garageCatalogEnabled then\s+for _,category in ipairs\(FBRP\.VehicleCatalog\)/);
  assert.match(request, /FBRP\.Personals\.category/);
  assert.match(spawn, /FBRP\.Config\.garageCatalogEnabled and FBRP\.VehicleCatalog or \{\}/);
  assert.match(read('resources/[fbrp]/fbrp_core/config.lua'), /garageCatalogEnabled = false,/);
});

test('the VIP vehicle tuning group still follows the Discord role only', () => {
  const migration = read('resources/[fbrp]/fbrp_core/migrations/094_vip_role_one_way.sql');
  assert.match(migration, /DELETE FROM discord_role_bindings[\s\S]*'1557689749198868520' AND group_name='vip_vehicle_tuning'/);
  assert.match(migration, /INSERT IGNORE INTO discord_role_sources[\s\S]*'1557689749198868520','vip_vehicle_tuning'/);
  const sync = read('../services/fbrp-bot/src/sync.js');
  assert.match(sync, /ROLE_SOURCED_GROUPS = new Set\(\[[\s\S]*"vip_vehicle_tuning"/);
});
