import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createOrgAuthority, rankFromRoles, recordForOrg, registryRecord, rolePlan, RANK_PERMISSIONS } from "../src/org-authority.js";
import { permissionsFor } from "../src/economy.js";
import { orgsApiAllowed, orgsHostFor, orgsStaticPath, safeNext, ORGS_ACTIONS } from "../src/orgs-site.js";

const OWNER = "123456789012345678";
const COMMAND_ROLE = "223456789012345678";
const GUILD = "323456789012345678";

test("manager registry rows keep full Discord IDs and their organization link", () => {
  const record = registryRecord("gang", { name: "Ballas", guild_id: 1570219683137716254n, owner_id: 1090083387638812755n, command_role_id: BigInt(COMMAND_ROLE), base_role_id: null, fbrp_org_id: " Ballas " });
  assert.equal(record.ownerId, "1090083387638812755");
  assert.equal(record.guildId, "1570219683137716254");
  assert.equal(record.commandRoleId, COMMAND_ROLE);
  assert.equal(record.orgRef, "ballas");
  assert.equal(registryRecord("gang", { name: "Unlinked", fbrp_org_id: "" }), null);
});

test("department heads are read from head_id", () => {
  const record = registryRecord("department", { name: "FHP", head_id: OWNER, fbrp_org_id: "7" }, "head_id");
  assert.equal(record.ownerId, OWNER);
});

test("registry records match an organization by id or slug", () => {
  const records = [registryRecord("business", { fbrp_org_id: "12", owner_id: OWNER }), registryRecord("gang", { fbrp_org_id: "vagos", owner_id: OWNER })];
  assert.equal(recordForOrg(records, { id: 12, slug: "bennys" }).kind, "business");
  assert.equal(recordForOrg(records, { id: 40, slug: "Vagos" }).kind, "gang");
  assert.equal(recordForOrg(records, { id: 41, slug: "lost" }), null);
});

test("members are ranked by the highest-level rank whose bound role they hold", () => {
  const ranks = [{ id: 1, level: 10 }, { id: 2, level: 50 }, { id: 3, level: 90 }];
  const bindings = [{ rank_id: 1, role_id: "a" }, { rank_id: 2, role_id: "b" }, { rank_id: 3, role_id: "c" }];
  assert.equal(rankFromRoles(ranks, bindings, ["a", "b"]).id, 2);
  assert.equal(rankFromRoles(ranks, bindings, ["c", "a"]).id, 3);
  assert.equal(rankFromRoles(ranks, bindings, ["z"]), null);
});

test("a rank change adds the new rank's roles and removes other ranks' roles", () => {
  const bindings = [
    { rank_id: 1, guild_id: GUILD, role_id: "recruit" },
    { rank_id: 2, guild_id: GUILD, role_id: "sergeant" },
    { rank_id: 2, guild_id: GUILD, role_id: "supervisor" },
  ];
  const plan = rolePlan(bindings, 2, ["recruit", "supervisor", "unrelated"]);
  assert.deepEqual(plan.add.map((b) => b.role_id), ["sergeant"]);
  assert.deepEqual(plan.remove.map((b) => b.role_id), ["recruit"]);
  const demoted = rolePlan(bindings, null, ["sergeant", "unrelated"]);
  assert.deepEqual(demoted.add, []);
  assert.deepEqual(demoted.remove.map((b) => b.role_id), ["sergeant"]);
});

test("owners and command have every permission without a leader flag", () => {
  for (const standing of [{ owner: true }, { command: true }]) {
    const perms = permissionsFor({}, false, standing);
    assert.equal(perms.full, true);
    for (const key of ["spend", "sell", "roster", "ranks", "motd", "ledger"]) assert.equal(perms[key], true, key);
    assert.equal(perms.level, 100);
    assert.equal(perms.spendLimit, null);
  }
  assert.equal(permissionsFor({}, false, { owner: true }).rank, "Owner");
  assert.equal(permissionsFor({}, false, { command: true }).rank, "Command");
});

test("ranked members follow their rank and unranked members keep default access", () => {
  const ranked = permissionsFor({ member: 1, rank_id: 4, rank_name: "Sergeant", level: 40, can_spend: 1, can_roster: 0, can_ranks: 1, can_motd: 0, can_sell: 0, can_ledger: 0, spend_limit: 5000 }, false);
  assert.equal(ranked.full, false);
  assert.equal(ranked.spend, true);
  assert.equal(ranked.ranks, true);
  assert.equal(ranked.roster, false);
  assert.equal(ranked.ledger, false);
  assert.equal(ranked.spendLimit, 5000);
  assert.equal(ranked.level, 40);
  const member = permissionsFor({ member: 1 }, false);
  assert.equal(member.spend, false);
  assert.equal(member.ledger, true);
  assert.equal(member.rank, "Member");
});

test("every rank permission maps to a column with a default", () => {
  const keys = RANK_PERMISSIONS.map((perm) => perm.key);
  assert.deepEqual(keys, ["spend", "sell", "roster", "ranks", "motd", "announce", "discipline", "applications", "profile", "ledger", "armory", "garage"]);
  for (const perm of RANK_PERMISSIONS) {
    assert.match(perm.column, /^can_[a-z]+$/);
    assert.equal(typeof perm.default, "boolean");
  }
});

test("the orgs host serves only its app and organization APIs", () => {
  assert.equal(orgsStaticPath("/"), "orgs/index.html");
  assert.equal(orgsStaticPath("/orgs/orgs.js"), "orgs/orgs.js");
  assert.equal(orgsStaticPath("/fonts/inter.woff2"), "fonts/inter.woff2");
  assert.equal(orgsStaticPath("/portal.html"), null);
  assert.equal(orgsStaticPath("/control.html"), null);
  assert.equal(orgsStaticPath("/orgs/../web-panel.js"), null);
  assert.ok(orgsApiAllowed("/api/orgs/data"));
  assert.ok(orgsApiAllowed("/api/auth/session"));
  assert.ok(!orgsApiAllowed("/api/bootstrap"));
  assert.ok(!orgsApiAllowed("/api/portal/bootstrap"));
  assert.ok(!orgsApiAllowed("/api/record/save"));
});

test("sign-in handoff only returns to local paths", () => {
  assert.equal(safeNext("/"), "/");
  assert.equal(safeNext("/o/ballas"), "/o/ballas");
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext("/a?b=c"), "/");
});

test("the orgs host is the orgs subdomain of the public site", () => {
  assert.equal(orgsHostFor(new URL("https://floridabay.net")), "orgs.floridabay.net");
  assert.equal(orgsHostFor(new URL("https://www.floridabay.net")), "orgs.floridabay.net");
  assert.equal(orgsHostFor(new URL("http://127.0.0.1:8080")), "orgs.127.0.0.1.invalid");
});

test("every website action maps to an economy function", () => {
  const values = Object.values(ORGS_ACTIONS);
  for (const name of ["purchase", "sellItem", "transfer", "adjust", "setLeader", "setMotd", "saveRank", "deleteRank", "reorderRanks", "setMemberRank", "saveRosterSettings", "importRanksFromDiscord"])
    assert.ok(values.includes(name), name);
});

test("owners and command are read from the manager registries", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "fbrp-orgs-"));
  try {
    const gangs = path.join(dir, "gang.db");
    const depts = path.join(dir, "dept.db");
    const gangDb = new DatabaseSync(gangs);
    gangDb.exec("CREATE TABLE gangs (name TEXT, guild_id INTEGER, owner_id INTEGER, command_role_id INTEGER, base_role_id INTEGER, fbrp_org_id TEXT, external_guild_id TEXT)");
    gangDb.prepare("INSERT INTO gangs VALUES (?,?,?,?,?,?,?)").run("Ballas", BigInt(GUILD), BigInt(OWNER), BigInt(COMMAND_ROLE), null, "ballas", null);
    gangDb.prepare("INSERT INTO gangs VALUES (?,?,?,?,?,?,?)").run("Unlinked", BigInt(GUILD), BigInt(OWNER), null, null, null, null);
    gangDb.close();
    const deptDb = new DatabaseSync(depts);
    deptDb.exec("CREATE TABLE departments (name TEXT, guild_id INTEGER, head_id INTEGER, command_role_id INTEGER, base_role_id INTEGER, fbrp_org_id TEXT)");
    deptDb.prepare("INSERT INTO departments VALUES (?,?,?,?,?,?)").run("FHP", BigInt(GUILD), 923456789012345678n, null, null, "9");
    deptDb.close();
    process.env.FBRP_GANG_DB = gangs;
    process.env.FBRP_DEPARTMENT_DBS = depts;
    process.env.FBRP_BUSINESS_DB = path.join(dir, "missing.db");
    const memberRoles = { [OWNER]: [], "823456789012345678": [COMMAND_ROLE] };
    const db = {
      one: async (sql, params) => (sql.includes("discord_member_cache") ? { roles: JSON.stringify(memberRoles[params[1]] || []) } : null),
      query: async () => [],
    };
    const authority = createOrgAuthority({ client: { guilds: { cache: new Map() } }, db });
    const records = await authority.records();
    assert.equal(records.length, 2);
    assert.equal(records.find((r) => r.kind === "department").ownerId, "923456789012345678");
    assert.deepEqual(await authority.standing(OWNER, { id: 3, slug: "ballas" }).then(({ owner, command }) => ({ owner, command })), { owner: true, command: false });
    assert.deepEqual(await authority.standing("823456789012345678", { id: 3, slug: "ballas" }).then(({ owner, command }) => ({ owner, command })), { owner: false, command: true });
    assert.equal((await authority.standing(OWNER, { id: 4, slug: "vagos" })).owner, false);
    const standings = await authority.standings("923456789012345678", [{ id: 9, slug: "fhp" }, { id: 3, slug: "ballas" }]);
    assert.deepEqual([...standings.keys()], [9]);
  } finally {
    delete process.env.FBRP_GANG_DB;
    delete process.env.FBRP_DEPARTMENT_DBS;
    delete process.env.FBRP_BUSINESS_DB;
    rmSync(dir, { recursive: true, force: true });
  }
});
