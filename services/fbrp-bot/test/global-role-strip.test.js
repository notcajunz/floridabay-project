import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { commands } from "../src/commands.js";

test("global role-strip commands expose the reversible snapshot workflow", () => {
  const command = commands.find((item) => item.name === "global");
  const rolestrip = command.options.find((item) => item.name === "rolestrip");
  const unrolestrip = command.options.find((item) => item.name === "unrolestrip");
  assert.ok(rolestrip);
  assert.ok(unrolestrip);
  assert.deepEqual(rolestrip.options.map(({ name, required }) => [name, required]), [
    ["user", true],
    ["reason", true],
  ]);
  assert.deepEqual(unrolestrip.options.map(({ name, required }) => [name, required]), [
    ["user", true],
    ["reason", false],
  ]);
});

test("role-strip migration preserves ACE and per-guild Discord role snapshots", async () => {
  const sql = await readFile(
    new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/064_global_role_strips.sql", import.meta.url),
    "utf8",
  );
  for (const column of ["discord_id", "ace_memberships", "guild_roles", "target_level", "restoring"])
    assert.match(sql, new RegExp(`\\b${column}\\b`));
});

test("bot and FiveM permission resolution both quarantine active role strips", async () => {
  const [database, sync, game] = await Promise.all([
    readFile(new URL("../src/database.js", import.meta.url), "utf8"),
    readFile(new URL("../src/sync.js", import.meta.url), "utf8"),
    readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/server/main.lua", import.meta.url), "utf8"),
  ]);
  assert.match(database, /NOT EXISTS \(SELECT 1 FROM global_role_strips/);
  assert.match(sync, /WHERE restoring=FALSE/);
  assert.match(game, /NOT EXISTS[\s\S]+global_role_strips/);
});
