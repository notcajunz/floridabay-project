import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createOrganizationSetup,
  defaultOrganizationPermissions,
  linkOrganizationAccessRole,
  organizationSetupInput,
} from "../src/organization-setup.js";

const guildId = "156000000000000001";
const roleId = "156000000000000002";

function fakeClient() {
  const role = { id: roleId, name: "T1 | Test Organization" };
  const guild = { id: guildId, name: "Organization Hub", roles: { fetch: async (id) => id === roleId ? role : null } };
  return { guilds: { cache: new Map([[guildId, guild]]) } };
}

test("setup input derives safe organization types and permissions", () => {
  const gang = organizationSetupInput({ family: "gang", name: "Test Gang", slug: "test_gang", tag: "TG", color: "#12abef", guildId });
  assert.equal(gang.type, "gang");
  assert.equal(gang.color, "#12ABEF");
  const fire = organizationSetupInput({ family: "department", departmentType: "fire", name: "Fire Rescue", slug: "fire_rescue", guildId });
  assert.equal(fire.type, "fire");
  assert.deepEqual(defaultOrganizationPermissions("fire"), ["fbrp.vehicles.fire"]);
  assert.throws(() => organizationSetupInput({ family: "department", departmentType: "gang", name: "Bad", slug: "bad", guildId }), /department type/i);
});

test("guided setup creates the tag, organization, ACE defaults, roster settings, and wallet atomically", async () => {
  const statements = [];
  let insertId = 40;
  const db = {
    one: async () => ({ guild_id: guildId, kind: "business", name: "Business Hub" }),
    transaction: async (work) => work(async (sql, params) => {
      statements.push([sql, params]);
      return { insertId: ++insertId };
    }),
  };
  const created = await createOrganizationSetup({
    db,
    client: fakeClient(),
    actorId: "156000000000000003",
    input: { family: "business", name: "Test Business", slug: "test_business", tag: "TEST", color: "#43e8d8", guildId },
  });
  assert.equal(created.orgId, 45);
  assert.equal(created.bot, "Business Assistant");
  const sql = statements.map(([statement]) => statement).join("\n");
  for (const table of ["ace_groups", "ace_entries", "headtags", "organizations", "org_roster_settings", "org_wallets"])
    assert.match(sql, new RegExp(table));
  assert.match(created.nextCommand, /fbrp_org_id:45/);
  assert.equal(created.managerField, "fbrp_org_id");
});

test("assistant role linking validates the selected server and replaces the pending requirement", async () => {
  const statements = [];
  const db = {
    one: async (sql) => sql.includes("FROM organizations")
      ? { id: 7, slug: "test_gang", name: "Test Gang", type: "gang", guild_id: guildId, active: 1 }
      : { kind: "gang" },
    transaction: async (work) => work(async (sql, params) => statements.push([sql, params])),
  };
  const linked = await linkOrganizationAccessRole({
    db, client: fakeClient(), actorId: "gang-assistant",
    input: { org: "test_gang", family: "gang", guildId, roleId },
  });
  assert.equal(linked.role.id, roleId);
  assert.match(statements.map(([sql]) => sql).join("\n"), /organization_role_requirements/);
  assert.match(statements.map(([sql]) => sql).join("\n"), /UPDATE organizations SET role_id/);
});

test("organization setup is gated by the exact Discord role and is visible in both portal UIs", async () => {
  const [server, control, portal] = await Promise.all([
    readFile(new URL("../src/web-panel.js", import.meta.url), "utf8"),
    readFile(new URL("../web/app.js", import.meta.url), "utf8"),
    readFile(new URL("../web/portal.js", import.meta.url), "utf8"),
  ]);
  assert.match(server, /ORGANIZATION_SETUP_ROLE_ID = "1570224060967682200"/);
  assert.match(server, /if \(!organizationSetup\) return sendJson\(response, 403/);
  assert.match(control, /view: "orgsetup"/);
  assert.match(control, /post\("organization\/setup"/);
  assert.match(control, /Organization ID: \$\{result\.orgId\}/);
  assert.match(control, /data-copy-org-handoff/);
  assert.match(portal, /access\.orgSetup/);
});

test("all three assistant bots link their base role after their own creation succeeds", async () => {
  const roots = [
    ["../../gangsmanager/gangbot/cogs/gangs.py", "../../gangsmanager/gangbot/fbrp_api.py", "gang"],
    ["../../businessmanager/businessbot/cogs/businesses.py", "../../businessmanager/businessbot/fbrp_api.py", "business"],
    ["../../deptmanager/deptbot/cogs/departments.py", "../../deptmanager/deptbot/fbrp_api.py", "department"],
  ];
  for (const [cogPath, apiPath, family] of roots) {
    const [cog, api] = await Promise.all([
      readFile(new URL(cogPath, import.meta.url), "utf8"),
      readFile(new URL(apiPath, import.meta.url), "utf8"),
    ]);
    assert.match(cog, /api\.link_access_role/);
    assert.match(api, /\/api\/gangs\/org\/access-role/);
    assert.match(api, new RegExp(`"family": "${family}"`));
  }
});
