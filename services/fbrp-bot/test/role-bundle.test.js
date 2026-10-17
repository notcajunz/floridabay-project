import test from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLE_ROLE_IDS,
  BUNDLE_SOURCE_ROLE_ID,
  enforceRoleBundle,
  roleBundleTransition,
} from "../src/role-bundle.js";

function member(roleIds, calls = []) {
  const cache = new Map(roleIds.map((id) => [id, { id, managed: false, editable: true }]));
  for (const id of [BUNDLE_SOURCE_ROLE_ID, ...BUNDLE_ROLE_IDS])
    if (!cache.has(id)) cache.set(id, { id, managed: false, editable: true, held: false });
  const held = new Set(roleIds);
  return {
    user: { bot: false },
    guild: { roles: { cache } },
    roles: {
      cache: { has: (id) => held.has(id) },
      add: async (ids) => calls.push({ action: "add", ids }),
      remove: async (ids) => calls.push({ action: "remove", ids }),
    },
  };
}

test("role bundle uses the requested source and target IDs", () => {
  assert.equal(BUNDLE_SOURCE_ROLE_ID, "1558777557799801004");
  assert.deepEqual(BUNDLE_ROLE_IDS, [
    "1559633446429786162",
    "1557689749198868520",
    "1558237674412974221",
    "1558237679353593927",
    "1560857811364356218",
    "1557689749509120091",
    "1557689750184398999",
    "1558772553789743214",
    "1558778405724626964",
    "1558778406403964958",
    "1558778407280447588",
  ]);
});

test("granting the source role grants every missing bundle role", async () => {
  const calls = [];
  const oldMember = member([]);
  const newMember = member([BUNDLE_SOURCE_ROLE_ID], calls);
  assert.equal(roleBundleTransition(oldMember, newMember), "add");
  const result = await enforceRoleBundle(oldMember, newMember);
  assert.equal(result.changed, 11);
  assert.deepEqual(calls, [{ action: "add", ids: [...BUNDLE_ROLE_IDS] }]);
});

test("removing the source role removes every held bundle role", async () => {
  const calls = [];
  const oldMember = member([BUNDLE_SOURCE_ROLE_ID, ...BUNDLE_ROLE_IDS]);
  const newMember = member(BUNDLE_ROLE_IDS, calls);
  assert.equal(roleBundleTransition(oldMember, newMember), "remove");
  const result = await enforceRoleBundle(oldMember, newMember);
  assert.equal(result.changed, 11);
  assert.deepEqual(calls, [{ action: "remove", ids: [...BUNDLE_ROLE_IDS] }]);
});

test("bundle-generated role updates do not recurse", async () => {
  const calls = [];
  const before = member([BUNDLE_SOURCE_ROLE_ID]);
  const after = member([BUNDLE_SOURCE_ROLE_ID, BUNDLE_ROLE_IDS[0]], calls);
  assert.equal(roleBundleTransition(before, after), null);
  assert.deepEqual(await enforceRoleBundle(before, after), { action: null, changed: 0, unavailable: [] });
  assert.deepEqual(calls, []);
});
