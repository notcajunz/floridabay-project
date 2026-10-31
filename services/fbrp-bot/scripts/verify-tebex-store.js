import { readFile } from "node:fs/promises";
import { createTebexStore } from "../src/tebex-store.js";
import { TEBEX_PRODUCTS } from "../src/tebex-fulfillment.js";

const PROJECT_ID = 1913588;
const CATEGORY_ORDER = [
  "Memberships",
  "Vehicle Packs",
  "Exclusive Perks",
  "Custom Content",
  "DevOps Packages",
  "Business Slots",
];

const csvPath = new URL("../../../docs/tebex/package-settings.csv", import.meta.url);

function fail(errors, message) {
  errors.push(message);
}

function parseMatrix(contents) {
  const [header, ...lines] = contents.trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [columns[index], value])));
}

function packageLimitMatches(actual, expected) {
  if (expected === "none") return actual == null;
  if (expected === "1 lifetime") return Number(actual?.limit) === 1 && actual?.period_unit == null;
  return Number(actual?.limit) === 1 && Number(actual?.period_length) === 1 && actual?.period_unit === "monthly";
}

const store = createTebexStore();
if (!store.configured) throw new Error("TEBEX_PUBLIC_TOKEN is not configured.");

const [matrixText, catalog] = await Promise.all([readFile(csvPath, "utf8"), store.catalog()]);
const matrix = parseMatrix(matrixText);
const errors = [];

if (Number(catalog.store?.id) !== PROJECT_ID) fail(errors, `expected project ${PROJECT_ID}, received ${catalog.store?.id || "none"}`);
if (catalog.store?.currency !== "USD") fail(errors, `expected USD store currency, received ${catalog.store?.currency || "none"}`);
if (catalog.store?.supports_gifting !== false) fail(errors, "store gifting must be disabled");

const categories = Array.isArray(catalog.categories) ? catalog.categories : [];
const categoryNames = categories.map((category) => category.name);
if (JSON.stringify(categoryNames) !== JSON.stringify(CATEGORY_ORDER))
  fail(errors, `category order mismatch: ${categoryNames.join(" | ")}`);

const livePackages = categories.flatMap((category) =>
  (category.packages || []).map((product) => ({ ...product, categoryName: category.name })),
);
if (livePackages.length !== matrix.length) fail(errors, `expected ${matrix.length} packages, received ${livePackages.length}`);

const specByName = new Map(TEBEX_PRODUCTS.map((product) => [product.name, product]));
const liveByName = new Map(livePackages.map((product) => [product.name, product]));

for (const expected of matrix) {
  const live = liveByName.get(expected.name);
  const spec = specByName.get(expected.name);
  if (!live) {
    fail(errors, `${expected.name}: missing from live catalog`);
    continue;
  }
  if (!spec) {
    fail(errors, `${expected.name}: missing from fulfillment catalog`);
    continue;
  }
  if (Number(live.id) !== Number(spec.id)) fail(errors, `${expected.name}: package ID changed from ${spec.id} to ${live.id}`);
  if (live.categoryName !== expected.category) fail(errors, `${expected.name}: expected category ${expected.category}, received ${live.categoryName}`);
  if (live.slug !== expected.slug) fail(errors, `${expected.name}: expected slug ${expected.slug}, received ${live.slug}`);
  if (Number(live.base_price) !== Number(expected.price_usd)) fail(errors, `${expected.name}: expected $${expected.price_usd}, received $${live.base_price}`);
  if (live.currency !== "USD") fail(errors, `${expected.name}: expected USD, received ${live.currency}`);
  if (live.type !== (expected.payment === "monthly" ? "subscription" : "single")) fail(errors, `${expected.name}: payment type mismatch`);
  if (live.disable_quantity !== true) fail(errors, `${expected.name}: quantity is not locked`);
  if (live.disable_gifting !== true) fail(errors, `${expected.name}: gifting is enabled`);
  if (!packageLimitMatches(live.user_limit, expected.user_limit)) fail(errors, `${expected.name}: purchase limit mismatch`);
  if (!live.image) fail(errors, `${expected.name}: image is missing`);
  if (!String(live.description || "").trim()) fail(errors, `${expected.name}: description is missing`);
  if (expected.payment === "monthly" && (Number(live.expiry_period?.count) !== 1 || live.expiry_period?.unit !== "month"))
    fail(errors, `${expected.name}: subscription interval is not one month`);
}

for (const live of livePackages) if (!specByName.has(live.name)) fail(errors, `${live.name}: unexpected live package`);

if (errors.length) {
  console.error(`Tebex catalog verification failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Tebex catalog verified: project ${PROJECT_ID}, ${categories.length} categories, ${livePackages.length} packages, stable fulfillment IDs.`);
}
