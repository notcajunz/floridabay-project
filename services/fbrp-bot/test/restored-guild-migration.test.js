import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reset = fs.readFileSync(new URL("../../../scripts/reset-season-data.mjs", import.meta.url), "utf8");
const migration = fs.readFileSync(
  new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/117_new_main_and_staff_guilds.sql", import.meta.url),
  "utf8",
);

test("season resets preserve global-sync parents with their dependent configuration", () => {
  assert.match(reset, /"network_syncs"/);
  assert.match(reset, /"network_sync_roles"/);
  assert.match(reset, /"network_sync_guilds"/);
});

test("restored-guild migration repairs reset sync definitions before rebinding guilds", () => {
  const repair = migration.indexOf("INSERT IGNORE INTO network_syncs");
  const rebind = migration.indexOf("UPDATE network_sync_roles SET role_id");
  assert.ok(repair >= 0 && repair < rebind);
  for (const id of [4, 9, 10, 11, 13, 14, 15, 29]) assert.match(migration, new RegExp(`\\(${id},`));
  assert.match(migration, /'1557600357163474946','1565745687105114154','department_coordinator'/);
});
