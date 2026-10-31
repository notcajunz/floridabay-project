/** Discord log for everything the Tebex store does: sales, refunds, disputes, subscriptions and checkout. */
export const TEBEX_LOG_CHANNEL_ID = "1558258545672327188";

const COLOR = { green: 0x2ecc71, red: 0xe74c3c, orange: 0xf39c12, blue: 0x3498db, grey: 0x95a5a6 };

const EVENTS = {
  "payment.completed": ["Sale completed", COLOR.green],
  "payment.declined": ["Payment declined", COLOR.red],
  "payment.refunded": ["Payment refunded", COLOR.orange],
  "payment.dispute.opened": ["Dispute opened", COLOR.red],
  "payment.dispute.won": ["Dispute won", COLOR.green],
  "payment.dispute.lost": ["Dispute lost", COLOR.red],
  "payment.dispute.closed": ["Dispute closed", COLOR.grey],
  "recurring-payment.started": ["Subscription started", COLOR.green],
  "recurring-payment.renewed": ["Subscription renewed", COLOR.green],
  "recurring-payment.ended": ["Subscription ended", COLOR.orange],
  "recurring-payment.cancellation.requested": ["Subscription cancellation requested", COLOR.orange],
  "recurring-payment.cancellation.aborted": ["Subscription cancellation aborted", COLOR.blue],
  "recurring-payment.status.changed": ["Subscription status changed", COLOR.grey],
  "recurring-payment.trial.started": ["Subscription trial started", COLOR.blue],
  "recurring-payment.trial.ending": ["Subscription trial ending", COLOR.grey],
  "recurring-payment.trial.ended": ["Subscription trial ended", COLOR.grey],
  "recurring-payment.trial.cancelled": ["Subscription trial cancelled", COLOR.orange],
  "basket.abandoned": ["Basket abandoned", COLOR.grey],
  "basket.authenticated": ["Basket authenticated", COLOR.blue],
};

const clip = (value, max = 1000) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

function money(value) {
  if (value == null) return "";
  const amount = typeof value === "object" ? value.amount : value;
  const currency = typeof value === "object" ? (value.currency?.iso_4217 || value.currency) : "";
  if (amount == null || amount === "") return "";
  const number = Number(amount);
  return `${Number.isFinite(number) ? number.toFixed(2) : clip(amount, 20)}${currency ? ` ${clip(currency, 8)}` : ""}`;
}

function paymentOf(event) {
  const subject = event?.subject;
  if (!subject || typeof subject !== "object") return null;
  if (String(event.type).startsWith("payment.")) return subject;
  return subject.last_payment || subject.initial_payment || null;
}

/** Builds the Discord embed for one verified Tebex webhook. Never includes email addresses or IPs. */
export function formatTebexEvent(event, outcome = {}) {
  const [title, color] = EVENTS[event?.type] || [clip(event?.type || "Tebex event", 80), COLOR.grey];
  const payment = paymentOf(event);
  const subject = event?.subject || {};
  const fields = [];
  const add = (name, value, inline = true) => { const text = clip(value); if (text) fields.push({ name, value: text, inline }); };

  add("Transaction", payment?.transaction_id);
  add("Subscription", subject.reference || payment?.recurring_payment_reference);
  const player = payment?.customer?.username?.username || payment?.customer?.username || payment?.player?.name;
  add("Player", typeof player === "string" ? player : "");
  const discordId = outcome.discordId || "";
  if (/^\d{17,20}$/.test(discordId)) add("Discord", `<@${discordId}> (${discordId})`);
  const products = (payment?.products || []).map((product) => `${clip(product?.name, 80)}${Number(product?.quantity) > 1 ? ` ×${Number(product.quantity)}` : ""}`).filter(Boolean);
  add("Products", products.join("\n"), false);
  add("Amount", money(payment?.price_paid || payment?.price || payment?.amount));
  add("Payment method", payment?.payment_method?.name);
  add("Status", payment?.status?.description);
  if (outcome.status === "attention") add("Needs attention", outcome.note || "Roles are pending delivery.", false);
  if (outcome.status === "failed") add("Fulfillment failed", outcome.note || "The webhook could not be processed.", false);
  if (outcome.roles) add("Roles processed", String(outcome.roles));

  const failed = outcome.status === "failed";
  return {
    title: failed ? `${title} — fulfillment failed` : title,
    color: failed ? COLOR.red : outcome.status === "attention" ? COLOR.orange : color,
    fields: fields.slice(0, 25),
    footer: { text: `Tebex webhook ${clip(event?.id, 60)}` },
    timestamp: new Date().toISOString(),
  };
}

/** Posts embeds to the Tebex log channel. Logging must never break the store, so every failure is swallowed. */
export function createTebexLogger({ client, channelId = TEBEX_LOG_CHANNEL_ID, warn = console.warn } = {}) {
  async function post(embed) {
    try {
      const channel = await client.channels.fetch(String(channelId));
      if (!channel?.send) return false;
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    } catch (error) {
      warn(`[tebex-log] could not post to ${channelId}: ${error.message}`);
      return false;
    }
  }
  return {
    channelId,
    post,
    event: (event, outcome) => post(formatTebexEvent(event, outcome)),
    /** Store-side activity such as a checkout starting. */
    store: (title, fields = [], color = COLOR.blue) => post({
      title: clip(title, 200),
      color,
      fields: fields.map(([name, value, inline = true]) => ({ name: clip(name, 80), value: clip(value) || "—", inline })).slice(0, 25),
      timestamp: new Date().toISOString(),
    }),
  };
}
