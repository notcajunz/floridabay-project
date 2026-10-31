import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { TEBEX_PRODUCTS } from "../src/tebex-fulfillment.js";

const kit = new URL("../../../docs/tebex/", import.meta.url);

test("Tebex setup kit covers every fulfillment product with upload-ready art", async () => {
  const csv = await readFile(new URL("package-settings.csv", kit), "utf8");
  const rows = csv.trim().split("\n").slice(1).map((line) => {
    const [order, name, category, price, payment, userLimit, slug, image, fulfillment] = line.split(",");
    return { order: Number(order), name, category, price: Number(price), payment, userLimit, slug, image, fulfillment };
  });
  assert.equal(rows.length, 26);
  assert.deepEqual(rows.map((row) => row.order), Array.from({ length: 26 }, (_, index) => index + 1));
  assert.deepEqual(rows.map((row) => row.name), TEBEX_PRODUCTS.map((product) => product.name));
  assert.deepEqual(rows.map((row) => row.price), TEBEX_PRODUCTS.map((product) => product.price));
  assert.deepEqual(rows.map((row) => row.payment), TEBEX_PRODUCTS.map((product) => product.type === "subscription" ? "monthly" : "one-time"));

  for (const row of rows) {
    assert.match(row.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const data = await readFile(new URL(`package-images/${row.image}`, kit));
    assert.equal(data.toString("ascii", 1, 4), "PNG");
    assert.equal(data.readUInt32BE(16), 165, `${row.image} width`);
    assert.equal(data.readUInt32BE(20), 165, `${row.image} height`);
    assert.ok(data.includes(Buffer.from("tRNS")), `${row.image} keeps transparency`);
  }
});

test("Tebex setup guide includes descriptions, webhook events, and the artwork index", async () => {
  const guide = await readFile(new URL("README.md", kit), "utf8");
  for (const product of TEBEX_PRODUCTS) assert.match(guide, new RegExp(`### ${product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  for (const event of [
    "payment.completed", "payment.refunded", "payment.dispute.opened", "payment.dispute.won",
    "payment.dispute.lost", "payment.dispute.closed", "recurring-payment.started",
    "recurring-payment.renewed", "recurring-payment.ended",
  ]) assert.match(guide, new RegExp(event.replaceAll(".", "\\.")));
  await access(new URL("package-images/package-logo-contact-sheet.png", kit));
});
