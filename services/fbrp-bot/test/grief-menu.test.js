import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, "server-data", relative), "utf8");
const dir = "resources/[fbrp]/fbrp_grief";

test("the grief menu is started and gated to Co-Owner and above while clocked in", () => {
  const phone = read("config/resources.cfg");
  assert.match(phone, /^ensure fbrp_grief$/m);
  assert.ok(phone.indexOf("ensure NativeUI") !== -1 && phone.indexOf("ensure NativeUI") < phone.indexOf("ensure fbrp_grief"));
  const config = read(`${dir}/config.lua`);
  assert.match(config, /RankName\s*=\s*'co_owner'/);
  assert.match(config, /RequireOnDuty\s*=\s*true/);
});

test("every grief action and the menu opener are authorized on the server", () => {
  const server = read(`${dir}/server.lua`);
  assert.match(server, /lib\.callback\.register\('fbrp_grief:canOpen'[\s\S]*authorized\(src\)/);
  assert.match(server, /RegisterNetEvent\('fbrp_grief:action'[\s\S]*if not authorized\(src\) then[\s\S]*return\n\s*end/);
  assert.match(server, /GetStaffRank/);
  assert.match(server, /IsStaffOnDuty/);
});

test("the grief menu holds no Discord token and the menu is NativeUI", () => {
  const all = ["config.lua", "server.lua", "client.lua"].map((file) => read(`${dir}/${file}`)).join("\n");
  assert.doesNotMatch(all, /BotToken|discord\.com\/api|Authorization/);
  const client = read(`${dir}/client.lua`);
  assert.doesNotMatch(client, /TriggerServerEvent\("(?!fbrp_grief:action)/);
  assert.match(read(`${dir}/fxmanifest.lua`), /@NativeUI\/NativeUI\.lua/);
});
