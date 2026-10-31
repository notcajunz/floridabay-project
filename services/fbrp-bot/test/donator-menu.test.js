import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, "server-data", relative), "utf8");
const dir = "resources/[fbrp]/fbrp_donatormenu";
const GERMAN_ROLE = "1564110361961959505";

test("the donator menu and its companion resources are started with a manifest", () => {
  const phone = read("config/resources.cfg");
  for (const name of ["fbrp_donatormenu", "fbrp-enginesoundmenu", "jaxtti-carwipe", "NoNPC"]) {
    assert.match(phone, new RegExp(`^ensure ${name}$`, "m"), name);
    assert.ok(fs.existsSync(path.join(root, "server-data/resources/[fbrp]", name, "fxmanifest.lua")), `${name} has no manifest`);
  }
});

test("the donator menu reads roles from the shared cache, not a Discord bot token, and avoids the tags key", () => {
  const server = read(`${dir}/server/main.lua`);
  assert.match(server, /discord_member_cache WHERE guild_id=\? AND discord_id=\?/);
  assert.match(server, /MAIN_GUILD = '1557594282976747550'/);
  assert.doesNotMatch(server, /Authorization|discord\.com\/api|BotToken/);
  assert.match(read(`${dir}/fxmanifest.lua`), /@oxmysql\/lib\/MySQL\.lua/);
  assert.match(read(`${dir}/client/client.lua`), /RegisterKeyMapping\('f6menu', 'Donator Menu', 'keyboard', 'F5'\)/);
});

test("the German Vehicles Pack is a gated pack of BMW and Mercedes models", () => {
  for (const file of ["package_config.lua", "packs.lua"])
    assert.match(read(`${dir}/data/${file}`), new RegExp(`id = 'germanpack',\\s+label = 'German Vehicles Pack',\\s+role = '${GERMAN_ROLE}'`));
  const vehicles = read(`${dir}/data/vehicles.lua`);
  const pack = vehicles.slice(vehicles.indexOf("germanpack = {"), vehicles.indexOf("aviationpack = {"));
  assert.match(pack, /name = 'BMW M4 G82', spawnCode = 'm4g82'/);
  assert.match(pack, /name = 'Mercedes-AMG GT 63', spawnCode = 'gt63'/);
  const names = [...pack.matchAll(/name = '([^']+)'/g)].map((match) => match[1]);
  assert.ok(names.filter((name) => name.startsWith("BMW")).length >= 10);
  assert.ok(names.filter((name) => name.startsWith("Mercedes")).length >= 10);
});

test("the donator menu's Car Radio entry opens the existing /carradio behind its Discord role", () => {
  const radio = read(`${dir}/data/addons_config.lua`).match(/\{ id = 'radiocar'[^}]*\}/)[0];
  assert.match(radio, /label = 'Car Radio'/);
  assert.match(radio, /command = 'carradio'/);
  assert.match(radio, /role = '1560857811364356218'/);
  assert.match(read("resources/[fbrp]/fbrp_core/config.lua"), /carRadioRoleId = '1560857811364356218'/);
});

test("engine sound, siren and prop menus need DevOps+, owner keys its own role, and Founders get every paid pack", () => {
  const addons = read(`${dir}/data/addons_config.lua`);
  for (const id of ["enginesound", "sirenmenu", "props"])
    assert.match(addons, new RegExp(`id = '${id}'[^}]*role = '1564380267617984552'`), id);
  assert.match(read(`${dir}/data/core.lua`), /id = 'ownerkeys'[^}]*role = '1564129525850443867'/);
  const server = read(`${dir}/server/main.lua`);
  assert.match(server, /FOUNDER_ROLE = '1558777557799801004'/);
  assert.match(server, /roles\[FOUNDER_ROLE\] and not NOT_FOR_FOUNDERS\[entry\.id\]/);
  assert.match(server, /vehicles\[pack\.id\] = type\(VehicleList\[pack\.id\]\) == 'table' and VehicleList\[pack\.id\] or \{\}/);
});

test("Owners Keys and the VIP Package list real fbrpCars models", () => {
  const vehicles = read(`${dir}/data/vehicles.lua`);
  for (const key of ["ownerkeys", "vip_package"]) {
    const block = vehicles.match(new RegExp(`\\n    ${key} = \\{[\\s\\S]*?\\n    \\},`))[0];
    assert.ok([...block.matchAll(/spawnCode = '/g)].length >= 10, key);
  }
});

test("the Owner Vehicles category is hidden unless the player holds one of its two roles", () => {
  const core = read(`${dir}/data/core.lua`);
  const entry = core.match(/\{ id = 'ownerfleet'[^\n]*\}/)[0];
  assert.match(entry, /roles = \{ '1557689734774390874', '1557596860208652338' \}/);
  assert.match(entry, /hidden = true/);

  const server = read(`${dir}/server/main.lua`);
  assert.match(server, /if entry\.roles then[\s\S]*roles\[tostring\(role\)\] == true then return true end/);
  assert.match(server, /NOT_FOR_FOUNDERS = \{[^}]*ownerfleet = true/);
  assert.match(server, /if VehicleList\.ownerfleet and permissions\.ownerfleet then\s+vehicles\.ownerfleet = VehicleList\.ownerfleet/);

  const client = read(`${dir}/client/client.lua`);
  assert.match(client, /if Permissions\?\['ownerfleet'\] then\s+Items:AddButton\(\s+M\.ownerFleet,/);
  assert.equal((client.match(/role ~= 'ownerfleet'/g) || []).length, 2, "the owner fleet never becomes a store pack submenu");
});

test("the owner fleet lists the owner LEO chargers and the owner personals", () => {
  const vehicles = read(`${dir}/data/vehicles.lua`);
  const fleet = vehicles.slice(vehicles.indexOf("ownerfleet = {"), vehicles.indexOf("aviationpack = {"));
  for (const code of ["saif_leo_charger1", "saif_leo_charger3", "saif_chargerpd", "owner_stc1", "owner_stc2", "owner_stc3", "owner_stc4", "sp_txr"])
    assert.match(fleet, new RegExp(`spawnCode = '${code}'`), code);
});

test("the aviation pack lists the G650, Phenom 300, PC-12 and EC130 add-ons", () => {
  const vehicles = read(`${dir}/data/vehicles.lua`);
  const aviation = vehicles.slice(vehicles.indexOf("aviationpack = {"));
  for (const code of ['g650', 'phenom300', 'pc12', 'ec130']) assert.match(aviation, new RegExp(`spawnCode = '${code}'`), code);
});
