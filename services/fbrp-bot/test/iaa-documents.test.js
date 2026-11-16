import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DOCS, DocsError, altGrid, createDocumentService, googleIdFrom, rosterGrid, sopParagraphs, validateEmail } from "../src/iaa/documents.js";
import { GoogleWorkspace, columnName } from "../src/iaa/google.js";

const LADDER = [
  { role_id: "r-dir", name: "Director", tier: "high_command", level: 90 },
  { role_id: "r-sup", name: "Supervisor Agent", tier: "supervisor", level: 40 },
  { role_id: "r-agt", name: "Agent", tier: "agent", level: 10 },
];
const A = "100000000000000001";
const B = "100000000000000002";
const C = "100000000000000003";

/** In-memory stand-in for the SQL repository. */
function memoryRepo() {
  const state = { members: [], docs: new Map(), grants: [], alts: [], nextId: 1 };
  const repo = {
    state,
    rosterMembers: async () => state.members.filter((m) => m.status !== "removed"),
    employeeStats: async () => state.members.filter((m) => m.status !== "removed").map((m) => ({ ...m, warnings: 2, strikes: 1, suspensions: 0, cases_led: 3, awards: 1, leave_until: null })),
    rosterMember: async (id) => state.members.find((m) => m.discord_id === String(id)) || null,
    getDocument: async (key) => state.docs.get(key) || null,
    saveDocument: async (d) => state.docs.set(d.doc_key, { ...d, content_hash: null }),
    touchDocument: async (key, hash, at) => Object.assign(state.docs.get(key), { content_hash: hash, synced_at: at }),
    activeGrants: async ({ docKey = null, discordId = null }) =>
      state.grants.filter((g) => !g.revoked_at && !g.revoke_pending && (!docKey || g.doc_key === docKey) && (!discordId || g.discord_id === String(discordId))),
    pendingRevocations: async () => state.grants.filter((g) => !g.revoked_at && g.revoke_pending),
    addGrant: async (g) => {
      const row = { id: state.nextId++, revoke_pending: 0, revoked_at: null, ...g };
      state.grants.push(row);
      return row;
    },
    markRevoked: async (id, { by, reason, at }) => Object.assign(state.grants.find((g) => g.id === id), { revoked_at: at, revoked_by: by, revoke_reason: reason, revoke_pending: 0 }),
    markRevokePending: async (id, { reason }) => Object.assign(state.grants.find((g) => g.id === id), { revoke_pending: 1, revoke_reason: reason }),
    altRecords: async ({ main = null } = {}) => state.alts.filter((a) => a.status === "active" && (!main || a.main_discord_id === main)),
    upsertAlt: async ({ main, alt, username, evidence, source, actorId, at }) => {
      let row = state.alts.find((a) => a.main_discord_id === main && a.alt_discord_id === alt);
      if (!row) state.alts.push((row = { main_discord_id: main, alt_discord_id: alt, created_at: at }));
      Object.assign(row, { alt_username: username, evidence, source, status: "active", added_by: String(actorId), updated_at: at });
      return row;
    },
    clearAlt: async ({ main, alt }) => {
      const row = state.alts.find((a) => a.main_discord_id === main && a.alt_discord_id === alt && a.status === "active");
      if (row) row.status = "cleared";
      return Boolean(row);
    },
  };
  return repo;
}

/** Fake Google that records every call and can be told to fail. */
function fakeGoogle() {
  const g = {
    calls: [],
    permissions: new Map(), // fileId -> Map(permissionId -> permission)
    failUnshare: false,
    seq: 0,
    createSpreadsheet: async (title) => (g.calls.push(["createSpreadsheet", title]), `sheet-${++g.seq}`),
    createDocument: async (title) => (g.calls.push(["createDocument", title]), `doc-${++g.seq}`),
    writeSheet: async (id, tab, grid) => g.calls.push(["writeSheet", id, tab, grid]),
    writeDocument: async (id, paragraphs) => g.calls.push(["writeDocument", id, paragraphs]),
    share: async (file, email, role) => {
      const id = `perm-${++g.seq}`;
      if (!g.permissions.has(file)) g.permissions.set(file, new Map([["owner-perm", { id: "owner-perm", role: "owner", type: "user", emailAddress: "bot@example.iam" }]]));
      g.permissions.get(file).set(id, { id, role, type: "user", emailAddress: email });
      g.calls.push(["share", file, email, role]);
      return id;
    },
    unshare: async (file, permissionId) => {
      if (g.failUnshare) throw new Error("google unavailable");
      g.permissions.get(file)?.delete(permissionId);
      g.calls.push(["unshare", file, permissionId]);
    },
    listAccess: async (file) => [...(g.permissions.get(file)?.values() || [])],
    link: (kind, id) => `https://example.test/${kind}/${id}`,
    files: new Map(),
    inspect: async (id) => {
      const file = g.files.get(id);
      if (!file) throw Object.assign(new Error("not found"), { status: 404 });
      return file;
    },
    ensureTab: async (id, tab) => g.calls.push(["ensureTab", id, tab]),
    writes: (id) => g.calls.filter((c) => c[0].startsWith("write") && c[1] === id),
    tab: (id, name) => g.calls.filter((c) => c[0] === "writeSheet" && c[1] === id && c[2] === name).at(-1)?.[3],
  };
  return g;
}

async function setup(extra = {}) {
  const repo = memoryRepo();
  const google = fakeGoogle();
  let clock = 1_000_000;
  const log = { warn: () => {} };
  const svc = createDocumentService({ repo, google, ranks: async () => LADDER, now: () => clock++, log, ...extra });
  repo.state.members.push(
    { discord_id: A, username: "alpha", callsign: "IA-01", rank_role_id: "r-dir", status: "active", joined_at: 1_700_000_000_000, rank_changed_at: 1_700_000_000_000 },
    { discord_id: B, username: "bravo", callsign: "IA-31", rank_role_id: "r-agt", status: "active", joined_at: 1_700_000_000_000, rank_changed_at: 1_700_000_000_000 },
  );
  await svc.setup("admin");
  return { repo, google, svc };
}

/* ---------------------------------------------------------------- roster synchronization */

test("the roster grid lists current agents highest rank first and never the removed", () => {
  const members = [
    { discord_id: B, username: "bravo", callsign: "IA-31", rank_role_id: "r-agt", status: "active" },
    { discord_id: A, username: "alpha", callsign: "IA-01", rank_role_id: "r-dir", status: "active" },
    { discord_id: C, username: "charlie", callsign: null, rank_role_id: null, status: "removed" },
    { discord_id: "100000000000000004", username: "delta", callsign: "IA-20", rank_role_id: "r-sup", status: "suspended" },
  ];
  const grid = rosterGrid(members, LADDER, { divisionsOf: (id) => (id === A ? ["Investigation Division"] : []) });
  assert.deepEqual(grid[0].slice(0, 4), ["Callsign", "Agent", "Discord ID", "Rank"]);
  assert.deepEqual(grid.slice(1).map((r) => r[1]), ["alpha", "delta", "bravo"]);
  assert.equal(grid[1][6], "Investigation Division");
  assert.equal(grid.some((r) => r.includes("charlie")), false);
});

test("setup creates private documents once and fills them; syncing only writes when the roster changed", async () => {
  const { repo, google, svc } = await setup();
  assert.deepEqual(google.calls.filter((c) => c[0].startsWith("create")).map((c) => c[1]), [DOCS.roster.title, DOCS.sop.title, DOCS.alts.title].sort((a, b) => 0));
  assert.equal(google.calls.filter((c) => c[0] === "share").length, 0, "nothing is shared by setup");
  const rosterId = repo.state.docs.get("roster").google_id;
  assert.equal(google.writes(rosterId).length, DOCS.roster.tabs.length, "every roster tab is written once");

  assert.equal(await svc.syncRoster(), false, "unchanged roster is not rewritten");
  repo.state.members.push({ discord_id: C, username: "charlie", callsign: "IA-32", rank_role_id: "r-agt", status: "active", joined_at: 1, rank_changed_at: 1 });
  assert.equal(await svc.syncRoster(), true);
  const latest = google.tab(rosterId, "Master Roster");
  assert.ok(latest.some((row) => row.includes("charlie")));

  assert.equal((await svc.setup("admin")).length, 0, "running setup again creates nothing new");
});

test("the converted SOP only mentions commands the IAA bot really has, and nothing from the CIA bot", async () => {
  const { SOP_TEXT } = await import("../src/iaa/sop-content.js");
  const { definitions } = await import("../src/iaa/commands.js");
  const byName = new Map(definitions.map((d) => [d.name, d]));
  const mentioned = new Set([...SOP_TEXT.matchAll(/(?<![\w/])\/([a-z][a-z-]*)/g)].map((m) => m[1]));
  for (const name of mentioned) assert.ok(byName.has(name), `/${name} is not an IAA command`);
  const tree = (cmd) => new Set((byName.get(cmd).options || []).flatMap((o) => (o.options ? [o.name, ...o.options.map((x) => `${o.name} ${x.name}`)] : [o.name])));
  for (const [cmd, sub] of [["iaa", "orientation"], ["iaa", "assign"], ["iaa", "remove"], ["iaa", "profile"], ["iaa", "history"], ["iaa", "roster"], ["iaa", "callsigns"], ["iaa", "blacklist"],
    ["investigation", "open"], ["investigation", "evidence"], ["investigation", "note"], ["investigation", "reopen"], ["discipline", "record"], ["loa", "request"], ["loa", "end"],
    ["intel", "blacklisted-server"], ["intel", "alt-scan"], ["intel", "lookup"], ["iaa-docs", "open"], ["iaa-docs", "link"], ["iaa-docs", "sync"], ["iaa-docs", "access grant"], ["iaa-docs", "alt add"]])
    assert.ok(tree(cmd).has(sub), `/${cmd} ${sub} does not exist`);
  assert.doesNotMatch(SOP_TEXT, /Central Intelligence|\bCIA\b|\/email|\/alt /);
  const paragraphs = sopParagraphs(LADDER, { strikeDays: 45, inactivityDays: 10 });
  const text = paragraphs.map((p) => p.text).join("\n");
  assert.match(text, /expires after 45 days/);
  assert.match(text, /stay active for 10 days/);
  assert.equal(paragraphs[1].style, "TITLE");
  assert.equal(paragraphs.filter((p) => p.style === "HEADING_1").length, 24, "23 sections plus the ladder appendix");
});

test("the SOP is IAA-native and describes the live ladder", () => {
  const text = sopParagraphs(LADDER, { strikeDays: 45 }).map((p) => p.text).join("\n");
  assert.match(text, /Internal Affairs Agency/);
  assert.match(text, /Director/);
  assert.match(text, /45 days/);
  assert.doesNotMatch(text, /Central Intelligence|\bCIA\b/);
});

/* ---------------------------------------------------------------- document access */

test("access is granted only to active agents, by named Google account, and recorded", async () => {
  const { repo, google, svc } = await setup();
  assert.throws(() => validateEmail("not-an-email"), DocsError);
  await assert.rejects(svc.grant({ docKey: "roster", target: { discordId: C }, email: "c@example.com", actorId: A }), /active agents/);
  await assert.rejects(svc.grant({ docKey: "roster", target: { discordId: B }, email: "nope", actorId: A }), /Google account/);

  const { changed, grant } = await svc.grant({ docKey: "roster", target: { discordId: B }, email: " Bravo@Example.com ", level: "writer", actorId: A });
  assert.equal(changed, true);
  assert.equal(grant.email, "bravo@example.com");
  assert.equal(grant.granted_by, A);
  assert.deepEqual(google.calls.find((c) => c[0] === "share").slice(2), ["bravo@example.com", "writer"]);
  assert.equal((await svc.grant({ docKey: "roster", target: { discordId: B }, email: "bravo@example.com", level: "writer", actorId: A })).changed, false);

  // A different address replaces the old grant instead of stacking.
  await svc.grant({ docKey: "roster", target: { discordId: B }, email: "other@example.com", level: "reader", actorId: A });
  assert.equal(repo.state.grants.filter((g) => !g.revoked_at).length, 1);
  assert.equal(google.calls.filter((c) => c[0] === "unshare").length, 1);
});

test("the locked alt database is view-only, and nobody can open a document they were not granted", async () => {
  const { svc } = await setup();
  await assert.rejects(svc.grant({ docKey: "alts", target: { discordId: A }, email: "a@example.com", level: "writer", actorId: A }), /view-only/);
  await assert.rejects(svc.linkFor("alts", A), /not been given access/);
  await svc.grant({ docKey: "alts", target: { discordId: A }, email: "a@example.com", actorId: A });
  assert.match(await svc.linkFor("alts", A), /^https:\/\/example\.test\/sheet\//);
  await assert.rejects(svc.linkFor("alts", B), /not been given access/);
});

test("the audit removes sharing that is not on the access list but keeps the owner and granted accounts", async () => {
  const { repo, google, svc } = await setup();
  await svc.grant({ docKey: "sop", target: { discordId: B }, email: "bravo@example.com", actorId: A });
  const file = repo.state.docs.get("sop").google_id;
  google.permissions.get(file).set("stray", { id: "stray", role: "reader", type: "anyone" });
  const removed = await svc.audit();
  assert.deepEqual(removed, [{ doc: "sop", type: "anyone", email: null }]);
  const left = [...google.permissions.get(file).keys()].sort();
  assert.deepEqual(left, ["owner-perm", repo.state.grants[0].permission_id].sort());
});

/* ---------------------------------------------------------------- alt records */

test("alt records are validated, unique per pair and mirrored to the locked sheet", async () => {
  const { repo, google, svc } = await setup();
  await assert.rejects(svc.addAlt({ main: "123", alt: B, actorId: A }), /Discord users/);
  await assert.rejects(svc.addAlt({ main: A, alt: A, actorId: A }), /own alt/);
  await svc.addAlt({ main: A, alt: C, username: "charlie_alt", evidence: "same device", actorId: B });
  await svc.addAlt({ main: A, alt: C, evidence: "updated", actorId: B });
  assert.equal(repo.state.alts.length, 1);
  const sheetId = repo.state.docs.get("alts").google_id;
  const grid = google.tab(sheetId, "LOCKED");
  assert.equal(grid.length, 2);
  assert.deepEqual(grid[1].slice(0, 2), [A, C]);

  await svc.removeAlt({ main: A, alt: C, actorId: B });
  assert.equal(google.tab(sheetId, "LOCKED").length, 1, "cleared records leave the sheet");
  await assert.rejects(svc.removeAlt({ main: A, alt: C, actorId: B }), /no active record/);
  assert.equal(altGrid([{ main_discord_id: A, alt_discord_id: C, status: "cleared" }]).length, 1);
});

/* ---------------------------------------------------------------- automatic offboarding */

test("offboarding revokes every document grant and drops the agent from the roster sheet", async () => {
  const { repo, google, svc } = await setup();
  await svc.grant({ docKey: "roster", target: { discordId: B }, email: "bravo@example.com", actorId: A });
  await svc.grant({ docKey: "sop", target: { discordId: B }, email: "bravo@example.com", actorId: A });
  repo.state.members.find((m) => m.discord_id === B).status = "removed";
  const result = await svc.offboard(B, { by: A, reason: "removed: misconduct" });
  assert.deepEqual(result, { found: 2, revoked: 2 });
  assert.equal(repo.state.grants.filter((g) => !g.revoked_at).length, 0);
  assert.equal(repo.state.grants[0].revoke_reason, "removed: misconduct");
  const rosterId = repo.state.docs.get("roster").google_id;
  assert.equal(google.tab(rosterId, "Master Roster").some((row) => row.includes("bravo")), false);
});

test("reconcile ends access for anyone who is no longer an active agent and retries stuck revocations", async () => {
  const { repo, google, svc } = await setup();
  await svc.grant({ docKey: "sop", target: { discordId: B }, email: "bravo@example.com", actorId: A });
  repo.state.members.find((m) => m.discord_id === B).status = "suspended";
  google.failUnshare = true;
  assert.deepEqual((await svc.reconcile()).revoked, [], "Google outage: nothing confirmed");
  assert.equal(repo.state.grants[0].revoke_pending, 1);

  google.failUnshare = false;
  await svc.reconcile();
  assert.ok(repo.state.grants[0].revoked_at, "the pending revocation completed once Google recovered");
  assert.equal([...google.permissions.get(repo.state.docs.get("sop").google_id).keys()].includes(repo.state.grants[0].permission_id), false);
});

test("a roster member removed through any route triggers document offboarding", async () => {
  const [roster, index, runtime] = await Promise.all(["roster", "index", "documents-runtime"].map((f) => readFile(new URL(`../src/iaa/${f}.js`, import.meta.url), "utf8")));
  assert.match(roster, /export async function separate[\s\S]*offboardDocuments\(member\.id/);
  assert.match(roster, /export async function autoSeparate[\s\S]*offboardDocuments\(user\.id/);
  assert.match(index, /GuildMemberRemove[\s\S]*roster\.autoSeparate\(/);
  assert.match(index, /svc\.reconcile\(\)/);
  assert.match(runtime, /export async function offboardDocuments/);
});

/* ---------------------------------------------------------------- google client and wiring */

test("the Google client names columns, shares by account with no notification, and never opens link sharing", async () => {
  assert.equal(columnName(1), "A");
  assert.equal(columnName(27), "AA");
  const requests = [];
  const account = { accessToken: async () => "token" };
  const client = new GoogleWorkspace(account, async (url, init) => {
    requests.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ id: "perm-1" }) };
  });
  assert.equal(await client.share("file-1", "a@example.com", "reader"), "perm-1");
  assert.match(requests[0].url, /sendNotificationEmail=false/);
  assert.deepEqual(requests[0].body, { type: "user", role: "reader", emailAddress: "a@example.com" });
  assert.equal(requests.some((r) => r.body?.type === "anyone" || r.body?.type === "domain"), false);
});

test("migration, command, permissions and docs are wired and carry no Google credentials", async () => {
  const [migration, commands, store] = await Promise.all([
    readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/121_iaa_documents.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/iaa/commands.js", import.meta.url), "utf8"),
    readFile(new URL("../src/iaa/store.js", import.meta.url), "utf8"),
  ]);
  for (const table of ["iaa_documents", "iaa_doc_access", "iaa_alt_records"]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(commands, /docsDefinition/);
  for (const perm of ["docs.grant", "docs.locked", "docs.alts"]) assert.match(store, new RegExp(`"${perm}"`));
  const sources = (await Promise.all(["google", "documents", "documents-store", "docs-command"].map((f) => readFile(new URL(`../src/iaa/${f}.js`, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(sources, /private_key|BEGIN PRIVATE|AIza|docs\.google\.com\/(document|spreadsheets)\/d\/[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(sources, /Central Intelligence|\bCIA\b/);
});

/* ---------------------------------------------------------------- adopting files a person created */

const SHEET_ID = "1Q65DWTJkzBnyVA0b5GFk6I7fkxmy_uycU_CFNzLOQ8U";
const DOC_ID = "19EbPXu8xxAx7-GXe_ZWxj1lLFc04dXX5noiRkyfectY";

test("googleIdFrom reads links and bare ids and rejects anything else", () => {
  assert.equal(googleIdFrom(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?usp=sharing`), SHEET_ID);
  assert.equal(googleIdFrom(SHEET_ID), SHEET_ID);
  assert.throws(() => googleIdFrom("https://example.com/nothing"), DocsError);
});

test("a Google file shared with the bot is adopted, given its tab and filled from live data", async () => {
  const repo = memoryRepo();
  const google = fakeGoogle();
  const svc = createDocumentService({ repo, google, ranks: async () => LADDER, log: { warn: () => {} } });
  repo.state.members.push({ discord_id: A, username: "alpha", callsign: "IA-01", rank_role_id: "r-dir", status: "active", joined_at: 1, rank_changed_at: 1 });
  google.files.set(SHEET_ID, { name: "IAA Roster", mimeType: "application/vnd.google-apps.spreadsheet", capabilities: { canEdit: true, canShare: true } });
  google.files.set(DOC_ID, { name: "IAA Standard Operating Procedures", mimeType: "application/vnd.google-apps.document", capabilities: { canEdit: true, canShare: true } });

  await svc.register({ docKey: "roster", source: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, actorId: A });
  assert.deepEqual(google.calls.filter((c) => c[0] === "ensureTab").map((c) => c[2]), DOCS.roster.tabs);
  assert.ok(google.tab(SHEET_ID, "Master Roster").some((row) => row.includes("alpha")));
  assert.equal(repo.state.docs.get("roster").google_id, SHEET_ID);

  await svc.register({ docKey: "sop", source: DOC_ID, actorId: A });
  assert.ok(google.writes(DOC_ID).at(-1)[2].some((p) => /Internal Affairs Agency \| SOP/.test(p.text)));

  // Access control works on a file the bot does not own.
  repo.state.members.push({ discord_id: B, username: "bravo", callsign: "IA-31", rank_role_id: "r-agt", status: "active", joined_at: 1, rank_changed_at: 1 });
  await svc.grant({ docKey: "sop", target: { discordId: B }, email: "bravo@example.com", actorId: A });
  assert.equal(google.calls.filter((c) => c[0] === "share" && c[1] === DOC_ID).length, 1);
});

test("a file the bot cannot edit, cannot share, cannot see or has the wrong type is refused", async () => {
  const repo = memoryRepo();
  const google = fakeGoogle();
  const svc = createDocumentService({ repo, google, ranks: async () => LADDER, log: { warn: () => {} } });
  await assert.rejects(svc.register({ docKey: "roster", source: SHEET_ID, actorId: A }), /cannot see that file/);
  google.files.set(SHEET_ID, { name: "x", mimeType: "application/vnd.google-apps.document", capabilities: { canEdit: true, canShare: true } });
  await assert.rejects(svc.register({ docKey: "roster", source: SHEET_ID, actorId: A }), /not a Google Sheet/);
  google.files.set(SHEET_ID, { name: "x", mimeType: "application/vnd.google-apps.spreadsheet", capabilities: { canEdit: true, canShare: false } });
  await assert.rejects(svc.register({ docKey: "roster", source: SHEET_ID, actorId: A }), /Editor access/);
  assert.equal(await repo.getDocument("roster"), null);
});

test("when Google refuses to let the service account own a file, setup explains how to link one instead", async () => {
  const repo = memoryRepo();
  const google = fakeGoogle();
  google.createSpreadsheet = async () => {
    throw Object.assign(new Error("Google POST failed (HTTP 403): Service Accounts do not have storage quota."), { status: 403 });
  };
  const svc = createDocumentService({ repo, google, ranks: async () => LADDER, log: { warn: () => {} } });
  await assert.rejects(svc.setup(A), /\/iaa-docs link/);
});

test("ensureTab renames the single tab of a reused sheet and adds a tab when several exist", async () => {
  const sent = [];
  const reply = (tabs) => async (url, init) => {
    sent.push(init.body ? JSON.parse(init.body) : null);
    return { ok: true, status: 200, json: async () => ({ sheets: tabs.map((title, i) => ({ properties: { sheetId: i + 1, title } })) }) };
  };
  const client = (tabs) => new GoogleWorkspace({ accessToken: async () => "t" }, reply(tabs));
  await client(["Whatever"]).ensureTab("id", "LOCKED");
  assert.deepEqual(sent.at(-1).requests[0].updateSheetProperties.properties, { sheetId: 1, title: "LOCKED" });
  await client(["A", "B"]).ensureTab("id", "LOCKED");
  assert.deepEqual(sent.at(-1).requests[0].addSheet.properties, { title: "LOCKED" });
  sent.length = 0;
  await client(["LOCKED"]).ensureTab("id", "LOCKED");
  assert.equal(sent.length, 1, "nothing to change when the tab already exists");
});

test("the roster workbook keeps the old five tabs, filled IAA-native from live data", async () => {
  const { repo, google, svc } = await setup({
    settings: async () => ({ strikeDays: 45 }),
    authority: async () => ({
      permissions: { "roster.manage": { tier: "supervisor", label: "Add and promote" }, "docs.locked": { tier: "high_command", label: "Locked alt database access" } },
      tiers: undefined,
      overrides: {},
    }),
  });
  const id = repo.state.docs.get("roster").google_id;
  assert.deepEqual([...new Set(google.writes(id).map((c) => c[2]))], ["Homepage", "Master Roster", "Employee Database", "Authority Matrix", "Punishment Guideline"]);

  const home = google.tab(id, "Homepage");
  assert.equal(home[0][0], "FBRP | Internal Affairs Agency");
  assert.deepEqual(home.find((r) => r[0] === "Active agents"), ["Active agents", "2"]);

  const employees = google.tab(id, "Employee Database");
  assert.deepEqual(employees[0].slice(7, 12), ["Warnings", "Active strikes", "Suspensions", "Cases led", "Awards"]);
  assert.deepEqual(employees[1].slice(1, 2).concat(employees[1].slice(7, 12)), ["alpha", 2, 1, 0, 3, 1]);

  const matrix = google.tab(id, "Authority Matrix");
  assert.deepEqual(matrix[0].slice(0, 3), ["Permission", "What it allows", "Minimum tier"]);
  const row = (name) => matrix.find((r) => r[0] === name);
  assert.deepEqual(row("roster.manage").slice(3), ["", "Yes", "Yes", "Yes", "Yes"], "Supervisors and above");
  assert.deepEqual(row("docs.locked").slice(3), ["", "", "", "", "Yes"], "High Command only");

  const guideline = google.tab(id, "Punishment Guideline");
  assert.equal(guideline.find((r) => r[0] === "Strike")[3], "45 days");
  assert.deepEqual(guideline.find((r) => r[0] === "Exonerated").slice(0, 2), ["Exonerated", "No action only"]);
  const text = JSON.stringify([home, employees, matrix, guideline]);
  assert.doesNotMatch(text, /Central Intelligence|\bCIA\b|FloriRP/);
});

test("writing a reused sheet unmerges old merged cells first, so no value is hidden", async () => {
  const calls = [];
  const client = new GoogleWorkspace({ accessToken: async () => "t" }, async (url, init) => {
    calls.push([init.method, url.replace(/^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/[^/:?]+/, ""), init.body ? JSON.parse(init.body) : null]);
    return { ok: true, status: 200, json: async () => ({ sheets: [{ properties: { sheetId: 7, title: "Punishment Guideline" } }] }) };
  });
  await client.writeSheet("sheet-id", "Punishment Guideline", [["a", "b"], ["c", "d"]]);
  const unmerge = calls.findIndex((c) => c[2]?.requests?.[0]?.unmergeCells);
  const clear = calls.findIndex((c) => c[1].includes(":clear"));
  const put = calls.findIndex((c) => c[0] === "PUT");
  assert.deepEqual(calls[unmerge][2].requests[0].unmergeCells.range, { sheetId: 7 });
  assert.ok(unmerge >= 0 && unmerge < clear && clear < put, "unmerge, then clear, then write");
});
