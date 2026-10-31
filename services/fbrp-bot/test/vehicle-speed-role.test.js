import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const config = readFileSync(`${root}server-data/resources/[fbrp]/fbrp_core/config.lua`, "utf8");
const server = readFileSync(`${root}server-data/resources/[fbrp]/fbrp_core/server/main.lua`, "utf8");
const roleBundle = readFileSync(new URL("../src/role-bundle.js", import.meta.url), "utf8");

test("the dedicated role is the exclusive global 330 MPH tier", () => {
  assert.match(config, /vehicleSpeedTopLimitMph\s*=\s*330/);
  assert.match(config, /vehicleSpeedTopRoleId\s*=\s*'1566098517427097731'/);
  assert.doesNotMatch(roleBundle, /1566098517427097731/);

  const resolver = server.match(/local function vehicleSpeedLimitFor\(discord\)([\s\S]*?)\nend/)[1];
  assert.ok(resolver.indexOf("vehicleSpeedTopRoleId") < resolver.indexOf("vehicleSpeedPrivilegedRoleId"));
  assert.match(resolver, /vehicleSpeedTopLimitMph or 330/);
  assert.match(resolver, /vehicleSpeedPrivilegedLimitMph or 250/);
  assert.match(server, /maxVehicleSpeedMph=vehicleSpeedLimitFor\(discord\)/);
  assert.match(server, /s\.maxVehicleSpeedMph = vehicleSpeedLimitFor\(s\.discord\)/);
});
