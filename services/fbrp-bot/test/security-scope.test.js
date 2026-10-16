import assert from "node:assert/strict";
import test from "node:test";
import { AuditLogEvent } from "discord.js";
import { db } from "../src/database.js";
import { handleAuditEntry, isAntiNukeAction, invalidateSecurityExemption } from "../src/security.js";

test("anti-nuke accepts only role/channel creation and deletion", () => {
  assert.equal(isAntiNukeAction("channel_create"), true);
  assert.equal(isAntiNukeAction("channel_delete"), true);
  assert.equal(isAntiNukeAction("role_create"), true);
  assert.equal(isAntiNukeAction("role_delete"), true);
  for (const type of ["member_ban", "member_kick", "member_prune", "member_roles", "channel_update", "role_update", "webhook_spam", "bot_add", "guild_update"])
    assert.equal(isAntiNukeAction(type), false, type);
});

test("a moderation audit event does not enter anti-nuke counters or security events", async (t) => {
  const originalOne = db.one;
  const originalQuery = db.query;
  t.after(() => { db.one = originalOne; db.query = originalQuery; });
  const guildId = "guild-security-scope";
  const actorId = "920000000000000001";
  invalidateSecurityExemption(actorId, "*");
  const writes = [];
  db.one = async (sql) => {
    if (sql.includes("FROM network_guilds")) return { ok: 1 };
    if (sql.includes("discord_security_exemption_scopes")) return null;
    if (sql.includes("bot_config")) return null;
    return null;
  };
  db.query = async (sql, params = []) => { writes.push({ sql, params }); return []; };
  let logs = 0;
  await handleAuditEntry(
    {
      action: AuditLogEvent.MemberBanAdd,
      executorId: actorId,
      targetId: "member-target",
      target: { id: "member-target", username: "target", tag: "target" },
      changes: [],
    },
    { id: guildId, ownerId: "owner", client: { user: { id: "bot" } } },
    async () => { logs += 1; },
  );
  assert.deepEqual(writes, []);
  assert.equal(logs, 0);
});
