import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, "server-data", relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, "server-data", relative));

test("gg_weathersystem and its gg_lib dependency are shipped and started in order", () => {
  assert.ok(exists("resources/[deps]/gg_lib/fxmanifest.lua"));
  assert.ok(exists("resources/[gameplay]/gg_weathersystem/fxmanifest.lua"));
  assert.ok(exists("resources/[gameplay]/gg_weathersystem/.fxap"), "escrow marker must be shipped unchanged");
  assert.match(read("resources/[deps]/gg_lib/fxmanifest.lua"), /version '1\.0\.(2\d|[3-9]\d)'/);
  const cfg = read("config/resources.cfg");
  assert.ok(cfg.indexOf("ensure gg_lib") !== -1 && cfg.indexOf("ensure gg_lib") < cfg.indexOf("ensure gg_weathersystem"));
  assert.match(cfg, /^add_ace resource\.gg_lib command\.ensure allow$/m);
});

test("vMenu weather and time sync are off so only gg_weathersystem drives the sky", () => {
  const vmenu = read("config/vmenu.cfg");
  assert.match(vmenu, /^setr vmenu_enable_weather_sync false$/m);
  assert.match(vmenu, /^setr vmenu_enable_dynamic_weather false$/m);
  assert.match(vmenu, /^setr vmenu_enable_time_sync false$/m);
});

test("the access migration grants /weather to mgmt_team and keeps vMenu weather and time Owner-and-above, by rank, in the database", () => {
  const sql = read("resources/[fbrp]/fbrp_core/migrations/115_weather_system_access.sql");
  assert.match(sql, /'mgmt_team', 'command\.weather', 'allow'/);
  assert.match(sql, /e\.object LIKE 'vMenu\.WeatherOptions\.%' OR e\.object LIKE 'vMenu\.TimeOptions\.%'/);
  assert.match(sql, /g\.rank_order < owner\.rank_order/);
  // the vMenu.Everything shortcut is written out without the two sections
  const objects = [...sql.matchAll(/SELECT '(vMenu\.[A-Za-z0-9_.]+)' AS object|UNION ALL SELECT '(vMenu\.[A-Za-z0-9_.]+)' AS object/g)].map((m) => m[1] || m[2]);
  assert.ok(objects.length > 200);
  assert.ok(!objects.some((o) => /^vMenu\.(WeatherOptions|TimeOptions)\./.test(o)));
  // the splitter used by the bot treats an apostrophe inside a comment as a quote
  const code = sql.replace(/--[^\n]*/g, "");
  assert.equal(code.split("'").length % 2, 1);
  assert.equal(sql.replace(/'[^']*'/g, "").includes("'"), false);
});

test("the vMenu.Everything expansion in the migration matches fbrp_core's list minus weather and time", () => {
  const lua = read("resources/[fbrp]/fbrp_core/config_vmenu.lua");
  const start = lua.indexOf("FBRP.VmenuEverything");
  const list = [...lua.slice(start, lua.indexOf("}", start)).matchAll(/'(vMenu\.[A-Za-z0-9_.]+)'/g)].map((m) => m[1]);
  const wanted = list.filter((o) => !/^vMenu\.(WeatherOptions|TimeOptions)\./.test(o));
  const sql = read("resources/[fbrp]/fbrp_core/migrations/115_weather_system_access.sql");
  const have = [...sql.matchAll(/SELECT '(vMenu\.[A-Za-z0-9_.]+)' AS object/g)].map((m) => m[1]);
  assert.deepEqual(have, wanted);
});
