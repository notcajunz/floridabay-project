import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERIFIED_ROLE_ID } from '../src/verification.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.resolve(here, '../../../server-data/resources/[fbrp]/fbrp_core');
const main = fs.readFileSync(path.join(core, 'server/main.lua'), 'utf8');
const config = fs.readFileSync(path.join(core, 'config.lua'), 'utf8');
const bot = fs.readFileSync(path.join(here, '../src/index.js'), 'utf8');

test('joining needs website verification, main-server membership and the Verified role', () => {
  assert.equal(config.match(/joinRoleId = '(\d+)'/)?.[1], '1557690864526954616');
  assert.equal(config.match(/joinRoleId = '(\d+)'/)?.[1], VERIFIED_ROLE_ID);
  assert.equal(config.match(/joinGuildId = '(\d+)'/)?.[1], '1557594282976747550');
  const handler = main.slice(main.indexOf("AddEventHandler('playerConnecting'"));
  const verified = handler.indexOf('verificationRejection(discord)');
  const member = handler.indexOf('membershipRejection(discord)');
  assert.ok(verified > 0 && member > verified, 'membership is checked after website verification');
  assert.match(main, /FROM discord_member_cache WHERE guild_id=\? AND discord_id=\?/);
  assert.match(main, /You must be in the Florida Bay Discord/);
  assert.match(main, /You need the Verified role/);
});

test('the bot drops departed members from the main server cache so they cannot join', () => {
  assert.match(bot, /client\.on\("guildMemberRemove"[\s\S]*?DELETE FROM discord_member_cache WHERE guild_id=\? AND discord_id=\?/);
  assert.match(bot, /Dropped \$\{gone\.length\} departed member/);
});
