import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../server-data/resources/[fbrp]/fbrp_core/migrations/088_junior_management_rank.sql",
  import.meta.url,
);
const rolesMigrationUrl = new URL(
  "../../../server-data/resources/[fbrp]/fbrp_core/migrations/089_junior_management_discord_roles.sql",
  import.meta.url,
);
const databaseUrl = new URL(
  "../../../server-data/resources/[fbrp]/fbrp_core/server/database.lua",
  import.meta.url,
);

test("Junior Management migration creates the requested rank hierarchy and Discord roles", async () => {
  const [sql, roles, database] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(rolesMigrationUrl, "utf8"),
    readFile(databaseUrl, "utf8"),
  ]);

  assert.match(sql, /'junior_management','Junior Management',FLOOR\(\(manager\.rank_order \+ head_admin\.rank_order\) \/ 2\)/);
  assert.match(sql, /manager\.name='assistant_community_manager'/);
  assert.match(sql, /head_admin\.name='head_administrator'/);
  assert.match(sql, /SET category\.callsign_end=149/);
  assert.match(sql, /'Junior Management',150,199/);
  assert.match(sql, /pre_category\.name='Pre Management'/);
  assert.match(sql, /junior_category\.id,'Junior Management',NULL,NULL,'junior_management'/);
  assert.match(database, /migrations\/088_junior_management_rank\.sql/);
  assert.match(roles, /guild\.kind IN \('main','staff'\)/);
  assert.match(roles, /'junior_management','Junior Management'/);
  assert.match(roles, /guild\.kind='staff'/);
  assert.match(roles, /LOWER\('Assistant Community Manager'\)/);
  const sync = await readFile(new URL("../src/sync.js", import.meta.url), "utf8");
  assert.match(sync, /LEGACY_ROLE_NAMES = \{ junior_management: "trial manager" \}/);
  assert.match(sync, /\.setName\(/);
});
