import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const server = path.join(root, "server-data");
const read = (relative) => fs.readFileSync(path.join(server, relative), "utf8");

test("the siren menu, its sound packs and the LVC override are started and wired together", () => {
  const phone = read("config/resources.cfg");
  assert.match(phone, /^ensure FBRP-Sirens$/m);
  assert.match(phone, /^ensure fbrp_sirenmenu$/m);
  assert.match(read("resources/[standalone]/lvc/fxmanifest.lua"), /'\/UI\/cl_\*\.lua',[\s\S]*'\/UTIL\/fbrp_override\.lua'/);
  assert.ok(fs.existsSync(path.join(server, "resources/[standalone]/lvc/UTIL/fbrp_override.lua")));
  assert.match(read("resources/[fbrp]/fbrp_sirenmenu/client.lua"), /RegisterCommand\("sirenmenu"/);
});

test("the streamlined siren menu reuses the seven installed audio packs for every department preset", () => {
  const config = read("resources/[fbrp]/fbrp_sirenmenu/client_config.lua");
  const sirens = read("resources/[standalone]/lvc/SIRENS.lua");
  const sounds = [...config.matchAll(/sound = "([A-Z0-9_]+)"/g)].map((match) => match[1]).filter((name) => name !== "DEFAULT");
  assert.equal(sounds.length, 20);
  for (const sound of sounds) {
    assert.ok(sound.length <= 11, `${sound} is longer than LVC keeps`);
    assert.match(sirens, new RegExp(`\\['${sound}'\\]\\s*=\\s*\\{ \\d+`), sound);
  }
  const manifest = read("resources/[fbrp]/FBRP-Sirens/fxmanifest.lua");
  assert.equal((manifest.match(/'dlc_[^']+\.awc'/g) || []).length, 7);
  for (const file of manifest.match(/'[^']+\.(?:awc|rel|nametable)'/g)) assert.ok(fs.existsSync(path.join(server, "resources/[fbrp]/FBRP-Sirens", file.slice(1, -1))), file);
  for (const bank of sirens.match(/RequestScriptAudioBank\("[^"]+"/g)) assert.ok(bank, bank);
});

test("the siren menu manifest lists no missing files", () => {
  const manifest = read("resources/[fbrp]/fbrp_sirenmenu/fxmanifest.lua");
  for (const file of manifest.match(/'(?:ui|client|server)[^']*\.(?:html|png|lua)'/g) || [])
    assert.ok(fs.existsSync(path.join(server, "resources/[fbrp]/fbrp_sirenmenu", file.slice(1, -1))), file);
});

test("the siren menu accepts the same emergency vehicles LVC does, including addon personals", () => {
  const client = read("resources/[fbrp]/fbrp_sirenmenu/client.lua");
  assert.match(client, /exports\.fbrp_core:IsEmergencyVehicle\(veh\)/);
  assert.match(client, /return GetVehicleClass\(veh\) == 18/);
  assert.doesNotMatch(client, /if GetVehicleClass\(veh\) ~= 18 then/);
});

test("LVC requests the seven shared siren banks and loads the Florida Bay override last", () => {
  const sirens = read("resources/[standalone]/lvc/SIRENS.lua");
  assert.equal((sirens.match(/RequestScriptAudioBank\("DLC_[A-Z0-9]+\\\\[A-Z0-9]+"/g) || []).length, 7);
  assert.match(read("resources/[standalone]/lvc/fxmanifest.lua"), /'\/UI\/cl_\*\.lua',[\s\S]*'\/UTIL\/fbrp_override\.lua'/);
  assert.match(read("resources/[standalone]/lvc/UTIL/fbrp_override.lua"), /exports\('overrideSiren'/);
});

test("LVC starts after FBRP-Sirens and keeps requesting the siren audio banks until they load", () => {
  assert.match(read("resources/[standalone]/lvc/fxmanifest.lua"), /dependencies \{[^}]*'FBRP-Sirens'/);
  const override = read("resources/[standalone]/lvc/UTIL/fbrp_override.lua");
  const names = (text, pattern) => (text.match(pattern) || []).sort();
  const requested = names(read("resources/[standalone]/lvc/SIRENS.lua"), /DLC_[A-Z0-9]+\\\\[A-Z0-9]+/g);
  assert.equal(requested.length, 7);
  assert.deepEqual(names(override, /DLC_[A-Z0-9]+\\\\[A-Z0-9]+/g), requested);
  assert.match(override, /RequestScriptAudioBank\(bank, true\)/);
  assert.match(override, /lvc:onVehicleChange/);
});
