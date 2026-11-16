import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { BUNDLE_ROLE_IDS, BUNDLE_SOURCE_ROLE_ID } from "./role-bundle.js";

export const TEBEX_MAIN_GUILD_ID = "1557594282976747550";
export const TEBEX_DEVOPS_INVITE = "https://discord.gg/4gCvKJRGxk";

const roleProduct = (id, name, price, type, roleId, extraRoles = []) => Object.freeze({
  id, name, price, type, roles: Object.freeze([roleId, ...extraRoles]),
});
const manualProduct = (id, name, price) => Object.freeze({ id, name, price, type: "single", roles: Object.freeze([]), manual: true });

/** Canonical catalog. Stable Tebex package IDs are authoritative for fulfillment. */
export const TEBEX_PRODUCTS = Object.freeze([
  roleProduct(7761877, "Founder's Edition", 49.99, "subscription", BUNDLE_SOURCE_ROLE_ID, BUNDLE_ROLE_IDS),
  roleProduct(7761881, "VIP Membership", 14.99, "subscription", "1570227967572054146"),
  roleProduct(7761883, "Australian Vehicle Pack", 15, "single", "1570227968293343327"),
  roleProduct(7761884, "UK Car Pack", 15, "single", "1570227969924931618"),
  roleProduct(7761885, "JDM Car Pack", 15, "single", "1570227984428834879"),
  roleProduct(7761886, "Aviation Pack", 15, "single", "1570227988119949438"),
  roleProduct(7761888, "Queue Bypass", 5, "subscription", "1570227972646903853"),
  roleProduct(7761891, "Whitelist Package", 5, "subscription", "1570227973292822558"),
  roleProduct(7761892, "Streamer Package", 10, "single", "1570227975696420935"),
  roleProduct(7761893, "Custom Weapons", 15, "single", "1570227975167942677"),
  roleProduct(7761894, "Any Organization", 25, "single", "1570228686274175110"),
  manualProduct(7761895, "LEO Department", 45),
  manualProduct(7761896, "Gang", 40),
  manualProduct(7761897, "Business", 35),
  manualProduct(7761898, "Headtag/Gangtag", 20),
  manualProduct(7761899, "Personal Vehicle", 30),
  manualProduct(7761900, "Bulletproof Add-on", 10),
  manualProduct(7761901, "Custom Handling Add-on", 10),
  manualProduct(7761903, "Custom Organization Bot", 50),
  manualProduct(7761904, "Car Club", 35),
  manualProduct(7761907, "Security", 25),
  manualProduct(7761908, "Transport", 45),
  manualProduct(7761910, "Miscellaneous Businesses", 25),
  roleProduct(7767181, "German Car Pack", 35, "single", "1570227969048453171"),
  roleProduct(7767259, "Mk2 Weapons", 15, "single", "1570227974018572288"),
  roleProduct(7768904, "DevOps+", 20, "subscription", "1570224070354542713"),
]);

const compact = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[’‘]/g, "'")
  .replace(/[–—]/g, "-")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const PRODUCT_BY_NAME = new Map(TEBEX_PRODUCTS.map((product) => [compact(product.name), product]));
const PRODUCT_BY_ID = new Map(TEBEX_PRODUCTS.map((product) => [String(product.id), product]));
const SNOWFLAKE = /^\d{17,20}$/;
const HANDLED = new Set([
  "payment.completed",
  "payment.refunded",
  "payment.dispute.opened",
  "payment.dispute.won",
  "payment.dispute.lost",
  "payment.dispute.closed",
  "recurring-payment.started",
  "recurring-payment.renewed",
  "recurring-payment.ended",
]);

export class TebexWebhookError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "TebexWebhookError";
    this.status = status;
  }
}

export function tebexSignature(rawBody, secret) {
  const digest = createHash("sha256").update(rawBody).digest("hex");
  return createHmac("sha256", String(secret)).update(digest).digest("hex");
}

export function verifyTebexSignature(rawBody, signature, secret) {
  const given = String(signature || "").trim().toLowerCase();
  if (!secret || !/^[a-f0-9]{64}$/.test(given)) return false;
  const expected = tebexSignature(rawBody, secret);
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

export function productSpec(product) {
  const id = String(product?.id || "").trim();
  if (id) return PRODUCT_BY_ID.get(id) || null;
  return PRODUCT_BY_NAME.get(compact(product?.name)) || null;
}

function customDiscordId(value) {
  if (!value || typeof value !== "object") return "";
  for (const key of ["discord_id", "discordId", "discord", "discord_user_id"])
    if (SNOWFLAKE.test(String(value[key] || ""))) return String(value[key]);
  return "";
}

export function paymentDiscordId(payment) {
  const direct = customDiscordId(payment?.custom);
  if (direct) return direct;
  for (const product of payment?.products || []) {
    const custom = customDiscordId(product?.custom);
    if (custom) return custom;
    for (const variable of product?.variables || []) {
      if (!["discord", "discord_id", "discordid", "discord_user_id"].includes(compact(variable?.identifier).replace(/\s/g, "_"))) continue;
      const option = String(variable?.option || variable?.value || "");
      if (SNOWFLAKE.test(option)) return option;
    }
  }
  return "";
}

function paymentFor(event) {
  if (event.type.startsWith("payment.")) return event.subject || null;
  if (event.type === "recurring-payment.started") return event.subject?.initial_payment || event.subject?.last_payment || null;
  if (event.type === "recurring-payment.renewed") return event.subject?.last_payment || event.subject?.initial_payment || null;
  return null;
}

function activePaymentEvent(event, payment) {
  if (["payment.completed", "payment.dispute.won", "recurring-payment.started", "recurring-payment.renewed"].includes(event.type)) return true;
  if (event.type === "payment.dispute.closed") return Number(payment?.status?.id) === 1;
  return false;
}

function inactivePaymentEvent(event, payment) {
  if (["payment.refunded", "payment.dispute.opened", "payment.dispute.lost"].includes(event.type)) return true;
  if (event.type === "payment.dispute.closed") return Number(payment?.status?.id) !== 1;
  return false;
}

const sourceKey = (transaction, product) => `${String(transaction || "unknown")}:${String(product?.id || compact(product?.name))}`.slice(0, 190);
const uniquePairs = (pairs) => [...new Map(pairs.map((pair) => [`${pair.discordId}:${pair.roleId}`, pair])).values()];

export function webhookPlan(event) {
  if (!event || typeof event !== "object" || !event.id || !event.type)
    throw new TebexWebhookError("Malformed Tebex webhook.");
  if (event.type === "validation.webhook") return { kind: "validation", id: String(event.id) };
  if (!HANDLED.has(String(event.type))) return { kind: "ignored", type: String(event.type) };
  if (event.type === "recurring-payment.ended") {
    const reference = String(event.subject?.reference || "");
    if (!reference) throw new TebexWebhookError("Recurring webhook is missing its reference.", 422);
    return { kind: "recurring-end", reference };
  }

  const payment = paymentFor(event);
  if (!payment) throw new TebexWebhookError("Payment webhook is missing its payment.", 422);
  const transaction = String(payment.transaction_id || "");
  if (!transaction) throw new TebexWebhookError("Payment webhook is missing its transaction ID.", 422);
  const products = (payment.products || []).map((product) => ({ product, spec: productSpec(product) })).filter(({ spec }) => spec);
  if (!products.length) return { kind: "ignored", type: String(event.type), transaction };
  const active = activePaymentEvent(event, payment);
  const inactive = inactivePaymentEvent(event, payment);
  if (!active && !inactive) return { kind: "ignored", type: String(event.type), transaction };
  const discordId = paymentDiscordId(payment);
  if (active && products.some(({ spec }) => spec.roles.length) && !discordId)
    return { kind: "attention", transaction, error: "A role package payment did not include a verified Discord ID." };
  const recurringReference = String(event.subject?.reference || payment.recurring_payment_reference || "");
  return {
    kind: active ? "activate" : "deactivate",
    transaction,
    recurringReference,
    discordId,
    entries: products.flatMap(({ product, spec }) => spec.roles.map((roleId) => ({
      sourceKey: sourceKey(transaction, product),
      transaction,
      recurringReference,
      productId: String(product.id || ""),
      productName: spec.name,
      discordId,
      roleId,
    }))),
  };
}

export function createTebexFulfillment({ client, db, audit, logger, guildId = TEBEX_MAIN_GUILD_ID, secret = process.env.TEBEX_WEBHOOK_SECRET } = {}) {
  const configured = Boolean(String(secret || "").trim());

  async function markEvent(event, status, error = null) {
    const stamp = Date.now();
    await db.query(
      `INSERT INTO tebex_webhook_events(webhook_id,event_type,status,payload,error,received_at,processed_at)
       VALUES(?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE status=VALUES(status),error=VALUES(error),processed_at=VALUES(processed_at)`,
      [String(event.id), String(event.type), status, JSON.stringify(event), error ? String(error).slice(0, 500) : null, stamp, status === "processing" ? null : stamp],
    );
  }

  async function roleState(discordId, roleId, member) {
    let state = await db.one("SELECT * FROM tebex_store_role_states WHERE discord_id=? AND role_id=?", [discordId, roleId]);
    if (state) return state;
    const botManaged = member ? !member.roles.cache.has(roleId) : true;
    await db.query(
      "INSERT IGNORE INTO tebex_store_role_states(discord_id,role_id,bot_managed,created_at,updated_at) VALUES(?,?,?,?,?)",
      [discordId, roleId, botManaged ? 1 : 0, Date.now(), Date.now()],
    );
    state = await db.one("SELECT * FROM tebex_store_role_states WHERE discord_id=? AND role_id=?", [discordId, roleId]);
    return state;
  }

  async function reconcileRole(discordId, roleId) {
    const active = await db.one("SELECT COUNT(*) count FROM tebex_store_entitlements WHERE discord_id=? AND role_id=? AND active=TRUE", [discordId, roleId]);
    const wanted = Number(active?.count || 0) > 0;
    const guild = client.guilds.cache.get(String(guildId));
    if (!guild) throw new Error(`Main Discord ${guildId} is unavailable.`);
    const member = await guild.members.fetch(String(discordId)).catch(() => null);
    let state = await db.one("SELECT * FROM tebex_store_role_states WHERE discord_id=? AND role_id=?", [discordId, roleId]);
    if (wanted && !state) state = await roleState(discordId, roleId, member);
    if (!wanted && !state) return { changed: false, pending: false };
    if (!member) {
      if (!wanted) await db.query("DELETE FROM tebex_store_role_states WHERE discord_id=? AND role_id=?", [discordId, roleId]);
      return { changed: false, pending: wanted, reason: "member-not-in-server" };
    }
    const role = guild.roles.cache.get(String(roleId));
    if (!role || role.managed || !role.editable) return { changed: false, pending: wanted, reason: "role-unavailable" };
    const held = member.roles.cache.has(String(roleId));
    if (wanted && state?.bot_managed && !held) {
      await member.roles.add(String(roleId), "Tebex purchase entitlement");
      await db.query("UPDATE tebex_store_role_states SET updated_at=? WHERE discord_id=? AND role_id=?", [Date.now(), discordId, roleId]);
      return { changed: true, pending: false };
    }
    if (!wanted) {
      if (state?.bot_managed && held) await member.roles.remove(String(roleId), "Tebex entitlement ended");
      await db.query("DELETE FROM tebex_store_role_states WHERE discord_id=? AND role_id=?", [discordId, roleId]);
      return { changed: Boolean(state?.bot_managed && held), pending: false };
    }
    return { changed: false, pending: false };
  }

  async function reconcilePairs(pairs) {
    const results = [];
    for (const pair of uniquePairs(pairs)) results.push(await reconcileRole(pair.discordId, pair.roleId));
    return results;
  }

  async function activate(plan, event) {
    const entries = [...plan.entries].sort((a, b) => Number(a.roleId === BUNDLE_SOURCE_ROLE_ID) - Number(b.roleId === BUNDLE_SOURCE_ROLE_ID));
    for (const entry of entries) {
      await db.query(
        `INSERT INTO tebex_store_entitlements(source_key,transaction_id,recurring_reference,product_id,product_name,discord_id,role_id,active,granted_at,revoked_at,last_webhook_id)
         VALUES(?,?,?,?,?,?,?,TRUE,?,NULL,?)
         ON DUPLICATE KEY UPDATE recurring_reference=VALUES(recurring_reference),discord_id=VALUES(discord_id),role_id=VALUES(role_id),active=TRUE,revoked_at=NULL,last_webhook_id=VALUES(last_webhook_id)`,
        [entry.sourceKey, entry.transaction, entry.recurringReference || null, entry.productId || null, entry.productName, entry.discordId, entry.roleId, Date.now(), String(event.id)],
      );
    }
    return reconcilePairs(entries);
  }

  async function deactivate(plan, event) {
    const keys = [...new Set(plan.entries.map((entry) => entry.sourceKey))];
    if (!keys.length) return [];
    const placeholders = keys.map(() => "?").join(",");
    const existing = await db.query(`SELECT discord_id,role_id FROM tebex_store_entitlements WHERE source_key IN (${placeholders}) AND active=TRUE`, keys);
    await db.query(`UPDATE tebex_store_entitlements SET active=FALSE,revoked_at=?,last_webhook_id=? WHERE source_key IN (${placeholders})`, [Date.now(), String(event.id), ...keys]);
    return reconcilePairs(existing.map((row) => ({ discordId: String(row.discord_id), roleId: String(row.role_id) })));
  }

  async function endRecurring(plan, event) {
    const existing = await db.query("SELECT discord_id,role_id FROM tebex_store_entitlements WHERE recurring_reference=? AND active=TRUE", [plan.reference]);
    await db.query("UPDATE tebex_store_entitlements SET active=FALSE,revoked_at=?,last_webhook_id=? WHERE recurring_reference=?", [Date.now(), String(event.id), plan.reference]);
    return reconcilePairs(existing.map((row) => ({ discordId: String(row.discord_id), roleId: String(row.role_id) })));
  }

  async function handle(rawBody, signature) {
    if (!configured) throw new TebexWebhookError("Tebex webhook fulfillment is not configured.", 503);
    const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""));
    if (!verifyTebexSignature(raw, signature, secret)) throw new TebexWebhookError("Invalid Tebex webhook signature.", 401);
    let event;
    try { event = JSON.parse(raw.toString("utf8")); }
    catch { throw new TebexWebhookError("Malformed Tebex webhook JSON."); }
    const plan = webhookPlan(event);
    if (plan.kind === "validation") return { id: plan.id };
    const prior = await db.one("SELECT status FROM tebex_webhook_events WHERE webhook_id=?", [String(event.id)]);
    if (prior?.status === "done" || prior?.status === "attention") return { received: true, duplicate: true };
    await markEvent(event, "processing");
    const discordId = plan.discordId || paymentDiscordId(event.subject);
    try {
      let deliveries = [];
      if (plan.kind === "activate") deliveries = await activate(plan, event);
      else if (plan.kind === "deactivate") deliveries = await deactivate(plan, event);
      else if (plan.kind === "recurring-end") deliveries = await endRecurring(plan, event);
      const attention = plan.kind === "attention" || deliveries.some((item) => item.pending);
      const message = plan.error || (attention ? "One or more Discord roles are pending delivery." : null);
      await markEvent(event, attention ? "attention" : "done", message);
      await audit?.("tebex", `tebex.${event.type}`, plan.transaction || plan.reference || String(event.id), {
        webhook: String(event.id), status: attention ? "attention" : "done", roles: plan.entries?.length || 0,
      }).catch(() => {});
      await logger?.event(event, { status: attention ? "attention" : "done", note: message, discordId, roles: plan.entries?.length || 0 });
      return { received: true, attention };
    } catch (error) {
      await markEvent(event, "failed", error.message).catch(() => {});
      await logger?.event(event, { status: "failed", note: error.message, discordId });
      throw error;
    }
  }

  async function reconcileMember(discordId) {
    const roles = await db.query("SELECT DISTINCT role_id FROM tebex_store_entitlements WHERE discord_id=? AND active=TRUE", [String(discordId)]);
    return reconcilePairs(roles.map((row) => ({ discordId: String(discordId), roleId: String(row.role_id) })));
  }

  async function reconcileAll() {
    const rows = await db.query("SELECT DISTINCT discord_id,role_id FROM tebex_store_entitlements WHERE active=TRUE");
    return reconcilePairs(rows.map((row) => ({ discordId: String(row.discord_id), roleId: String(row.role_id) })));
  }

  const hasActiveRole = async (discordId, roleId) => Boolean(await db.one(
    "SELECT 1 active FROM tebex_store_entitlements WHERE discord_id=? AND role_id=? AND active=TRUE LIMIT 1",
    [String(discordId), String(roleId)],
  ));

  /** Every store purchase on record for a member, newest first, with whether each Discord role is currently held. */
  async function purchasesOf(discordId) {
    const rows = await db.query(
      `SELECT source_key,transaction_id,product_id,product_name,role_id,active,granted_at,revoked_at
         FROM tebex_store_entitlements WHERE discord_id=? ORDER BY granted_at DESC LIMIT 100`,
      [String(discordId)],
    );
    const guild = client.guilds.cache.get(String(guildId));
    const member = guild ? await guild.members.fetch(String(discordId)).catch(() => null) : null;
    const byKey = new Map();
    for (const row of rows) {
      const entry = byKey.get(row.source_key) || {
        transaction: String(row.transaction_id || ""), productId: String(row.product_id || ""), name: String(row.product_name || "Store item"),
        active: false, grantedAt: Number(row.granted_at) || 0, roles: [],
      };
      entry.active = entry.active || Boolean(row.active);
      entry.roles.push({ roleId: String(row.role_id), held: Boolean(member?.roles.cache.has(String(row.role_id))) });
      byKey.set(row.source_key, entry);
    }
    return { purchases: [...byKey.values()], inServer: Boolean(member) };
  }

  /** Re-applies every active purchase to the member and reports which Discord roles were missing and are now delivered. */
  async function redeem(discordId) {
    const roles = await db.query("SELECT DISTINCT role_id FROM tebex_store_entitlements WHERE discord_id=? AND active=TRUE", [String(discordId)]);
    if (!roles.length) return { active: 0, granted: [], pending: [], inServer: true };
    const guild = client.guilds.cache.get(String(guildId));
    const member = guild ? await guild.members.fetch(String(discordId)).catch(() => null) : null;
    if (!member) return { active: roles.length, granted: [], pending: roles.map((row) => String(row.role_id)), inServer: false };
    const missing = roles.map((row) => String(row.role_id)).filter((roleId) => !member.roles.cache.has(roleId));
    await reconcileMember(discordId);
    const fresh = await guild.members.fetch({ user: String(discordId), force: true }).catch(() => member);
    return {
      active: roles.length,
      granted: missing.filter((roleId) => fresh.roles.cache.has(roleId)),
      pending: missing.filter((roleId) => !fresh.roles.cache.has(roleId)),
      inServer: true,
    };
  }

  return { configured, handle, reconcileMember, reconcileAll, hasActiveRole, purchasesOf, redeem };
}
