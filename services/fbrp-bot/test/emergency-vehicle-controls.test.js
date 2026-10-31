import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const core = path.join(root, "server-data/resources/[fbrp]/fbrp_core");
const standalone = path.join(root, "server-data/resources/[standalone]");

test("Luxart owns emergency lights and sirens without competing Florida Bay key mappings", async () => {
  const [classification, coreManifest, lvcManifest, settings] = await Promise.all([
    readFile(path.join(core, "client/emergency_vehicles.lua"), "utf8"),
    readFile(path.join(core, "fxmanifest.lua"), "utf8"),
    readFile(path.join(standalone, "lvc/fxmanifest.lua"), "utf8"),
    readFile(path.join(standalone, "lvc/SETTINGS.lua"), "utf8"),
  ]);

  assert.match(coreManifest, /client\/emergency_vehicles\.lua/);
  assert.doesNotMatch(classification, /RegisterKeyMapping|SetVehicleSiren|PlaySoundFromEntity/);
  assert.match(classification, /exports\('IsLeoVehicle'/);
  assert.match(classification, /exports\('IsEmergencyVehicle'/);
  assert.match(lvcManifest, /version '3\.2\.9'/);
  assert.match(lvcManifest, /dependencies \{\s*'RageUI'/);
  assert.match(settings, /community_id = 'FBRP'/);
  assert.match(await readFile(path.join(standalone, "lvc/UTIL/cl_lvc.lua"), "utf8"), /exports\.fbrp_core:IsEmergencyVehicle/);
});

test("Not Wanted disables ambient dispatch and continually clears wanted state", async () => {
  const client = await readFile(path.join(standalone, "NotWanted/client.lua"), "utf8");
  assert.match(client, /SetMaxWantedLevel\(0\)/);
  assert.match(client, /EnableDispatchService\(service, false\)/);
  assert.match(client, /SetPlayerWantedLevel\(player, 0, false\)/);
  assert.match(client, /SetPlayerWantedLevelNow\(player, false\)/);
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

