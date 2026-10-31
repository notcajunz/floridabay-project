import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../server-data/resources/[fbrp]/fbrp_core");
const server = fs.readFileSync(path.join(core, "server/characters.lua"), "utf8");
const app = fs.readFileSync(path.join(core, "web/app.js"), "utf8");
const css = fs.readFileSync(path.join(core, "web/styles.css"), "utf8");
const config = fs.readFileSync(path.join(core, "config.lua"), "utf8");
const justice = fs.readFileSync(path.join(core, "server/justice.lua"), "utf8");
const manifest = fs.readFileSync(path.join(core, "fxmanifest.lua"), "utf8");

test("the character maker saves nationality and height to the profile the MDT and ID read", () => {
  const create = server.slice(server.indexOf("fbrp:characters:create"), server.indexOf("fbrp:characters:select"));
  assert.match(create, /data\.nationality/);
  assert.match(create, /data\.heightCm/);
  assert.match(create, /INSERT INTO character_profiles\(character_id,nationality,height_cm,updated_at\)/);
  assert.match(create, /local characterId=MySQL\.insert\.await\('INSERT INTO characters/);
  // The MDT searches these same tables, so no second identity store is introduced.
  assert.match(justice, /FROM characters c\s+LEFT JOIN character_profiles p ON p\.character_id=c\.id/);
  assert.doesNotMatch(create, /CREATE TABLE|multichar_tbx|users/);
});

test("character creation enforces age, height and nationality on the server", () => {
  const create = server.slice(server.indexOf("fbrp:characters:create"), server.indexOf("fbrp:characters:select"));
  assert.match(create, /between 18 and 100 years old/);
  assert.match(create, /Height must be between 120 and 230 cm/);
  assert.match(create, /Enter a valid nationality/);
  assert.match(create, /count >= \(FBRP\.Config\.characterSlots or 3\)/);
});

test("new characters announce themselves with the State ID the MDT searches by", () => {
  assert.match(server, /return \('FB-%06d'\):format/);
  assert.match(server, /TriggerEvent\('fbrp:characterCreated',src,characterId/);
  assert.match(server, /State ID %s/);
  assert.match(justice, /match\('\^FB%-\?\(%d\+\)\$'\)/);
});

test("the selector payload carries the profile, citizen number and playtime for the statistics panel", () => {
  assert.match(server, /p\.nationality,p\.height_cm,p\.phone/);
  assert.match(server, /row\.citizen = citizenNumber\(row\.id\)/);
  assert.match(server, /FROM player_playtime WHERE license=\?/);
  assert.match(server, /nationalities=FBRP\.Config\.nationalities/);
  assert.match(config, /nationalities = \{/);
});

test("character select shows fixed slots, a statistics panel and a register form without remote assets", () => {
  const view = app.slice(app.indexOf("function renderCharacters"), app.indexOf("function renderSpawns"));
  assert.match(view, /Array\.from\(\{ length: slots \}/);
  assert.match(view, /slot-new" data-new-character/);
  assert.match(view, /Character Statistics/);
  assert.match(view, /State ID \(MDT\)/);
  assert.match(view, /data-character-id/);
  const form = app.slice(app.indexOf("function characterForm"), app.indexOf("function formatPlaytime"));
  assert.match(form, /name="nationality"/);
  assert.match(form, /name="heightCm"/);
  assert.match(form, /Character Register/);
  assert.match(css, /\.slot\.slot-new/);
  // The zip's Tailwind/jQuery CDN scripts and its ESX resource are deliberately not shipped.
  assert.doesNotMatch(app + css, /cdn\.tailwindcss|code\.jquery|mMulticharacter|codem/i);
  assert.doesNotMatch(manifest, /mMulticharacter|codem/i);
});
