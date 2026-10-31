import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverData = path.resolve(here, "../../../server-data");
const read = (relative) => fs.readFileSync(path.join(serverData, relative), "utf8");

test("the golf minigame ships with PolyZone and starts after it", () => {
  const manifest = read("resources/[gameplay]/golf/fxmanifest.lua");
  assert.match(manifest, /@PolyZone\/client\.lua/);
  assert.ok(fs.existsSync(path.join(serverData, "resources/[deps]/PolyZone/client.lua")));
  for (const file of ["client.lua", "tools.lua"]) {
    assert.ok(fs.existsSync(path.join(serverData, "resources/[gameplay]/golf", file)));
  }
  const cfg = read("config/resources.cfg");
  assert.ok(cfg.indexOf("ensure PolyZone") !== -1);
  assert.ok(cfg.indexOf("ensure PolyZone") < cfg.indexOf("ensure golf"));
});
