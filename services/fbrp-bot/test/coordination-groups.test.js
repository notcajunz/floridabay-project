import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.MARIADB_HOST ||= "127.0.0.1";
const { ROLE_SOURCED_GROUPS, ROLE_AUTHORITATIVE_GROUPS } = await import("../src/sync.js");

test("sector coordination groups are role-sourced, not bidirectional", () => {
  assert.deepEqual([...ROLE_SOURCED_GROUPS].sort(), ["business_coordinator", "department_coordinator", "gang_coordination_team"]);
  for (const name of ROLE_SOURCED_GROUPS) assert.equal(ROLE_AUTHORITATIVE_GROUPS.has(name), false);
});

test("migration 058 seeds the groups, syncs and source roles", async () => {
  const sql = await readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/058_sector_coordination_groups.sql", import.meta.url), "utf8");
  for (const name of ROLE_SOURCED_GROUPS) assert.ok(sql.includes(`'${name}'`), name);
  assert.ok(sql.includes("'500362386'"));
  assert.ok(sql.includes("discord_role_sources"));
});
