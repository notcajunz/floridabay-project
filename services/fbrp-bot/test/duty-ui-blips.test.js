import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const core = path.join(root, 'server-data/resources/[fbrp]/fbrp_core');
const read = (relative) => readFileSync(path.join(core, relative), 'utf8');

test('organization duty selection uses an ox_lib searchable select and no custom NUI', () => {
  const client = read('client/main.lua');
  const html = read('web/index.html');
  const app = read('web/app.js');
  const styles = read('web/styles.css');

  assert.match(client, /lib\.inputDialog\(/);
  assert.match(client, /type = 'select'/);
  assert.match(client, /searchable = true/);
  assert.match(client, /TriggerServerEvent\('fbrp:duty:choose', result\[1\]\)/);
  assert.doesNotMatch(client, /RegisterNUICallback\('dutyChoose'|type='duty'/);
  assert.doesNotMatch(html, /id="duty"|duty-backdrop|duty-card/);
  assert.doesNotMatch(app, /dutyPayload|dutyChoice|dutyChoose|closeDutyPicker/);
  assert.doesNotMatch(styles, /\.duty-(?:backdrop|card|select|option|list)/);
});

test('organization duty accepts an organization-bound rank when its network access role is delayed', () => {
  const server = read('server/main.lua');
  const dutyQuery = server.slice(server.indexOf('local function dutyOrganizations'), server.indexOf('local dutyLastChoice'));

  assert.match(dutyQuery, /FROM organization_role_requirements r/);
  assert.match(dutyQuery, /FROM org_rank_roles rr/);
  assert.match(dutyQuery, /c\.guild_id=rr\.guild_id AND c\.discord_id=\?/);
  assert.match(dutyQuery, /JSON_CONTAINS\(c\.roles, JSON_QUOTE\(rr\.role_id\)\)/);
  assert.match(dutyQuery, /WHERE rr\.org_id=o\.id/);
  assert.match(dutyQuery, /\{ slug, slug, discord, discord, discord \}/);
});

test('duty blips are loaded and filtered by exact organization except for shared LEO visibility', () => {
  const manifest = read('fxmanifest.lua');
  const server = read('server/duty_blips.lua');
  const client = read('client/duty_blips.lua');

  assert.match(manifest, /'server\/duty_blips\.lua'/);
  assert.match(manifest, /'client\/duty_blips\.lua'/);
  assert.match(server, /\(cfg\.visibility or \{\}\)\[viewer\.org\.type\]/);
  assert.match(server, /allowed\[target\.org\.type\] == true/);
  assert.match(server, /tonumber\(viewer\.org\.id\) == tonumber\(target\.org\.id\)/);
  assert.match(server, /targetSource ~= viewerSource/);
  assert.match(server, /TriggerClientEvent\('fbrp:dutyBlips:update', source, dutyBlipsFor\(source\)\)/);
  assert.doesNotMatch(server, /TriggerClientEvent\('fbrp:dutyBlips:update', -1/);
  assert.match(client, /AddBlipForCoord/);
  assert.match(client, /SetBlipAsShortRange\(blip, false\)/);
  assert.match(client, /ShowHeadingIndicatorOnBlip\(blip, kind == 'foot'\)/);
  assert.match(client, /if not active\[serverId\] then removeDutyBlip\(serverId\) end/);
});
