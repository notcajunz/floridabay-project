import assert from "node:assert/strict";
import test from "node:test";
import {
  STAFF_LADDER_ORIGIN,
  reconcileStaffLadder,
  MANAGEMENT_MEMBERSHIP_ORIGIN,
  reconcileAllManagementMemberships,
  reconcileManagementMembership,
} from "../src/sync.js";

function fakeDatabase({ eligible, origins = [] }) {
  const state = { origins: [...origins], transactions: 0 };
  return {
    state,
    async one() { return eligible ? { ok: 1 } : null; },
    async query(sql) { if (sql.includes("staff_roster_ranks") || sql.includes("origin=?")) return []; return state.origins.map((origin) => ({ origin })); },
    async transaction(work) {
      state.transactions += 1;
      return work(async (sql, params) => {
        if (sql.startsWith("DELETE")) state.origins = [];
        if (sql.startsWith("INSERT")) state.origins.push(params[2]);
        return [];
      });
    },
  };
}

test("ACM+ replaces stale/manual Management Team grants with one derived membership", async () => {
  const database = fakeDatabase({ eligible: true, origins: ["manual", "discord:test"] });
  const result = await reconcileManagementMembership("member", "bot", database);
  assert.deepEqual(result, { eligible: true, changed: true });
  assert.deepEqual(database.state.origins, [MANAGEMENT_MEMBERSHIP_ORIGIN]);
  assert.equal(database.state.transactions, 1);
});

test("demotion below ACM removes Management Team membership", async () => {
  const database = fakeDatabase({ eligible: false, origins: [MANAGEMENT_MEMBERSHIP_ORIGIN] });
  const result = await reconcileManagementMembership("member", "bot", database);
  assert.deepEqual(result, { eligible: false, changed: true });
  assert.deepEqual(database.state.origins, []);
});

test("correct derived Management Team membership is idempotent", async () => {
  const database = fakeDatabase({ eligible: true, origins: [MANAGEMENT_MEMBERSHIP_ORIGIN] });
  const result = await reconcileManagementMembership("member", "bot", database);
  assert.deepEqual(result, { eligible: true, changed: false });
  assert.equal(database.state.transactions, 0);
});

test("bulk reconciliation adds missing ACM+ members and removes stale members", async () => {
  const state = {
    eligible: ["acm", "owner"],
    memberships: [
      { discord_id: "owner", origin: MANAGEMENT_MEMBERSHIP_ORIGIN },
      { discord_id: "former", origin: "manual" },
    ],
  };
  const database = {
    async query(sql) {
      if (sql.includes("staff_roster_ranks") || sql.includes("origin=?")) return [];
      return sql.includes("SELECT DISTINCT")
        ? state.eligible.map((discord_id) => ({ discord_id }))
        : state.memberships.map((row) => ({ ...row }));
    },
    async transaction(work) {
      return work(async (sql, params) => {
        if (sql.startsWith("DELETE"))
          state.memberships = state.memberships.filter((row) => row.discord_id !== params[0]);
        if (sql.startsWith("INSERT"))
          state.memberships.push({ discord_id: params[0], origin: params[2] });
        return [];
      });
    },
  };
  const result = await reconcileAllManagementMemberships("bot", database);
  assert.deepEqual(new Set(result.changed), new Set(["acm", "former"]));
  assert.equal(result.eligible, 2);
  assert.deepEqual(
    state.memberships.sort((a, b) => a.discord_id.localeCompare(b.discord_id)),
    [
      { discord_id: "acm", origin: MANAGEMENT_MEMBERSHIP_ORIGIN },
      { discord_id: "owner", origin: MANAGEMENT_MEMBERSHIP_ORIGIN },
    ],
  );
});

function ladderDatabase(memberships) {
  const state = { memberships: memberships.map((row) => ({ ...row })) };
  const ranks = [["mod", 10], ["admin", 20], ["acm", 30], ["head", 40]];
  return {
    state,
    async query(sql, params) {
      if (sql.includes("JOIN ace_groups g")) return ranks.map(([name, rank_order]) => ({ name, rank_order }));
      if (sql.includes("JOIN staff_roster_ranks")) return state.memberships.filter((row) => ranks.some(([name]) => name === row.group_name));
      return state.memberships.filter((row) => row.origin === params[0]);
    },
    async transaction(work) {
      return work(async (sql, params) => {
        if (sql.startsWith("DELETE"))
          state.memberships = state.memberships.filter((row) => !(row.discord_id === params[0] && row.group_name === params[1] && row.origin === params[2]));
        if (sql.startsWith("INSERT")) state.memberships.push({ discord_id: params[0], group_name: params[1], origin: params[2] });
        return [];
      });
    },
  };
}
const names = (database, id) => database.state.memberships.filter((row) => row.discord_id === id).map((row) => row.group_name).sort();

test("a staff rank also grants the ACE group of every rank below it", async () => {
  const database = ladderDatabase([{ discord_id: "u", group_name: "acm", origin: "manual" }]);
  await reconcileStaffLadder("u", "bot", database);
  assert.deepEqual(names(database, "u"), ["acm", "admin", "mod"]);
});

test("demotion drops the derived lower ranks that no longer apply", async () => {
  const database = ladderDatabase([
    { discord_id: "u", group_name: "admin", origin: "manual" },
    { discord_id: "u", group_name: "mod", origin: STAFF_LADDER_ORIGIN },
    { discord_id: "u", group_name: "acm", origin: STAFF_LADDER_ORIGIN },
  ]);
  await reconcileStaffLadder("u", "bot", database);
  assert.deepEqual(names(database, "u"), ["admin", "mod"]);
});

test("staff removal clears derived ranks, and Discord-synced ranks never derive others", async () => {
  const database = ladderDatabase([
    { discord_id: "gone", group_name: "mod", origin: STAFF_LADDER_ORIGIN },
    { discord_id: "synced", group_name: "head", origin: "discord:1" },
  ]);
  await reconcileStaffLadder(null, "bot", database);
  assert.deepEqual(names(database, "gone"), []);
  assert.deepEqual(names(database, "synced"), ["head"]);
});
