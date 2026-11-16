import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ChannelType } from "discord.js";

import {
  MAIN_LOG_KEY, applicationCustomId, applicationEmbed, createApplicationLogs, isDepartmentOrg, joinSummary, parseApplicationCustomId,
} from "../src/org-application-logs.js";
import { acceptedJoinLine, createOrgRoster } from "../src/org-roster.js";
import { APPLICATION_LOG_ACTIONS } from "../src/orgs-site.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.resolve(here, "../../../server-data/resources/[fbrp]/fbrp_core");
const HUB = "1570217077669757069";
const DEPT_GUILD = "1558238773958017024";
const ORG = { id: 3, slug: "dhs", name: "Department of Homefront Security", type: "leo", color: "#2255aa", guild_id: null };

function channel(id, name, sent) {
  return {
    id, name, type: ChannelType.GuildText, rawPosition: 1, parent: null, isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => { sent.push({ channel: id, payload }); return { id: `m${sent.length}` }; },
  };
}

function guild(id, name, channels, { members = [] } = {}) {
  const g = {
    id, name,
    channels: { cache: new Map(channels.map((c) => [c.id, c])) },
    roles: { cache: new Map([[id, { id, name: "@everyone" }], ["900000000000000001", { id: "900000000000000001", name: "Recruiters", position: 3, managed: false, hexColor: "#ffffff" }]]) },
    members: { me: {}, fetch: async (memberId) => { if (members.includes(String(memberId))) return { id: memberId }; throw new Error("Unknown Member"); } },
  };
  for (const c of channels) c.guild = g;
  return g;
}

function fakeDb(rows = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM org_application_messages/.test(sql)) return rows.messages || [];
      return { affectedRows: 1, insertId: 41 };
    },
    async one(sql, params = []) {
      calls.push({ sql, params });
      if (/FROM org_application_logs/.test(sql)) return rows.orgLog || null;
      if (/FROM bot_config/.test(sql)) return rows.main ? { value: JSON.stringify(rows.main), updated_by: "1", updated_at: 1 } : null;
      return null;
    },
  };
}

function setup({ orgLog = null, main = null, deptGuildCached = true, members = [], perms = { full: true, applications: true }, management = false, joinState = "joined" } = {}) {
  const sent = [];
  const hubGuild = guild(HUB, "Department Hub", [channel("700000000000000001", "dept-applications", sent)]);
  const deptGuild = guild(DEPT_GUILD, "DHS", [channel("700000000000000002", "applications", sent)], { members });
  const cache = new Map([[HUB, hubGuild], ...(deptGuildCached ? [[DEPT_GUILD, deptGuild]] : [])]);
  const db = fakeDb({ orgLog, main });
  const joins = [];
  const logs = createApplicationLogs({
    client: { guilds: { cache }, users: { fetch: async (id) => ({ id, send: async () => {} }) }, channels: { cache: new Map() } },
    db,
    economy: {
      accessTo: async () => ({ org: ORG, perms }),
      managementAccess: async () => (management ? { all: false, types: new Set(["leo", "fire", "government"]) } : { all: false, types: new Set() }),
    },
    authority: { records: async () => [{ kind: "department", orgRef: "3", guildId: HUB, externalGuildId: DEPT_GUILD }] },
    joinMember: async (g, user) => { joins.push([g.id, user.id]); return { state: joinState }; },
    verifyUrl: () => "https://floridabay.net/verify.html",
  });
  logs.attach({ url: () => "https://orgs.floridabay.net" });
  return { logs, sent, db, joins };
}

const application = { id: 41, discord_id: "123456789012345678", answers: [{ question: "Why DHS?", answer: "Because." }], created_at: Date.now() };

test("button ids round-trip and reject anything else", () => {
  assert.equal(applicationCustomId("accept", 41), "orgapp:accept:41");
  assert.deepEqual(parseApplicationCustomId("orgapp:deny:41"), { action: "deny", id: 41 });
  assert.deepEqual(parseApplicationCustomId("orgapp:note:7"), { action: "note", id: 7 });
  assert.equal(parseApplicationCustomId("orgapp:delete:1"), null);
  assert.equal(parseApplicationCustomId("deptreq:approve:1"), null);
});

test("departments are the Department Hub types or registered by /dept add", () => {
  assert.equal(isDepartmentOrg({ type: "fire" }), true);
  assert.equal(isDepartmentOrg({ type: "gang" }), false);
  assert.equal(isDepartmentOrg({ type: "other" }, { kind: "department" }), true);
});

test("a new department application goes to the main log and to high command's log with a ping and buttons", async () => {
  const { logs, sent, db } = setup({
    main: { guild_id: HUB, channel_id: "700000000000000001" },
    orgLog: { guild_id: DEPT_GUILD, channel_id: "700000000000000002", ping_role_id: "900000000000000001", buttons: 1 },
  });
  await logs.applied({ org: ORG, application });
  assert.equal(sent.length, 2);
  const main = sent.find((row) => row.channel === "700000000000000001").payload;
  const own = sent.find((row) => row.channel === "700000000000000002").payload;
  assert.equal(main.content, undefined);
  assert.deepEqual(main.components[0].components.map((b) => b.data.label), ["Open on the website"]);
  assert.equal(own.content, "<@&900000000000000001>");
  assert.deepEqual(own.allowedMentions.roles, ["900000000000000001"]);
  assert.deepEqual(own.components[0].components.map((b) => b.data.custom_id || b.data.url), ["orgapp:accept:41", "orgapp:deny:41", "https://orgs.floridabay.net/#/o/dhs/applications"]);
  assert.equal(db.calls.filter((c) => /INSERT IGNORE INTO org_application_messages/.test(c.sql)).length, 2);
});

test("link-only logs carry no review buttons", async () => {
  const { logs, sent } = setup({ orgLog: { guild_id: DEPT_GUILD, channel_id: "700000000000000002", ping_role_id: null, buttons: 0 } });
  await logs.applied({ org: ORG, application });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].payload.components[0].components.map((b) => b.data.label), ["Open on the website"]);
});

test("accepting adds the applicant to the department Discord and records it", async () => {
  const { logs, joins, db } = setup();
  const result = await logs.reviewed({ org: ORG, application, decision: "accepted", actorId: "222222222222222222" });
  assert.deepEqual(joins, [[DEPT_GUILD, application.discord_id]]);
  assert.equal(result.join.state, "joined");
  assert.equal(result.join.guildName, "DHS");
  assert.ok(db.calls.some((c) => /UPDATE org_applications SET join_state/.test(c.sql) && c.params[0] === "joined" && c.params[1] === DEPT_GUILD));
});

test("denied, already-joined and bot-missing applicants are not added", async () => {
  const denied = setup();
  assert.equal((await denied.logs.reviewed({ org: ORG, application, decision: "denied", actorId: "2" })).join, null);
  assert.deepEqual(denied.joins, []);
  const already = setup({ members: [application.discord_id] });
  assert.equal((await already.logs.reviewed({ org: ORG, application, decision: "accepted", actorId: "2" })).join.state, "already");
  assert.deepEqual(already.joins, []);
  const missing = setup({ deptGuildCached: false });
  assert.equal((await missing.logs.reviewed({ org: ORG, application, decision: "accepted", actorId: "2" })).join.state, "bot_missing");
});

test("unverified applicants get the verify link and are added later", async () => {
  const { logs } = setup({ joinState: "authorization_required" });
  const result = await logs.reviewed({ org: ORG, application, decision: "accepted", actorId: "2" });
  assert.equal(result.verifyUrl, "https://floridabay.net/verify.html");
  const line = acceptedJoinLine({ state: "authorization_required", guildName: "DHS" }, "https://discord.gg/dhs", result.verifyUrl);
  assert.match(line, /Verify at https:\/\/floridabay\.net\/verify\.html/);
  assert.match(line, /added to the \*\*DHS\*\* Discord automatically/);
  assert.match(acceptedJoinLine({ state: "joined", guildName: "DHS" }, null), /You were added to the \*\*DHS\*\* Discord/);
  assert.equal(acceptedJoinLine(null, "https://discord.gg/x"), "\nJoin their Discord: https://discord.gg/x");
});

test("only Department Management sets the main log and only high command sets their own", async () => {
  await assert.rejects(setup().logs.saveMainLog("1", { channelId: "700000000000000001" }), /Only Department Management/);
  const management = setup({ management: true });
  assert.deepEqual(await management.logs.saveMainLog("1", { channelId: "700000000000000001" }), { channel: "dept-applications" });
  assert.ok(management.db.calls.some((c) => /INSERT INTO bot_config/.test(c.sql) && c.params[0] === MAIN_LOG_KEY));
  await assert.rejects(setup({ perms: { full: false, applications: true } }).logs.saveOrgLog("1", { orgId: 3, channelId: "700000000000000002" }), /high command/);
  const hc = setup();
  assert.deepEqual(await hc.logs.saveOrgLog("1", { orgId: 3, channelId: "700000000000000002", pingRoleId: "900000000000000001", buttons: true }), { channel: "applications", server: "DHS", buttons: true });
  await assert.rejects(hc.logs.saveOrgLog("1", { orgId: 3, channelId: "700000000000000002", pingRoleId: "999999999999999999" }), /same server/);
  await assert.rejects(hc.logs.saveOrgLog("1", { orgId: 3, channelId: "700000000000000999" }), /text channel/);
});

test("the review embed shows the decision and the department join", () => {
  const embed = applicationEmbed({ org: ORG, application, decision: "accepted", reviewerId: "222222222222222222", join: { state: "joined", guildName: "DHS" } }).toJSON();
  assert.match(embed.title, /^Accepted · /);
  assert.deepEqual(embed.fields.map((f) => f.name), ["Why DHS?", "Decision", "Department Discord"]);
  assert.equal(joinSummary({ state: "no_guild" }), "No department Discord is linked (`/dept add guild_id:`).");
});

test("reviewing on the website runs the join hook and tells the applicant", async () => {
  const dms = [];
  const db = {
    async one(sql) {
      if (/FROM org_applications/.test(sql)) return { id: 41, discord_id: application.discord_id, answers: "[]", created_at: 1 };
      return null;
    },
    async query(sql) { return /UPDATE org_applications/.test(sql) ? { affectedRows: 1 } : []; },
  };
  const hooks = [];
  const roster = createOrgRoster({
    client: { users: { fetch: async () => ({ send: async (text) => dms.push(text) }) } },
    db, audit: async () => {}, resolvePeople: async () => ({}), logos: {},
    economy: { accessTo: async () => ({ org: ORG, perms: { applications: true } }) },
    applicationLogs: { reviewed: async (input) => { hooks.push(input.decision); return { join: { state: "joined", guildName: "DHS" } }; } },
  });
  const result = await roster.reviewApplication("2", { orgId: 3, applicationId: 41, decision: "accepted" });
  assert.deepEqual(hooks, ["accepted"]);
  assert.deepEqual(result.join, { state: "joined", guildName: "DHS" });
  assert.match(dms[0], /You were added to the \*\*DHS\*\* Discord/);
});

test("website actions, migration and the department registry are wired", () => {
  assert.equal(APPLICATION_LOG_ACTIONS["application/log"], "saveOrgLog");
  assert.equal(APPLICATION_LOG_ACTIONS["application/main-log"], "saveMainLog");
  const sql = fs.readFileSync(path.join(core, "migrations/090_org_application_logs.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS org_application_logs/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS org_application_messages/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS join_state/);
  assert.doesNotMatch(sql.replace(/^--.*$/gm, ""), /'/, "the migration runners split on apostrophes");
  // Bot-only, like 089: the game runner stops at 088.
  assert.doesNotMatch(fs.readFileSync(path.join(core, "server/database.lua"), "utf8"), /090_org_application_logs/);
  const authority = fs.readFileSync(path.join(here, "../src/org-authority.js"), "utf8");
  assert.match(authority, /columns\.has\("external_guild_id"\)/);
});

test("/join no longer lists or joins the DHS Discord", () => {
  const source = fs.readFileSync(path.join(here, "../src/index.js"), "utf8");
  assert.match(source, /const JOIN_HIDDEN_GUILD_IDS = new Set\(\[[\s\S]*?"1558238773958017024"/);
  const join = source.slice(source.indexOf("async function joinCommand"), source.indexOf("const autocompleters"));
  assert.match(join, /JOIN_HIDDEN_GUILD_IDS\.has\(id\)/);
  assert.match(join, /!JOIN_HIDDEN_GUILD_IDS\.has\(String\(row\.guild_id\)\)/);
  assert.doesNotMatch(join, /SECRET_GUILD_IDS/);
});
