import assert from "node:assert/strict";
import test from "node:test";
import {
  MANAGEMENT_MEMBERSHIP_ORIGIN,
  reconcileAllManagementMemberships,
  reconcileManagementMembership,
} from "../src/sync.js";

function fakeDatabase({ eligible, origins = [] }) {
  const state = { origins: [...origins], transactions: 0 };
  return {
    state,
    async one() { return eligible ? { ok: 1 } : null; },
    async query() { return state.origins.map((origin) => ({ origin })); },
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
