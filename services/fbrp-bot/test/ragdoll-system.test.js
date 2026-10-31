import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const core = path.join(root, "server-data/resources/[fbrp]/fbrp_core");

test("ragdoll system handles gunshots, vehicle strikes, landings and ejections", async () => {
  const [ragdoll, vehicles, manifest] = await Promise.all([
    readFile(path.join(core, "client/ragdoll.lua"), "utf8"),
    readFile(path.join(core, "client/vehicles.lua"), "utf8"),
    readFile(path.join(core, "fxmanifest.lua"), "utf8"),
  ]);

  assert.match(manifest, /client\/ragdoll\.lua[\s\S]*client\/vehicles\.lua/);
  assert.match(ragdoll, /GetPedLastDamageBone/);
  assert.match(ragdoll, /IsEntityAVehicle\(attacker\)/);
  assert.match(ragdoll, /FBRP\.IsDowned/);
  assert.match(ragdoll, /IsControlJustPressed\(0, 22\)/);
  assert.match(ragdoll, /fastest < -R\.landingSpeed/);
  assert.match(vehicles, /FBRP\.Ragdoll\.launch\(/);
  assert.match(vehicles, /IsEntityUpsidedown\(vehicle\)/);
});
