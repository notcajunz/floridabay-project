import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { cleanCallsign, cleanInvite, cleanQuestions, csvField, MEMBER_STATUSES } from "../src/org-roster.js";
import { GRANT_GUARDED, permissionsFor } from "../src/economy.js";
import { ROSTER_ACTIONS } from "../src/orgs-site.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.resolve(here, "../../../server-data/resources/[fbrp]/fbrp_core");

test("application questions are trimmed, blank lines dropped and capped at eight", () => {
  assert.deepEqual(cleanQuestions("How old are you?\n\n  Why us?  \n"), ["How old are you?", "Why us?"]);
  assert.deepEqual(cleanQuestions(["A", "", "B"]), ["A", "B"]);
  assert.throws(() => cleanQuestions(Array.from({ length: 9 }, (_, i) => `Q${i}`)), /up to 8/);
});

test("Discord invites normalize to discord.gg links and reject other URLs", () => {
  assert.equal(cleanInvite("https://discord.gg/floridabay"), "https://discord.gg/floridabay");
  assert.equal(cleanInvite("discord.com/invite/abc-123"), "https://discord.gg/abc-123");
  assert.equal(cleanInvite("abcDEF"), "https://discord.gg/abcDEF");
  assert.equal(cleanInvite(""), null);
  assert.throws(() => cleanInvite("https://evil.example/discord.gg/x"), /Discord invite/);
});

test("callsigns are upper-cased and limited to safe characters", () => {
  assert.equal(cleanCallsign(" 1a-21 "), "1A-21");
  assert.equal(cleanCallsign(""), null);
  assert.throws(() => cleanCallsign("<script>"), /Callsigns/);
});

test("CSV export quotes fields and defuses spreadsheet formulas", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField('a,"b"'), '"a,""b"""');
  assert.equal(csvField("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvField("-2"), "'-2");
});

test("the new rank permissions follow the rank and are full for owners", () => {
  const ranked = permissionsFor({ member: 1, rank_id: 2, rank_name: "Sgt", level: 40, can_announce: 1, can_discipline: 0, can_applications: 1, can_profile: 0 }, false);
  assert.equal(ranked.announce, true);
  assert.equal(ranked.discipline, false);
  assert.equal(ranked.applications, true);
  assert.equal(ranked.profile, false);
  const owner = permissionsFor({}, false, { owner: true });
  for (const key of ["announce", "discipline", "applications", "profile"]) assert.equal(owner[key], true, key);
  for (const key of ["announce", "discipline", "applications", "profile"]) assert.ok(GRANT_GUARDED.includes(key), key);
});

test("member statuses and website roster actions are complete", () => {
  assert.deepEqual(Object.keys(MEMBER_STATUSES), ["active", "loa", "probation", "inactive", "suspended"]);
  for (const name of ["profile", "division", "division/delete", "member/profile", "record", "record/revoke", "announce", "announce/delete", "apply", "application/withdraw", "application/review"])
    assert.ok(ROSTER_ACTIONS[name], name);
});

test("migration 079 is registered and its statuses match the website", () => {
  assert.match(fs.readFileSync(path.join(core, "server/database.lua"), "utf8"), /'migrations\/079_org_roster_system\.sql'/);
  const sql = fs.readFileSync(path.join(core, "migrations/079_org_roster_system.sql"), "utf8");
  assert.match(sql, /ENUM\('active','loa','probation','inactive','suspended'\)/);
  for (const name of ["org_profiles", "org_divisions", "org_member_profiles", "org_member_records", "org_announcements", "org_applications", "can_announce", "can_discipline", "can_applications", "can_profile", "min_weekly_minutes"]) assert.match(sql, new RegExp(name));
  const comments = sql.split("\n").filter((line) => line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(comments, /[';]/);
});

test("events validate their time and the website exposes the event actions", async () => {
  const { cleanEventTime, EVENT_RESPONSES } = await import("../src/org-roster.js");
  const now = Date.UTC(2026, 9, 18, 12);
  assert.equal(cleanEventTime(now + 3600000, now), now + 3600000);
  assert.throws(() => cleanEventTime("soon", now), /date and time/);
  assert.throws(() => cleanEventTime(now - 2 * 3600000, now), /already passed/);
  assert.doesNotThrow(() => cleanEventTime(now - 2 * 3600000, now, true));
  assert.throws(() => cleanEventTime(now + 400 * 86400000, now), /year ahead/);
  assert.deepEqual(Object.keys(EVENT_RESPONSES), ["going", "maybe", "no"]);
  for (const name of ["event", "event/cancel", "event/rsvp"]) assert.ok(ROSTER_ACTIONS[name], name);
});

test("migration 082 creates the event tables and is registered", () => {
  assert.match(fs.readFileSync(path.join(core, "server/database.lua"), "utf8"), /'migrations\/082_org_events\.sql'/);
  const sql = fs.readFileSync(path.join(core, "migrations/082_org_events.sql"), "utf8");
  for (const statement of ["org_events", "org_event_rsvps", "'going','maybe','no'", "ON DELETE CASCADE"]) assert.ok(sql.includes(statement), statement);
  const comments = sql.split("\n").filter((line) => line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(comments, /[';]/, "both SQL splitters treat quotes and semicolons in comments as code");
});

test("the orgs website has Hours and Events tabs wired to the event actions", () => {
  const ui = fs.readFileSync(path.resolve(here, "../web/orgs/orgs.js"), "utf8");
  for (const piece of ['["hours", "Hours"', '["events", "Events"', "hoursTab", "eventsTab", 'act("event/rsvp"', 'act("event/cancel"', 'act("event"']) assert.ok(ui.includes(piece), piece);
});
