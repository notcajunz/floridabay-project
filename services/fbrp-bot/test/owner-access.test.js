import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { OWNER_DISCORD_ID, OWNER_DISCORD_IDS, PROTECTED_ROLE_MANAGER_IDS, requireOwnerId } from "../src/access-control.js";

const SECOND_OWNER = "1099651002208104488";

test("both owner accounts pass the owner-only gate and nobody else does", () => {
  assert.deepEqual([...OWNER_DISCORD_IDS], [OWNER_DISCORD_ID, SECOND_OWNER]);
  assert.doesNotThrow(() => requireOwnerId(OWNER_DISCORD_ID));
  assert.doesNotThrow(() => requireOwnerId(SECOND_OWNER, "edit ACE permissions"));
  assert.throws(() => requireOwnerId("123456789012345678"), /Only the Florida Bay owner/);
  assert.deepEqual([...PROTECTED_ROLE_MANAGER_IDS], [...OWNER_DISCORD_IDS]);
});

test("security owner checks follow the configured superusers, not a single hard-coded id", async () => {
  const source = await readFile(new URL("../src/security.js", import.meta.url), "utf8");
  assert.match(source, /const isBotOwner = \(id\) => botOwnerIds\(\)\.has\(String\(id\)\);/);
  assert.match(source, /FBRP_SUPERUSER_IDS/);
  assert.doesNotMatch(source, /String\(id\) === String\(process\.env\.FBRP_OWNER_DISCORD_ID/);
});
