import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = async () => Promise.all([
  readFile(new URL("../web/portal.js", import.meta.url), "utf8"),
  readFile(new URL("../web/site.css", import.meta.url), "utf8"),
  readFile(new URL("../src/web-panel.js", import.meta.url), "utf8"),
]);

test("the portal roster is one rank-ordered row list with 30 members per page", async () => {
  const [portal, css, server] = await files();
  assert.match(server, /ORDER BY COALESCE\(c\.sort_order,9999\),COALESCE\(r\.sort_order,9999\),m\.callsign,m\.display_name/);
  assert.match(portal, /const pageSize = 30/);
  assert.match(portal, /class="roster-row/);
  assert.doesNotMatch(portal, /class="roster-group"/);
  for (const field of ["Discord ID", "Staff jobs", "Rank", "Hours"]) assert.match(portal, new RegExp(field));
  assert.match(css, /\.roster-row \{ width: 100%/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("only staff coordinators and management can open another member evaluation", async () => {
  const [portal, , server] = await files();
  assert.match(server, /group_name='staff_coordination_team'/);
  assert.match(server, /rosterAnalysis: Boolean\(owner \|\| sceneModerate \|\| staffCoordinator\)/);
  assert.match(server, /id !== String\(session\.id\) && !access\.rosterAnalysis/);
  assert.match(portal, /const canInspect = Boolean\(state\.data\.access\.rosterAnalysis\)/);
  assert.match(portal, /Staff evaluation & analysis/);
  for (const metric of ["30-day duty", "Active days", "Week-over-week", "Average shift", "Last shift"])
    assert.match(portal, new RegExp(metric));
});

test("the roster payload includes ordered staff job assignments", async () => {
  const [, , server] = await files();
  assert.match(server, /FROM staff_roster_member_jobs mj\s+JOIN staff_roster_jobs j/);
  assert.match(server, /jobs: jobs\.get\(row\.discord_id\) \|\| \[\]/);
});
