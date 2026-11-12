import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

test('vehicle YouTube audio is synchronized, occupant-controlled and spatial', () => {
  const base = 'server-data/resources/[fbrp]/fbrp_core/';
  const manifest = read(`${base}fxmanifest.lua`);
  const server = read(`${base}server/vehicle_radio.lua`);
  const client = read(`${base}client/vehicle_radio.lua`);

  assert.match(manifest, /server\/vehicle_radio\.lua/);
  assert.match(manifest, /client\/vehicle_radio\.lua/);
  assert.match(server, /playerVehicle\(src, netId\)/);
  assert.match(server, /videoId:match/);
  assert.match(client, /occupiedVehicle == vehicle/);
  assert.match(client, /distance < maxDistance/);
  assert.match(client, /falloff \* falloff/);
});

test('vehicle YouTube audio controls require the configured Discord role', () => {
  const base = 'server-data/resources/[fbrp]/fbrp_core/';
  const config = read(`${base}config.lua`);
  const main = read(`${base}server/main.lua`);
  const server = read(`${base}server/vehicle_radio.lua`);
  const client = read(`${base}client/vehicle_radio.lua`);
  const clientMain = read(`${base}client/main.lua`);
  const web = read(`${base}web/app.js`);

  assert.match(config, /carRadioRoleId = '1570227971908833381'/);
  assert.match(main, /discordHasRole\(discord, FBRP\.Config\.carRadioRoleId\)/);
  assert.match(main, /player\.state:set\('fbrp:carRadioAccess'/);
  assert.match(server, /FBRP\.HasCarRadioAccess\(source\)/);
  assert.match(server, /requestOpen/);
  assert.match(client, /LocalPlayer\.state\['fbrp:carRadioAccess'\]/);
  assert.match(clientMain, /carRadioAccess=state\['fbrp:carRadioAccess'\] == true/);
  assert.match(web, /radialPayload\.carRadioAccess !== true/);
});

test('the loading screen is Florida Bay branded, hardened and closes itself', () => {
  const base = 'server-data/resources/[fbrp]/fbrp_loading/';
  const manifest = read(`${base}fxmanifest.lua`);
  const html = read(`${base}web/index.html`);
  const css = read(`${base}web/assets/css/style.css`);
  const config = read(`${base}web/assets/scripts/config.js`);
  const main = read(`${base}web/assets/scripts/main.js`);
  assert.match(manifest, /loadscreen 'web\/index\.html'/);
  assert.match(manifest, /loadscreen_manual_shutdown 'yes'/);
  assert.match(manifest, /'web\/assets\/fbrp-logo\.png'/, 'the website serves this logo too');
  assert.match(read(`${base}client.lua`), /ShutdownLoadingScreenNui\(\)/);
  assert.match(config, /Config\.ServerName = "Florida Bay Roleplay"/);
  assert.match(config, /https:\/\/discord\.gg\/floridabay\b/);
  assert.match(config, /Config\.StatusUrl = "https:\/\/floridabay\.net\/api\/public\/status"/);
  assert.match(config, /Config\.Store = "https:\/\/store\.floridabay\.net\/"/);
  assert.match(config, /Config\.YouTubeRelay/);
  assert.match(main, /e\.source !== f\.contentWindow \|\| e\.origin !== relayOrigin/);
  // The owner's YouTube relay is retained, while commercial Font Awesome and unrelated templates stay out.
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /all\.min\.(css|js)|fa-|ajax\.googleapis/);
  assert.doesNotMatch(html + css + config, /Long Ville|LongVille|Dinero/i);
  assert.match(read('services/fbrp-bot/src/web-panel.js'), /PUBLIC_STATUS_HEADERS = Object\.freeze\(\{ "Access-Control-Allow-Origin": "\*" \}\)/);
});

test('all citizen licenses self-issue and old pending applications become valid', () => {
  const base = 'server-data/resources/[fbrp]/fbrp_core/';
  const config = read(`${base}config_systems.lua`);
  const licenses = config.match(/licenses = \{([\s\S]*?)\n    \},\n    reportKinds/)?.[1] || '';
  const rows = [...licenses.matchAll(/\{ id='[^']+', label='[^']+'[^}]+\}/g)].map((match) => match[0]);
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => /selfIssue=true/.test(row)));
  assert.match(read(`${base}server/citizen.lua`), /row\.id, license\.id, 'valid', 'Licensing office'/);
  assert.match(read(`${base}migrations/069_self_service_licenses.sql`), /SET status='valid'/);
});
