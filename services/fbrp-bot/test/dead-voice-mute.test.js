import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverData = path.resolve(here, '../../../server-data');
const read = (relative) => fs.readFileSync(path.join(serverData, relative), 'utf8');

test('the downed state sets and clears the pma-voice dead flag', () => {
  const medical = read('resources/[fbrp]/fbrp_core/client/medical.lua');
  assert.match(medical, /LocalPlayer\.state:set\('isDead', muted == true, true\)/);
  const goDown = medical.slice(medical.indexOf('local function goDown'), medical.indexOf("AddEventHandler('fbrp:characterSpawned'"));
  assert.match(goDown, /setVoiceMuted\(true\)/);
  const leave = medical.slice(medical.indexOf('local function leaveDowned'), medical.indexOf('local KEEP'));
  assert.match(leave, /setVoiceMuted\(false\)/);
  const stop = medical.slice(medical.indexOf("AddEventHandler('onClientResourceStop'"));
  assert.match(stop, /setVoiceMuted\(false\)/);
});

test('pma-voice sends no proximity, call or radio audio while the dead flag is set', () => {
  const proximity = read('resources/[standalone]/pma-voice/client/init/proximity.lua');
  const nearby = proximity.slice(proximity.indexOf('function addNearbyPlayers'), proximity.indexOf('function addChannelListener'));
  const dead = nearby.indexOf('LocalPlayer.state.isDead');
  assert.ok(dead > 0, 'addNearbyPlayers checks isDead');
  assert.ok(nearby.indexOf('MumbleClearVoiceTargetPlayers', dead) > dead, 'player (call/radio) targets are cleared');
  assert.ok(dead < nearby.indexOf('MumbleAddVoiceTargetChannel'), 'before any target is added');
  const main = read('resources/[standalone]/pma-voice/client/init/main.lua');
  const add = main.slice(main.indexOf('function addVoiceTargets'));
  assert.ok(add.indexOf('LocalPlayer.state.isDead') > 0 && add.indexOf('LocalPlayer.state.isDead') < add.indexOf('MumbleAddVoiceTargetPlayerByServerId'));
  const radio = read('resources/[standalone]/pma-voice/client/module/radio.lua');
  assert.match(radio, /if isDead\(\) then return end/);
});
