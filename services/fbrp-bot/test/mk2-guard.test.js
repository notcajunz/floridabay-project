import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TEBEX_PRODUCTS } from "../src/tebex-fulfillment.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, "server-data", relative), "utf8");
const dir = "resources/[fbrp]/fbrp_mk2guard";

test("the Mk2 guard is started and keyed to the same role the Mk2 Weapons product grants", () => {
  assert.match(read("config/resources.cfg"), /^ensure fbrp_mk2guard$/m);
  const role = read(`${dir}/config.lua`).match(/RoleId\s*=\s*'(\d+)'/)[1];
  assert.deepEqual(TEBEX_PRODUCTS.find((product) => product.name === "Mk2 Weapons").roles, [role]);
});

test("every base-game Mk2 weapon is guarded on both the client and the server", () => {
  const config = read(`${dir}/config.lua`);
  const weapons = [...config.matchAll(/'(WEAPON_[A-Z0-9_]+_MK2)'/g)].map((match) => match[1]);
  assert.deepEqual(weapons.sort(), [
    "WEAPON_ASSAULTRIFLE_MK2", "WEAPON_BULLPUPRIFLE_MK2", "WEAPON_CARBINERIFLE_MK2", "WEAPON_COMBATMG_MK2",
    "WEAPON_HEAVYSNIPER_MK2", "WEAPON_MARKSMANRIFLE_MK2", "WEAPON_PISTOL_MK2", "WEAPON_PUMPSHOTGUN_MK2",
    "WEAPON_REVOLVER_MK2", "WEAPON_SMG_MK2", "WEAPON_SNSPISTOL_MK2", "WEAPON_SPECIALCARBINE_MK2",
  ]);
  const client = read(`${dir}/client.lua`);
  assert.match(client, /if access == false then/);
  assert.match(client, /RemoveWeaponFromPed\(ped, weapon\)/);
  const server = read(`${dir}/server.lua`);
  assert.match(server, /GetSelectedPedWeapon\(ped\)/);
  assert.match(server, /not hasAccess\(src\)[\s\S]*RemoveWeaponFromPed\(ped, held\)/);
  assert.match(server, /discord_member_cache/);
});
