import { EmbedBuilder, MessageFlags } from "discord.js";

/** IAA house style: dark navy case files with a gold seal, red for discipline, green for good news. */
export const C = {
  navy: 0x1d2b44,
  gold: 0xc9a227,
  red: 0xc0392b,
  green: 0x2ecc71,
  amber: 0xe67e22,
  blue: 0x3b82c4,
  grey: 0x7f8c8d,
  purple: 0x8e44ad,
};

export const BRAND = "FBRP · Internal Affairs Agency";
export const SEAL = "🦅";

/** Thrown for anything the user did wrong. The message is shown to them as-is. */
export class UserError extends Error {}

const strip = (value) =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function clip(value, max = 1024) {
  const text = strip(value);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
export const line = (value, max = 256) => clip(strip(value).replace(/\s*\n\s*/g, " "), max);

export const mention = (id) => (id ? `<@${id}>` : "—");
export const roleMention = (id) => (id ? `<@&${id}>` : "—");
export const channelMention = (id) => (id ? `<#${id}>` : "—");
export const ts = (ms, style = "f") => (ms ? `<t:${Math.floor(Number(ms) / 1000)}:${style}>` : "—");
export const rel = (ms) => ts(ms, "R");

/** Embed with the IAA footer. `fields` are [name, value, inline?] triples. */
export function card(title, { description, color = C.navy, fields = [], footer, thumbnail, author, image } = {}) {
  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(line(title, 256))
    .setFooter({ text: line(footer || BRAND, 2048) })
    .setTimestamp();
  if (description) e.setDescription(clip(description, 4096));
  if (thumbnail) e.setThumbnail(thumbnail);
  if (image) e.setImage(image);
  if (author) e.setAuthor(typeof author === "string" ? { name: line(author) } : { ...author, name: line(author.name) });
  for (const [name, value, inline = true] of fields.filter(Boolean).slice(0, 25))
    e.addFields({ name: line(name, 256) || "​", value: clip(value === 0 ? "0" : value, 1024) || "—", inline });
  return e;
}

export const ok = (text, title = "Done") => card(`✅ ${title}`, { description: text, color: C.green });
export const fail = (text) => card("⛔ Not allowed", { description: text, color: C.red });

/** Replies whether or not the interaction was deferred. Ephemeral unless told otherwise. */
export async function respond(i, payload, { visible = false } = {}) {
  const body = typeof payload === "string" ? { embeds: [ok(payload)] } : payload;
  if (i.deferred || i.replied) return i.editReply(body);
  return i.reply({ ...body, ...(visible ? {} : { flags: MessageFlags.Ephemeral }) });
}

export const EPHEMERAL = { flags: MessageFlags.Ephemeral };

/** "7d", "12h", "2w", "90m", "1d12h" → milliseconds. Bare numbers are days. */
export function parseDuration(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw) * 86400000;
  const units = { m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  let total = 0;
  let matched = "";
  for (const m of raw.matchAll(/(\d+)\s*([mhdw])/g)) {
    total += Number(m[1]) * units[m[2]];
    matched += m[0];
  }
  if (!total || matched.replace(/\s/g, "") !== raw.replace(/\s/g, "")) return null;
  return total;
}

/** 5400 → "1h 30m". */
export function hours(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function humanDuration(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d && h) return `${d}d ${h}h`;
  if (d) return `${d} day${d === 1 ? "" : "s"}`;
  if (h) return `${h} hour${h === 1 ? "" : "s"}`;
  return `${Math.max(1, Math.round(ms / 60000))} minutes`;
}

/** Ten-segment meter: ▰▰▰▱▱▱▱▱▱▱ */
export const meter = (value, max = 100, size = 10) => {
  const filled = Math.max(0, Math.min(size, Math.round((Number(value) / max) * size)));
  return "▰".repeat(filled) + "▱".repeat(size - filled);
};

/** Monday 00:00 UTC of the current week. */
export function weekStart(now = Date.now()) {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/** Strips an IAA role prefix: "IAA | Senior Agent" → "Senior Agent". */
export const shortRole = (name) => String(name || "").replace(/^[A-Z]{2,5}\s*\|\s*/, "");

export const chunk = (list, size) => {
  const out = [];
  for (let n = 0; n < list.length; n += size) out.push(list.slice(n, n + size));
  return out;
};

/** Packs lines into description-sized pages. */
export function pages(lines, max = 3900) {
  const out = [];
  let current = "";
  for (const row of lines) {
    if (current.length + row.length + 1 > max) {
      out.push(current);
      current = "";
    }
    current += (current ? "\n" : "") + row;
  }
  if (current) out.push(current);
  return out.length ? out : [""];
}
