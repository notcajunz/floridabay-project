import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, "server-data", relative), "utf8");
const dir = "resources/[fbrp]/fbrp_ironman";

test("the Iron Man resource is started and gated to Co-Owner and above while clocked in", () => {
  assert.match(read("config/resources.cfg"), /^ensure fbrp_ironman$/m);
  const config = read(`${dir}/config.lua`);
  assert.match(config, /RankName\s*=\s*'co_owner'/);
  assert.match(config, /RequireOnDuty\s*=\s*true/);
});

test("the suit toggle and the revoke loop are decided on the server", () => {
  const server = read(`${dir}/server.lua`);
  assert.match(server, /lib\.callback\.register\('fbrp_ironman:toggle'[\s\S]*if not authorized\(src\) then[\s\S]*return \{ ok = false \}/);
  assert.match(server, /GetStaffRank/);
  assert.match(server, /IsStaffOnDuty/);
  assert.match(server, /fbrp_ironman:revoke/);
  assert.match(server, /if not suited\[src\]/);
});

test("the client only acts while suited and never grabs or disables player-occupied vehicles", () => {
  const client = read(`${dir}/client.lua`);
  assert.match(client, /lib\.callback\.await\('fbrp_ironman:toggle'/);
  assert.match(client, /if not suited then\s+Wait\(500\)/);
  assert.match(client, /IsPedAPlayer/);
  assert.match(client, /occupiedByPlayer/);
  assert.doesNotMatch(client, /TriggerServerEvent\('(?!fbrp_ironman:(used|diag)')/);
});

test("the suit streams as a replacement for the vanilla ig_bankman ped", () => {
  assert.match(read(`${dir}/config.lua`), /Model\s*=\s*'ig_bankman'/);
  for (const ext of ["yft", "ydd", "ytd", "ymt"]) {
    assert.ok(fs.existsSync(path.join(root, "server-data", dir, "stream", `ig_bankman.${ext}`)), ext);
  }
  assert.doesNotMatch(read(`${dir}/fxmanifest.lua`), /PED_METADATA_FILE/);
  const client = read(`${dir}/client.lua`);
  for (const [, name] of client.matchAll(/play\('([a-z_]+)'/g)) {
    assert.ok(fs.existsSync(path.join(root, "server-data", dir, "html/sfx", `${name}.wav`)), name);
  }
});
