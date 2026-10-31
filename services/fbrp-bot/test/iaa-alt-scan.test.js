import test from "node:test";
import assert from "node:assert/strict";
import { SnowflakeUtil } from "discord.js";
import { definitions } from "../src/iaa/commands.js";
import { scoreAccount, toCsv, DEFAULT_MIN_SCORE } from "../src/iaa/altscan.js";

const NOW = Date.UTC(2026, 9, 29);
const base = (over = {}) => ({
  created: NOW - 800 * 86400000,
  username: "samantha",
  nickname: "Sam",
  avatar: "https://cdn.discordapp.com/avatars/1/abc.png",
  servers: 1,
  connections: 2,
  strongLinks: new Set(),
  networkLinks: new Set(),
  bannedLinks: 0,
  ...over,
});

test("IAA exposes /intel alt-scan", () => {
  const intel = definitions.find((c) => c.name === "intel");
  const sub = intel.options.find((o) => o.name === "alt-scan");
  assert.ok(sub);
  assert.equal(sub.options[0].name, "min_score");
});

test("an established, filled-in account is clean", () => {
  assert.equal(scoreAccount(base(), NOW).level, "clean");
});

test("a days-old account with an empty generic profile is flagged", () => {
  const r = scoreAccount(base({ created: NOW - 2 * 86400000, username: "user48213", nickname: null, avatar: "https://cdn.discordapp.com/embed/avatars/3.png", connections: 0 }), NOW);
  assert.ok(r.score >= 65, r.score);
  assert.equal(r.level, "likely");
  assert.ok(r.reasons.some((x) => /empty profile/.test(x)));
});

test("a shared game identity alone is enough to flag an old account", () => {
  const r = scoreAccount(base({ strongLinks: new Set(["222222222222222222"]) }), NOW);
  assert.ok(r.score >= DEFAULT_MIN_SCORE);
});

test("link to a banned account raises the score", () => {
  const a = scoreAccount(base({ networkLinks: new Set(["1"]) }), NOW).score;
  const b = scoreAccount(base({ networkLinks: new Set(["1"]), bannedLinks: 1 }), NOW).score;
  assert.ok(b > a);
});

test("CSV escapes quotes and lists linked accounts", () => {
  const csv = toCsv([{ id: "1", username: 'a"b', score: 50, level: "suspicious", servers: 2, linked: ["2", "3"], reasons: ["x"] }]);
  assert.match(csv, /"a""b"/);
  assert.match(csv, /"2 3"/);
});

test("snowflake helper agrees with account age assumptions", () => {
  const id = SnowflakeUtil.generate({ timestamp: NOW - 86400000 }).toString();
  assert.equal(Math.floor((NOW - Number(SnowflakeUtil.deconstruct(id).timestamp)) / 86400000), 1);
});

test("members who never verified are scored and flagged as such", () => {
  const verified = scoreAccount(base({ created: NOW - 20 * 86400000 }), NOW);
  const unverified = scoreAccount(base({ created: NOW - 20 * 86400000, unverified: true }), NOW);
  assert.equal(unverified.score, verified.score + 8);
  assert.ok(unverified.reasons.includes("never verified on the website"));
});
