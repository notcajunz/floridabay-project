import { EmbedBuilder } from "discord.js";

/** One visual language for everything the bot posts: replies, DMs, panels and log entries. */
export const COLORS = {
  primary: 0x43e8d8,
  success: 0x6ef1ae,
  warning: 0xffbf69,
  danger: 0xff765f,
  muted: 0x8b95a7,
};

export const BRAND = "Florida Bay Roleplay";

/**
 * Multi-line safe text: keeps line breaks (embeds rely on them for layout), drops every other
 * control character, trims trailing spaces per line and never stacks more than one blank line.
 */
const strip = (value) =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Single-line text for titles, field names, footers and authors. */
const line = (value) => strip(value).replace(/\s*\n\s*/g, " ");

/** Truncates and marks the cut. Line breaks survive. */
export function clip(value, max = 1024) {
  const text = strip(value);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}

const clipLine = (value, max) => {
  const text = line(value);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
};

/** A user mention followed by its raw ID on the next line, the layout used for audit trails. */
export const who = (id) => (id ? `<@${id}>\n\`${id}\`` : "Unknown");
export const roleRef = (id) => `<@&${id}>`;
export const when = (ms) => `<t:${Math.floor(Number(ms) / 1000)}:R>`;
export const stamp = (ms, style = "f") => `<t:${Math.floor(Number(ms) / 1000)}:${style}>`;
export const yesNo = (value) => (value ? "Yes" : "No");
export const onOff = (value) => (value ? "On" : "Off");

/** Server label used on every log entry: bold name with the raw ID underneath. */
export const serverRef = (guild) => (guild ? `**${clipLine(guild.name, 90)}**\n\`${guild.id}\`` : "Unknown server");

/** Embed field (never empty, always within Discord limits). */
export const field = (name, value, inline = true) => ({
  name: clipLine(name, 256) || "​",
  value: clip(value === 0 ? "0" : value, 1024) || "None",
  inline,
});

const footerText = (text) => clipLine(text || BRAND, 2048);

/** Plain embed: title plus a short description. */
export function embed(title, description, color = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(clipLine(title, 256))
    .setDescription(clip(description || "Done.", 4096))
    .setFooter({ text: BRAND })
    .setTimestamp();
}

/**
 * Structured embed. `rows` are [label, value, inline?] triples rendered as fields,
 * which scans far better than a paragraph of `key: value` text.
 */
export function card(title, { description, color = COLORS.primary, rows = [], footer, author, thumbnail } = {}) {
  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(clipLine(title, 256))
    .setFooter({ text: footerText(footer) })
    .setTimestamp();
  if (author) e.setAuthor(typeof author === "string" ? { name: clipLine(author, 256) } : { ...author, name: clipLine(author.name, 256) });
  if (description) e.setDescription(clip(description, 4096));
  if (thumbnail) e.setThumbnail(thumbnail);
  const fields = rows
    .filter(Boolean)
    .slice(0, 25)
    .map(([name, value, inline = true]) => field(name, value, inline));
  if (fields.length) e.addFields(fields);
  return e;
}

/** List body. Each item is one line; the empty case reads naturally. */
export const lines = (items, empty = "Nothing to show.") => {
  const rows = items.filter(Boolean);
  return rows.length ? rows.join("\n") : empty;
};

/** Packs items into chunks that each fit a field/description limit. `separator` goes between items. */
export function chunkLines(items, max = 1000, separator = "\n") {
  const chunks = [];
  let current = "";
  for (const item of items) {
    const entry = clip(item, max);
    if (current && current.length + entry.length + separator.length > max) {
      chunks.push(current);
      current = "";
    }
    current += `${current ? separator : ""}${entry}`;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Log channel purposes mapped to the label shown above each audit entry. */
const CATEGORY = {
  security: "Security",
  moderation: "Moderation",
  bans: "Moderation",
  unbans: "Moderation",
  tickets: "Tickets",
  roster: "Staff roster",
  callsigns: "Staff roster",
  role_sync: "Role sync",
  protected_roles: "Protected roles",
  verification: "Verification",
  organizations: "Organizations",
  staff_audit: "Staff audit",
  staff_exams: "Staff exams",
  staff_exams_head_admin: "Head Admin exam",
  staff_exams_management: "Management exam",
  staff_duty: "Staff duty",
  staff_shifts: "Staff duty",
  game: "Game audit",
  game_audit: "Game audit",
  connections: "Connections",
  easyadmin: "EasyAdmin",
  organization_audit: "Organizations",
};

const categoryOf = (purpose) =>
  CATEGORY[purpose] ||
  String(purpose || "audit")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

/**
 * Builds a log entry from a spec:
 *   { title, description?, color?, actor?, target?, fields?: [[name, value, inline?]], footer?, thumbnail?, server? }
 * `actor`/`target` are Discord IDs and become Actor/Target fields with a mention and the raw ID.
 * `guild` labels the entry with the server it happened in (author line, plus a Server field on
 * security entries, since one security channel collects events from every network server).
 */
export function logEmbed(purpose, spec = {}, guild = null) {
  const category = categoryOf(purpose);
  const rows = [];
  const named = (name) => (spec.fields || []).some((row) => row && String(row[0]).toLowerCase() === name);
  if (guild && spec.server !== false && purpose === "security" && !named("server")) rows.push(["Server", serverRef(guild)]);
  if (spec.actor) rows.push(["Actor", who(spec.actor)]);
  if (spec.target) rows.push(["Target", who(spec.target)]);
  rows.push(...(spec.fields || []));
  const e = new EmbedBuilder()
    .setColor(spec.color ?? COLORS.primary)
    .setTitle(clipLine(spec.title || category, 256))
    .setFooter({ text: footerText(spec.footer || `${BRAND} · ${category}`) })
    .setTimestamp();
  const showServer = guild && spec.server !== false;
  e.setAuthor({
    name: clipLine(showServer ? `${category} · ${guild.name}` : category, 256),
    ...(showServer && guild.iconURL?.() ? { iconURL: guild.iconURL({ size: 64 }) } : {}),
  });
  if (spec.description) e.setDescription(clip(spec.description, 4096));
  if (spec.thumbnail) e.setThumbnail(spec.thumbnail);
  const fields = rows
    .filter(Boolean)
    .slice(0, 25)
    .map(([name, value, inline = true]) => field(name, value, inline));
  if (fields.length) e.addFields(fields);
  return e;
}

/** Turns `staff.clock_in` into `Staff clock in`. */
export const humanize = (key) =>
  String(key || "")
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
