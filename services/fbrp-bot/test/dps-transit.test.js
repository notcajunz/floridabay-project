import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const dir = "server-data/resources/[fbrp]/dps-transit";

test("dps-transit runs on the FBRP bridge without qbx_core or ox_target", () => {
  const manifest = read(`${dir}/fxmanifest.lua`);
  assert.match(manifest, /'bridge\/fbrp\.lua'/);
  assert.doesNotMatch(manifest, /qbx_core|ox_target/);
  assert.match(read(`${dir}/config/config.lua`), /Config\.Framework = 'fbrp'/);
  for (const file of ["client/stations.lua", "client/shuttles.lua"]) {
    assert.doesNotMatch(read(`${dir}/${file}`), /exports\.ox_target/);
  }
});

test("dps-transit rides are free and use only vanilla train models", () => {
  const bridge = read(`${dir}/bridge/fbrp.lua`);
  assert.match(bridge, /function Bridge\.RemoveMoney\(\) return true end/);
  const config = read(`${dir}/config/config.lua`);
  assert.match(config, /sameZone = 0,/);
  assert.match(config, /persistentTickets = false/);
  assert.doesNotMatch(read(`${dir}/config/trains.lua`), /streakc|sd70mac/);
});

test("dps-transit replaces the Roxwood train script in resources.cfg", () => {
  const cfg = read("server-data/config/resources.cfg");
  const roxwood = cfg.indexOf("ensure [roxwood]");
  const stop = cfg.indexOf("stop amb-roxwood-trains");
  const start = cfg.indexOf("ensure dps-transit");
  assert.ok(roxwood > 0 && stop > roxwood && start > stop);
});
