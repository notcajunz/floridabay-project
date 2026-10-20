import test from "node:test";
import assert from "node:assert/strict";

process.env.MARIADB_HOST ||= "127.0.0.1";
const { visibleMemberships, staffDisplayGroups } = await import("../src/sync.js");

const ranks = new Map([
  ["owner", 1000],
  ["co_owner", 950],
  ["community_director", 900],
  ["community_manager", 850],
  ["assistant_community_manager", 825],
  ["junior_management", 812],
  ["head_administrator", 800],
  ["admin", 725],
  ["moderator", 650],
  ["trial_moderator", 625],
]);
const info = { ranks, floor: 820 };
const names = (set) => [...set].sort();

test("staff wear only their top rank role", () => {
  const held = new Set(["admin", "moderator", "trial_moderator", "verified"]);
  assert.deepEqual(names(visibleMemberships(held, info)), ["admin", "verified"]);
});

test("management wear Head Administrator and every lower management rank", () => {
  const held = new Set(["community_director", "community_manager", "assistant_community_manager", "head_administrator", "admin", "moderator", "law_enforcement"]);
  assert.deepEqual(names(visibleMemberships(held, info)), ["assistant_community_manager", "community_director", "community_manager", "head_administrator", "junior_management", "law_enforcement"]);
});

test("ownership wear every management and ownership rank below them", () => {
  const held = new Set(["owner", "co_owner", "community_director", "community_manager", "assistant_community_manager", "head_administrator", "admin"]);
  assert.deepEqual(names(visibleMemberships(held, info)), ["assistant_community_manager", "co_owner", "community_director", "community_manager", "head_administrator", "junior_management", "owner"]);
  const coOwner = new Set(["co_owner", "community_director", "assistant_community_manager", "head_administrator", "admin"]);
  assert.deepEqual(names(visibleMemberships(coOwner, info)), ["assistant_community_manager", "co_owner", "community_director", "community_manager", "head_administrator", "junior_management"]);
});

test("a lower management rank does not wear ranks above it", () => {
  const held = new Set(["assistant_community_manager", "head_administrator", "admin"]);
  assert.deepEqual(names(visibleMemberships(held, info)), ["assistant_community_manager", "head_administrator", "junior_management"]);
});

test("Head Administrator is not management and keeps only its own role", () => {
  const held = new Set(["head_administrator", "admin", "moderator"]);
  assert.deepEqual(names(visibleMemberships(held, info)), ["head_administrator"]);
});

test("Junior Management also wears Head Administrator, even without holding that ACE group", () => {
  const held = new Set(["junior_management", "admin", "moderator"]);
  assert.deepEqual(names(visibleMemberships(held, info)), ["head_administrator", "junior_management"]);
});

test("non-staff memberships pass through untouched", () => {
  const held = new Set(["verified", "network_security"]);
  assert.equal(visibleMemberships(held, info), held);
});

test("management exception is skipped when no management floor is configured", () => {
  assert.deepEqual(names(staffDisplayGroups("owner", { ranks, floor: null })), ["owner"]);
});

test("team roles are not rank roles, so they follow every ACE group held", async () => {
  const { isRankRole } = await import("../src/sync.js");
  const info = { rankRoleIds: new Set(["9"]), rankRoleNames: new Set(["moderator", "head administrator"]) };
  assert.equal(isRankRole({ id: "9", name: "anything" }, info), true);
  assert.equal(isRankRole({ id: "1", name: "Head Administrator" }, info), true);
  assert.equal(isRankRole({ id: "1", name: "FBRP | Head Administrator" }, info), false);
  for (const name of ["Staff Team", "Senior Staff Team", "High Staff Team"]) assert.equal(isRankRole({ id: "2", name }, info), false);
});
