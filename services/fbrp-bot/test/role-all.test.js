import assert from "node:assert/strict";
import test from "node:test";

import { commands } from "../src/commands.js";
import { createRoleMembershipCommands } from "../src/role-membership.js";

const MAIN = "100000000000000001";
const ROLE_ID = "200000000000000002";

function setup({ guildId = MAIN, roleOver = {}, staffBound = false, protectedRole = false, members, press = "confirm", owner = false, failFor = [] } = {}) {
  const calls = [];
  const role = { id: ROLE_ID, name: "Example", managed: false, editable: true, permissions: { bitfield: 0n }, ...roleOver };
  const people = members || [
    { id: "1", has: false, bot: false },
    { id: "2", has: true, bot: false },
    { id: "3", has: false, bot: false },
    { id: "4", has: false, bot: true },
  ];
  const fakeMember = (p) => ({
    id: p.id,
    user: { bot: p.bot },
    roles: {
      cache: { has: () => p.has },
      add: async (_r, reason) => { if (failFor.includes(p.id)) throw new Error("nope"); calls.push(["add", p.id, reason]); },
      remove: async (_r, reason) => { if (failFor.includes(p.id)) throw new Error("nope"); calls.push(["remove", p.id, reason]); },
    },
  });
  const edits = [];
  const interaction = {
    guildId,
    guild: { members: { fetch: async () => new Map(people.map((p) => [p.id, fakeMember(p)])) } },
    user: { id: "900", tag: "exec#0001" },
    options: { getRole: () => role },
    editReply: async (payload) => { edits.push(payload); },
    fetchReply: async () => ({
      awaitMessageComponent: async () => {
        if (press === "timeout") throw new Error("time");
        return { customId: `${interaction.__name}:${press}`, user: { id: "900" }, deferUpdate: async () => {} };
      },
    }),
  };
  const dependencies = {
    db: {
      one: async (sql) => {
        if (sql.includes("staff_roster_ranks")) return staffBound ? { hit: 1 } : null;
        if (sql.includes("protected_roles")) return protectedRole ? { protected: 1 } : null;
        throw new Error(`Unexpected query: ${sql}`);
      },
    },
    audit: async (...args) => calls.push(["audit", ...args]),
    requireMinimumStaffRank: async (_i, rank) => calls.push(["rank", rank]),
    requireProtectedRoleManagerId: (id) => calls.push(["protected-manager", id]),
    card: (title, options) => ({ title, ...options }),
    colors: { success: 1, warning: 2 },
    roleRef: (id) => `<@&${id}>`,
    who: (id) => `<@${id}>`,
    log: async (...args) => calls.push(["log", ...args]),
    mainGuildId: MAIN,
    dangerousPermissions: 8n,
    isBotOwner: () => owner,
    confirmMs: 50,
  };
  const { bulk } = createRoleMembershipCommands(dependencies);
  const run = (sub) => { interaction.__name = sub === "assign" ? "roleall" : "unroleall"; return bulk(interaction, sub); };
  return { calls, edits, run, interaction };
}
const changes = (calls, kind) => calls.filter(([n]) => n === kind).map(([, id]) => id);
const text = (r) => (r.embeds ? r.embeds[0] : r);

test("registers /roleall and /unroleall with one required role option and no DM use", () => {
  for (const name of ["roleall", "unroleall"]) {
    const command = commands.find((c) => c.name === name);
    assert.ok(command, name);
    assert.deepEqual(command.options.map((o) => [o.name, o.required]), [["role", true]]);
    assert.equal(command.dm_permission, false);
  }
});

test("both commands are wired in the bot with the main server id and Executive Management gate", async () => {
  const { readFile } = await import("node:fs/promises");
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /roleall: \(i\) => roleMembership\.bulk\(i, "assign"\)/);
  assert.match(index, /unroleall: \(i\) => roleMembership\.bulk\(i, "unassign"\)/);
  assert.match(index, /mainGuildId: MAIN_GUILD_ID/);
  assert.match(index, /DANGEROUS_ROLE_PERMISSIONS,\n\s+isBotOwner,\n\} from "\.\/sync\.js"/);
  const module = await readFile(new URL("../src/role-membership.js", import.meta.url), "utf8");
  assert.match(module, /requireMinimumStaffRank\(i, "Executive Management"/);
});

test("they refuse any server except the main one, before checking anything else", async () => {
  const { run, calls } = setup({ guildId: "999" });
  await assert.rejects(run("assign"), /only be used in the main Florida Bay Discord/);
  assert.equal(calls.length, 0);
});

test("the Executive Management rank is required and checked first", async () => {
  const { run, calls } = setup();
  await run("assign");
  assert.deepEqual(calls.find(([n]) => n === "rank"), ["rank", "Executive Management"]);
});

test("unsafe roles are refused: everyone, managed, uneditable, dangerous (unless bot owner), staff-bound", async () => {
  await assert.rejects(setup({ roleOver: { id: MAIN } }).run("assign"), /everyone/);
  await assert.rejects(setup({ roleOver: { managed: true } }).run("assign"), /managed/);
  await assert.rejects(setup({ roleOver: { editable: false } }).run("assign"), /cannot edit/);
  await assert.rejects(setup({ roleOver: { permissions: { bitfield: 8n } } }).run("assign"), /dangerous Discord permissions/);
  const ownerRun = setup({ roleOver: { permissions: { bitfield: 8n } }, owner: true });
  assert.equal((await ownerRun.run("assign")).embeds[0].title, "Role given to everyone");
  const staff = setup({ staffBound: true });
  await assert.rejects(staff.run("assign"), /staff, ACE or synced role/);
  assert.equal(changes(staff.calls, "add").length, 0);
});

test("a protected role needs a Co-Owner as well", async () => {
  const { run, calls } = setup({ protectedRole: true });
  await run("assign");
  assert.deepEqual(calls.filter(([n]) => n === "rank").map((c) => c[1]), ["Executive Management", "Co-Owner"]);
  assert.ok(calls.some(([n]) => n === "protected-manager"));
});

test("/roleall gives the role only to humans who lack it, after the confirmation, and logs it", async () => {
  const { run, calls, edits } = setup();
  const result = await run("assign");
  assert.deepEqual(changes(calls, "add"), ["1", "3"], "the holder and the bot are skipped");
  assert.match(edits[0].embeds[0].description, /\*\*2\*\* of \*\*3\*\* members/);
  assert.equal(edits[0].components.length, 1);
  assert.match(text(result).description, /given to \*\*2\*\* members/);
  assert.deepEqual(result.components, []);
  const audit = calls.find(([n]) => n === "audit");
  assert.equal(audit[2], "role.roleall");
  assert.deepEqual([audit[4].targeted, audit[4].changed, audit[4].failed], [2, 2, 0]);
  assert.ok(calls.some(([n]) => n === "log"));
});

test("/unroleall removes the role only from the humans who hold it", async () => {
  const { run, calls } = setup();
  const result = await run("unassign");
  assert.deepEqual(changes(calls, "remove"), ["2"]);
  assert.match(text(result).description, /removed from \*\*1\*\* member\./);
});

test("cancelling or letting the confirmation time out changes nothing", async () => {
  for (const press of ["cancel", "timeout"]) {
    const { run, calls } = setup({ press });
    const result = await run("assign");
    assert.equal(result.embeds[0].title, "Cancelled");
    assert.equal(changes(calls, "add").length, 0);
    assert.ok(!calls.some(([n]) => n === "audit"));
  }
});

test("failures are counted and reported, and the rest still succeed", async () => {
  const { run, calls } = setup({ failFor: ["1"] });
  const result = await run("assign");
  assert.deepEqual(changes(calls, "add"), ["3"]);
  assert.match(text(result).description, /\*\*1\*\* could not be changed/);
});

test("nothing to do is reported without asking for confirmation", async () => {
  const { run, edits } = setup({ members: [{ id: "1", has: true, bot: false }, { id: "2", has: true, bot: true }] });
  const result = await run("assign");
  assert.equal(result.title, "Nothing to change");
  assert.equal(edits.length, 0);
});

test("a second bulk change in the same server is refused while one is running", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = setup();
  const members = await first.interaction.guild.members.fetch();
  const slow = members.get("1");
  const originalAdd = slow.roles.add;
  first.interaction.guild.members.fetch = async () => members;
  slow.roles.add = async (...args) => { await gate; return originalAdd(...args); };
  const running = first.run("assign");
  await new Promise((r) => setTimeout(r, 20)); // the first run is now inside its role loop
  await assert.rejects(first.run("assign"), /already running in this server/);
  release();
  await running;
  assert.deepEqual(changes(first.calls, "add"), ["1", "3"]);
  // and the guard clears afterwards
  assert.equal((await first.run("unassign")).embeds[0].title, "Role removed from everyone");
});
