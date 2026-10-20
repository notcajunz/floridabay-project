import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const core = path.join(root, "server-data/resources/[fbrp]/fbrp_core");

test("emergency vehicles bind lights to Q and three synchronized siren tones to 1, 2, and 3", async () => {
  const client = await readFile(path.join(core, "client/emergency_vehicles.lua"), "utf8");
  const manifest = await readFile(path.join(core, "fxmanifest.lua"), "utf8");

  assert.match(manifest, /client\/emergency_vehicles\.lua/);
  assert.match(client, /RegisterKeyMapping\('fbrp_emergency_lights',[\s\S]*'Q'\)/);
  assert.match(client, /for tone = 1, 3 do/);
  assert.match(client, /RegisterKeyMapping\(command,[\s\S]*tostring\(tone\)\)/);
  assert.match(client, /fbrpEmergencyLights/);
  assert.match(client, /fbrpSirenTone/);
  assert.match(client, /AddStateBagChangeHandler/);
  assert.match(client, /GetVehicleClass\(vehicle\) == 18/);
});

test("a stored false light state is read back so pressing Q again really switches the siren off", async () => {
  const client = await readFile(path.join(core, "client/emergency_vehicles.lua"), "utf8");
  const reader = client.slice(client.indexOf("local function stateValue"), client.indexOf("local function personalId"));

  // `ok and value or nil` turns false into nil, which applyState treats as "never used" and skips SetVehicleSiren(false).
  assert.doesNotMatch(reader.replace(/--.*$/gm, ""), /ok and value or nil/);
  assert.match(reader, /if not ok then return nil end\s+return value/);
});

test("the personal vehicle schema and game sync carry the portal emergency classification", async () => {
  const [migration, database, server, vehicleClient] = await Promise.all([
    readFile(path.join(core, "migrations/085_personal_emergency_class.sql"), "utf8"),
    readFile(path.join(core, "server/database.lua"), "utf8"),
    readFile(path.join(core, "server/personals.lua"), "utf8"),
    readFile(path.join(core, "client/vehicles.lua"), "utf8"),
  ]);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS emergency_class/);
  assert.match(database, /migrations\/085_personal_emergency_class\.sql/);
  assert.match(server, /emergency_class/);
  assert.match(server, /emergencyClass = p\.emergencyClass/);
  assert.match(vehicleClient, /state:set\('fbrpEmergencyClass',emergencyClass,true\)/);
});

