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

test('loading music accepts a configurable or player-pasted YouTube link', () => {
  const base = 'server-data/resources/[fbrp]/fbrp_loading/';
  assert.match(read(`${base}fxmanifest.lua`), /web\/config\.js/);
  assert.match(read(`${base}web/config.js`), /youtubeUrl/);
  assert.match(read(`${base}web/index.html`), /id="music-url"/);
  assert.match(read(`${base}web/loading.js`), /youtubeVideoId/);
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
