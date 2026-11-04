import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const res = 'server-data/resources';
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full, out); } else out.push(full);
  }
  return out;
};

const config = read(`${res}/[fbrp]/fbrp_core/config_vmenu_tiers.lua`);
const listOf = (name) => {
  const start = config.indexOf(`${name} = {`);
  const body = config.slice(start, config.indexOf('\n}', start));
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
};

test('vMenu admin features and heavy weapons are Co-Owner and above only', () => {
  const exact = listOf('FBRP.VmenuCoOwnerObjects');
  const prefixes = listOf('FBRP.VmenuCoOwnerPrefixes');
  for (const required of ['vMenu.Staff', 'vMenu.WeaponOptions.Railgun', 'vMenu.WeaponOptions.RailgunXM3', 'vMenu.WeaponOptions.EMPLauncher',
    'vMenu.WeaponOptions.Minigun', 'vMenu.WeaponOptions.HomingLauncher', 'vMenu.WeaponOptions.RPG', 'vMenu.WeaponOptions.SpawnByName',
    'vMenu.WeaponOptions.GetAll', 'vMenu.VehicleOptions.God', 'vMenu.MiscSettings.DevTools']) assert.ok(exact.includes(required), required);
  assert.deepEqual(prefixes.sort(), ['vMenu.OnlinePlayers', 'vMenu.PlayerOptions', 'vMenu.TimeOptions', 'vMenu.WeatherOptions']);
  assert.deepEqual(listOf('FBRP.VmenuDirectorObjects'), ['vMenu.VehicleOptions.UnlimitedMultipliers']);
  assert.ok(!exact.includes('vMenu.NoClip'));
  assert.deepEqual(listOf('FBRP.VmenuSeniorObjects'), ['vMenu.NoClip', 'vMenu.MiscSettings.OverheadNames', 'vMenu.MiscSettings.PlayerBlips']);
  assert.ok(!exact.includes('vMenu.MiscSettings.OverheadNames') && !exact.includes('vMenu.MiscSettings.PlayerBlips'));
  assert.match(config, /VmenuTierGroups = \{ coowner = 'co_owner', director = 'community_director', senior = 'senior_moderator' \}/);
  assert.match(config, /VmenuTierLevel = \{ standard = 0, senior = 1, director = 2, coowner = 3 \}/);

  // Nothing restricted is granted to everyone.
  const active = read('server-data/config/permissions.cfg');
  const granted = [...active.matchAll(/^add_ace builtin\.everyone "(vMenu[^"]+)" allow$/gm)].map((match) => match[1]);
  for (const object of granted) {
    assert.ok(!exact.includes(object), `${object} must not be public`);
    assert.ok(!prefixes.some((prefix) => object === prefix || object.startsWith(`${prefix}.`)), `${object} must not be public`);
  }
  assert.ok(granted.includes('vMenu.WeaponOptions.Pistol'));
  assert.ok(granted.includes('vMenu.VehicleOptions.Engine'));

  // The ACE loader applies the tiers to stored rows, to vMenu.Everything and to the NoClip state.
  const main = read(`${res}/[fbrp]/fbrp_core/server/main.lua`);
  assert.match(main, /FBRP\.VmenuObjectsForTier\(tier, expanded\.object\)/);
  assert.match(main, /tieredAceRows\(row, groupTiers\[row\.group_name\] or 'standard'\)/);
  assert.match(main, /FBRP\.VmenuTierAllows\(groupTierCache\[group\.name\] or 'standard', 'vMenu\.NoClip'\)/);
  assert.match(read(`${res}/[fbrp]/fbrp_core/server/staffperms.lua`), /FBRP\.VmenuTierAllows\(rankTiers\[index\], target\)/);
});

test('the tier migration cleans lower groups and grants Co-Owner and Community Director tiers by rank', () => {
  const sql = read(`${res}/[fbrp]/fbrp_core/migrations/101_vmenu_staff_tiers.sql`);
  assert.match(sql, /DELETE e FROM ace_entries e[\s\S]*co\.name = 'co_owner'[\s\S]*g\.rank_order < co\.rank_order/);
  assert.match(sql, /e\.object LIKE 'vMenu\.OnlinePlayers\.%'/);
  assert.match(sql, /cd\.name = 'community_director'[\s\S]*vMenu\.VehicleOptions\.UnlimitedMultipliers/);
  assert.match(sql, /INSERT INTO ace_entries[\s\S]*g\.rank_order >= co\.rank_order/);
  assert.doesNotMatch(sql, /^--.*['"`;]/m);
  for (const object of listOf('FBRP.VmenuCoOwnerObjects')) assert.ok(sql.includes(`'${object}'`), object);
  const catalog = read('services/fbrp-bot/src/permission-catalog.js');
  assert.match(catalog, /"UnlimitedMultipliers"/);
});

test('the NoClip migration grants Senior Moderator and above by rank', () => {
  const sql = read('server-data/resources/[fbrp]/fbrp_core/migrations/104_vmenu_noclip_senior_moderator.sql');
  assert.match(sql, /'vMenu\.NoClip'[\s\S]*sm\.name = 'senior_moderator'[\s\S]*g\.rank_order >= sm\.rank_order/);
  assert.doesNotMatch(sql, /^--.*['"`;]/m);
});

test('the names and blips migration grants Senior Moderator and above by rank and the gate needs duty', () => {
  const sql = read(`${res}/[fbrp]/fbrp_core/migrations/109_vmenu_names_blips_senior_moderator.sql`);
  assert.match(sql, /sm\.name = 'senior_moderator'[\s\S]*OverheadNames[\s\S]*PlayerBlips[\s\S]*g\.rank_order >= sm\.rank_order/);
  assert.doesNotMatch(sql, /^--.*['"`;]/m);
  const gate = read(`${res}/[fbrp]/fbrp_core/client/vmenu_gate.lua`);
  assert.match(gate, /fbrp:staffSenior/);
  assert.match(gate, /data\.MSOverheadNames = false/);
  assert.match(gate, /data\.MSPlayerBlips = false/);
  assert.match(read(`${res}/[fbrp]/fbrp_core/server/main.lua`), /fbrp:staffSenior', s\.staffDuty == true and seniorTier/);
});

test('the patched vMenu build is reproducible and ships the ox_lib bridge, multiplier cap and share codes', () => {
  const patch = read('patches/vmenu-3.8.68-fbrp/fbrp.patch');
  assert.match(patch, /ox_lib:notify/);
  assert.match(patch, /VOUnlimitedMultipliers/);
  assert.match(patch, /"x2", "x4", "x8", "x16", "x32", "x64", "x128" \}/);
  assert.match(patch, /fbrp:outfitshare:create/);
  assert.match(patch, /fbrp:outfitshare:redeem/);
  assert.match(patch, /fbrp:outfitshare:import/);
  assert.match(patch, /SpawnWeaponLoadoutAsync\(SelectedSavedLoadoutName, false, false, false\)/);
  const script = read('scripts/build-vmenu-fbrp.sh');
  assert.match(script, /COMMIT=824d891075327d9fd14f11b7f4028b14e243b9d1/);
  const manifest = read(`${res}/[standalone]/vMenu/fxmanifest.lua`);
  assert.match(manifest, /dependency 'ox_lib'/);
  assert.match(manifest, /version '3\.8\.68'/);
  for (const dll of ['vMenuClient.net.dll', 'vMenuServer.net.dll']) {
    const bytes = fs.readFileSync(path.join(root, res, '[standalone]/vMenu', dll));
    assert.ok(bytes.length > 50000, dll);
  }
  const client = fs.readFileSync(path.join(root, res, '[standalone]/vMenu/vMenuClient.net.dll'));
  assert.ok(client.includes(Buffer.from('ox_lib:notify', 'utf16le')));
  assert.ok(client.includes(Buffer.from('fbrp:outfitshare:create', 'utf16le')));
  const server = fs.readFileSync(path.join(root, res, '[standalone]/vMenu/vMenuServer.net.dll'));
  assert.ok(server.includes(Buffer.from('VOUnlimitedMultipliers')));
});

test('pma-voice exclusively owns PTT and vMenu cannot disable it every frame', () => {
  const patch = read('patches/vmenu-3.8.68-fbrp/fbrp.patch');
  const active = read('server-data/config/vmenu.cfg');
  const gates = patch.match(/GetConvarInt\("vmenu_disable_voice_chat", 0\) != 1/g) || [];
  assert.equal(gates.length, 2, 'both the vMenu voice menu and voice tick must be gated');
  assert.match(patch, /Never register[\s\S]*NetworkSetVoiceActive\(false\) every frame/);
  assert.match(active, /^setr vmenu_disable_voice_chat 1$/m);
});

test('the custom fbrp notification system is gone and everything uses ox_lib', () => {
  const sources = walk(res).filter((file) => /\.(lua|js|html|css|md)$/.test(file) && !file.includes('/ox_lib/') && !file.includes('node_modules'));
  for (const file of sources) assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /fbrp:notify/, file);
  const clientMain = read(`${res}/[fbrp]/fbrp_core/client/main.lua`);
  assert.doesNotMatch(clientMain, /type='notify'/);
  const app = read(`${res}/[fbrp]/fbrp_core/web/app.js`);
  assert.doesNotMatch(app, /function notice\(|data\.type === "notify"/);
  assert.doesNotMatch(read(`${res}/[fbrp]/fbrp_core/web/index.html`), /id="notifications"/);
  assert.match(read(`${res}/[fbrp]/fbrp_core/server/main.lua`), /TriggerClientEvent\('ox_lib:notify', source, \{ description = clean\(message, 300\)/);
  // The remaining native feed notifications were moved too.
  assert.doesNotMatch(read(`${res}/[fbrp]/fbrp_guns2/cl_m203.lua`), /ThefeedPost/);
  assert.doesNotMatch(read(`${res}/[fbrp]/wk_wars2x/cl_utils.lua`), /DrawNotification/);
  assert.doesNotMatch(read(`${res}/[standalone]/lvc/UI/cl_hud.lua`), /DrawNotification/);
  assert.doesNotMatch(read(`${res}/[admin]/EasyAdmin/client/admin_client.lua`), /ThefeedPost/);
  assert.match(read(`${res}/[fbrp]/fbrp_core/client/characters.lua`), /title = 'Spawn'/);
});

test('outfit share codes: server validates and rate limits, the client shows the code', () => {
  const server = read(`${res}/[fbrp]/fbrp_core/server/outfitshare.lua`);
  const client = read(`${res}/[fbrp]/fbrp_core/client/outfitshare.lua`);
  const manifest = read(`${res}/[fbrp]/fbrp_core/fxmanifest.lua`);
  assert.match(manifest, /'server\/outfitshare\.lua'/);
  assert.match(manifest, /'client\/outfitshare\.lua'/);
  for (const event of ['create', 'redeem', 'list', 'delete']) assert.match(server, new RegExp(`RegisterNetEvent\\('fbrp:outfitshare:${event}'`));
  assert.match(server, /MAX_PAYLOAD = 60000/);
  assert.match(server, /MAX_CODES_PER_PLAYER = 20/);
  assert.match(server, /BAD_CODES_BEFORE_LOCK/);
  assert.match(server, /MALE_MODEL, FEMALE_MODEL = 1885233650, 2627665880/);
  assert.match(server, /INSERT IGNORE INTO outfit_shares/);
  // Validation must not demand nested sections by name (builds differ) and must say why it rejected.
  assert.doesNotMatch(server, /PedHeadBlendData/);
  assert.match(server, /outfit share from .* rejected: /);
  assert.ok(server.indexOf('lastCreate[src] = now') > server.indexOf('validCharacter(payload)'));
  assert.match(server, /owner_license=\?/);
  assert.match(client, /lib\.setClipboard\(code\)/);
  assert.match(client, /RegisterCommand\('outfitcodes'/);
  const sql = read(`${res}/[fbrp]/fbrp_core/migrations/102_outfit_shares.sql`);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS outfit_shares/);
  assert.doesNotMatch(sql, /^--.*['"`;]/m);
  // The alphabet has no look-alike characters and the code format matches what vMenu asks players to type.
  const alphabet = server.match(/ALPHABET = '([A-Z0-9]+)'/)[1];
  assert.equal(new Set(alphabet).size, alphabet.length);
  assert.ok(!/[01OI]/.test(alphabet));
});
