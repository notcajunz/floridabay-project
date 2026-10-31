import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const core = 'server-data/resources/[fbrp]/fbrp_core/';

test('tag wardrobe uses RageUI instead of ox_lib or the custom core NUI', () => {
  const manifest = read(`${core}fxmanifest.lua`);
  const tags = read(`${core}client/tags.lua`);
  const app = read(`${core}web/app.js`);

  assert.match(manifest, /'@RageUI\/RMenu\.lua'/);
  assert.match(manifest, /'@RageUI\/menu\/RageUI\.lua'/);
  assert.match(manifest, /dependency 'RageUI'/);
  assert.match(tags, /RageUI\.CreateMenu\(/);
  assert.match(tags, /RageUI\.CreateSubMenu\(/);
  assert.match(tags, /RageUI\.IsVisible\(/);
  assert.match(tags, /RageUI\.Button\(/);
  assert.doesNotMatch(tags, /lib\.registerMenu|lib\.showMenu/);
  assert.doesNotMatch(tags, /registerContext|showContext/);
  assert.doesNotMatch(tags, /FBRP\.OpenMenu\('tags'/);
  assert.doesNotMatch(app, /renderTags|tagsData|tagSelected|data-tag-id|equipTag/);
});

test('HUD status matches the plain-text priority reference while retaining live state', () => {
  const html = read(`${core}web/index.html`);
  const styles = read(`${core}web/styles.css`);
  const app = read(`${core}web/app.js`);
  const status = html.match(/<section[^>]*class="status scaled"[^>]*>([\s\S]*?)<\/section>/)?.[1] || '';

  assert.match(status, /Florida Bay Roleplay \(Server 1\)/);
  assert.match(status, /id="game-time"/);
  assert.match(status, /id="aop"/);
  assert.match(status, /id="priority-list"/);
  assert.match(status, /id="hud-headtag"/);
  assert.match(status, />Job</);
  assert.match(styles, /\.status \{[\s\S]*?width: 380px;/);
  assert.match(styles, /\.status \{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
  assert.match(styles, /font-family: "Proxima Nova"/);
  assert.match(app, /zancudo: "Fort Zancudo"/);
  assert.match(app, /ls: "Los Angeles"/);
  assert.match(app, /renderPriorityRows\(data\.priorities, priority, !!data\.peacetime\)/);
  assert.match(app, /data\.staffDuty \? "Staff"/);
  assert.match(styles, /\.id-badge, \.voice \{ background: transparent; border: 0; box-shadow: none; \}/);
});

test('custom HUD is an iframe page that persists live player customization and hides the native vitals', () => {
  const html = read(`${core}web/index.html`);
  const hud = read(`${core}client/hud.lua`);
  const minimap = read(`${core}client/hud_minimap.lua`);
  const manifest = read(`${core}fxmanifest.lua`);
  assert.match(html, /<iframe id="hud-frame"[^>]*src="hud\/index\.html"/);
  assert.match(hud, /RegisterCommand\(HudConfig\.Command/);
  assert.match(hud, /SetResourceKvp\(SETTINGS_KEY/);
  assert.match(hud, /RegisterNUICallback\('hud_saveSettings'/);
  assert.match(minimap, /SETUP_HEALTH_ARMOUR/);
  assert.match(minimap, /ScaleformMovieMethodAddParamInt\(3\)/);
  for (const file of ['index.html', 'style.css', 'app.js']) assert.ok(read(`${core}web/hud/${file}`).length > 100, file);
  assert.match(manifest, /'config_hud\.lua'/);
  assert.match(manifest, /'client\/hud_minimap\.lua'/);
  assert.match(manifest, /'web\/hud\/\*\.mp3'|'web\/hud\/sfx\/\*\.mp3'/);
});

test('MDT no longer renders the unit map', () => {
  const app = read(`${core}web/app.js`);
  assert.doesNotMatch(app, /function cadMap|Live map|<div class="eyebrow">Map<\/div>|map-unit|map-call/);
  assert.match(app, /<div class="eyebrow">Units · \$\{units\.length\}/);
});

test('organization hub is removed and physical facilities use a focused native menu', () => {
  const app = read(`${core}web/app.js`);
  const economy = read(`${core}client/economy.lua`);
  const interactions = read(`${core}client/interactions.lua`);
  const main = read(`${core}client/main.lua`);
  const server = read(`${core}server/economy.lua`);

  assert.doesNotMatch(app, /hubCard\("org"/);
  assert.doesNotMatch(app, /action: "org"/);
  assert.doesNotMatch(app, /orghub: renderOrgHub/);
  assert.doesNotMatch(economy, /RegisterKeyMapping\('org'/);
  assert.doesNotMatch(economy, /RegisterCommand\('org'/);
  assert.doesNotMatch(main, /org='org'/);
  assert.match(economy, /lib\.registerMenu\(\{/);
  assert.match(economy, /id = 'fbrp_org_facilities'/);
  assert.match(interactions, /FBRP\.OpenFacilities/);
  assert.match(server, /mode ~= 'armory' and mode ~= 'wardrobe' and mode ~= 'facilities'/);
  assert.match(server, /Use the wardrobe at your organization property or department station/);
});

test('character, spawn and MDT layouts use the restrained interface revision', () => {
  const app = read(`${core}web/app.js`);
  const styles = read(`${core}web/styles.css`);

  assert.match(app, /class="onboarding character-select"/);
  assert.match(app, /data-character-preview/);
  assert.match(app, /class="onboarding spawn-select"/);
  assert.match(app, /data-spawn-preview/);
  assert.match(app, /class="cad-nav-section"/);
  assert.match(styles, /2026 interface revision/);
  assert.match(styles, /\.menu-shell\.onboarding-mode/);
  assert.match(styles, /\.cad-grid-stats \{ display: grid; grid-template-columns: 180px repeat\(6, 1fr\)/);
});

test('loading screen enables the FiveM cursor and renders the supplied custom pointer', () => {
  const base = 'server-data/resources/[fbrp]/fbrp_loading/';
  const manifest = read(`${base}fxmanifest.lua`);
  const html = read(`${base}web/index.html`);
  const css = read(`${base}web/assets/css/style.css`);
  const js = read(`${base}web/assets/scripts/main.js`);

  assert.match(manifest, /loadscreen_cursor 'yes'/);
  assert.match(html, /id="cursor"/);
  assert.match(css, /#cursor/);
  assert.match(js, /#cursor/);
});

test('chat uses restrained non-branded chrome', () => {
  const html = read('server-data/resources/[standalone]/fbrp_chat/web/index.html');
  const css = read('server-data/resources/[standalone]/fbrp_chat/web/style.css');
  assert.doesNotMatch(html, /brand-mark|brand-name/);
  assert.match(css, /html, body \{[^}]*background: transparent/);
});

test('vehicle controls are the paradise_vehmenu resource, not the custom core panel', () => {
  const manifest = read(`${core}fxmanifest.lua`);
  const vehicles = read(`${core}client/vehicles.lua`);
  const app = read(`${core}web/app.js`);
  const html = read(`${core}web/index.html`);
  const resource = 'server-data/resources/[standalone]/paradise_vehmenu/';
  const config = read(`${resource}config.lua`);
  const client = read(`${resource}scripting/client.lua`);


  assert.match(manifest, /dependency 'paradise_vehmenu'/);
  assert.ok(!existsSync(path.join(root, 'server-data/resources/[standalone]/vehcontrol')));
  assert.match(config, /Config\.Command = 'vehmenu'/);
  assert.match(config, /Config\.Keybind = 'K'/);
  assert.doesNotMatch(vehicles, /carcontrols|vehicleControl|closeCarControls/);
  assert.doesNotMatch(app, /carcontrols|car-controls|carControls|closeCarControls|data-car\]/);
  assert.doesNotMatch(html, /id="car-controls"/);
  assert.match(read(`${core}client/main.lua`), /vehcontrol='vehmenu'/);

  // fbrp_core owns /engine and /carradio, so the menu must not register its own copies.
  assert.doesNotMatch(client, /RegisterCommand\((Config\.RadioCommand|'carradio'|'engine'|"engine")/);
  assert.match(client, /ExecuteCommand\(Config\.EngineCommand\)/);
  assert.match(client, /ExecuteCommand\(Config\.RadioCommand\)/);
  assert.doesNotMatch(client, /SetVehicleDoorsLocked/);
});

test('vehicle menu has headlight, high beam and interior light highlight toggles', () => {
  const resource = 'server-data/resources/[standalone]/paradise_vehmenu/';
  const client = read(`${resource}scripting/client.lua`);
  const bundle = readdirSync(path.join(root, resource, 'build/assets'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => read(`${resource}build/assets/${file}`)).join('\n');

  assert.match(client, /controlId == 'headlights'/);
  assert.match(client, /lightMode\[vehicle\] = \{ lights = 2, fullbeam = false \}/);
  assert.match(client, /lightMode\[vehicle\] = \{ lights = 2, fullbeam = true \}/);
  assert.match(client, /SetVehicleInteriorlight\(vehicle, state\)/);
  assert.match(client, /GetVehicleLightsState\(vehicle\)/);
  for (const id of ['headlights', 'highbeams', 'interior']) assert.match(bundle, new RegExp(`id:"${id}"`));
  assert.match(bundle, /Headlights/);
  assert.match(bundle, /High Beams/);
});

test('legacy vMenu admin features expand Everything without exposing NoClip or voice', () => {
  const config = read(`${core}config_vmenu.lua`);
  const main = read(`${core}server/main.lua`);
  const cfg = read('server-data/config/vmenu.cfg');
  const manifest = read('server-data/resources/[standalone]/vMenu/fxmanifest.lua');

  assert.match(config, /FBRP\.VmenuEverything = \{/);
  assert.match(config, /'vMenu\.OnlinePlayers\.Kick'/);
  assert.match(read(`${core}config.lua`), /FBRP\.VmenuVoicePermissions = \{/);
  assert.doesNotMatch(config, /'vMenu\.NoClip'/);
  assert.match(main, /for _, object in ipairs\(FBRP\.VmenuEverything\)/);
  assert.match(cfg, /setr vmenu_use_permissions true/);
  assert.match(manifest, /version '3\.8\.68'/);
});

test('loading screen limits uppercase styling to compact interface labels', () => {
  const css = read('server-data/resources/[fbrp]/fbrp_loading/web/assets/css/style.css');
  const html = read('server-data/resources/[fbrp]/fbrp_loading/web/index.html');
  assert.match(css, /\.eyebrow[\s\S]*?text-transform: uppercase/);
  assert.match(css, /\.link small[\s\S]*?text-transform: uppercase/);
  assert.doesNotMatch(css, /body\s*\{[^}]*text-transform: uppercase/);
  assert.doesNotMatch(html, /HIDE COVER/);
});

test('ox_lib notifications default to the center right and the garage is an ox_lib menu', () => {
  const settings = read('server-data/resources/[deps]/ox_lib/resource/settings.lua');
  const vehicles = read(`${core}client/vehicles.lua`);

  assert.match(settings, /'notification_position', 'center-right'\)/);
  assert.match(vehicles, /lib\.registerMenu\(/);
  assert.match(vehicles, /lib\.showMenu\(/);
  assert.doesNotMatch(vehicles, /OpenMenu\('vehicles'/);
});
