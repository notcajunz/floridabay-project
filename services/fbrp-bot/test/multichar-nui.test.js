import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const resources = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../server-data/resources/[fbrp]");
const multichar = path.join(resources, "fbrp_multichar");
const read = (...parts) => fs.readFileSync(path.join(multichar, ...parts), "utf8");
const bridge = read("client/main.lua");
const manifest = read("fxmanifest.lua");
const indexJs = read("html/js/index.js");
const indexHtml = read("html/index.html");
const coreManifest = fs.readFileSync(path.join(resources, "fbrp_core/fxmanifest.lua"), "utf8");
const coreClient = fs.readFileSync(path.join(resources, "fbrp_core/client/characters.lua"), "utf8");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}

test("the resource ships the CodeM screens but none of the zip's escrowed Lua", () => {
  const files = walk(multichar);
  assert.ok(files.some((f) => f.endsWith("html/index.html")));
  assert.ok(files.some((f) => f.endsWith("html/js/index.js")));
  assert.ok(files.some((f) => f.endsWith("html/style.css")));
  assert.equal(files.filter((f) => f.endsWith(".fxap")).length, 0);
  for (const file of files.filter((f) => f.endsWith(".lua"))) {
    assert.ok(!fs.readFileSync(file).subarray(0, 4).equals(Buffer.from("FXAP")), `${file} must not be escrowed`);
  }
  assert.doesNotMatch(manifest, /assetpacks|GetCore|esx|oxmysql|server_script/i);
  assert.match(manifest, /ui_page 'html\/index\.html'/);
  assert.match(manifest, /html\/images\/\*\.svg/);
});

test("every callback the screens post is answered by the bridge", () => {
  const posted = [...indexJs.matchAll(/postNUI\(\s*(?:this\.editingId \? "editChar" : )?"([A-Za-z]+)"/g)].map((m) => m[1]);
  posted.push("editChar");
  assert.ok(posted.includes("Play") && posted.includes("createChar") && posted.includes("loadagain"));
  for (const name of new Set(posted)) {
    assert.match(bridge, new RegExp(`RegisterNUICallback\\('${name}'`), `missing NUI callback ${name}`);
  }
  assert.match(indexJs, /case "Hide":/);
  assert.match(bridge, /message = 'Hide'/);
  for (const message of ["SetChars", "SetSteamInfos"]) {
    assert.match(indexJs, new RegExp(`case "${message}"`));
    assert.match(bridge, new RegExp(`message = '${message}'`));
  }
});

test("the bridge talks to fbrp_core's character events and keeps creation tied to the MDT", () => {
  assert.match(bridge, /RegisterNetEvent\('fbrp:characters:data'/);
  assert.match(bridge, /RegisterNetEvent\('fbrp:characters:spawns'/);
  assert.match(bridge, /message = 'SetSpawns'/);
  assert.match(indexJs, /case "SetSpawns":/);
  assert.match(bridge, /TriggerServerEvent\('fbrp:characters:select', id\)/);
  const create = bridge.slice(bridge.indexOf("RegisterNUICallback('createChar'"));
  for (const field of ["firstName", "lastName", "dateOfBirth", "gender", "nationality", "heightCm"]) {
    assert.match(create, new RegExp(`${field} = `));
  }
  assert.match(create, /TriggerServerEvent\('fbrp:characters:create'/);
  assert.match(create, /TriggerServerEvent\('fbrp:characters:request'\)/);
  // The screens locate a slot from the 5th character of the identifier.
  assert.match(bridge, /\('char%d:%d'\):format\(index, row\.id\)/);
  assert.match(bridge, /money = text\(row\.citizen/);
  assert.match(bridge, /CanDelete = false/);
});

test("characters can be edited from the selector", () => {
  assert.match(indexHtml, /openEdit\(\)/);
  assert.match(indexJs, /postNUI\(this\.editingId \? "editChar" : "createChar"/);
  const edit = bridge.slice(bridge.indexOf("RegisterNUICallback('editChar'"));
  assert.match(edit, /TriggerServerEvent\('fbrp:characters:update', tonumber\(data\.id\)/);
  const server = fs.readFileSync(path.join(resources, "fbrp_core/server/characters.lua"), "utf8");
  assert.match(server, /RegisterNetEvent\('fbrp:characters:update'/);
  assert.match(server, /owner_license=\? AND archived=FALSE',\{id,license\}/);
  assert.match(server, /character\.update/);
});

test("the spawn page previews a birdseye camera and releases the cursor once placed", () => {
  assert.match(indexHtml, /v-if="spawnPage"/);
  assert.match(indexJs, /postNUI\("PreviewSpawn"/);
  assert.match(bridge, /CreateCamWithParams/);
  assert.match(bridge, /SetFocusPosAndVel/);
  assert.match(bridge, /exports\.fbrp_core:SpawnAt/);
  const release = bridge.slice(bridge.indexOf("local function release()"), bridge.indexOf("-- The old fbrp_core selector"));
  assert.match(release, /stopPreview\(\)/);
  assert.match(release, /SetNuiFocus\(false, false\)/);
  assert.match(bridge, /AddEventHandler\('fbrp:characters:placed', release\)/);
  assert.match(coreClient, /TriggerEvent\('fbrp:characters:placed'\)/);
  assert.match(coreClient, /exports\('SpawnAt',spawnAt\)/);
});

test("the centre spinner that flashed is gone", () => {
  assert.doesNotMatch(indexHtml, /loading-container/);
  assert.doesNotMatch(indexJs, /loading-container/);
});

test("fbrp_core starts the new screens and stops opening the old selector", () => {
  assert.match(coreManifest, /dependency 'fbrp_multichar'/);
  assert.match(coreClient, /GetResourceState\('fbrp_multichar'\)=='started' then return end\s+FBRP\.OpenMenu\('characters'/);
  assert.match(coreClient, /GetResourceState\('fbrp_multichar'\)=='started' then return end\s+FBRP\.OpenMenu\('spawns'/);
});

test("the screens load pinned scripts and the sound file that actually exists", () => {
  assert.doesNotMatch(indexHtml, /cdn\.tailwindcss\.com/);
  assert.match(indexHtml, /href="fbrp\.css"/);
  assert.ok(fs.existsSync(path.join(multichar, "html/fbrp.css")));
  assert.match(indexHtml, /cdnjs\.cloudflare\.com\/ajax\/libs\/howler\/2\.1\.1\//);
  assert.match(indexHtml, /src="\.\/click\.mp3"/);
  assert.ok(fs.existsSync(path.join(multichar, "html/click.mp3")));
  assert.ok(fs.existsSync(path.join(multichar, "html/images/fbrp-logo.png")));
  for (const [, file] of indexHtml.matchAll(/src="\.\/(images\/[^"]+)"/g)) {
    assert.ok(fs.existsSync(path.join(multichar, "html", file)), `${file} is referenced but not shipped`);
  }
});

test("a refused create or edit comes back onto the form instead of silently doing nothing", () => {
  const server = fs.readFileSync(path.join(resources, "fbrp_core/server/characters.lua"), "utf8");
  assert.match(server, /TriggerClientEvent\('fbrp:characters:error', src, message\)/);
  assert.doesNotMatch(server.slice(server.indexOf("RegisterNetEvent('fbrp:characters:create'"), server.indexOf("RegisterNetEvent('fbrp:characters:select'")), /type = 'error'/);
  assert.match(bridge, /RegisterNetEvent\('fbrp:characters:error'/);
  assert.match(indexJs, /case "FormError":/);
  assert.doesNotMatch(indexJs, /toString\(\) > "300"/);
});

test("the screens use the opaque Florida palette so the world behind never shows", () => {
  const css = read("html/style.css");
  assert.match(css, /--fl-aqua/);
  assert.match(css, /\.mainBody, \.registerBody \{\s*background-image:\s*radial-gradient/);
});

test("the HUD keeps GTA's own minimap, clears the old masks and hides the native health bars", () => {
  const minimap = fs.readFileSync(path.join(resources, "fbrp_core/client/hud_minimap.lua"), "utf8");
  assert.match(minimap, /RemoveReplaceTexture\('platform:\/textures\/graphics', 'radarmasksm'\)/);
  assert.match(minimap, /SetRadarBigmapEnabled\(true, false\)/);
  assert.match(minimap, /SETUP_HEALTH_ARMOUR/);
  assert.match(coreManifest, /client\/hud_minimap\.lua/);
  assert.match(coreManifest, /web\/hud\/index\.html/);
  assert.ok(fs.existsSync(path.join(resources, "fbrp_core/web/hud/index.html")));
});
