import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = fs.readFileSync(path.resolve(here, "../../../server-data/resources/[fbrp]/fbrp_core/client/characters.lua"), "utf8");

test("picking a spawn cannot be silently blocked by spawnmanager", () => {
  assert.doesNotMatch(client, /spawnmanager:spawnPlayer/);
  assert.match(client, /GetGameTimer\(\)<deadline/);
});

test("a failed spawn hands the selector back instead of leaving a dead screen", () => {
  const spawn = client.slice(client.indexOf("local function spawnAt"));
  assert.match(spawn, /pcall\(function\(\)/);
  assert.match(spawn, /if not ok then[\s\S]*DoScreenFadeIn[\s\S]*holdPlayer\(true\)/);
  assert.match(spawn, /spawning=false/);
});
