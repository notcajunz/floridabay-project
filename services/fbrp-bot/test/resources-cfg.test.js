import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("phone.cfg starts only the phone and resources.cfg starts everything else in its old order", () => {
  const phone = read("server-data/config/phone.cfg");
  const resources = read("server-data/config/resources.cfg");
  assert.deepEqual(phone.match(/^(?:ensure|stop) .*/gm), ["ensure sky_phone"]);
  const lines = resources.match(/^(?:ensure|stop) .*/gm);
  assert.ok(lines.length > 40);
  const at = (line) => lines.indexOf(line);
  assert.ok(at("ensure PolyZone") < at("ensure golf"));
  assert.ok(at("ensure FBRP-Sirens") < at("ensure fbrp_sirenmenu"));
  assert.ok(at("ensure jaxtti_lib") < at("ensure jaxtti_core"));
  assert.ok(at("ensure [roxwood]") < at("stop amb-roxwood-clothing"));
  assert.ok(at("ensure xsound") >= 0 && at("ensure xsound") < at("ensure fbrp_carplay"));
  assert.equal(new Set(lines).size, lines.length, "no line is listed twice");
});

test("the deploy script keeps exec config/resources.cfg right after exec config/phone.cfg", () => {
  const script = read("scripts/apply-game-files.sh");
  assert.match(script, /exec config\/resources\.cfg/);
  const awk = /awk '(\{ print \} \$0 == "exec config\/phone\.cfg"[^']*)'/.exec(script)[1];
  const cfg = "ensure fbrp_core\nexec config/phone.cfg\nensure x\n";
  const out = execFileSync("awk", [awk], { input: cfg, encoding: "utf8" });
  assert.equal(out, "ensure fbrp_core\nexec config/phone.cfg\nexec config/resources.cfg\nensure x\n");
  assert.ok(fs.existsSync(path.join(os.tmpdir())));
});

test("CarPlay depends on the patched xsound that exports setMuffle", () => {
  const dir = "server-data/resources";
  assert.match(read(`${dir}/[fbrp]/fbrp_carplay/fxmanifest.lua`), /dependency 'xsound'/);
  assert.match(read(`${dir}/[deps]/xsound/client/exports/manipulation.lua`), /setMuffle/);
  assert.match(read(`${dir}/[deps]/xsound/fxmanifest.lua`), /html\/scripts\/FxAudio\.js/);
  assert.ok(fs.existsSync(path.join(root, dir, "[deps]/xsound/html/scripts/FxAudio.js")));
});

test("the normal loading screen is never stopped for a resource that does not ship", () => {
  const cfg = read("server-data/config/resources.cfg");
  assert.doesNotMatch(cfg, /^stop fbrp_loading\b/m, "stopping fbrp_loading leaves players with no loading screen");
  assert.doesNotMatch(cfg, /^ensure fbrp-LChalloween\b/m, "the Halloween loading screen resource no longer exists");
  assert.ok(fs.existsSync(path.join(root, "server-data/resources/[fbrp]/fbrp_loading/fxmanifest.lua")));
});
