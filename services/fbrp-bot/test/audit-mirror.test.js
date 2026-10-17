import test from "node:test";
import assert from "node:assert/strict";
import { describeInteraction, recordInteraction } from "../src/audit-trail.js";
import { keyForAction } from "../src/audit-mirror.js";

const fakeCommand = () => ({
  isChatInputCommand: () => true,
  isModalSubmit: () => false,
  isMessageComponent: () => false,
  commandName: "global",
  user: { id: "111111111111111111" },
  guild: { name: "FBRP | Main" },
  guildId: "222222222222222222",
  channelId: "333333333333333333",
  options: {
    getSubcommand: () => "ban",
    getSubcommandGroup: () => null,
    data: [{ type: 1, name: "ban", options: [
      { name: "member", type: 6, user: { id: "444444444444444444" }, value: "444444444444444444" },
      { name: "reason", type: 3, value: "ban evasion" },
    ] }],
  },
});

test("a slash command becomes a cmd.<bot>.<command>.<sub> row with its options", () => {
  const entry = describeInteraction("main", fakeCommand());
  assert.equal(entry.action, "cmd.main.global.ban");
  assert.equal(entry.actor, "111111111111111111");
  assert.equal(entry.payload.opt_member, "444444444444444444");
  assert.equal(entry.payload.opt_reason, "ban evasion");
  assert.equal(entry.payload.result, "ok");
});

test("failures keep the error and autocomplete is ignored", () => {
  const failed = describeInteraction("main", fakeCommand(), new Error("nope"));
  assert.equal(failed.payload.result, "failed");
  assert.equal(failed.payload.error, "nope");
  const complete = { isChatInputCommand: () => false, isModalSubmit: () => false, isMessageComponent: () => false };
  assert.equal(describeInteraction("main", complete), null);
});

test("recordInteraction writes one audit_log row", async () => {
  const calls = [];
  await recordInteraction(async (sql, args) => calls.push([sql, args]), "iaa", fakeCommand());
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /INSERT INTO audit_log/);
  assert.equal(calls[0][1][1], "cmd.iaa.global.ban");
});

test("actions route to the right audit channel", () => {
  assert.equal(keyForAction("cmd.main.global.lookup"), "global-commands");
  assert.equal(keyForAction("cmd.iaa.iaa.case"), "commands-iaa");
  assert.equal(keyForAction("cmd.main.mod.ban"), "commands-main");
  assert.equal(keyForAction("economy.purchase"), "audit-economy");
});
