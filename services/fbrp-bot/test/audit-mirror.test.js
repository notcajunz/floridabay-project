import test from "node:test";
import assert from "node:assert/strict";
import { describeInteraction, recordInteraction } from "../src/audit-trail.js";
import { channelName, destinationPurpose, groupOf, isAuditMirrorChannel, keyForAction, LOG_GROUPS } from "../src/audit-mirror.js";

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

test("in-game kills and deaths get their own audit channel", () => {
  assert.equal(keyForAction("player.kill"), "kill-logs");
  assert.equal(keyForAction("player.death"), "kill-logs");
  assert.equal(channelName(keyForAction("player.kill")), "💀│kill-logs");
  assert.equal(keyForAction("player.join"), "audit-player");
});

test("every kind of entry is grouped into one of a few channels", () => {
  assert.equal(groupOf("global-commands"), "command-logs");
  assert.equal(groupOf("commands-iaa"), "command-logs");
  assert.equal(groupOf("audit-staff"), "staff-logs");
  assert.equal(groupOf("log-staff_duty"), "staff-logs");
  assert.equal(groupOf("audit-medical"), "game-logs");
  assert.equal(groupOf("audit-economy"), "organization-logs");
  assert.equal(groupOf("audit-portal"), "system-logs");
  assert.equal(groupOf("audit-zzz"), "system-logs");
  assert.equal(groupOf("log-weird kind!"), "system-logs");
  assert.ok(Object.keys(LOG_GROUPS).length <= 6);
});

test("overlapping main-server log purposes share their canonical destinations", () => {
  assert.equal(destinationPurpose("bans"), "bans");
  assert.equal(destinationPurpose("blacklists"), "blacklists");
  assert.equal(destinationPurpose("unbans"), "moderation");
  assert.equal(destinationPurpose("staff_audit"), "staff_audit");
  assert.equal(destinationPurpose("role_sync"), "organizations");
  assert.equal(destinationPurpose("verification"), "verification");
});

test("mirror channels use the emoji, bar and -logs style of the other log channels", () => {
  assert.equal(channelName("global-commands"), "⌨️│command-logs");
  assert.equal(channelName("audit-economy"), "🏢│organization-logs");
  assert.equal(channelName("log-staff_duty"), "🛡️│staff-logs");
  for (const key of ["audit-zzz", "log-weird kind!", "commands-iaa"]) assert.match(channelName(key), /^[^a-z0-9-]+│[a-z0-9-]+-logs$/u);
});

test("existing mirror channels are recognized by canonical name or topic", () => {
  const channel = (overrides = {}) => ({
    isTextBased: () => true,
    parentId: "category",
    name: "🛡️│staff-logs",
    topic: null,
    ...overrides,
  });
  assert.equal(isAuditMirrorChannel(channel(), "audit-staff", "category"), true);
  assert.equal(isAuditMirrorChannel(channel({ name: "old-name", topic: "Automatic audit mirror: staff-logs" }), "staff-logs", "category"), true);
  assert.equal(isAuditMirrorChannel(channel({ parentId: "elsewhere" }), "staff-logs", "category"), false);
  assert.equal(isAuditMirrorChannel(channel({ name: "🛡️│staff-logs-copy" }), "staff-logs", "category"), false);
});
