import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, "server-data", relative), "utf8");

test("the HUD notice and lights resources are started and ship their files", () => {
  const phone = read("config/resources.cfg");
  for (const name of ["fbrp_hudnotice", "fbrp_lights"]) {
    assert.match(phone, new RegExp(`^ensure ${name}$`, "m"), name);
    const manifest = read(`resources/[fbrp]/${name}/fxmanifest.lua`);
    for (const file of manifest.match(/'[^']+\.(?:html|css|js|dat)'/g) || [])
      assert.ok(fs.existsSync(path.join(root, "server-data/resources/[fbrp]", name, file.slice(1, -1))), `${name} is missing ${file}`);
  }
});

test("the HUD notice and lights resources are client-only with no network or server events", () => {
  for (const name of ["fbrp_hudnotice", "fbrp_lights"]) {
    const code = read(`resources/[fbrp]/${name}/client.lua`);
    assert.doesNotMatch(code, /PerformHttpRequest|TriggerServerEvent|https?:\/\//, name);
    assert.doesNotMatch(read(`resources/[fbrp]/${name}/fxmanifest.lua`), /server_script/, name);
  }
});

test("the dev permission-sync pieces were not brought into fbrp_core", () => {
  assert.ok(!fs.existsSync(path.join(root, "server-data/resources/[fbrp]/fbrp_core/server/discord_roles.lua")));
  assert.ok(!fs.existsSync(path.join(root, "server-data/resources/[fbrp]/fbrp_core/migrations/110_donator_pack_roles.sql")));
  assert.doesNotMatch(read("resources/[fbrp]/fbrp_core/fxmanifest.lua"), /discord_roles\.lua/);
});

test("tag vehicles follow the dev duty flag and the tags menu uses the banner header", () => {
  assert.match(read("resources/[fbrp]/fbrp_core/config.lua"), /FBRP\.RequireDutyForTagVehicles = false/);
  const personals = read("resources/[fbrp]/fbrp_core/server/personals.lua");
  assert.equal((personals.match(/level == 'tag' and FBRP\.RequireDutyForTagVehicles/g) || []).length, 2);
  assert.match(read("resources/[fbrp]/fbrp_tags/client/menu.lua"), /CreateRuntimeTextureFromImage\(bannerTxd, 'banner', 'ui\/img\/banner\.png'\)/);
  assert.match(read("resources/[fbrp]/fbrp_tags/fxmanifest.lua"), /'ui\/img\/banner\.png'/);
  assert.ok(fs.existsSync(path.join(root, "server-data/resources/[fbrp]/fbrp_tags/ui/img/banner.png")));
});

test("live-only systems survive the core merge", () => {
  const main = read("resources/[fbrp]/fbrp_core/server/main.lua");
  assert.match(main, /membershipRejection\(discord\)/);
  assert.match(main, /fbrp:staffSenior/);
  assert.match(main, /RegisterCommand\('refreshroles'/);
  assert.ok(fs.existsSync(path.join(root, "server-data/resources/[fbrp]/fbrp_core/migrations/111_donator_pack_roles.sql")));
  assert.ok(fs.existsSync(path.join(root, "server-data/resources/[fbrp]/fbrp_mk2guard/server.lua")));
});
