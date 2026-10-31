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
    "1563444048277274694",
    "1564056853585854485",
    "1564110361961959505",
    "1564110293846724710",
    "1564380267617984552",
  ]);
});

test("granting the source role grants every missing bundle role", async () => {
  const calls = [];
  const oldMember = member([]);
  const newMember = member([BUNDLE_SOURCE_ROLE_ID], calls);
  assert.equal(roleBundleTransition(oldMember, newMember), "add");
  const result = await enforceRoleBundle(oldMember, newMember);
  assert.equal(result.changed, 16);
  assert.deepEqual(calls, [{ action: "add", ids: [...BUNDLE_ROLE_IDS] }]);
});

test("removing the source role removes every held bundle role", async () => {
  const calls = [];
  const oldMember = member([BUNDLE_SOURCE_ROLE_ID, ...BUNDLE_ROLE_IDS]);
  const newMember = member(BUNDLE_ROLE_IDS, calls);
  assert.equal(roleBundleTransition(oldMember, newMember), "remove");
  const result = await enforceRoleBundle(oldMember, newMember);
  assert.equal(result.changed, 16);
  assert.deepEqual(calls, [{ action: "remove", ids: [...BUNDLE_ROLE_IDS] }]);
});

test("removing Founder preserves roles still backed by Tebex entitlements", async () => {
  const calls = [];
  const oldMember = member([BUNDLE_SOURCE_ROLE_ID, ...BUNDLE_ROLE_IDS]);
  const newMember = member(BUNDLE_ROLE_IDS, calls);
  const preserved = new Set([BUNDLE_ROLE_IDS[1], BUNDLE_ROLE_IDS[4]]);
  const result = await enforceRoleBundle(oldMember, newMember, { preserve: async (id) => preserved.has(id) });
  assert.equal(result.changed, BUNDLE_ROLE_IDS.length - preserved.size);
  assert.deepEqual(calls[0].ids, BUNDLE_ROLE_IDS.filter((id) => !preserved.has(id)));
});

test("bundle-generated role updates do not recurse", async () => {
  const calls = [];
  const before = member([BUNDLE_SOURCE_ROLE_ID]);
  const after = member([BUNDLE_SOURCE_ROLE_ID, BUNDLE_ROLE_IDS[0]], calls);
  assert.equal(roleBundleTransition(before, after), null);
  assert.deepEqual(await enforceRoleBundle(before, after), { action: null, changed: 0, unavailable: [] });
  assert.deepEqual(calls, []);
});
