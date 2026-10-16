import assert from "node:assert/strict";
import test from "node:test";
import { AuditLogEvent } from "discord.js";
import { db } from "../src/database.js";
import {
  guardJoin,
  handleAuditEntry,
  invalidateSecurityExemption,
  isNukeOffender,
  isSecurityExempt,
  loadOffenders,
} from "../src/security.js";

const originalOne = db.one;
const originalQuery = db.query;

test.after(() => {
  db.one = originalOne;
  db.query = originalQuery;
});

test("scoped and global exemptions are applied and invalidated immediately", async () => {
  const memberId = "910000000000000001";
  const scopes = new Set([`guild-a:${memberId}`]);
  db.one = async (sql, params = []) => {
    if (!sql.includes("discord_security_exemption_scopes")) return null;
    const [id, guildId] = params.map(String);
    return scopes.has(`*:${id}`) || scopes.has(`${guildId}:${id}`) ? { found: 1 } : null;
  };

  invalidateSecurityExemption(memberId, "*");
  assert.equal(await isSecurityExempt("guild-a", memberId), true);
  assert.equal(await isSecurityExempt("guild-b", memberId), false);

  scopes.delete(`guild-a:${memberId}`);
  scopes.add(`*:${memberId}`);
  invalidateSecurityExemption(memberId, "*");
  assert.equal(await isSecurityExempt("guild-a", memberId), true);
  assert.equal(await isSecurityExempt("guild-b", memberId), true);

  scopes.clear();
  invalidateSecurityExemption(memberId, "*");
  assert.equal(await isSecurityExempt("guild-a", memberId), false);
  assert.equal(await isSecurityExempt("guild-b", memberId), false);
});

test("an exempt known offender bypasses anti-nuke, raid and young-account detection", async () => {
  const guildId = "guild-exempt";
  const memberId = "910000000000000002";
  const writes = [];
  db.query = async (sql, params = []) => {
    if (sql.includes("FROM network_nuke_offenders WHERE active=TRUE"))
      return [{ discord_id: memberId, punishment: "strip", created_at: Date.now() }];
    writes.push({ sql, params });
    return [];
  };
  db.one = async (sql, params = []) => {
    if (sql.includes("FROM network_guilds")) return { found: 1 };
    if (sql.includes("discord_security_exemption_scopes")) return String(params[0]) === memberId ? { found: 1 } : null;
    return null;
  };

  await loadOffenders();
  assert.equal(isNukeOffender(memberId), true);
  invalidateSecurityExemption(memberId, "*");

  const guild = { id: guildId, ownerId: "owner", client: { user: { id: "bot" } } };
  let logs = 0;
  const log = async () => { logs += 1; };
  await handleAuditEntry(
    {
      action: AuditLogEvent.ChannelDelete,
      executorId: memberId,
      targetId: "channel-1",
      target: { id: "channel-1", name: "test" },
      changes: [],
    },
    guild,
    log,
  );

  const kicked = await guardJoin(
    {
      id: memberId,
      guild,
      user: { bot: false, createdTimestamp: Date.now() - 60_000 },
      kick: async () => { throw new Error("exempt member should not be kicked"); },
      timeout: async () => { throw new Error("exempt member should not be timed out"); },
    },
    log,
  );

  assert.equal(kicked, false);
  assert.equal(logs, 0);
  assert.deepEqual(writes, []);
});
