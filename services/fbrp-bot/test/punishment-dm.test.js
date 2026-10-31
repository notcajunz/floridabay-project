import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

function bodyBetween(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return source.slice(from, to);
}

function before(body, first, second) {
  const a = body.indexOf(first);
  const b = body.indexOf(second);
  assert.notEqual(a, -1, `missing: ${first}`);
  assert.notEqual(b, -1, `missing: ${second}`);
  assert.ok(a < b, `expected ${first} before ${second}`);
}

test("every moderation punishment DM includes punishment, case ID, and portal appeal instructions", () => {
  const local = bodyBetween("async function moderationCommand", "async function serverCommand");
  assert.match(local, /\["Punishment", humanize\(action\)\]/);
  assert.match(local, /\["Case ID",/);
  assert.match(local, /Submit an appeal through the member portal:.*\/portal#punishments/);

  const global = bodyBetween("async function notifyGlobal", "/** Every stored game identifier");
  assert.match(global, /\["Punishment", humanize\(action\)\]/);
  assert.match(global, /\["Case ID",/);
  assert.match(global, /Submit an appeal through the member portal:.*\/portal#punishments/);
});

test("local removals send the case DM before Discord removes the member", () => {
  const local = bodyBetween("async function moderationCommand", "async function serverCommand");
  before(local, "moderationCase = await caseRow", "await member.ban(");
  before(local, "await dm(user, `Florida Bay ${action}`", "await member.ban(");
  before(local, "await dm(user, `Florida Bay ${action}`", "await member.kick(reason)");
});

test("network removals and linked-account bans send the case DM before enforcement", () => {
  const command = bodyBetween('if (sub === "kick") {\n    const c = await createGlobalCase', "// blacklist");
  before(command, 'await notifyGlobal(user.id, "kick"', "await acrossNetwork(");
  before(command, 'await notifyGlobal(user.id, "ban"', "await callGame(");
  before(command, 'await notifyGlobal(user.id, "ban"', "await banAcrossNetwork(user.id");

  const blacklist = bodyBetween("// blacklist", "/** Website verification");
  before(blacklist, 'await notifyGlobal(user.id, "blacklist"', "await censorMember(");
  before(blacklist, 'await notifyGlobal(user.id, "blacklist"', "await g.members.ban(user.id");

  const alts = bodyBetween("async function banLinkedAlts", "let altSweepBusy");
  before(alts, "await notifyGlobal(alt.discordId", "await banAcrossNetwork(alt.discordId");
});
