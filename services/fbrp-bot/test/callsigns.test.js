import assert from "node:assert/strict";
import test from "node:test";
import { rebalanceCallsigns } from "../src/callsigns.js";

function fakeDatabase(members, cutoff = 850) {
  const writes = [];
  return {
    writes,
    async transaction(work) {
      return work(async (sql, params = []) => {
        if (sql.includes("MAX(g.rank_order)")) return [{ rank_order: cutoff }];
        if (sql.includes("FROM staff_roster_members m")) return members.map((row) => ({ ...row }));
        writes.push({ sql, params });
        return [];
      });
    },
  };
}

const member = (discordId, rankOrder, callsign, overrides = {}) => ({
  discord_id: discordId,
  callsign,
  joined_at: 1,
  rank_changed_at: 1,
  rank_id: rankOrder,
  rank_sort: 1,
  rank_order: rankOrder,
  category_id: 1,
  category_name: "High Staff",
  callsign_start: 300,
  callsign_end: 399,
  category_sort: 1,
  ...overrides,
});

test("callsigns include Trial Head Administrator but exclude Senior Administrator and below", async () => {
  const database = fakeDatabase([
    member("head", 900, 301),
    member("trial-head", 875, 302, { rank_sort: 2 }),
    member("senior", 850, 300, { rank_sort: 3 }),
    member("admin", 800, 303, { rank_sort: 4 }),
  ]);

  const result = await rebalanceCallsigns(database, "tester");

  assert.deepEqual(
    result.assignments.map(({ discordId, callsign, eligible }) => ({ discordId, callsign, eligible })),
    [
      { discordId: "head", callsign: 300, eligible: true },
      { discordId: "trial-head", callsign: 301, eligible: true },
      { discordId: "senior", callsign: null, eligible: false },
      { discordId: "admin", callsign: null, eligible: false },
    ],
  );
  assert.deepEqual(
    result.changes.map(({ discordId, callsign }) => ({ discordId, callsign })),
    [
      { discordId: "head", callsign: 300 },
      { discordId: "trial-head", callsign: 301 },
      { discordId: "senior", callsign: null },
      { discordId: "admin", callsign: null },
    ],
  );
  assert.ok(database.writes.some(({ sql }) => sql.includes("SET callsign=NULL")));
  assert.deepEqual(
    database.writes
      .filter(({ sql, params }) => sql.startsWith("INSERT INTO staff_roster_history") && JSON.parse(params[3]).reason === "rank_policy")
      .map(({ params }) => params[0]),
    ["senior", "admin"],
  );
});

test("the leadership callsign policy is idempotent", async () => {
  const database = fakeDatabase([
    member("head", 900, 300),
    member("trial-head", 875, 301, { rank_sort: 2 }),
    member("senior", 850, null, { rank_sort: 3 }),
  ]);

  const result = await rebalanceCallsigns(database);

  assert.equal(result.changes.length, 0);
  assert.equal(database.writes.length, 0);
});

test("Junior Management receives callsigns from their dedicated 150-199 pool", async () => {
  const database = fakeDatabase([
    member("manager", 825, 107, {
      category_id: 1,
      category_name: "Management",
      callsign_start: 107,
      callsign_end: 149,
    }),
    member("junior-one", 812, null, {
      category_id: 2,
      category_name: "Junior Management",
      callsign_start: 150,
      callsign_end: 199,
    }),
    member("junior-two", 812, null, {
      category_id: 2,
      category_name: "Junior Management",
      callsign_start: 150,
      callsign_end: 199,
      joined_at: 2,
    }),
  ], 750);

  const result = await rebalanceCallsigns(database);
  assert.deepEqual(
    result.assignments.map(({ discordId, callsign }) => ({ discordId, callsign })),
    [
      { discordId: "manager", callsign: 107 },
      { discordId: "junior-one", callsign: 150 },
      { discordId: "junior-two", callsign: 151 },
    ],
  );
});

test("a missing Senior Administrator ACE mapping stops rebalancing", async () => {
  const database = fakeDatabase([], null);
  await assert.rejects(
    rebalanceCallsigns(database),
    /Senior Administrator must have a mapped ACE group/,
  );
});
