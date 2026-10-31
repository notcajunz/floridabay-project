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

test("dps-transit starts alongside the Roxwood train line and points riders to it", () => {
  const cfg = read("server-data/config/resources.cfg");
  assert.doesNotMatch(cfg, /^stop amb-roxwood-trains/m);
  assert.ok(cfg.indexOf("ensure [roxwood]") > 0 && cfg.indexOf("ensure dps-transit") > cfg.indexOf("ensure [roxwood]"));
  const link = read(`${dir}/client/roxwood_link.lua`);
  assert.match(link, /560\.4, -440\.6/);
  assert.match(link, /Config\.Stations\.downtown/);
});

test("shuttle buses spawn on one owner's client only, not on every client", () => {
  const server = read(`${dir}/server/shuttles.lua`);
  assert.doesNotMatch(server, /client:spawnShuttle', -1/);
  assert.match(server, /client:spawnShuttle', owner/);
  assert.match(server, /AddEventHandler\('playerDropped'/);
  assert.match(read(`${dir}/client/shuttles.lua`), /server:shuttleSpawned/);
});

test("dps-transit does not delete the Roxwood trains as orphan carriages", () => {
  assert.match(read(`${dir}/config/config.lua`), /Config\.OrphanCleanup = false/);
  assert.match(read(`${dir}/client/main.lua`), /if not Config\.OrphanCleanup then return end/);
});

test("regional trains run every 3 minutes at every hour of the day", () => {
  const trains = read(`${dir}/config/trains.lua`);
  const regional = trains.slice(trains.indexOf("regional = {"), trains.indexOf("metro = {"));
  assert.equal((regional.match(/minute = /g) || []).length, 20);
  assert.equal((trains.match(/multiplier = 1\.0/g) || []).length, 3);
});

test("the metro runs between the two LSIA platforms read in game, and shuttles are off", () => {
  const stations = read(`${dir}/config/stations.lua`);
  assert.match(stations, /vec4\(-1067\.3877, -2705\.5085, -7\.4101, 228\.7211\)/);
  assert.match(stations, /vec4\(-896\.1577, -2337\.6904, -11\.7327, 71\.9923\)/);
  const trains = read(`${dir}/config/trains.lua`).replace(/\r/g, "");
  assert.match(trains, /\['metro'\] = \{[\s\S]*?enabled = true/);
  assert.match(trains, /stations = \{ 'metro_airport', 'metro_parking', 'metro_puerto_del_sol', 'metro_strawberry', 'metro_burton', 'metro_portola_drive', 'metro_del_perro', 'metro_little_seoul', 'metro_pillbox_south', 'metro_davis' \}/);
  assert.match(stations, /vec4\(106\.6429, -1721\.9415, 30\.1095, 145\.2918\)/);
  assert.match(stations, /vec4\(-212\.5303, -1022\.6653, 30\.1409, 68\.0024\)/);
  assert.match(stations, /vec4\(-1356\.184, -468\.6306, 15\.0453, 121\.4116\)/);
  assert.match(stations, /vec4\(-504\.1793, -679\.0389, 11\.809, 182\.7213\)/);
  assert.match(stations, /vec4\(-288\.677, -335\.0993, 10\.063, 270\.002\)/);
  assert.match(stations, /vec4\(-813\.9764, -130\.2018, 19\.9503, 28\.8045\)/);
  assert.match(stations, /vec4\(248\.5795, -1208\.0962, 38\.9079, 181\.0042\)/);
  assert.match(stations, /vec4\(-535\.7524, -1278\.3768, 26\.9016, 248\.6337\)/);
  assert.match(read(`${dir}/config/shuttles.lua`), /enabled = false/);
  assert.match(read(`${dir}/server/main.lua`), /return true, \{ type = 'free' \}/);
});

test("dps-trains runs on game build 3258 numbering and replaces dps-transit", () => {
  const cfg = read("server-data/config/resources.cfg");
  assert.match(cfg, /^ensure dps-trains-stock\nensure dps-traintracks\nensure dps-trains$/m);
  assert.doesNotMatch(cfg, /^ensure dps-transit$/m);
  assert.ok(cfg.indexOf("ensure dps-trains-stock") < cfg.indexOf("ensure dps-trains\n"));
  assert.ok(cfg.indexOf("ensure [roxwood]") < cfg.indexOf("ensure dps-trains-stock"));
  const data = read("server-data/resources/[trains]/dps-trains/data/trains.lua");
  for (const entry of ["27,   -- vanilla metro", "28,   -- passenger_config01", "29,   -- passenger_config02", "30,   -- freight_config01", "31,   -- metro_config01", "32,   -- rox_passenger_config01"]) {
    assert.ok(data.includes(`index = ${entry}`), entry);
  }
  const metro = read("server-data/resources/[trains]/dps-trains/configs/metro.lua");
  assert.equal((metro.match(/^\s*\{index = 0, variation = 32,/gm) || []).length, 3);
  assert.match(metro, /^\s*\{index = 12, variation = 31,/m);
  assert.match(read("server-data/resources/[trains]/dps-trains-stock/data/trains.xml"), /Game variation 32 \(vanilla 0-27, then 28-31 above\)/);
});

test("the Roxwood shuttle is track 12, registered by dps-traintracks", () => {
  assert.match(read("server-data/resources/[trains]/dps-trains/configs/general.lua"), /^config\.usedTracks = \{0, 1, 3, 12\}/m);
});

test("the Transit phone app registers with sky_phone and starts after dps-trains", () => {
  const app = read("server-data/resources/[trains]/dps-transitapp/client.lua");
  assert.match(app, /GetResourceState\('sky_phone'\) == 'started'/);
  assert.match(app, /res ~= 'lb-phone' and res ~= 'sky_phone'/);
  assert.match(read("server-data/resources/[standalone]/sky_phone/fxmanifest.lua"), /provide 'lb-phone'/);
  const cfg = read("server-data/config/resources.cfg");
  assert.ok(cfg.indexOf("ensure dps-transitapp") > cfg.indexOf("ensure dps-trains\n"));
});

test("dps-trains leaves the Roxwood package's own trains alone", () => {
  const general = read("server-data/resources/[trains]/dps-trains/configs/general.lua");
  assert.match(general, /^config\.purgeRougeTrains = false/m);
  assert.match(general, /^config\.blockCreationOfNonScriptOwnedTrains = false/m);
});

test("dps-traintracks registers a 335-node Roxwood shuttle cut with stops at nodes 1, 94 and 335", () => {
  const dir12 = "server-data/resources/[trains]/dps-traintracks";
  const rows = read(`${dir12}/trains12.dat`).split(/\r?\n/).filter(Boolean);
  assert.equal(rows[0], "335");
  assert.equal(rows.length, 336);
  const flags = rows.slice(1).map((r) => r.split(" ")[3]);
  for (const i of [0, 93, 334]) assert.equal(flags[i], "1");
  assert.equal(flags.filter((f) => f === "1").length, 3);
  assert.match(rows[1], /^-483\.94928 7657\.527 5\.36333942 1$/);
  const manifest = read(`${dir12}/fxmanifest.lua`);
  assert.match(manifest, /data_file 'TRAINTRACK_FILE' 'traintracks\.xml'/);
  assert.match(read(`${dir12}/traintracks.xml`), /resources:\/dps-traintracks\/trains12\.dat/);
});

test("the Roxwood coach set has no seatless cab car", () => {
  const xml = read("server-data/resources/[trains]/dps-trains-stock/data/trains.xml");
  const block = xml.slice(xml.indexOf('name = "rox_passenger_config01"'), xml.indexOf("</train_config>", xml.indexOf('name = "rox_passenger_config01"')));
  assert.doesNotMatch(block, /model_name = "streakcab"/);
});

test("resources.cfg comments have no semicolons, which FXServer would run as commands", () => {
  const bad = read("server-data/config/resources.cfg").split("\n").filter((l) => l.startsWith("#") && l.includes(";"));
  assert.deepEqual(bad, []);
});

test("the prop station platforms are gone", () => {
  assert.ok(!fs.existsSync(path.join(root, "server-data/resources/[trains]/fbrp_trainstations")));
  assert.doesNotMatch(read("server-data/config/resources.cfg"), /fbrp_trainstations/);
});

test("dps-traintools boards riders at the dps-trains stops, so the game's enter action cannot put them on the roof", () => {
  const client = read("server-data/resources/[trains]/dps-traintools/client.lua");
  for (const stop of ["684.67, -618.87", "795.09, 6443.56", "-483.95, 7657.53", "-1067.39, -2705.51"]) {
    assert.ok(client.includes(`vec3(${stop}`), stop);
  }
  const cfg = read("server-data/config/resources.cfg");
  assert.match(cfg, /^ensure dps-traintools$/m);
  assert.ok(cfg.indexOf("ensure dps-traintools") > cfg.indexOf("ensure dps-trains\n"));
});
