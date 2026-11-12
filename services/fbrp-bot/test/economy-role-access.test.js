import assert from "node:assert/strict";
import test from "node:test";

import { managedOrgTypesForRoleIds, ORG_TYPE_MANAGER_ROLE_IDS, ORG_MANAGER_GRANT_TYPES } from "../src/economy.js";

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

test("department management roles grant every department organization type", () => {
  for (const roleId of ORG_TYPE_MANAGER_ROLE_IDS.department)
    assert.deepEqual([...managedOrgTypesForRoleIds([roleId])].sort(), ["fire", "government", "leo"]);
  assert.deepEqual([...managedOrgTypesForRoleIds(["1570223495437230131"])], [], "Assistant Department Manager is below Manager+");
});

test("the Manager+ role lists match the manager bots' configured ladders", () => {
  assert.deepEqual([...ORG_TYPE_MANAGER_ROLE_IDS.gang].sort(), ["1570223688689778728", "1570223689096495206", "1570223690203926562"]);
  assert.deepEqual([...ORG_TYPE_MANAGER_ROLE_IDS.business].sort(), ["1570224206354972865", "1570224207260942336", "1570224208494076035", "1570224209676996699"]);
  assert.deepEqual(ORG_MANAGER_GRANT_TYPES.department, ["leo", "fire", "government"]);
});

test("multiple management roles combine scopes and unrelated roles grant nothing", () => {
  assert.deepEqual([...managedOrgTypesForRoleIds([ORG_TYPE_MANAGER_ROLE_IDS.gang[0], ORG_TYPE_MANAGER_ROLE_IDS.business[0]])], ["gang", "business"]);
  assert.deepEqual([...managedOrgTypesForRoleIds(["123456789012345678"])], []);
});
