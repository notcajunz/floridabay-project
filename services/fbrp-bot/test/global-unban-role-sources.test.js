import test from "node:test";
import assert from "node:assert/strict";
import { clearRoleSourcedMemberships, ROLE_SOURCED_GROUPS } from "../src/sync.js";

test("global unban cleanup retracts stale Discord-sourced coordinator memberships", async () => {
  const calls = [];
  const database = {
    query: async (sql, args) => {
      calls.push([sql, args]);
      return { affectedRows: 1 };
    },
  };

  assert.equal(await clearRoleSourcedMemberships("1483945026932441179", database), 1);
  assert.match(calls[0][0], /DELETE FROM ace_memberships/);
  assert.match(calls[0][0], /origin LIKE 'discord:%'/);
  assert.deepEqual(calls[0][1], ["1483945026932441179", ...ROLE_SOURCED_GROUPS]);
  assert.ok(ROLE_SOURCED_GROUPS.has("department_coordinator"));
});
