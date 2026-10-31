import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resourceRoot = new URL(
  "../../../server-data/resources/[fbrp]/fbrp_personalpilot/",
  import.meta.url,
);

test("personal pilot is rank-gated and handles full plane and helicopter flights", async () => {
  const [manifest, config, server, client, resources] = await Promise.all([
    readFile(new URL("fxmanifest.lua", resourceRoot), "utf8"),
    readFile(new URL("config.lua", resourceRoot), "utf8"),
    readFile(new URL("server.lua", resourceRoot), "utf8"),
    readFile(new URL("client.lua", resourceRoot), "utf8"),
    readFile(new URL("../../../server-data/config/resources.cfg", import.meta.url), "utf8"),
  ]);

  assert.match(manifest, /'fbrp_core'/);
  assert.match(manifest, /'oxmysql'/);
  assert.match(config, /RankName = 'trial_management'/);
  assert.match(config, /RequireOnDuty = true/);
  assert.match(config, /Runways = \{/);
  assert.match(config, /Roxwood - Arroyo Muerto Municipal Airport/);
  assert.match(config, /TaxiCommand = 'pilottaxi'/);
  assert.match(config, /HeliTakeoffHeight = 12\.0/);
  assert.match(config, /HeliTakeoffClearanceHeight = 7\.0/);
  assert.match(config, /HeliTakeoffTimeoutSeconds = 12/);
  assert.match(server, /IsStaffOnDuty/);
  assert.match(server, /GetStaffRank/);
  assert.match(server, /rank_order/);
  assert.match(server, /sessions\[src\]/);
  assert.match(client, /IsThisModelAPlane/);
  assert.match(client, /IsThisModelAHeli/);
  assert.match(client, /GetVehicleModelNumberOfSeats/);
  assert.match(client, /TaskPlaneMission/);
  assert.match(client, /TaskPlaneLand/);
  assert.match(client, /TaskHeliMission/);
  assert.match(client, /cfg\.HeliTakeoffClearanceHeight/);
  assert.match(client, /TaskVehicleTempAction/);
  assert.match(client, /SetVehicleMaxSpeed/);
  assert.match(client, /TaxiMaxRecoveries/);
  assert.match(client, /SetVehicleLandingGear\(aircraft, 1\)/);
  assert.match(client, /SetVehicleLandingGear\(aircraft, 0\)/);
  assert.doesNotMatch(client, /TaskVehicleDriveToCoordLongrange/);
  assert.match(client, /TakeoffClearanceHeight/);
  assert.match(client, /aircraftIsEmpty/);
  assert.match(resources, /ensure fbrp_personalpilot/);
});
