import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const dir = "server-data/resources/[fbrp]";

test("CarPlay Music needs the Car Radio Discord role, checked on the server", () => {
  const core = read(`${dir}/fbrp_core/server/main.lua`);
  const server = read(`${dir}/fbrp_carplay/server/main.lua`);
  assert.match(core, /exports\('HasCarRadioAccess', function\(source\)\s+return FBRP\.HasCarRadioAccess\(source\) == true/);
  assert.match(server, /exports\.fbrp_core:HasCarRadioAccess\(src\)/);
  const handler = server.slice(server.indexOf("RegisterNetEvent('carplay:server:action'"));
  const gate = handler.indexOf("action ~= 'outside' and not hasMusicAccess(src)");
  assert.ok(gate > 0, "the gate exists in the action handler");
  assert.ok(gate < handler.indexOf("action == 'add'"), "the gate runs before adding songs");
  assert.ok(gate < handler.indexOf("actions[action]"), "the gate runs before every playback action");
});

test("the CarPlay UI shows a locked Music app without the role", () => {
  assert.match(read(`${dir}/fbrp_carplay/client/main.lua`), /radio = LocalPlayer\.state\['fbrp:carRadioAccess'\] == true/);
  assert.match(read(`${dir}/fbrp_carplay/html/script.js`), /classList\.toggle\('no-radio', d\.radio !== true\)/);
  assert.match(read(`${dir}/fbrp_carplay/html/index.html`), /id="musicLock"/);
  assert.match(read(`${dir}/fbrp_carplay/html/style.css`), /\.no-radio #page-music \.np/);
});

test("the Roxwood train models are requested before Roxwood starts", () => {
  const client = read(`${dir}/fbrp_trainmodels/client.lua`);
  assert.match(client, /'freightcar'/);
  const lines = read("server-data/config/resources.cfg").match(/^(?:ensure|stop) .*/gm);
  assert.ok(lines.indexOf("ensure fbrp_trainmodels") >= 0);
  assert.ok(lines.indexOf("ensure fbrp_trainmodels") < lines.indexOf("ensure [roxwood]"));
});
