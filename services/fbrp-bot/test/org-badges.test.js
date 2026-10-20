import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BADGE_TIERS, TIER_ORDER, cleanFields, cleanTier, createOrgBadges, decodeBadgeImage, defaultFields, defaultTier,
  MAX_BADGE_BYTES, tierFallbacks,
} from "../src/org-badges.js";
import { BADGE_ACTIONS, orgsStaticPath } from "../src/orgs-site.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const dataUrl = (buffer, type = "png") => `data:image/${type};base64,${buffer.toString("base64")}`;

test("every tier has a label and the order runs from member to high command", () => {
  assert.deepEqual(TIER_ORDER, ["member", "supervisor", "low_command", "high_command"]);
  assert.equal(BADGE_TIERS.high_command, "High Command");
  assert.equal(cleanTier("High Command"), "high_command");
  assert.equal(cleanTier("low-command"), "low_command");
  assert.equal(cleanTier("default"), "member");
  assert.equal(cleanTier("R12"), "r12"); // a rank's own badge
  assert.throws(() => cleanTier("admin"), /default badge or one of the department's ranks/);
  assert.throws(() => cleanTier("r0"), /default badge/);
});

test("field placement is clamped and filled from defaults", () => {
  const fields = cleanFields({
    callsign: { x: 4, y: -2, size: 9, color: "#ABCDEF", align: "diagonal", weight: "bold", enabled: "false", maxWidth: 0 },
    avatar: { enabled: true, size: 2, shape: "star" },
    bogus: { x: 1 },
  });
  assert.equal(fields.callsign.x, 1);
  assert.equal(fields.callsign.y, 0);
  assert.equal(fields.callsign.size, 0.4);
  assert.equal(fields.callsign.color, "#abcdef");
  assert.equal(fields.callsign.align, "center");
  assert.equal(fields.callsign.enabled, false);
  assert.equal(fields.callsign.maxWidth, 0.05);
  assert.equal(fields.avatar.size, 0.9);
  assert.equal(fields.avatar.shape, "circle");
  assert.equal(fields.avatar.enabled, true);
  assert.equal(fields.bogus, undefined);
  assert.deepEqual(cleanFields(undefined), defaultFields());
  assert.deepEqual(Object.keys(fields).sort(), ["avatar", "callsign", "department", "name", "rank"]);
});

test("a rank wears the tier its permissions suggest unless an override exists", () => {
  assert.equal(defaultTier({ can_ranks: 1 }), "high_command");
  assert.equal(defaultTier({}, true), "high_command");
  assert.equal(defaultTier({ can_roster: 1 }), "low_command");
  assert.equal(defaultTier({ can_discipline: 1 }), "supervisor");
  assert.equal(defaultTier({ can_announce: true }), "supervisor");
  assert.equal(defaultTier({ can_spend: 1 }), "member");
  assert.equal(defaultTier(null), "member");
});

test("a missing tier falls back to the nearest lower tier, then higher ones", () => {
  assert.deepEqual(tierFallbacks("low_command"), ["low_command", "supervisor", "member", "high_command"]);
  assert.deepEqual(tierFallbacks("member"), ["member", "supervisor", "low_command", "high_command"]);
});

test("template uploads must be real PNG, JPEG or WebP pictures under the size limit", () => {
  assert.equal(decodeBadgeImage(dataUrl(PNG)).mime, "image/png");
  assert.throws(() => decodeBadgeImage("https://evil.example/a.png"), /PNG, JPEG or WebP/);
  assert.throws(() => decodeBadgeImage(dataUrl(Buffer.from("<script>alert(1)</script>"))), /not a PNG/);
  assert.throws(() => decodeBadgeImage(dataUrl(Buffer.concat([PNG, Buffer.alloc(MAX_BADGE_BYTES)]))), /at most 3 MB/);
});

function fakeDb(rows = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) { calls.push([sql, params]); return rows.query?.(sql, params) ?? []; },
    async one(sql, params = []) { calls.push([sql, params]); return rows.one?.(sql, params) ?? null; },
  };
}

test("saving a picture stores it with cleaned placement and audits the change", async () => {
  const db = fakeDb();
  const audits = [];
  const badges = createOrgBadges({ db, economy: {}, audit: async (...a) => { audits.push(a); }, analyze: async () => ({ fields: {}, cleaned: null, found: [], notes: [] }) });
  const saved = await badges.save(7, { tier: "supervisor", image: dataUrl(PNG), fields: { name: { y: 0.4 } } }, "42");
  const insert = db.calls.find(([sql]) => /INSERT INTO org_badge_templates/.test(sql));
  assert.ok(insert);
  assert.equal(insert[1][0], 7);
  assert.equal(insert[1][1], "supervisor");
  assert.equal(JSON.parse(insert[1][5]).name.y, 0.4);
  assert.equal(JSON.parse(insert[1][5]).rank.enabled, false); // names and ranks are never printed
  assert.equal(saved.tier, "supervisor");
  assert.deepEqual(audits[0].slice(0, 3), ["42", "organization.badge", 7]);
});

test("changing only the placement needs an existing picture", async () => {
  const db = fakeDb();
  const badges = createOrgBadges({ db, economy: {} });
  await assert.rejects(badges.save(7, { tier: "member", fields: {} }, "42"), /Upload a picture/);
  const withPicture = fakeDb({ one: (sql) => (/SELECT fields FROM org_badge_templates/.test(sql) ? { fields: JSON.stringify({ callsign: { y: 0.9 } }) } : null) });
  const ok = createOrgBadges({ db: withPicture, economy: {} });
  const result = await ok.save(7, { tier: "member", fields: { name: { y: 0.3 } } }, "42");
  assert.equal(result.fields.callsign.y, 0.9);
  assert.equal(result.fields.name.y, 0.3);
  assert.ok(withPicture.calls.some(([sql]) => /^UPDATE org_badge_templates SET fields/.test(sql)));
});

test("website edits need the profile permission, members can look", async () => {
  const economy = {
    accessTo: async (actor) => ({
      org: { id: 3 },
      perms: actor === "leader" ? { full: true, profile: true } : actor === "editor" ? { profile: true } : { member: true },
    }),
  };
  const db = fakeDb({ query: () => [], one: () => null });
  const badges = createOrgBadges({ db, economy });
  assert.equal((await badges.portalOverview("leader", "dept")).canEdit, true);
  assert.equal((await badges.portalOverview("member", "dept")).canEdit, false);
  await assert.rejects(badges.saveBadge("member", { orgId: 3, tier: "member", image: dataUrl(PNG) }), /cannot edit/);
  await assert.rejects(badges.removeBadge("member", { orgId: 3, tier: "member" }), /cannot edit/);
  await badges.saveBadge("editor", { orgId: 3, tier: "member", image: dataUrl(PNG) });
});

test("a member badge reports rank, callsign and the tier it maps to", async () => {
  const db = fakeDb({
    one: (sql) => {
      if (/FROM organizations/.test(sql)) return { id: 3, slug: "lspd", name: "LSPD" };
      if (/FROM organization_members/.test(sql)) return { manager: 0, rank_id: 9, rank_name: "Sergeant", level: 40, can_discipline: 1, callsign: "2A-14" };
      return null;
    },
  });
  const info = await createOrgBadges({ db, economy: {} }).memberInfo("lspd", "123456789012345678");
  assert.deepEqual(info.rank, { id: 9, name: "Sergeant", level: 40 });
  assert.equal(info.callsign, "2A-14");
  assert.equal(info.tier, "supervisor");
  const absent = fakeDb({ one: (sql) => (/FROM organizations/.test(sql) ? { id: 3, slug: "lspd", name: "LSPD" } : null) });
  assert.equal((await createOrgBadges({ db: absent, economy: {} }).memberInfo("lspd", "123456789012345678")).onRoster, false);
  await assert.rejects(createOrgBadges({ db, economy: {} }).memberInfo("lspd", "nope"), /Invalid discord_id/);
});

test("the website exposes the badge actions, routes, fonts and migration", () => {
  assert.equal(BADGE_ACTIONS.badge, "saveBadge");
  assert.equal(BADGE_ACTIONS["badge/rank"], undefined); // one badge per rank, no rank-to-tier mapping
  assert.equal(orgsStaticPath("/orgs/badges.js"), "orgs/badges.js");
  assert.equal(orgsStaticPath("/fonts/dejavu-sans-bold.ttf"), "fonts/dejavu-sans-bold.ttf");
  const panel = fs.readFileSync(path.join(here, "../src/web-panel.js"), "utf8");
  assert.match(panel, /\/api\/orgs\/badges"/);
  assert.match(panel, /\/api\/orgs\/badge-image"/);
  assert.match(panel, /\/badge\(s\|/);
  const core = path.resolve(here, "../../../server-data/resources/[fbrp]/fbrp_core");
  const migration = fs.readFileSync(path.join(core, "migrations/086_org_badges.sql"), "utf8");
  assert.match(migration, /org_badge_templates/);
  assert.match(migration, /org_badge_rank_tiers/);
  assert.doesNotMatch(migration.replace(/CREATE TABLE.*?;/gs, "").split("\n").filter((l) => l.startsWith("--")).join("\n"), /['';]/);
  assert.match(fs.readFileSync(path.join(core, "server/database.lua"), "utf8"), /086_org_badges\.sql/);
  const ui = fs.readFileSync(path.join(here, "../web/orgs/orgs.js"), "utf8");
  assert.match(ui, /\["badges", "Badges", "badge"\]/);
  assert.match(ui, /mountBadges\(/);
});

test("each rank has its own badge slot, backed by the default and older tier pictures", async () => {
  const rows = {
    query: (sql) => /FROM org_badge_templates/.test(sql)
      ? [{ tier: "r12", mime: "image/png", bytes: 5, fields: "{}", updated_at: 7 }, { tier: "supervisor", mime: "image/png", bytes: 5, fields: "{}", updated_at: 3 }]
      : /FROM org_ranks/.test(sql) ? [{ id: 12, name: "Chief", level: 90 }, { id: 13, name: "Officer", level: 10 }] : [],
    one: () => ({ name: "Los Santos Police Department", slug: "lspd" }),
  };
  const view = await createOrgBadges({ db: fakeDb(rows), economy: {} }).overview(3);
  assert.deepEqual(view.slots.map((slot) => [slot.key, slot.kind, slot.has]), [
    ["member", "default", false], ["r12", "rank", true], ["r13", "rank", false], ["supervisor", "legacy", true],
  ]);
  assert.equal(view.slots[0].label, "Default badge");
  assert.equal(view.slots[1].label, "Chief");
});

test("a member gets their rank's badge, else the default, else an older tier", async () => {
  const stored = new Map();
  const db = { one: async (sql, params) => (/FROM org_badge_templates/.test(sql) ? stored.get(params[1]) || null : null), query: async () => [] };
  const badges = createOrgBadges({ db, economy: {} });
  const row = (tier) => ({ tier, mime: "image/png", data: Buffer.from("x"), fields: "{}", updated_at: 1 });
  assert.equal(await badges.template(3, "supervisor", 12), null);
  stored.set("supervisor", row("supervisor"));
  assert.equal((await badges.template(3, "supervisor", 12)).tier, "supervisor");
  stored.set("member", row("member"));
  assert.equal((await badges.template(3, "supervisor", 12)).tier, "supervisor"); // tier fallback order comes first for a plain member default
  stored.set("r12", row("r12"));
  assert.equal((await badges.template(3, "supervisor", 12)).tier, "r12");
  assert.equal((await badges.template(3, "r12")).tier, "r12"); // asking for the slot itself
  assert.equal((await badges.template(3, "r99")).tier, "member"); // a rank with no picture falls back to the default
});

test("a rank slot can only be written for a rank of that organization", async () => {
  const db = { one: async (sql) => (/FROM org_ranks/.test(sql) ? null : null), query: async () => [] };
  const badges = createOrgBadges({ db, economy: {}, analyze: async () => ({ fields: {}, cleaned: null, found: [], notes: [] }) });
  await assert.rejects(badges.save(3, { tier: "r99", image: dataUrl(PNG) }, "42"), /does not belong/);
  await assert.rejects(badges.remove(3, "r99", "42"), /does not belong/);
});
