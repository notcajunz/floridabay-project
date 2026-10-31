import test from "node:test";
import assert from "node:assert/strict";
import { MAIN_GUILD_ID, MAIN_LEAVE_LOG_CHANNEL_ID, logMainGuildLeave, mainLeaveEmbed } from "../src/iaa/member-logs.js";

const member = (guildId = MAIN_GUILD_ID) => ({
  id: "123456789012345678",
  guild: { id: guildId, name: "Florida Bay Roleplay" },
  joinedTimestamp: Date.UTC(2026, 0, 1),
  user: { username: "Example", createdTimestamp: Date.UTC(2025, 0, 1), bot: false, displayAvatarURL: () => "https://example.com/avatar.png" },
  displayAvatarURL: () => "https://example.com/avatar.png",
  roles: { cache: new Map([
    [guildId, { id: guildId, position: 0, managed: false }],
    ["200000000000000001", { id: "200000000000000001", position: 2, managed: false }],
  ]) },
});

test("IAA main-server leave logger targets the requested channel", async () => {
  const sent = [];
  const channel = { isTextBased: () => true, send: async (payload) => sent.push(payload) };
  const client = { channels: { cache: new Map([[MAIN_LEAVE_LOG_CHANNEL_ID, channel]]), fetch: async () => null } };
  assert.equal(await logMainGuildLeave(client, member()), true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].embeds[0].data.title, /Main server departure/);
  assert.match(sent[0].embeds[0].data.description, /123456789012345678/);
  assert.equal(await logMainGuildLeave(client, member("999999999999999999")), false);
  assert.equal(sent.length, 1);
});

test("main-server leave embed retains useful member context", () => {
  const embed = mainLeaveEmbed(member(), Date.UTC(2026, 0, 11)).data;
  assert.match(embed.fields.find((field) => field.name === "Joined").value, /10d ago/);
  assert.match(embed.fields.find((field) => field.name === "Roles at departure").value, /200000000000000001/);
});
