import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server-data/resources/[fbrp]/fbrp_core');
const read = (file) => fs.readFileSync(path.join(core, file), 'utf8');
const config = read('config.lua');
const server = read('server/main.lua');
const client = read('client/interactions.lua');

test('anyone can escort a restrained player and place or remove a zip-tied one', () => {
  assert.match(config, /id = 'escort'[^\n]*anyoneIf = 'restrained'/);
  assert.match(config, /id = 'seat'[^\n]*anyoneIf = 'ziptie'/);
  assert.match(config, /id = 'unseat'[^\n]*anyoneIf = 'ziptie'/);
  assert.match(server, /local function interactionAllowed\(source, spec, target\)/);
  assert.match(server, /interactionAllowed\(src,spec,target\)/);
  assert.match(server, /action=='escort' or action=='seat' or action=='unseat'\) and visibleFor/);
});

test('the third-eye list only offers actions that fit the target state', () => {
  for (const id of ['softcuff', 'hardcuff', 'arrest', 'ziptie']) assert.ok(server.includes(`'${id}'`));
  assert.match(server, /InteractionVisible\.seat = function\(_, target\) return not targetInVehicle\(target\)/);
  assert.match(server, /InteractionVisible\.unseat = function\(_, target\) return targetInVehicle\(target\)/);
  assert.match(client, /id = 'w_more', label = 'More\.\.\.'/);
  assert.match(client, /id == 'w_more' or id == 'w_back'/);
});

test('taking someone out of a vehicle keeps their restraint', () => {
  const unseat = client.slice(client.indexOf("elseif action == 'unseat'"));
  assert.match(unseat, /setRestrained\(held\)/);
  assert.match(client, /SetEnableHandcuffs\(ped,true\)/);
});

test('searching opens an ox_lib menu with removable weapons and contraband', () => {
  assert.match(client, /lib\.registerContext\(\{ id = 'fbrp_search'/);
  assert.match(client, /TriggerServerEvent\('fbrp:search:take', 'weapon', weapon\.hash\)/);
  assert.match(client, /RemoveWeaponFromPed\(PlayerPedId\(\), tonumber\(hash\)\)/);
  assert.match(server, /RegisterNetEvent\('fbrp:search:take'/);
  assert.match(server, /hasPermission\(actor,FBRP\.Ace\.policeSearch\)/);
  assert.match(server, /SEARCH_WEAPONS\[hash\]/);
});
