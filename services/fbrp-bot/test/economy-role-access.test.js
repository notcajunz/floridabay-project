import assert from "node:assert/strict";
import test from "node:test";

import { managedOrgTypesForRoleIds, ORG_TYPE_MANAGER_ROLE_IDS } from "../src/economy.js";

test("gang management roles grant only gang organization management", () => {
  for (const roleId of ORG_TYPE_MANAGER_ROLE_IDS.gang)
    assert.deepEqual([...managedOrgTypesForRoleIds([roleId])], ["gang"]);
});

test("LEO management roles grant only LEO organization management", () => {
  for (const roleId of ORG_TYPE_MANAGER_ROLE_IDS.leo)
    assert.deepEqual([...managedOrgTypesForRoleIds([roleId])], ["leo"]);
});

test("business management roles grant only business organization management", () => {
  for (const roleId of ORG_TYPE_MANAGER_ROLE_IDS.business)
    assert.deepEqual([...managedOrgTypesForRoleIds([roleId])], ["business"]);
});

test("multiple management roles combine scopes and unrelated roles grant nothing", () => {
  assert.deepEqual([...managedOrgTypesForRoleIds([ORG_TYPE_MANAGER_ROLE_IDS.gang[0], ORG_TYPE_MANAGER_ROLE_IDS.business[0]])], ["gang", "business"]);
  assert.deepEqual([...managedOrgTypesForRoleIds(["123456789012345678"])], []);
});
