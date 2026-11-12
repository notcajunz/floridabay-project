import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const SADO = "1560427159355400242";

test("migration 120 removes SADO from every network table but keeps backups", async () => {
  const sql = await readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/120_remove_sado_from_network.sql", import.meta.url), "utf8");
  for (const table of ["network_guilds", "network_sync_roles", "network_sync_anchors", "network_sync_guild_settings", "network_sync_guilds", "discord_guild_roles"])
    assert.match(sql, new RegExp(`DELETE FROM ${table} WHERE guild_id='${SADO}'`), table);
  assert.doesNotMatch(sql, /discord_server_backup/);
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b/i);
});
