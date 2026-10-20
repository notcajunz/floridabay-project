import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverData = path.resolve(here, "../../../server-data");
const phone = "resources/[standalone]/sky_phone";
const read = (relative) => fs.readFileSync(path.join(serverData, relative), "utf8");

test("the phone runs on the fbrp framework with one device per character", () => {
  const config = read(`${phone}/config/config.lua`);
  assert.match(config, /Framework = "fbrp"/);
  assert.match(config, /Inventory = "fbrp"/);
  assert.match(config, /Unique = false/);
  assert.match(config, /Config\.PhoneConfigurator = \{\s*Enabled = false,/);
  assert.match(config, /Config\.Sim = \{[^}]*Enabled = false/s);
  assert.match(config, /Keybind = "UP"/, "F1 belongs to vMenu");
});

test("no shipped password pepper is used", () => {
  const config = read(`${phone}/config/config.lua`);
  assert.doesNotMatch(config, /f626581802800478346266e66414d8e6f2c28050214a593c25901904c162bffe/);
  for (const convar of ["sky_phone_passcode_pepper", "sky_phone_crewlink_pepper", "sky_phone_fliptok_pepper", "sky_phone_picstagram_pepper"])
    assert.match(config, new RegExp(`GetConvar\\("${convar}", ""\\)`));
});

test("apps that need personal money, framework garages or a second radio are off", () => {
  const config = read(`${phone}/config/config.lua`);
  for (const app of ["banking", "billing", "crypto", "garage", "house", "radio", "skyride", "citymarkt", "local-pages", "health", "crewlink", "flare"])
    assert.match(config, new RegExp(`^    (?:\\["${app}"\\]|${app}) = false,`, "m"), app);
  for (const app of ["phone", "messages", "settings", "camera", "photos", "mail", "notes"])
    assert.match(config, new RegExp(`^    ${app} = true,`, "m"), app);
});

test("the phone owner identifier is the selected fbrp character", () => {
  const adapter = read(`${phone}/source/bridge/server/frameworks/fbrp.lua`);
  assert.match(adapter, /if Bridge\.Framework\.Name ~= "fbrp" then/);
  assert.match(adapter, /state\["fbrp:characterId"\]/);
  assert.match(adapter, /"fbrp_char_%d"/);
  assert.match(adapter, /AddEventHandler\("fbrp:characterSelected"/);
  assert.match(adapter, /GetInvokingResource\(\) ~= CORE/);
  assert.match(adapter, /TriggerEvent\("sky_phone:fbrp:characterChanged", player_source\)/);
  const inventory = read(`${phone}/source/bridge/server/inventory/fbrp.lua`);
  assert.match(inventory, /Bridge\.Framework\.CharacterId\(source\)/);
  assert.match(inventory, /function Bridge\.Inventory\.RegisterUsableItem\(\)\s*return true/);
});

test("a character switch resets the open phone and provisions the new character", () => {
  const server = read(`${phone}/source/server/phone.lua`);
  assert.match(server, /function SkyPhone\.ProvisionCharacter\(source\)/);
  assert.match(server, /AddEventHandler\("sky_phone:fbrp:characterChanged"/);
  assert.match(server, /TriggerClientEvent\("sky_phone:device:invalidated", player_source\)/);
  const characters = read("resources/[fbrp]/fbrp_core/server/characters.lua");
  assert.match(characters, /TriggerEvent\('fbrp:characterSelected',src,id,/);
});

test("the citizen record mirrors the phone number only from sky_phone", () => {
  const citizen = read("resources/[fbrp]/fbrp_core/server/citizen.lua");
  assert.match(citizen, /AddEventHandler\('fbrp:phone:number'/);
  assert.match(citizen, /GetInvokingResource\(\) ~= 'sky_phone'/);
  assert.match(citizen, /phone_from_device=TRUE/);
});

test("the phone starts after its dependencies and gets its ACE grants", () => {
  const manifest = read(`${phone}/fxmanifest.lua`);
  for (const dependency of ["oxmysql", "fbrp_core", "pma-voice"]) assert.match(manifest, new RegExp(`'${dependency}'`));
  const cfg = read("config/phone.cfg");
  assert.match(cfg, /add_ace resource\.sky_phone command\.add_ace allow/);
  assert.match(cfg, /add_ace resource\.sky_phone command\.remove_ace allow/);
  assert.match(cfg, /^ensure sky_phone$/m);
  assert.ok(fs.existsSync(path.join(serverData, phone, "source/html/index.html")), "the built phone UI ships with the resource");
});

test("migration 078 is applied by both migration runners", () => {
  const list = read("resources/[fbrp]/fbrp_core/server/database.lua");
  assert.match(list, /'migrations\/078_org_roster_phone\.sql'/);
  const sql = read("resources/[fbrp]/fbrp_core/migrations/078_org_roster_phone.sql");
  for (const statement of ["phone_from_device", "org_rank_roles", "org_roster_settings", "org_roster_log", "can_ranks", "can_ledger"]) assert.match(sql, new RegExp(statement));
  const comments = sql.split("\n").filter((line) => line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(comments, /[';]/, "both SQL splitters treat quotes and semicolons in comments as code");
});
