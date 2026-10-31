import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createPortalStaff } from "../src/portal-staff.js";

function harness({ status = "active" } = {}) {
  const sql = [];
  const audits = [];
  const db = {
    async one(text, params) {
      if (text.includes("staff_roster_members")) return { discord_id: params[0], status };
      if (text.includes("staff_roster_discipline")) return { id: 4, discord_id: "222222222222222222", kind: "warning" };
      return null;
    },
    async query(text, params) { sql.push({ text, params }); return { insertId: 9, affectedRows: 1 }; },
  };
  const client = { channels: { fetch: async () => null }, users: { fetch: async () => ({ send: async () => {} }) } };
  const portal = createPortalStaff({ client, db, audit: async (...args) => { audits.push(args); } });
  return { portal, sql, audits };
}
const session = { id: "111111111111111111" };
const target = "222222222222222222";
const lead = { rosterManage: true, rosterDiscipline: true };

test("portal staff actions are refused without roster access", async () => {
  const { portal, sql } = harness();
  await assert.rejects(portal.act(session, {}, { action: "note", discordId: target, note: "x" }), /required/);
  await assert.rejects(portal.act(session, { rosterManage: true }, { action: "discipline", discordId: target, kind: "strike", reason: "x" }), /required/);
  assert.equal(sql.length, 0);
});

test("note, status and force-out write the same records as the Discord commands", async () => {
  const { portal, sql, audits } = harness();
  await portal.act(session, lead, { action: "note", discordId: target, note: "Back from vacation" });
  await portal.act(session, lead, { action: "status", discordId: target, status: "loa" });
  assert.ok(sql.some((q) => q.text.startsWith("UPDATE staff_roster_members SET activity_note")));
  assert.ok(sql.some((q) => q.text.startsWith("UPDATE staff_roster_members SET status")));
  assert.equal(sql.filter((q) => q.text.includes("staff_roster_history")).length, 2);
  assert.deepEqual(audits.map((a) => a[1]), ["roster.note", "roster.status"]);
  await assert.rejects(portal.act(session, lead, { action: "status", discordId: target, status: "removed" }), /Active, Inactive or LOA/);
});

test("discipline is issued and revoked with a reason; self-discipline is blocked", async () => {
  const { portal, sql } = harness();
  const issued = await portal.act(session, lead, { action: "discipline", discordId: target, kind: "strike", reason: "No-show" });
  assert.equal(issued.id, 9);
  assert.ok(sql.some((q) => q.text.startsWith("INSERT INTO staff_roster_discipline")));
  await assert.rejects(portal.act(session, lead, { action: "discipline", discordId: target, kind: "ban", reason: "x" }), /warning or a strike/);
  await assert.rejects(portal.act(session, lead, { action: "discipline", discordId: session.id, kind: "warning", reason: "x" }), /yourself/);
  await assert.rejects(portal.act(session, lead, { action: "discipline_revoke", id: 4, reason: "" }), /reason/);
  await portal.act(session, lead, { action: "discipline_revoke", id: 4, reason: "Issued in error" });
  assert.ok(sql.some((q) => q.text.startsWith("UPDATE staff_roster_discipline SET revoked_at")));
});

test("the portal API grants roster management to management and the coordination team", async () => {
  const panel = await readFile(new URL("../src/web-panel.js", import.meta.url), "utf8");
  assert.match(panel, /rosterLead = Boolean\(owner \|\| staffCoordinator \|\| managementTeam\)/);
  assert.match(panel, /"\/api\/portal\/staff\/manage"/);
  const ui = await readFile(new URL("../web/portal.js", import.meta.url), "utf8");
  assert.match(ui, /data-staff-manage/);
  assert.match(ui, /portal\/staff\/manage/);
});

test("the portal script version is bumped so browsers load the staff controls", async () => {
  const html = await readFile(new URL("../web/portal.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /portal\.js\?v=23/);
});
