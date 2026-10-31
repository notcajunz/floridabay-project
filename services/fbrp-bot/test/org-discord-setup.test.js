import assert from "node:assert/strict";
import test from "node:test";
import { PermissionFlagsBits as P } from "discord.js";

import { PALM_BEACH_HOTRODS as PBH, applyGuild, applyRanks, channelOverwrites, validateBlueprint } from "../src/org-discord-setup.js";
import { RANK_PERMISSIONS } from "../src/org-authority.js";

const category = (name) => PBH.categories.find((entry) => entry.name.includes(name));
const channel = (cat, name) => category(cat).channels.find((entry) => entry.name === name);

test("the Palm Beach Hotrods blueprint is valid and its ranks fit the website limits", () => {
  assert.equal(validateBlueprint(PBH), true);
  const ranks = PBH.roles.filter((role) => role.rank);
  assert.ok(ranks.length >= 5 && ranks.length <= 25);
  for (const role of ranks) {
    assert.ok(role.rank.level >= 1 && role.rank.level <= 99);
    assert.ok(role.name.length >= 2 && role.name.length <= 40);
    assert.ok(Object.keys(role.rank.perms).every((key) => RANK_PERMISSIONS.some((perm) => perm.key === key)));
  }
  assert.ok(PBH.roles.every((role) => !role.color || /^#[0-9a-f]{6}$/i.test(role.color)));
});

test("lower ranks never hold a permission a higher rank lacks", () => {
  const ranks = PBH.roles.filter((role) => role.rank);
  for (let i = 1; i < ranks.length; i++)
    for (const key of Object.keys(ranks[i].rank.perms))
      assert.ok(ranks[i - 1].rank.perms[key], `${ranks[i - 1].name} lacks ${key} held by ${ranks[i].name}`);
});

test("information channels are public but read-only, staff areas are hidden from everyone", () => {
  const rules = channelOverwrites(PBH, category("INFORMATION"), channel("INFORMATION", "rules"));
  assert.ok(rules["@everyone"].allow & P.ViewChannel);
  assert.ok(rules["@everyone"].deny & P.SendMessages);
  assert.ok(rules.owner.allow & P.SendMessages);
  assert.equal(rules.mechanic, undefined);

  const shop = channelOverwrites(PBH, category("SHOP FLOOR"), channel("SHOP FLOOR", "employee-chat"));
  assert.ok(shop["@everyone"].deny & P.ViewChannel);
  assert.ok(shop.apprentice.allow & P.SendMessages);

  const memo = channelOverwrites(PBH, category("SHOP FLOOR"), channel("SHOP FLOOR", "shop-announcements"));
  assert.ok(memo.apprentice.deny & P.SendMessages);
  assert.ok(memo.manager.allow & P.SendMessages);

  const mgmt = channelOverwrites(PBH, category("MANAGEMENT"), channel("MANAGEMENT", "management-chat"));
  assert.ok(mgmt["@everyone"].deny & P.ViewChannel);
  assert.equal(mgmt.mechanic, undefined);
  assert.ok(mgmt.gm.allow & P.ViewChannel);
});

test("customer channels let customers write without conflicting allow and deny bits", () => {
  const commissions = channelOverwrites(PBH, category("SHOWROOM"), channel("SHOWROOM", "commission-requests"));
  assert.ok(commissions["@everyone"].deny & P.ViewChannel);
  assert.ok(commissions.customer.allow & P.SendMessages);
  for (const entry of Object.values(commissions)) assert.equal(entry.allow & entry.deny, 0n);
  for (const cat of PBH.categories)
    for (const item of cat.channels)
      for (const entry of Object.values(channelOverwrites(PBH, cat, item))) assert.equal(entry.allow & entry.deny, 0n, `${item.name} has conflicting bits`);
});

function fakeApi(state) {
  const calls = [];
  let next = 1000;
  return {
    calls,
    async get(route) {
      if (route === "/guilds/G") return { id: "G" };
      if (route === "/guilds/G/roles") return state.roles;
      if (route === "/guilds/G/channels") return state.channels;
      if (route.startsWith("/guilds/G/members/")) return { roles: ["B"] };
      if (route.includes("/messages")) return state.messages;
      throw new Error(`unexpected GET ${route}`);
    },
    async post(route, body) { calls.push(["post", route, body]); const created = { id: String(next++), ...body }; if (route.endsWith("/roles")) state.roles.push({ position: 1, managed: false, ...created }); if (route.endsWith("/channels")) state.channels.push(created); return created; },
    async patch(route, body) { calls.push(["patch", route, body]); return {}; },
  };
}

test("applyGuild creates every role and channel, orders roles under the bot and posts intros once", async () => {
  const state = { roles: [{ id: "G", name: "@everyone", permissions: "0", position: 0 }, { id: "B", name: "Bot", permissions: "8", position: 40, managed: true }], channels: [], messages: [] };
  const api = fakeApi(state);
  const result = await applyGuild(api, "G", PBH, { botId: "BOT" });
  assert.equal(result.rolesCreated.length, PBH.roles.length);
  assert.equal(result.categoriesCreated.length, PBH.categories.length);
  assert.equal(result.channelsCreated.length, PBH.categories.reduce((n, cat) => n + cat.channels.length, 0));
  assert.equal(result.posted.length, 3);
  const order = api.calls.find(([method, route]) => method === "patch" && route === "/guilds/G/roles")[2];
  assert.equal(order.length, PBH.roles.length);
  assert.ok(order[0].position > order.at(-1).position && order[0].position < 40);
  assert.ok(!api.calls.some(([method]) => method === "delete"));
  const welcome = api.calls.find(([, route, body]) => route.endsWith("/messages") && body.embeds[0].title.includes("Welcome"))[2];
  assert.ok(/<#\d+>/.test(welcome.embeds[0].fields[0].value), "channel placeholders become mentions");
  assert.deepEqual(welcome.allowed_mentions, { parse: [] });
});

test("applyGuild is idempotent: a second run creates nothing and keeps existing intro messages", async () => {
  const state = { roles: [{ id: "G", name: "@everyone", permissions: "0", position: 0 }, { id: "B", name: "Bot", permissions: "8", position: 40, managed: true }], channels: [], messages: [] };
  await applyGuild(fakeApi(state), "G", PBH, { botId: "BOT" });
  for (const role of state.roles) if (role.id !== "G" && role.id !== "B") { const spec = PBH.roles.find((entry) => entry.name === role.name); role.permissions = String(spec.permissions); }
  state.messages = [{ id: "m" }];
  const api = fakeApi(state);
  const again = await applyGuild(api, "G", PBH, { botId: "BOT" });
  assert.deepEqual(again.rolesCreated, []);
  assert.deepEqual(again.categoriesCreated, []);
  assert.deepEqual(again.channelsCreated, []);
  assert.deepEqual(again.posted, []);
});

test("dry run changes nothing", async () => {
  const state = { roles: [{ id: "G", name: "@everyone", permissions: "0", position: 0 }], channels: [], messages: [] };
  const api = fakeApi(state);
  await applyGuild(api, "G", PBH, { dryRun: true });
  assert.deepEqual(api.calls, []);
});

test("applyRanks writes ranks with permissions and binds each to its Discord role, updating on re-run", async () => {
  const ranks = new Map();
  const bound = [];
  const query = async (sql, params) => {
    if (sql.startsWith("SELECT id FROM org_ranks")) return ranks.has(params[1]) ? [{ id: ranks.get(params[1]) }] : [];
    if (sql.startsWith("INSERT INTO org_ranks")) { ranks.set(params[1], ranks.size + 1); return { insertId: ranks.size }; }
    if (sql.startsWith("UPDATE org_ranks")) return {};
    if (sql.startsWith("DELETE FROM org_rank_roles")) { for (let i = bound.length - 1; i >= 0; i--) if (bound[i][0] === params[1]) bound.splice(i, 1); return {}; }
    if (sql.startsWith("INSERT INTO org_rank_roles")) { bound.push(params); return {}; }
    throw new Error(sql);
  };
  const roleIds = Object.fromEntries(PBH.roles.map((role) => [role.key, `role-${role.key}`]));
  const first = await applyRanks(query, { id: 6 }, "G", roleIds, PBH);
  assert.equal(first.length, PBH.roles.filter((role) => role.rank).length);
  assert.ok(first.every((entry) => entry.created));
  const second = await applyRanks(query, { id: 6 }, "G", roleIds, PBH);
  assert.ok(second.every((entry) => !entry.created));
  assert.equal(bound.length, first.length);
  assert.ok(bound.every((row) => row[2] === "G" && String(row[3]).startsWith("role-")));
});
