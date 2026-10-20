import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const core = path.join(root, "server-data/resources/[fbrp]/fbrp_core");
const read = (file) => readFile(path.join(core, file), "utf8");

test("Discord rich presence is configured, loaded, and drives every presence native", async () => {
  const [config, manifest, client, server] = await Promise.all([
    read("config.lua"), read("fxmanifest.lua"), read("client/discord_presence.lua"), read("server/discord_presence.lua"),
  ]);

  assert.match(config, /discordPresence = \{[\s\S]*appId = GetConvar\('fbrp_discordAppId', '\d{17,20}'\)/);
  assert.match(config, /largeImage = GetConvar\('fbrp_discordLargeImage', 'https:\/\/floridabay\.net\//);
  assert.match(manifest, /'client\/discord_presence\.lua'/);
  assert.match(manifest, /'server\/discord_presence\.lua'/);
  for (const native of [
    "SetDiscordAppId", "SetDiscordRichPresenceAsset(", "SetDiscordRichPresenceAssetText", "SetDiscordRichPresenceAssetSmall(",
    "SetDiscordRichPresenceAssetSmallText", "SetRichPresence", "SetDiscordRichPresenceAction",
  ]) assert.ok(client.includes(native), `${native} is called`);

  // The presence reads the character, organization, duty, and downed state the HUD already publishes.
  for (const key of ["fbrp:characterName", "fbrp:organization", "fbrp:staffDuty", "fbrp:downed"]) {
    assert.ok(client.includes(`'${key}'`), `${key} is read`);
  }
  assert.match(client, /On duty: /);
  assert.match(client, /Choosing a character/);
  assert.match(client, /appId == '' or type\(SetDiscordAppId\) ~= 'function'/);
  assert.match(server, /GlobalState\['fbrp:onlinePlayers'\]/);
});

test("the organization logo version reaches the client so presence can link the website logo", async () => {
  const main = await read("server/main.lua");
  assert.match(main, /SELECT updated_at FROM org_logos WHERE org_id=\?/);
  assert.match(main, /type=s\.org\.type,logo=s\.org\.logo/);
});
