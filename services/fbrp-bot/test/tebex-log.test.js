import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TEBEX_LOG_CHANNEL_ID, createTebexLogger, formatTebexEvent } from "../src/tebex-log.js";

const sale = {
  id: "w1",
  type: "payment.completed",
  subject: {
    transaction_id: "tbx-1",
    status: { id: 1, description: "Complete" },
    price_paid: { amount: 15, currency: "USD" },
    payment_method: { name: "Card" },
    customer: { email: "buyer@example.com", ip: "203.0.113.5", username: { username: "BuyerName" } },
    products: [{ id: 7761883, name: "Australian Vehicle Pack", quantity: 1 }],
  },
};

test("Tebex logs go to the configured Discord channel", () => {
  assert.equal(TEBEX_LOG_CHANNEL_ID, "1570228210426183773");
});

test("a sale embed lists transaction, buyer, products and amount but never email or IP", () => {
  const embed = formatTebexEvent(sale, { status: "done", discordId: "972327470411964456", roles: 1 });
  const text = JSON.stringify(embed);
  assert.equal(embed.title, "Sale completed");
  assert.match(text, /tbx-1/);
  assert.match(text, /Australian Vehicle Pack/);
  assert.match(text, /15\.00 USD/);
  assert.match(text, /<@972327470411964456>/);
  assert.doesNotMatch(text, /buyer@example\.com|203\.0\.113\.5/);
});

test("refunds, subscriptions and failures are labelled", () => {
  assert.equal(formatTebexEvent({ ...sale, type: "payment.refunded" }).title, "Payment refunded");
  assert.equal(formatTebexEvent({ id: "w2", type: "recurring-payment.ended", subject: { reference: "tbx-r-1" } }).title, "Subscription ended");
  const failed = formatTebexEvent(sale, { status: "failed", note: "boom" });
  assert.match(failed.title, /fulfillment failed/);
  assert.match(JSON.stringify(failed), /boom/);
  assert.equal(formatTebexEvent({ id: "w3", type: "something.new" }).title, "something.new");
});

test("the logger posts without pings and never throws", async () => {
  const sent = [];
  const logger = createTebexLogger({ client: { channels: { fetch: async (id) => ({ send: async (payload) => sent.push({ id, payload }) }) } } });
  assert.equal(await logger.event(sale, { status: "done" }), true);
  assert.equal(sent[0].id, TEBEX_LOG_CHANNEL_ID);
  assert.deepEqual(sent[0].payload.allowedMentions, { parse: [] });
  await logger.store("Checkout started", [["Discord", "<@1> (1)"]]);
  assert.equal(sent.length, 2);
  const broken = createTebexLogger({ client: { channels: { fetch: async () => { throw new Error("no access"); } } }, warn: () => {} });
  assert.equal(await broken.event(sale, {}), false);
});

test("fulfillment and the store endpoints are wired to the logger", async () => {
  const [index, fulfillment, panel] = await Promise.all([
    readFile(new URL("../src/index.js", import.meta.url), "utf8"),
    readFile(new URL("../src/tebex-fulfillment.js", import.meta.url), "utf8"),
    readFile(new URL("../src/web-panel.js", import.meta.url), "utf8"),
  ]);
  assert.match(index, /createTebexFulfillment\(\{ client, db, audit, logger: tebexLog \}\)/);
  assert.match(fulfillment, /logger\?\.event\(event/);
  assert.match(panel, /tebexLog\?\.store\("Checkout started"/);
});
