import test from "node:test";
import assert from "node:assert/strict";
import { mainRolesForRank, planMainRoles } from "../src/iaa/ranksync.js";
import { SERVICE_ROLES, queueServiceRoles } from "../src/service-roles.js";

const roles = SERVICE_ROLES.iaa.roles;
const cfg = {
  tiers: [
    { key: "agent", index: 0 },
    { key: "supervisor", index: 1 },
    { key: "low_command", index: 2 },
    { key: "high_command", index: 3 },
  ],
};

test("main-server IAA roles follow the rank tier", () => {
  assert.deepEqual([...mainRolesForRank(cfg, null)], []);
  assert.deepEqual([...mainRolesForRank(cfg, { tier: "agent" })], [roles.base]);
  assert.deepEqual([...mainRolesForRank(cfg, { tier: "low_command" })], [roles.base, roles.supervisor]);
  assert.deepEqual([...mainRolesForRank(cfg, { tier: "high_command" })], [roles.base, roles.supervisor, roles.high_command]);
  assert.deepEqual([...mainRolesForRank(cfg, { tier: "high_command" }, true)], []);
});

test("someone off the roster loses every main-server role and ranked agents gain missing ones", () => {
  const expected = new Map([["10", new Set([roles.base])]]);
  const holders = { [roles.base]: ["10", "99"], [roles.supervisor]: ["99"], [roles.high_command]: ["99"] };
  const { changes, removals } = planMainRoles({ expected, holders, roleIds: Object.values(roles) });
  assert.equal(removals, 3);
  assert.deepEqual(changes.filter((c) => c.discord_id === "99").map((c) => c.action), ["remove", "remove", "remove"]);
  assert.ok(!changes.some((c) => c.discord_id === "10"));
  const add = planMainRoles({ expected, holders: { [roles.base]: [] }, roleIds: Object.values(roles) });
  assert.deepEqual(add.changes, [{ discord_id: "10", role_id: roles.base, action: "add" }]);
});

test("the service role queue only accepts the service's own roles", async () => {
  await assert.rejects(queueServiceRoles("iaa", [{ discord_id: "12345678", role_id: "1", action: "add" }]), /not managed/);
  await assert.rejects(queueServiceRoles("dohs", [{ discord_id: "12345678", role_id: SERVICE_ROLES.iaa.roles.base, action: "add" }]), /not managed/);
  await assert.rejects(queueServiceRoles("nope", []), /Unknown service/);
  await assert.rejects(queueServiceRoles("dohs", [{ discord_id: "x", role_id: SERVICE_ROLES.dohs.roles.base, action: "add" }]), /Invalid discord_id/);
  await assert.rejects(queueServiceRoles("dohs", [{ discord_id: "12345678", role_id: SERVICE_ROLES.dohs.roles.base, action: "grant" }]), /add or remove/);
});

test("bot owners are exempt from IAA roster-bound removals", async () => {
  const { AGENCY_BYPASS_IDS } = await import("../src/service-roles.js");
  assert.deepEqual([...AGENCY_BYPASS_IDS], ["1090083387638812755"]);
  const { enforceRosterRoles } = await import("../src/iaa/ranksync.js");
  assert.deepEqual(await enforceRosterRoles({ id: "1090083387638812755" }), { added: 0, removed: 0, warned: 0 });
});

test("an exempt owner who holds the roles is neither removed nor re-added", () => {
  const roleIds = Object.values(roles);
  const holders = { [roles.base]: ["7"], [roles.supervisor]: ["7"], [roles.high_command]: ["7"] };
  const owner = planMainRoles({ expected: new Map([["7", new Set(roleIds)]]), holders, roleIds, exempt: new Set(["7"]) });
  assert.deepEqual(owner.changes, []);
  const offRoster = planMainRoles({ expected: new Map(), holders, roleIds, exempt: new Set(["7"]) });
  assert.deepEqual(offRoster.changes, []);
});
