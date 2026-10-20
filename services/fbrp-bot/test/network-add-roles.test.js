import assert from "node:assert/strict";
import test from "node:test";
import { botRoleProblem, enrollNewGuild } from "../src/sync.js";

const guildWith = (botPosition, positions) => ({
  id: "g",
  name: "DOT",
  members: { me: { roles: { highest: { name: "Florida Bay Network", position: botPosition } } } },
  roles: { cache: new Map(positions.map((position, index) => [`r${index}`, { id: `r${index}`, position }])) },
});

test("a bot role below other roles is reported with how to fix it", () => {
  const message = botRoleProblem(guildWith(1, [0, 1, 54, 53]));
  assert.match(message, /below 2 roles/);
  assert.match(message, /\/globalsync push/);
  assert.equal(botRoleProblem(guildWith(62, [0, 1, 54, 53])), null);
});

test("a new server joins the picked syncs of servers of its own type", async () => {
  const inserts = [];
  const database = {
    query: async (sql, params) => {
      if (/FROM network_syncs/.test(sql)) return [{ id: 14, group_name: "department_coordinator" }, { id: 13, group_name: "gang_coordination_team" }];
      inserts.push(params);
      return { affectedRows: 1 };
    },
    one: async (sql, params) => (params[0] === 14 ? { ok: 1 } : null),
  };
  assert.deepEqual(await enrollNewGuild({ id: "g" }, "department", database), ["department_coordinator"]);
  assert.deepEqual(inserts, [[14, "g"]]);
});

const coordinatorDb = (inserts) => ({
  query: async (sql, params) => {
    if (/FROM network_syncs/.test(sql))
      return [
        { id: 13, group_name: "gang_coordination_team" },
        { id: 14, group_name: "department_coordinator" },
        { id: 15, group_name: "business_coordinator" },
      ];
    inserts.push(params);
    return { affectedRows: 1 };
  },
  one: async () => null, // no peer server of this type has picked any sync yet
});

test("a new business, department or gang server always gets its type's coordinator role", async () => {
  for (const [kind, id, group] of [
    ["business", 15, "business_coordinator"],
    ["department", 14, "department_coordinator"],
    ["gang", 13, "gang_coordination_team"],
  ]) {
    const inserts = [];
    assert.deepEqual(await enrollNewGuild({ id: "g" }, kind, coordinatorDb(inserts)), [group]);
    assert.deepEqual(inserts, [[id, "g"]]);
  }
});

test("other server types are not given a coordinator role", async () => {
  const inserts = [];
  assert.deepEqual(await enrollNewGuild({ id: "g" }, "community", coordinatorDb(inserts)), []);
  assert.deepEqual(inserts, []);
});
