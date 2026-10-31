import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PERMISSIONS_TAB, CHANGES_TAB, ServiceAccount, SheetsClient, buildPermissionsGrid, columnLetter, diffGrants, fetchMatrix,
  formatRequests, grantMapFromGrid, matrixHash, publishMatrix, startStaffPermissionsSheetFromEnv, startStaffPermissionsSheetSync,
} from '../src/staff-permissions-sheet.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const quiet = { log() {}, error() {} };
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const matrix = (overrides = {}) => ({
  generatedAt: 1,
  ranks: [
    { id: 'everyone', label: 'Everyone', team: 'All players' },
    { id: 'trial_moderator', label: 'Trial Moderator', team: 'Staff' },
    { id: 'moderator', label: 'Moderator', team: 'Staff' },
    { id: 'owner', label: 'Owner', team: 'Ownership' },
  ],
  sections: [
    { source: 'EasyAdmin', title: 'Player moderation', rows: [
      { label: 'Warn player', ace: 'easyadmin.player.warn', has: overrides.warn || '0110' },
      { label: 'Kick player', ace: 'easyadmin.player.kick', has: '0011' },
    ] },
    { source: 'vMenu', title: 'Player Options', rows: [
      { label: 'Godmode', ace: 'vMenu.PlayerOptions.God', has: '1111' },
    ] },
  ],
  ...overrides.extra,
});

test('the grid mirrors the reference sheet: team row, rank row, section rows and TRUE/FALSE cells', () => {
  const { grid, teams, sectionRows, width } = buildPermissionsGrid(matrix(), 'Oct 20, 2026, 9:00 PM ET');
  assert.equal(width, 6);
  assert.equal(grid[0][0], 'FBRP | In-Game Staff Permissions');
  assert.match(grid[1][0], /Last updated Oct 20, 2026, 9:00 PM ET/);
  assert.deepEqual(grid[2].slice(2), ['All players', 'Staff', 'Staff', 'Ownership']);
  assert.deepEqual(grid[3], ['Permission', 'Permission ID', 'Everyone', 'Trial Moderator', 'Moderator', 'Owner']);
  assert.deepEqual(teams, [
    { name: 'All players', start: 2, end: 3 },
    { name: 'Staff', start: 3, end: 5 },
    { name: 'Ownership', start: 5, end: 6 },
  ]);
  assert.deepEqual(sectionRows, [4, 7]);
  assert.equal(grid[4][0], 'EasyAdmin: Player moderation');
  assert.deepEqual(grid[5], ['Warn player', 'easyadmin.player.warn', false, true, true, false]);
  assert.deepEqual(grid[6].slice(2), [false, false, true, true]);
});

test('grants and revokes between two generations are listed for the Changes tab', () => {
  const before = grantMapFromGrid(buildPermissionsGrid(matrix(), 'a').grid);
  const after = grantMapFromGrid(buildPermissionsGrid(matrix({ warn: '0011' }), 'b').grid);
  const changes = diffGrants(before, after, 'Oct 20 ET');
  assert.deepEqual(changes, [
    ['Oct 20 ET', 'Trial Moderator', 'Warn player', 'easyadmin.player.warn', 'Revoked'],
    ['Oct 20 ET', 'Owner', 'Warn player', 'easyadmin.player.warn', 'Granted'],
  ]);
  assert.deepEqual(diffGrants(before, before, 'x'), []);
});

test('the hash ignores the generation time but follows any permission change', () => {
  assert.equal(matrixHash(matrix()), matrixHash({ ...matrix(), generatedAt: 999 }));
  assert.notEqual(matrixHash(matrix()), matrixHash(matrix({ warn: '1110' })));
});

test('format requests freeze the headers, merge teams and colour TRUE and FALSE', () => {
  const layout = buildPermissionsGrid(matrix(), 'a');
  const requests = formatRequests(7, layout, 2);
  assert.equal(requests.filter((r) => r.deleteConditionalFormatRule).length, 2);
  assert.ok(requests.some((r) => r.updateSheetProperties?.properties.gridProperties.frozenRowCount === 4));
  assert.ok(requests.some((r) => r.mergeCells?.range.startRowIndex === 2 && r.mergeCells.range.startColumnIndex === 3 && r.mergeCells.range.endColumnIndex === 5));
  const rules = requests.filter((r) => r.addConditionalFormatRule).map((r) => r.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue);
  assert.deepEqual(rules, ['=C5=TRUE', '=C5=FALSE']);
  assert.equal(columnLetter(0), 'A');
  assert.equal(columnLetter(26), 'AA');
});

function fakeClient({ previous = [], tabs = [PERMISSIONS_TAB, CHANGES_TAB], changesHeader = true } = {}) {
  const calls = [];
  return {
    calls,
    async metadata() { calls.push(['metadata']); return { sheets: tabs.map((title, i) => ({ properties: { sheetId: i + 1, title }, conditionalFormats: [] })) }; },
    async values(range) {
      calls.push(['values', range]);
      if (range.startsWith(PERMISSIONS_TAB)) return { values: previous };
      return { values: changesHeader ? [['When']] : [] };
    },
    async clear(range) { calls.push(['clear', range]); },
    async updateValues(range, values) { calls.push(['update', range, values]); },
    async appendValues(range, values) { calls.push(['append', range, values]); },
    async batchUpdate(requests) { calls.push(['batch', requests]); },
  };
}

test('publishing rewrites the Permissions tab and appends only real changes', async () => {
  const first = buildPermissionsGrid(matrix(), 'a').grid;
  const client = fakeClient({ previous: first });
  const result = await publishMatrix(client, matrix({ warn: '0011' }), { now: new Date('2026-10-21T01:00:00Z'), log: quiet });
  assert.equal(result.changes, 2);
  const update = client.calls.find((c) => c[0] === 'update');
  assert.equal(update[1], `${PERMISSIONS_TAB}!A1`);
  assert.equal(update[2][4][0], 'EasyAdmin: Player moderation');
  const append = client.calls.find((c) => c[0] === 'append');
  assert.equal(append[2].length, 2);
  assert.match(append[2][0][0], /ET$/);
});

test('the first publish appends nothing and a missing tab is created first', async () => {
  const client = fakeClient({ tabs: [PERMISSIONS_TAB] });
  let created = false;
  const batch = client.batchUpdate;
  client.batchUpdate = async (requests) => {
    if (requests[0].addSheet) { created = true; client.metadata = async () => ({ sheets: [PERMISSIONS_TAB, CHANGES_TAB].map((title, i) => ({ properties: { sheetId: i + 1, title }, conditionalFormats: [] })) }); }
    return batch.call(client, requests);
  };
  const result = await publishMatrix(client, matrix(), { log: quiet });
  assert.ok(created);
  assert.equal(result.changes, 0);
  assert.equal(client.calls.some((c) => c[0] === 'append'), false);
});

test('the sync publishes the first matrix, skips identical ones and publishes again on change', async () => {
  const published = [];
  const client = fakeClient();
  const originalUpdate = client.updateValues;
  client.updateValues = async (range, values) => { if (range === `${PERMISSIONS_TAB}!A1`) published.push(values); return originalUpdate(range, values); };
  let current = matrix();
  const sync = startStaffPermissionsSheetSync({ client, load: async () => current, intervalMs: 3600000, log: quiet });
  await settle();
  await sync.tick();
  assert.equal(published.length, 1);
  current = matrix({ warn: '1110' });
  await sync.tick();
  assert.equal(published.length, 2);
  sync.stop();
});

test('a failed load is logged and retried instead of crashing the bot', async () => {
  const errors = [];
  let attempts = 0;
  const sync = startStaffPermissionsSheetSync({
    client: fakeClient(), intervalMs: 3600000, log: { log() {}, error: (...args) => errors.push(args.join(' ')) },
    load: async () => { attempts += 1; if (attempts === 1) throw new Error('game offline'); return matrix(); },
  });
  await settle();
  await sync.tick();
  assert.equal(attempts >= 2, true);
  assert.match(errors[0], /game offline/);
  sync.stop();
});

test('fetchMatrix authenticates with the service token and validates the shape', async () => {
  let seen;
  const ok = await fetchMatrix({ origin: 'http://127.0.0.1:30120/fbrp_core/', token: 't0k', fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, json: async () => matrix() }; } });
  assert.equal(seen.url, 'http://127.0.0.1:30120/fbrp_core/staff-permissions');
  assert.equal(seen.init.headers.Authorization, 'Bearer t0k');
  assert.equal(ok.ranks.length, 4);
  await assert.rejects(fetchMatrix({ origin: 'x', token: 't', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /unexpected/);
  await assert.rejects(fetchMatrix({ origin: 'x', token: 't', fetchImpl: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
});

test('the service account signs a verifiable RS256 assertion and caches its token', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const account = new ServiceAccount({ client_email: 'sheet@example.iam.gserviceaccount.com', private_key: privateKey });
  const [header, claims, signature] = account.assertion(1000).split('.');
  assert.equal(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, signature, 'base64url'), true);
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), { iss: 'sheet@example.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: 1000, exp: 4600 });
  let requests = 0;
  const fetchImpl = async () => { requests += 1; return { ok: true, json: async () => ({ access_token: 'abc', expires_in: 3600 }) }; };
  assert.equal(await account.accessToken(fetchImpl), 'abc');
  assert.equal(await account.accessToken(fetchImpl), 'abc');
  assert.equal(requests, 1);
});

test('a denied sheet names the account to share it with', async () => {
  const account = { email: 'sheet@example.iam.gserviceaccount.com', accessToken: async () => 'abc' };
  const client = new SheetsClient('sheet-id', account, async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'no' } }) }));
  await assert.rejects(client.metadata(), /Share it with sheet@example\.iam\.gserviceaccount\.com as an editor/);
});

test('the sync stays off without a key file or sheet id', () => {
  assert.equal(startStaffPermissionsSheetFromEnv({}, quiet), null);
  // The roster bot's key is never borrowed.
  assert.equal(startStaffPermissionsSheetFromEnv({ GOOGLE_SERVICE_ACCOUNT_FILE: '/some/roster/key.json' }, quiet), null);
  assert.equal(startStaffPermissionsSheetFromEnv({ FBRP_STAFF_PERMS_SERVICE_ACCOUNT_FILE: '/nonexistent/key.json', FBRP_STAFF_PERMS_SHEET_ID: 'abc' }, quiet), null);
});

test('fbrp_core serves the matrix and the bot starts the sync', () => {
  const core = 'server-data/resources/[fbrp]/fbrp_core/';
  const main = read(`${core}server/main.lua`);
  assert.match(main, /req\.path=='\/staff-permissions' and req\.method=='GET'/);
  assert.match(main, /FBRP\.StaffPerms\.build/);
  const server = read(`${core}server/staffperms.lua`);
  assert.match(server, /IsPrincipalAceAllowed\(EVERYONE/);
  assert.match(server, /FROM staff_roster_ranks r/);
  assert.match(server, /FBRP\.VmenuEverything/);
  assert.match(server, /legacyVmenuAllows/);
  assert.match(server, /source = 'vMenu'/);
  assert.match(read(`${core}fxmanifest.lua`), /'server\/staffperms\.lua'/);
  assert.doesNotMatch(read(`${core}fxmanifest.lua`), /client\/staffperms\.lua/);
  assert.match(read('services/fbrp-bot/src/index.js'), /startStaffPermissionsSheetFromEnv\(\)/);
});
