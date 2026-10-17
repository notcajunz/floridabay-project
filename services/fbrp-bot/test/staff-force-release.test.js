import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverData = path.resolve(here, '../../../server-data');
const read = (relative) => fs.readFileSync(path.join(serverData, relative), 'utf8');
const core = 'resources/[fbrp]/fbrp_core';
const ea = 'resources/[admin]/EasyAdmin';

test('EasyAdmin exposes five Admin+ force release actions backed by fbrp_core', () => {
  assert.match(read(`${ea}/shared/util_shared.lua`), /\["player\.release"\] = false/);
  const gui = read(`${ea}/client/gui_c.lua`);
  assert.match(gui, /permissions\["player\.release"\]/);
  for (const kind of ['jail', 'communityservice', 'headbag', 'ziptie', 'cuff']) assert.match(gui, new RegExp(`"${kind}"`));
  const server = read(`${ea}/server/admin_server.lua`);
  assert.match(server, /DoesPlayerHavePermission\(src, "player\.release"\)/);
  assert.match(server, /exports\.fbrp_core:ForceRelease\(src, playerId, kind\)/);
  assert.match(read(`${core}/server/justice.lua`), /exports\('ForceRelease', forceRelease\)/);
  assert.match(read(`${core}/config.lua`), /staffRelease = 'fbrp\.staff\.release'/);
});

test('fbrp_core re-checks the release ACE and only unjails with release powers', () => {
  const justice = read(`${core}/server/justice.lua`);
  assert.match(justice, /hasPermission\(actorSource, FBRP\.Ace\.staffRelease\)/);
  const canRelease = justice.match(/local function canRelease\(source\)\n([\s\S]*?)\nend/)[1];
  assert.match(canRelease, /policeJail/);
  assert.match(canRelease, /staffRelease/);
  assert.doesNotMatch(canRelease, /staffJail/);
  assert.match(justice, /RegisterCommand\('unjail', function\(source, args\)\n    if source > 0 and not canRelease\(source\)/);
});

test('migration 071 gives Admin and above force release and is registered', () => {
  const sql = read(`${core}/migrations/071_staff_permission_matrix.sql`);
  const block = sql.match(/-- Administrator and above[\s\S]*?WHERE g\.staff_only=TRUE AND g\.rank_order>=(\d+);/);
  assert.ok(block, 'Administrator tier block');
  assert.equal(block[1], '725');
  assert.match(block[0], /fbrp\.staff\.release/);
  assert.match(block[0], /easyadmin\.player\.release/);
  assert.match(read(`${core}/server/database.lua`), /migrations\/071_staff_permission_matrix\.sql/);
  // The splitter tracks quotes inside comments, so comments must stay free of quotes.
  for (const line of sql.split('\n').filter((l) => l.startsWith('--'))) assert.doesNotMatch(line, /['";]/, line);
});
