import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("connected players are told to rejoin when their vMenu grants change", async () => {
  const lua = await readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/server/main.lua", import.meta.url), "utf8");
  assert.match(lua, /local function notifyVmenuChange\(changedGroups\)/);
  assert.match(lua, /permissionModelLoaded and applied\.object:sub\(1, 6\) == 'vMenu\.'/);
  assert.match(lua, /if changedVmenuGroups then notifyVmenuChange\(changedVmenuGroups\) end/);
});

test("the portal explains that vMenu changes need a rejoin", async () => {
  const server = await readFile(new URL("../src/web-panel.js", import.meta.url), "utf8");
  assert.match(server, /anyone already in the server must rejoin to see vMenu changes/);
});
