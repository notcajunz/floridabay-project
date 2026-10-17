import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { effectiveGuildSync } from "../src/sync.js";

test("global sync server settings override permissions and channel access", () => {
  const sync = { id: 7, permissions: "8", all_channels: true, role_name: "Staff" };

  assert.equal(effectiveGuildSync(sync), sync);
  assert.deepEqual(effectiveGuildSync(sync, {
    guild_id: "guild-1",
    permissions: "32",
    all_channels: 0,
  }), {
    ...sync,
    permissions: "32",
    all_channels: false,
  });
  assert.equal(effectiveGuildSync(sync, { permissions: "0", all_channels: "1" }).all_channels, true);
  assert.equal(effectiveGuildSync(sync, { permissions: "0", all_channels: "0" }).all_channels, false);
});

test("dashboard submits per-server role permissions and channel visibility", async () => {
  const source = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
  assert.match(source, /data-permissions-for/);
  assert.match(source, /data-channels-for/);
  assert.match(source, /server_settings:/);
});

test("per-server global sync settings migration is registered", async () => {
  const migration = await readFile(
    new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/070_global_role_server_settings.sql", import.meta.url),
    "utf8",
  );
  const database = await readFile(
    new URL("../../../server-data/resources/[fbrp]/fbrp_core/server/database.lua", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS network_sync_guild_settings/);
  assert.match(migration, /permissions VARCHAR\(24\)/);
  assert.match(migration, /all_channels BOOLEAN/);
  assert.match(database, /070_global_role_server_settings\.sql/);
});
