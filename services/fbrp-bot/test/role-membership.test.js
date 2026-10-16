import assert from "node:assert/strict";
import test from "node:test";

import { commands } from "../src/commands.js";
import { createRoleMembershipCommands } from "../src/role-membership.js";

const MAIN_GUILD_ID = "100000000000000001";

function setup({ guildId = MAIN_GUILD_ID, held = false, protectedRole = false, protectedManagerError = null } = {}) {
  const calls = [];
  const role = { id: "200000000000000002", name: "Example", managed: false, editable: true };
  const member = {
    id: "300000000000000003",
    roles: {
      cache: { has: () => held },
      add: async (selected, reason) => calls.push(["add", selected.id, reason]),
      remove: async (selected, reason) => calls.push(["remove", selected.id, reason]),
    },
  };
  const interaction = {
    guildId,
    guild: { members: { fetch: async () => member } },
    user: { id: "400000000000000004", tag: "manager" },
    options: {
      getRole: () => role,
      getUser: () => ({ id: member.id }),
    },
  };
  const dependencies = {
    db: {
      one: async (sql) => {
        if (sql.includes("network_guilds")) return { guild_id: MAIN_GUILD_ID };
        if (sql.includes("protected_roles")) return protectedRole ? { protected: 1 } : null;
        throw new Error(`Unexpected query: ${sql}`);
      },
    },
    audit: async (...args) => calls.push(["audit", ...args]),
    requireMinimumStaffRank: async (_i, rank) => calls.push(["rank", rank]),
    requireProtectedRoleManagerId: (id) => {
      calls.push(["protected-manager", id]);
      if (protectedManagerError) throw protectedManagerError;
    },
    card: (title, options) => ({ title, ...options }),
    colors: { success: 1, warning: 2 },
    roleRef: (id) => `<@&${id}>`,
    who: (id) => `<@${id}>`,
    log: async (...args) => calls.push(["log", ...args]),
  };
  return { calls, interaction, command: createRoleMembershipCommands(dependencies).command };
}

test("registers /role assign and /role unassign", () => {
  const role = commands.find((command) => command.name === "role");
  assert.ok(role);
  assert.deepEqual(role.options.map((option) => option.name), ["assign", "unassign"]);
});

test("assigns an unprotected role in the main server for ACM+", async () => {
  const { calls, interaction, command } = setup();
  const result = await command(interaction, "assign");

  assert.equal(result.title, "Role assigned");
  assert.deepEqual(calls.filter(([name]) => name === "rank"), [["rank", "Assistant Community Manager"]]);
  assert.equal(calls.filter(([name]) => name === "add").length, 1);
  assert.equal(calls.filter(([name]) => name === "audit")[0][1], "400000000000000004");
  assert.equal(calls.filter(([name]) => name === "audit")[0][2], "role.assign");
});

test("unassign is idempotent when the member does not hold the role", async () => {
  const { calls, interaction, command } = setup({ held: false });
  const result = await command(interaction, "unassign");

  assert.equal(result.title, "Role unassigned");
  assert.equal(calls.some(([name]) => name === "remove"), false);
  assert.equal(calls.filter(([name]) => name === "audit")[0][4].changed, false);
});

test("rejects role changes outside the configured main server", async () => {
  const { calls, interaction, command } = setup({ guildId: "999999999999999999" });
  await assert.rejects(command(interaction, "assign"), /only be used in the main/);
  assert.equal(calls.length, 0);
});

test("protected roles retain the authorized-account and Co-Owner requirements", async () => {
  const { calls, interaction, command } = setup({ protectedRole: true });
  await command(interaction, "assign");

  assert.deepEqual(calls.filter(([name]) => name === "rank"), [
    ["rank", "Assistant Community Manager"],
    ["rank", "Co-Owner"],
  ]);
  assert.deepEqual(calls.filter(([name]) => name === "protected-manager"), [
    ["protected-manager", "400000000000000004"],
  ]);
  assert.equal(calls.filter(([name]) => name === "add").length, 1);
});

test("an unauthorized caller cannot mutate a protected role", async () => {
  const denied = new Error("Only an authorized protected-role manager can make this change.");
  const { calls, interaction, command } = setup({ protectedRole: true, protectedManagerError: denied });
  await assert.rejects(command(interaction, "assign"), /authorized protected-role manager/);
  assert.equal(calls.some(([name]) => name === "add"), false);
});
