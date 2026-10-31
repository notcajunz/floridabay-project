import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panel = fs.readFileSync(new URL('../src/web-panel.js', import.meta.url), 'utf8');
const sync = fs.readFileSync(new URL('../src/sync.js', import.meta.url), 'utf8');

test('permission edits refresh the game before the slow Discord role sync, which runs in the background', () => {
  const apply = panel.slice(panel.indexOf('async function applyPermissionChange'), panel.indexOf('async function effects'));
  assert.ok(apply.indexOf('refreshGame()') > -1 && apply.indexOf('refreshGame()') < apply.indexOf('syncRolesInBackground()'));
  const save = panel.slice(panel.indexOf('async function saveAceGroup'), panel.indexOf('async function deleteRecord'));
  assert.match(save, /applyPermissionChange\(\)/);
  assert.doesNotMatch(save, /await syncAll\(client\)/);
  assert.match(panel, /resource\.effect === "permissions"\) await applyPermissionChange\(\)/);
});

test('refreshGame retries once before giving up', () => {
  const body = sync.slice(sync.indexOf('export async function refreshGame'), sync.indexOf('async function pickedGuilds'));
  assert.equal((body.match(/callGame\("\/refresh"/g) || []).length, 2);
});
