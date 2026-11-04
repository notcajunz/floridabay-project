import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.MARIADB_HOST ||= "127.0.0.1";
const { ROLE_SOURCED_GROUPS, ROLE_AUTHORITATIVE_GROUPS } = await import("../src/sync.js");

test("sector coordination groups are role-sourced, not bidirectional", () => {
  assert.deepEqual([...ROLE_SOURCED_GROUPS].sort(), ["business_coordinator", "department_coordinator", "gang_coordination_team", "vip_vehicle_tuning"]);
  for (const name of ROLE_SOURCED_GROUPS) assert.equal(ROLE_AUTHORITATIVE_GROUPS.has(name), false);
});

test("migration 058 seeds the groups, syncs and source roles", async () => {
  const sql = await readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/058_sector_coordination_groups.sql", import.meta.url), "utf8");
  for (const name of ROLE_SOURCED_GROUPS) if (name !== "vip_vehicle_tuning") assert.ok(sql.includes(`'${name}'`), name);
  assert.ok(sql.includes("'500362386'"));
  assert.ok(sql.includes("discord_role_sources"));
});

test("every department coordination rank sources the global department role", async () => {
  const sql = await readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/099_department_coordination_all_ranks.sql", import.meta.url), "utf8");
  const sources = [...sql.matchAll(/'1558235113295315004','(\d+)','department_coordinator'/g)].map((match) => match[1]);
  assert.equal(new Set(sources).size, 9);
  assert.ok(sources.includes("1560393456323534958"), "Probationary Department Coordinator");
});
