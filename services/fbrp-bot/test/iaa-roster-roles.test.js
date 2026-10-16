import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isCurrentRosterMember, rosterRolePlan } from "../src/iaa/ranksync.js";

const cfg = {
  roles: { base: "iaa" },
  tiers: [
    { key: "agent", roleId: null, index: 0 },
    { key: "supervisor", roleId: "supervisor", index: 1 },
    { key: "low_command", roleId: "low", index: 2 },
    { key: "high_command", roleId: "high", index: 3 },
  ],
};

test("IAA access roles are derived from roster rank tiers", () => {
  assert.deepEqual([...rosterRolePlan(cfg, null).expected], []);
  assert.deepEqual([...rosterRolePlan(cfg, { tier: "agent" }).expected], ["iaa"]);
  assert.deepEqual([...rosterRolePlan(cfg, { tier: "supervisor" }).expected], ["iaa", "supervisor"]);
  assert.deepEqual([...rosterRolePlan(cfg, { tier: "high_command" }).expected], ["iaa", "supervisor", "low", "high"]);
});

test("suspended agents receive no roster access roles", () => {
  assert.deepEqual([...rosterRolePlan(cfg, { tier: "high_command" }, true).expected], []);
});

test("active and suspended roster records retain agency roles while removed records do not", () => {
  assert.equal(isCurrentRosterMember(null, { status: "active" }), true);
  assert.equal(isCurrentRosterMember(null, { status: "suspended" }), true);
  assert.equal(isCurrentRosterMember(null, { status: "removed" }), false);
  assert.equal(isCurrentRosterMember(null, null), false);
  assert.equal(isCurrentRosterMember({ tier: "agent" }, null), true);
});

test("member updates enforce unauthorized additions and DM the member", async () => {
  const [index, sync] = await Promise.all([
    readFile(new URL("../src/iaa/index.js", import.meta.url), "utf8"),
    readFile(new URL("../src/iaa/ranksync.js", import.meta.url), "utf8"),
  ]);
  assert.match(index, /enforceRosterRoles\(after, \{ warnFor: added \}\)/);
  assert.match(index, /controlled = await agencyRoleIds\(\)/);
  assert.match(sync, /member\.roles\.remove\(\[\.\.\.remove\]/);
  assert.match(await readFile(new URL("../src/iaa/store.js", import.meta.url), "utf8"), /r\.botPermissions/);
  assert.match(sync, /await member\.send/);
  assert.match(sync, /Unauthorized IAA role removed/);
});
