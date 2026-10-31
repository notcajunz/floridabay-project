import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../server-data/resources/[fbrp]/fbrp_core/migrations/100_management_rank_names.sql",
  import.meta.url,
);

test("management rank migration preserves identities while renaming ACE groups", async () => {
  const [sql, database] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/server/database.lua", import.meta.url), "utf8"),
  ]);

  assert.match(database, /migrations\/100_management_rank_names\.sql/);
  assert.match(database, /migrations\/050_assistant_community_director\.sql/);
  assert.match(sql, /'trial_management','Trial Management'/);
  assert.match(sql, /'community_director','Community Director'/);
  assert.match(sql, /'executive_management','Executive Management'/);
  assert.match(sql, /'1561889647918063738','trial_management'/);
  assert.match(sql, /'1557960561097183282','executive_management'/);
  for (const table of ["ace_entries", "ace_memberships", "discord_role_bindings"])
    assert.match(sql, new RegExp(`INSERT IGNORE INTO ${table}`));
  assert.match(sql, /UPDATE staff_roster_ranks SET ace_group='executive_management'/);
  assert.match(sql, /UPDATE staff_roster_ranks SET ace_group='community_director'/);
  assert.match(sql, /UPDATE staff_roster_ranks SET ace_group='trial_management'/);
});
