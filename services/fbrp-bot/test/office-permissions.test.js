import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { OFFICE_OWNER_PERMISSIONS } from "../src/office-permissions.js";

test("office owners can manage their voice channel and its permission overwrites", () => {
  assert.deepEqual(OFFICE_OWNER_PERMISSIONS, {
    ViewChannel: true,
    Connect: true,
    ManageChannels: true,
    ManageRoles: true,
    MoveMembers: true,
  });
});

test("slash command and web panel use the shared office owner permissions", async () => {
  const [commandSource, panelSource] = await Promise.all([
    readFile(new URL("../src/index.js", import.meta.url), "utf8"),
    readFile(new URL("../src/web-panel.js", import.meta.url), "utf8"),
  ]);

  assert.match(commandSource, /permissionOverwrites\.edit\([\s\S]*?OFFICE_OWNER_PERMISSIONS,[\s\S]*?"Florida Bay office owner"/);
  assert.match(panelSource, /permissionOverwrites\.edit\(String\(values\.owner_id\), OFFICE_OWNER_PERMISSIONS, "Florida Bay office owner"\)/);
});
