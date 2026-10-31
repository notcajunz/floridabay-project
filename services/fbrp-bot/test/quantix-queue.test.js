import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const server = path.join(root, "server-data");
const read = (relative) => fs.readFileSync(path.join(server, relative), "utf8");
const queue = "resources/[standalone]/Quantix-Queue";

test("Quantix-Queue is started and its secrets come from convars", () => {
  assert.match(read("config/resources.cfg"), /^ensure Quantix-Queue$/m);
  assert.match(read(`${queue}/config.lua`), /GetConvar\("quantix_discord_token"/);
});

test("every player sees the queue screen for the minimum hold even when slots are free", () => {
  assert.match(read(`${queue}/config.lua`), /Config\.MinQueueScreenSeconds = [1-9]\d*/);
  const main = read(`${queue}/server/main.lua`);
  const immediate = main.slice(main.indexOf("if canImmediateConnect then"), main.indexOf("local playerData"));
  assert.match(immediate, /Wait\(holdSeconds \* 1000\)/);
  assert.ok(immediate.indexOf("Wait(holdSeconds") < immediate.indexOf("deferrals.done()"));
});

test("the queue screen lists up to 20 waiting players with their ranks", () => {
  assert.match(read(`${queue}/config.lua`), /MaxListedPlayers = 20/);
  const card = read(`${queue}/server/card.lua`);
  assert.match(card, /function Card\.BuildQueueList/);
  assert.match(card, /player\.priority\.name/);
  assert.match(card, /Card\.BuildQueueList\(data\)/);
});
