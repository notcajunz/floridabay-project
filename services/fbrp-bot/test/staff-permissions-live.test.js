import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLiveStaffPermissions } from "../src/staff-permissions-live.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const matrix = (has) => ({ generatedAt: 1, ranks: [{ label: "Everyone", team: "All players" }, { label: "Owner", team: "Ownership" }], sections: [{ source: "vMenu", title: "General", rows: [{ label: "NoClip", ace: "vMenu.NoClip", has }] }] });

test('an unchanged matrix answers "not changed" and a changed one returns everything', async () => {
  let current = matrix("01");
  let clock = 0;
  const live = createLiveStaffPermissions({ load: async () => current, ttlMs: 1000, now: () => clock });
  const first = await live.snapshot();
  assert.equal(first.changed, true);
  assert.equal(first.sections[0].rows[0].ace, "vMenu.NoClip");
  assert.deepEqual(await live.snapshot(first.hash), { hash: first.hash, changed: false, checkedAt: 0 });
  current = matrix("11");
  assert.equal((await live.snapshot(first.hash)).changed, false, "inside the cache window the game is not asked again");
  clock = 1500;
  const next = await live.snapshot(first.hash);
  assert.equal(next.changed, true);
  assert.notEqual(next.hash, first.hash);
});

test("concurrent requests share one read and a game outage serves the last copy", async () => {
  let reads = 0;
  let fail = false;
  let clock = 0;
  const live = createLiveStaffPermissions({ load: async () => { reads++; if (fail) throw new Error("down"); return matrix("01"); }, ttlMs: 10, now: () => clock });
  await Promise.all([live.snapshot(), live.snapshot(), live.snapshot()]);
  assert.equal(reads, 1);
  fail = true;
  clock = 100;
  assert.equal((await live.snapshot()).changed, true);
  const fresh = createLiveStaffPermissions({ load: async () => { throw new Error("down"); } });
  await assert.rejects(fresh.snapshot(), /down/);
});

test("the website serves the live permission page to Co-Owner and above only", () => {
  const panel = read("src/web-panel.js");
  assert.match(panel, /"\/staff-permissions": "staff-permissions\.html"/);
  assert.match(panel, /\/staff-permissions", "\/staff-permissions\.html"[\s\S]{0,200}canViewStaffPermissions\(session\.id\)/);
  assert.match(panel, /url\.pathname === "\/api\/staff-permissions"[\s\S]{0,200}canViewStaffPermissions\(session\.id\)[\s\S]{0,200}403/);
  assert.match(panel, /scope === "full" \|\| scope === "organizations"/);
  const page = read("web/staff-permissions.js");
  assert.match(page, /\/api\/staff-permissions\$\{state\.hash \? `\?since=/);
  assert.doesNotMatch(page, /innerHTML/);
  assert.match(read("web/staff-permissions.html"), /staff-permissions\.js/);
});

test("permanent bans are granted to Trial Head Administrator and above by rank", () => {
  const sql = read("../../server-data/resources/[fbrp]/fbrp_core/migrations/110_permban_trial_head_admin.sql");
  assert.match(sql, /'easyadmin\.player\.ban\.permanent'[\s\S]*th\.name = 'trial_head_administrator'[\s\S]*g\.rank_order >= th\.rank_order/);
  assert.doesNotMatch(sql, /^--.*['"`;]/m);
});
