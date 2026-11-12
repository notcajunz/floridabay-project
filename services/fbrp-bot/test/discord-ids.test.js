import test from "node:test";
import assert from "node:assert/strict";

import { currentDiscordId, MAIN_GUILD_ID } from "../src/discord-ids.js";

test("deleted main-server IDs resolve to their restored replacements", () => {
  assert.equal(currentDiscordId("1557594282976747550"), MAIN_GUILD_ID);
  assert.equal(currentDiscordId("1558173819150012436"), "1570228185369546803");
  assert.equal(currentDiscordId("1557690864526954616"), "1570228067501211648");
  assert.equal(currentDiscordId("1558171442250784798"), "1570228138347077795");
});

test("current and blank Discord IDs are unchanged", () => {
  assert.equal(currentDiscordId(MAIN_GUILD_ID), MAIN_GUILD_ID);
  assert.equal(currentDiscordId(""), "");
});
