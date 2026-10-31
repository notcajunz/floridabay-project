import assert from "node:assert/strict";
import test from "node:test";
import { createTemporaryRoles, parseTemporaryRoleDuration } from "../src/temporary-roles.js";

const GUILD = "1557594282976747550";
const MEMBER = "100000000000000001";
const ROLE = "100000000000000002";
const ACTOR = "100000000000000003";

function fixture({ bound = false, stamp = 1_800_000_000_000 } = {}) {
  const held = new Set();
  const records = new Map();
  const audits = [];
  const logs = [];
  const role = { id: ROLE, name: "Event Access", managed: false, editable: true };
  const member = {
    id: MEMBER,
    user: { id: MEMBER, bot: false, username: "Member" },
    roles: {
      cache: { has: (id) => held.has(String(id)) },
      add: async (item) => held.add(String(item.id)),
      remove: async (item) => held.delete(String(item.id)),
    },
  };
  const guild = {
    id: GUILD,
    name: "Florida Bay",
    members: { fetch: async (id) => String(id) === MEMBER ? member : null },
    roles: { cache: new Map([[ROLE, role]]) },
  };
  const key = () => `${GUILD}:${MEMBER}:${ROLE}`;
  const db = {
    async one(sql) {
      if (sql.includes("network_guilds")) return { guild_id: GUILD };
      if (sql.includes("discord_role_bindings")) return bound ? { group_name: "staff" } : null;
      if (sql.includes("protected_roles")) return null;
      if (sql.includes("temporary_discord_roles")) return records.get(key()) || null;
      throw new Error(`Unexpected one: ${sql}`);
    },
    async query(sql, params = []) {
      if (sql.startsWith("INSERT INTO temporary_discord_roles")) {
        records.set(key(), { guild_id: params[0], member_id: params[1], role_id: params[2], granted_by: params[3], reason: params[4], granted_at: params[5], expires_at: params[6], status: "active" });
        return { affectedRows: 1 };
      }
      if (sql.startsWith("SELECT guild_id"))
        return [...records.values()].filter((row) => row.status === "active" && row.expires_at <= params[0]);
      if (sql.includes("SET status='expiring'")) {
        const row = records.get(key());
        if (!row || row.status !== "active" || row.expires_at > params[3]) return { affectedRows: 0 };
        row.status = "expiring";
        return { affectedRows: 1 };
      }
      if (sql.includes("SET status='expired'")) {
        records.get(key()).status = "expired";
        return { affectedRows: 1 };
      }
      if (sql.includes("SET status='active'")) {
        records.get(key()).status = "active";
        return { affectedRows: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const system = createTemporaryRoles({
    client: { user: { id: "bot" }, guilds: { cache: new Map([[GUILD, guild]]) } },
    db,
    audit: async (...args) => audits.push(args),
    log: async (...args) => logs.push(args),
    now: () => stamp,
  });
  const interaction = {
    guildId: GUILD,
    guild,
    user: { id: ACTOR, tag: "Manager" },
    options: {
      getRole: () => role,
      getMember: () => member,
      getUser: () => member.user,
      getString: (name) => name === "duration" ? "2h" : "Event staffing",
    },
  };
  return { system, interaction, held, records, audits, logs, key };
}

test("temporary role durations accept common units and enforce the 30-day cap", () => {
  assert.equal(parseTemporaryRoleDuration("30m"), 1_800_000);
  assert.equal(parseTemporaryRoleDuration("2w"), 1_209_600_000);
  assert.throws(() => parseTemporaryRoleDuration("45s"), /must look like/);
  assert.throws(() => parseTemporaryRoleDuration("31d"), /between 1 minute and 30 days/);
});

test("ACE-bound roles are rejected before Discord membership changes", async () => {
  const { system, interaction, held } = fixture({ bound: true });
  await assert.rejects(system.command(interaction), /ACE-bound/);
  assert.equal(held.has(ROLE), false);
});

test("a temporary role is stored and removed by the durable expiry sweep", async () => {
  const state = fixture();
  await state.system.command(state.interaction);
  assert.equal(state.held.has(ROLE), true);
  assert.equal(state.records.get(state.key()).status, "active");
  state.records.get(state.key()).expires_at = 1;
  assert.equal(await state.system.sweep(), 1);
  assert.equal(state.held.has(ROLE), false);
  assert.equal(state.records.get(state.key()).status, "expired");
  assert.deepEqual(state.audits.map((entry) => entry[1]), ["temp_role.grant", "temp_role.expire"]);
});
