import assert from "node:assert/strict";
import test from "node:test";
import { applyRoleOrder, syncNetworkGuildName } from "../src/sync.js";

test("network server renames update the directory entry", async () => {
  const calls = [];
  const database = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { affectedRows: 1 };
    },
  };

  assert.equal(await syncNetworkGuildName({ id: "guild-1", name: "  New County Name  " }, database), true);
  assert.deepEqual(calls, [{
    sql: "UPDATE network_guilds SET name=? WHERE guild_id=? AND name<>?",
    params: ["New County Name", "guild-1", "New County Name"],
  }]);
});

test("duplicate Discord raw positions fall back to individual synced-role moves", async () => {
  const moves = [];
  const role = (id, position, rawPosition) => ({
    id,
    name: id,
    position,
    rawPosition,
    editable: true,
    managed: false,
    permissions: 0n,
    async setPosition(target) {
      moves.push([id, target]);
      this.position = target;
      return this;
    },
  });
  const roles = [
    role("owner", 4, 3),
    role("co-owner", 3, 2),
    role("management", 2, 1),
    role("security", 1, 1),
  ];
  const cache = new Map(roles.map((item) => [item.id, item]));
  const guild = {
    id: "sheriff",
    members: { me: { roles: { highest: { position: 5, rawPosition: 4 } }, permissions: { has: () => true } } },
    roles: {
      cache,
      fetch: async () => cache,
      setPositions: async () => assert.fail("bulk reorder must not run with duplicate raw positions"),
    },
  };
  const database = {
    async query() {
      return ["owner", "co-owner", "security", "management"].map((role_id) => ({ role_id }));
    },
  };

  const result = await applyRoleOrder(guild, database);

  assert.deepEqual(moves, [["management", 1], ["security", 2]]);
  assert.deepEqual(result, { moved: 2, skipped: 0 });
});
