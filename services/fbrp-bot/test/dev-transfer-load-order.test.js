import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const phone = read("server-data/config/resources.cfg");
const resources = "server-data/resources";

test("every resource ensured from the dev transfer ships a manifest in the repository or is a known external pack", () => {
  const external = new Set(["[roxwood]", "fbrp-LChalloween"]);
  for (const name of ["DeathScript", "fbrp_deleteveh", "fbrp_fuel", "fbrp_jail", "fbrp_staffjail", "fbrp-misc", "ox_doorlock", "qx-online", "jaxtti_lib", "jaxtti_core", "jaxtti_collision"]) {
    assert.match(phone, new RegExp(`^ensure ${name}$`, "m"), name);
    assert.ok(fs.existsSync(path.join(root, resources, "[fbrp]", name, "fxmanifest.lua")), `${name} has no manifest`);
  }
  for (const name of external) assert.match(phone, new RegExp(`^ensure ${name.replace(/[[\]]/g, "\\$&")}$`, "m"), name);
});

test("the Halloween loading screen replaces fbrp_loading explicitly and Roxwood loads", () => {
  assert.ok(phone.indexOf("stop fbrp_loading") !== -1);
  assert.ok(phone.indexOf("stop fbrp_loading") < phone.indexOf("ensure fbrp-LChalloween"));
  assert.match(phone, /^ensure \[roxwood\]$/m);
});

test("Roxwood's freemode clothing stays stopped after the Roxwood ensure (it crashed clients in SetPlayerModel at spawn)", () => {
  assert.ok(phone.indexOf("stop amb-roxwood-clothing") > phone.indexOf("ensure [roxwood]"));
});

test("the unusable lb-payphone (escrowed, needs loaf_lib) and the unused menu libraries are not started (NativeUI is, for the grief menu)", () => {
  assert.doesNotMatch(phone, /^ensure (lb-payphone|MenuAPI|SEM_InteractionMenu)$/m);
});

test("only fbrp_core owns /staff and /ondutystaff, and fbrp_core steps aside for fbrp_jail", () => {
  const chat = read(`${resources}/[standalone]/fbrp_chat/server/commands.lua`);
  assert.doesNotMatch(chat, /RegisterCommand\('(staff|ondutystaff)'/);
  const core = read(`${resources}/[fbrp]/fbrp_core/server/main.lua`);
  assert.match(core, /RegisterCommand\('staff'/);
  assert.match(core, /RegisterCommand\('ondutystaff'/);
  const justice = read(`${resources}/[fbrp]/fbrp_core/server/justice.lua`);
  assert.match(justice, /RegisterCommand\('jail', function\(source, args\)\n    if jailResource\(\) then return end/);
});

test("the control status board knows the Roxwood priority zone", () => {
  assert.match(read("services/fbrp-bot/src/status-board.js"), /roxwood: "Roxwood"/);
  assert.match(read(`${resources}/[fbrp]/fbrp_core/config.lua`), /id='roxwood'/);
});
