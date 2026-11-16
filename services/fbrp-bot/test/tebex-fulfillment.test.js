import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  TEBEX_PRODUCTS,
  createTebexFulfillment,
  paymentDiscordId,
  productSpec,
  tebexSignature,
  verifyTebexSignature,
  webhookPlan,
} from "../src/tebex-fulfillment.js";
import { BUNDLE_ROLE_IDS, BUNDLE_SOURCE_ROLE_ID } from "../src/role-bundle.js";

const DISCORD_ID = "972327470411964456";
const productId = (name) => TEBEX_PRODUCTS.find((product) => product.name === name)?.id;
const payment = (name, id = productId(name), custom = { discord_id: DISCORD_ID }) => ({
  transaction_id: "tbx-test-1",
  custom,
  products: [{ id, name, custom: null, variables: [] }],
});

test("catalog defines all 26 products and Founder excludes Any Organization", () => {
  assert.equal(TEBEX_PRODUCTS.length, 26);
  const founder = productSpec({ name: "Founder’s Edition" });
  assert.deepEqual(founder.roles, [BUNDLE_SOURCE_ROLE_ID, ...BUNDLE_ROLE_IDS]);
  assert.ok(!founder.roles.includes("1570228686274175110"));
  assert.equal(productSpec({ name: "Any Org" }), null);
  assert.equal(productSpec({ name: "Any Organization" }).roles[0], "1570228686274175110");
  assert.equal(productSpec({ id: 7761881, name: "Renamed in Tebex" }).name, "VIP Membership");
  assert.equal(productSpec({ id: 9999999, name: "VIP Membership" }), null);
});

test("all canonical Tebex package IDs are positive and unique", () => {
  assert.equal(TEBEX_PRODUCTS.every((product) => Number.isSafeInteger(product.id) && product.id > 0), true);
  assert.equal(new Set(TEBEX_PRODUCTS.map((product) => product.id)).size, TEBEX_PRODUCTS.length);
});

test("Tebex signatures use the raw request bytes", () => {
  const body = Buffer.from('{"id":"webhook-1","type":"validation.webhook","subject":{}}');
  const secret = "private-test-secret";
  const signature = tebexSignature(body, secret);
  assert.equal(signature.length, 64);
  assert.equal(verifyTebexSignature(body, signature, secret), true);
  assert.equal(verifyTebexSignature(Buffer.from(`${body} `), signature, secret), false);
  assert.equal(verifyTebexSignature(body, "bad", secret), false);
});

test("payment Discord ID is read from basket custom data or a package variable", () => {
  assert.equal(paymentDiscordId(payment("VIP Membership")), DISCORD_ID);
  const variable = payment("VIP Membership", undefined, null);
  variable.products[0].variables = [{ identifier: "discord_id", option: DISCORD_ID }];
  assert.equal(paymentDiscordId(variable), DISCORD_ID);
  assert.equal(paymentDiscordId(payment("VIP Membership", undefined, { discord_id: "not-an-id" })), "");
});

test("completed payments create role activations and manual services create none", () => {
  const vip = webhookPlan({ id: "w1", type: "payment.completed", subject: payment("VIP Membership") });
  assert.equal(vip.kind, "activate");
  assert.equal(vip.discordId, DISCORD_ID);
  assert.deepEqual(vip.entries.map((entry) => entry.roleId), ["1570227967572054146"]);

  const manual = webhookPlan({ id: "w2", type: "payment.completed", subject: payment("Personal Vehicle") });
  assert.equal(manual.kind, "activate");
  assert.deepEqual(manual.entries, []);
});

test("role purchases without a verified Discord identity are retained for attention", () => {
  const plan = webhookPlan({ id: "w3", type: "payment.completed", subject: payment("Queue Bypass", undefined, null) });
  assert.equal(plan.kind, "attention");
  assert.match(plan.error, /Discord ID/);
});

test("refunds and ended subscriptions produce revocation plans", () => {
  const refund = webhookPlan({ id: "w4", type: "payment.refunded", subject: payment("Custom Weapons", undefined, null) });
  assert.equal(refund.kind, "deactivate");
  assert.equal(refund.entries[0].sourceKey, "tbx-test-1:7761893");
  const ended = webhookPlan({ id: "w5", type: "recurring-payment.ended", subject: { reference: "tbx-r-123" } });
  assert.deepEqual(ended, { kind: "recurring-end", reference: "tbx-r-123" });
});

test("validation webhook returns the challenge ID only after signature verification", async () => {
  const body = Buffer.from(JSON.stringify({ id: "validation-123", type: "validation.webhook", subject: {} }));
  const secret = "webhook-test-secret";
  const fulfillment = createTebexFulfillment({
    client: { guilds: { cache: new Map() } },
    db: { one: async () => null, query: async () => [] },
    secret,
  });
  assert.deepEqual(await fulfillment.handle(body, tebexSignature(body, secret)), { id: "validation-123" });
  await assert.rejects(() => fulfillment.handle(body, "0".repeat(64)), /Invalid Tebex webhook signature/);
});

test("the fulfillment ledger migration is registered with the game schema", async () => {
  const [migration, database] = await Promise.all([
    readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/084_tebex_fulfillment.sql", import.meta.url), "utf8"),
    readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/server/database.lua", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tebex_webhook_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tebex_store_entitlements/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS tebex_store_role_states/);
  assert.match(database, /migrations\/084_tebex_fulfillment\.sql/);
});

test("German Car Pack, Mk2 Weapons and DevOps+ purchases give exactly their Discord roles", () => {
  for (const [id, name, role] of [[7767181, "German Car Pack", "1570227969048453171"], [7767259, "Mk2 Weapons", "1570227974018572288"], [7768904, "DevOps+", "1570224070354542713"]]) {
    assert.deepEqual(productSpec({ id, name }).roles, [role]);
    const plan = webhookPlan({ id: `w-${id}`, type: "payment.completed", subject: payment(name, id) });
    assert.equal(plan.kind, "activate");
    assert.deepEqual(plan.entries.map((entry) => [entry.roleId, entry.discordId]), [[role, DISCORD_ID]]);
    const refund = webhookPlan({ id: `r-${id}`, type: "payment.refunded", subject: payment(name, id) });
    assert.equal(refund.kind, "deactivate");
    assert.equal(refund.entries[0].roleId, role);
  }
});

function memberStore(initialRoles) {
  const held = new Set(initialRoles);
  const member = { roles: { cache: { has: (id) => held.has(id) }, }, };
  const guild = { members: { fetch: async () => member }, roles: { cache: new Map() } };
  return { held, member, client: { guilds: { cache: new Map([["g1", guild]]) } } };
}

test("purchases lists a member's store items with whether each role is held", async () => {
  const { client } = memberStore(["role-a"]);
  const rows = [
    { source_key: "t1:1", transaction_id: "t1", product_id: 1, product_name: "German Car Pack", role_id: "role-a", active: 1, granted_at: 2000, revoked_at: null },
    { source_key: "t2:2", transaction_id: "t2", product_id: 2, product_name: "Mk2 Weapons", role_id: "role-b", active: 1, granted_at: 1000, revoked_at: null },
  ];
  const db = { query: async () => rows, one: async () => null };
  const { purchasesOf } = createTebexFulfillment({ client, db, guildId: "g1", secret: "x" });
  const result = await purchasesOf("42");
  assert.equal(result.inServer, true);
  assert.deepEqual(result.purchases.map((p) => [p.name, p.roles[0].held]), [["German Car Pack", true], ["Mk2 Weapons", false]]);
});

test("redeem reports nothing to redeem, a member outside the server, and roles it delivers", async () => {
  const none = createTebexFulfillment({ client: { guilds: { cache: new Map() } }, db: { query: async () => [], one: async () => null }, guildId: "g1", secret: "x" });
  assert.deepEqual(await none.redeem("42"), { active: 0, granted: [], pending: [], inServer: true });

  const away = createTebexFulfillment({
    client: { guilds: { cache: new Map([["g1", { members: { fetch: async () => { throw new Error("Unknown Member"); } } }]]) } },
    db: { query: async () => [{ role_id: "role-b" }], one: async () => null }, guildId: "g1", secret: "x",
  });
  assert.equal((await away.redeem("42")).inServer, false);
});
