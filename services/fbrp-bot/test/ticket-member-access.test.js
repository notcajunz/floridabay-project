import assert from "node:assert/strict";
import test from "node:test";

import { PermissionFlagsBits } from "discord.js";
import { createTicketSystem } from "../src/ticket-system.js";

function fixture({ actorId, authorId, canView = false, isStaff = false, targetId = "new-member" }) {
  const writes = [];
  const permissionEdits = [];
  const row = {
    id: 42,
    guild_id: "guild-1",
    channel_id: "channel-1",
    author_id: authorId,
    type: "support",
    status: "open",
  };
  const member = { id: actorId };
  const channel = {
    permissionsFor: (candidate) => ({
      has: (permission) => candidate === member && permission === PermissionFlagsBits.ViewChannel && canView,
    }),
    permissionOverwrites: {
      edit: async (id, permissions) => permissionEdits.push({ id, permissions }),
    },
    send: async () => null,
  };
  const db = {
    one: async (sql) => sql.includes("FROM support_tickets") ? row : null,
    query: async (sql, params = []) => {
      if (sql.includes("ticket_support_roles")) return [];
      writes.push({ sql, params });
      return { affectedRows: 1 };
    },
  };
  const guild = { id: row.guild_id, members: { fetch: async () => member } };
  const interaction = {
    guild,
    guildId: row.guild_id,
    channelId: row.channel_id,
    user: { id: actorId },
    options: {
      getInteger: () => null,
      getUser: () => ({ id: targetId }),
    },
  };
  const system = createTicketSystem({
    client: { user: { id: "bot" }, channels: { fetch: async () => channel } },
    db,
    audit: async () => {},
    hasPermission: async () => isStaff,
    requireMinimumStaffRank: async () => {},
    clean: (value) => String(value),
    safeName: (value) => String(value),
    embed: () => ({}),
    card: (title, options) => ({ title, options }),
    colors: { primary: 1, success: 2, warning: 3, danger: 4 },
    log: async () => {},
  });
  return { system, interaction, writes, permissionEdits };
}

test("the member who opened a ticket can add another member", async () => {
  const { system, interaction, writes, permissionEdits } = fixture({ actorId: "owner", authorId: "owner" });

  await system.command(interaction, "add");

  assert.equal(permissionEdits[0].id, "new-member");
  assert.ok(writes.some(({ sql, params }) => sql.includes("INSERT IGNORE INTO ticket_participants") && params[2] === "owner"));
});

test("any member who can view a ticket can add another member", async () => {
  const { system, interaction, permissionEdits } = fixture({ actorId: "participant", authorId: "owner", canView: true });

  await system.command(interaction, "add");

  assert.equal(permissionEdits[0].id, "new-member");
});

test("a member without ticket access cannot add another member", async () => {
  const { system, interaction, permissionEdits } = fixture({ actorId: "outsider", authorId: "owner" });

  await assert.rejects(system.command(interaction, "add"), /need access to this ticket/i);
  assert.deepEqual(permissionEdits, []);
});

test("ticket remove denies role-based access for a management member", async () => {
  const { system, interaction, permissionEdits } = fixture({
    actorId: "support-staff",
    authorId: "ticket-owner",
    isStaff: true,
    targetId: "management-member",
  });

  await system.command(interaction, "remove");

  assert.deepEqual(permissionEdits[0], {
    id: "management-member",
    permissions: { ViewChannel: false },
  });
});

test("ticket remove can deny access to the member who opened the ticket", async () => {
  const { system, interaction, permissionEdits } = fixture({
    actorId: "support-staff",
    authorId: "ticket-owner",
    isStaff: true,
    targetId: "ticket-owner",
  });

  await system.command(interaction, "remove");

  assert.deepEqual(permissionEdits[0], {
    id: "ticket-owner",
    permissions: { ViewChannel: false },
  });
});
