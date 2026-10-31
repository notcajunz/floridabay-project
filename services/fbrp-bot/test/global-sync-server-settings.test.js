import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { effectiveGuildSync, enforceLinkedAppearance, renameManagementRankRoles } from "../src/sync.js";

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

test("Trial Management has its requested appearance only in the main server", () => {
  const sync = {
    group_name: "trial_management",
    role_name: "Trial Management",
    color: 0,
    permissions: "0",
    all_channels: false,
  };

  assert.deepEqual(effectiveGuildSync(sync, null, "main"), {
    ...sync,
    role_name: "FBRP | Trial Management",
    color: 0x826bc2,
    enforce_appearance: true,
  });
  assert.equal(effectiveGuildSync(sync, null, "staff"), sync);
});

test("an existing linked Trial Management role receives the enforced appearance", async () => {
  let edit;
  const role = {
    name: "Trial Management",
    colors: { primaryColor: 0 },
    editable: true,
    async edit(changes) {
      edit = changes;
      return { ...this, name: changes.name, colors: changes.colors };
    },
  };

  const result = await enforceLinkedAppearance(
    role,
    { group_name: "trial_management", enforce_appearance: true },
    { name: "FBRP | Trial Management", colors: { primaryColor: 0x826bc2 } },
  );
  assert.equal(result.role.name, "FBRP | Trial Management");
  assert.equal(edit.colors.primaryColor, 0x826bc2);
  assert.match(result.note, /appearance updated/);
});

test("management roles are renamed in place in main and staff servers", async () => {
  const edits = [];
  const roles = new Map([
    ["trial-main", { id: "trial-main", name: "FBRP | Junior Management", editable: true }],
    ["director-staff", { id: "director-staff", name: "FBRP | Assistant Community Director", editable: true }],
    ["executive-staff", { id: "executive-staff", name: "FBRP | Community Director", editable: true }],
  ]);
  for (const role of roles.values()) role.edit = async ({ name }) => { edits.push([role.id, name]); role.name = name; return role; };
  const guild = { roles: { cache: roles, fetch: async (id) => roles.get(id) } };
  const client = { guilds: { cache: new Map([["guild", guild]]) } };
  const database = { query: async () => [
    { guild_id: "guild", role_id: "trial-main", group_name: "trial_management" },
    { guild_id: "guild", role_id: "director-staff", group_name: "community_director" },
    { guild_id: "guild", role_id: "executive-staff", group_name: "executive_management" },
  ] };

  assert.deepEqual(await renameManagementRankRoles(client, database), { renamed: 3, unchanged: 0, unavailable: 0 });
  assert.deepEqual(edits, [
    ["trial-main", "FBRP | Trial Management"],
    ["director-staff", "FBRP | Community Director"],
    ["executive-staff", "FBRP | Executive Management"],
  ]);
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
