import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { authority, config, db, post, setConfig } from "./store.js";
import { BRAND, C, card, clip, humanize, line, pages, ts } from "./util.js";

/**
 * FBRP | DevOps ticket system. Mirrors the Florida Bay main bot's tickets (select-menu panel, intake
 * forms, private channel with a control message, claim / priority / notes / participants, close and
 * reopen, transcripts) with two categories: General Support and Purchase Support.
 */

export const TICKET_TYPES = {
  general: {
    label: "General Support",
    emoji: "🛠️",
    description: "Questions, account problems, and anything else.",
    priority: 3,
    fields: [
      ["subject", "Subject", "short", true, 100],
      ["description", "Describe what you need", "paragraph", true, 1000],
      ["tried", "What have you already tried?", "paragraph", false, 500],
    ],
  },
  purchase: {
    label: "Purchase Support",
    emoji: "💳",
    description: "Orders, receipts, refunds and missing items.",
    priority: 1,
    fields: [
      ["transaction", "Order or receipt ID", "short", false, 80],
      ["item", "What did you purchase?", "short", true, 100],
      ["issue", "What went wrong?", "paragraph", true, 1000],
    ],
  },
};
const PRIORITIES = [
  { label: "Critical", sla: 10 },
  { label: "High", sla: 30 },
  { label: "Priority", sla: 60 },
  { label: "Standard", sla: 240 },
];
const PRIORITY_EMOJI = ["🔴", "🟠", "🟡", "🔵"];
const STATUS = {
  open: { icon: "🟢", label: "Open", color: 0x43e8d8 },
  claimed: { icon: "🟣", label: "Claimed", color: 0x9b8cff },
  closed: { icon: "🔒", label: "Closed", color: 0x8b95a7 },
};

const parseJson = (value, fallback) => {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};
const typeSpec = (type) => TICKET_TYPES[type] || { label: humanize(type), emoji: "🎫", description: "", priority: 3, fields: [] };
const priorityEmoji = (level) => PRIORITY_EMOJI[Number(level)] || "⚪";
const priority = (level) => PRIORITIES[Number(level)] || { label: `Level ${level}`, sla: 240 };
const mention = (id) => `<@${id}>`;
const when = (ms) => `<t:${Math.floor(Number(ms) / 1000)}:R>`;
const quote = (value) => clip(value, 1000).split("\n").map((row) => `> ${row}`).join("\n");

function duration(ms) {
  const s = Math.max(0, Math.floor(Number(ms) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

const button = (id, label, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
const EPH = { flags: MessageFlags.Ephemeral };

let client = null;
export const init = (c) => {
  client = c;
};

const ticketById = (guildId, id) => db.one("SELECT * FROM devops_tickets WHERE guild_id=? AND id=?", [guildId, id]);
const fetchChannel = (row) => (row?.channel_id ? client.channels.fetch(String(row.channel_id)).catch(() => null) : null);
const addEvent = (ticket, type, actor, detail = {}) =>
  db.query("INSERT INTO devops_ticket_events(ticket_id,event_type,actor_id,detail,created_at) VALUES(?,?,?,?,?)", [ticket?.id || null, type, actor || null, JSON.stringify(detail), Date.now()]);

/** Compact description-only embed posted in the ticket channel so the member sees what staff did. */
const notice = (channel, text, color = C.teal, extra = {}) =>
  channel?.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(clip(text, 4096))], allowedMentions: { parse: [] }, ...extra }).catch(() => null);

const ticketLog = async (guild, row, { title, color = C.teal, actor, target, fields = [] }) => {
  const embed = card(title, { color, fields: fields.map(([n, v, inline = true]) => [n, v, inline]), footer: `${BRAND} · Ticket #${row.id}` });
  if (actor) embed.setAuthor({ name: (await guild.members.fetch(actor).catch(() => null))?.displayName || "Staff" });
  if (target) embed.addFields({ name: "Member", value: mention(target), inline: true });
  await post(guild, "ticketLogs", { embeds: [embed] }, "botLogs");
};

/* ------------------------------------------------------------------ access */

const isAdmin = async (guild, userId) => {
  const member = await guild.members.fetch(userId).catch(() => null);
  return member ? (await authority(member)).admin : false;
};

/** Roles that handle a ticket type: configured support roles plus leadership. */
async function supportRoleIds(guild, type) {
  const cfg = await config();
  const ids = new Set((cfg.ticketRoles || []).filter((r) => r.type === type || r.type === "all").map((r) => String(r.roleId)));
  if (cfg.roles.leadership) ids.add(cfg.roles.leadership);
  return [...ids].filter((id) => guild.roles.cache.has(id));
}

async function access(i, type = "all", managersOnly = false) {
  const member = await i.guild.members.fetch(i.user.id).catch(() => null);
  if (!member) return false;
  if ((await authority(member)).admin) return true;
  const cfg = await config();
  const rows = (cfg.ticketRoles || []).filter((r) => (type === "all" || r.type === type || r.type === "all") && (!managersOnly || r.level === "manager"));
  if (rows.some((r) => member.roles.cache.has(String(r.roleId)))) return true;
  // Leadership always manages tickets.
  return Boolean(cfg.roles.leadership && member.roles.cache.has(cfg.roles.leadership));
}

async function overwrites(guild, row, participantIds = []) {
  const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
  const map = new Map();
  map.set(guild.roles.everyone.id, { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] });
  for (const id of new Set([String(row.author_id), ...participantIds.map(String)])) map.set(id, { id, allow });
  map.set(client.user.id, { id: client.user.id, allow: [...allow, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] });
  for (const id of await supportRoleIds(guild, row.type)) map.set(id, { id, allow });
  return [...map.values()];
}

async function syncPermissions(guild, row) {
  const channel = await guild.channels.fetch(String(row.channel_id)).catch(() => null);
  if (!channel) throw new Error("The ticket channel is unavailable.");
  const participants = await db.query("SELECT user_id FROM devops_ticket_participants WHERE ticket_id=?", [row.id]);
  await channel.permissionOverwrites.set(await overwrites(guild, row, participants.map((p) => p.user_id)), `Sync support roles for ticket #${row.id}`);
}

/* ------------------------------------------------------------------ control message */

function controlEmbed(row) {
  const spec = typeSpec(row.type);
  const status = STATUS[row.status] || STATUS.open;
  const p = priority(row.priority);
  const form = parseJson(row.form_data, {}) || {};
  const labels = Object.fromEntries(spec.fields.map(([id, label]) => [id, label]));
  const closed = row.status === "closed";
  const description = closed
    ? `This ticket was closed by ${mention(row.closed_by)} ${when(row.closed_at)}.${row.close_reason ? `\n> ${clip(row.close_reason, 300)}` : ""}`
    : `Thanks for reaching out, ${mention(row.author_id)}. A member of staff will be with you shortly.\nShare any extra details, screenshots or evidence below while you wait.`;
  const responded = row.first_response_at ? `Answered ${when(row.first_response_at)}` : row.due_at ? when(row.due_at) : "None";
  const e = new EmbedBuilder()
    .setColor(status.color)
    .setAuthor({ name: `${spec.emoji} ${spec.label} · Ticket #${row.id}` })
    .setTitle(clip(row.subject || spec.label, 256).replace(/\n/g, " "))
    .setDescription(description)
    .addFields(
      { name: "Status", value: `${status.icon} ${status.label}`, inline: true },
      { name: "Priority", value: `${priorityEmoji(row.priority)} ${p.label}`, inline: true },
      { name: closed ? "Open for" : "Response target", value: closed ? duration(Number(row.closed_at) - Number(row.created_at)) : responded, inline: true },
      { name: "Opened by", value: mention(row.author_id), inline: true },
      { name: "Claimed by", value: row.claimed_by ? mention(row.claimed_by) : "Unclaimed", inline: true },
      { name: "Opened", value: ts(row.created_at, "f"), inline: true },
    )
    .setFooter({ text: `${BRAND} · Ticket #${row.id}` })
    .setTimestamp(Number(row.created_at) || Date.now());
  const answers = Object.entries(form).filter(([, v]) => String(v || "").trim() && String(v).trim() !== String(row.subject || "").trim()).slice(0, 18);
  if (answers.length) e.addFields(answers.map(([key, value]) => ({ name: clip(labels[key] || humanize(key), 256), value: quote(value), inline: false })));
  return e;
}

function controlComponents(row) {
  const id = row.id;
  if (row.status === "closed") return [];
  const claimed = row.status === "claimed";
  return [
    new ActionRowBuilder().addComponents(
      button(`tk:claim:${id}`, claimed ? "Unclaim" : "Claim", "🙋", claimed ? ButtonStyle.Secondary : ButtonStyle.Success),
      button(`tk:close:${id}`, "Close", "🔒", ButtonStyle.Danger),
      button(`tk:transcript:${id}`, "Transcript", "📄"),
    ),
    new ActionRowBuilder().addComponents(
      button(`tk:note:${id}`, "Add note", "📝"),
      button(`tk:notes:${id}`, "Notes", "🗒️"),
      button(`tk:add:${id}`, "Add member", "➕"),
      button(`tk:priority:${id}`, "Priority", "⚡"),
    ),
  ];
}

const closedComponents = (id) => [
  new ActionRowBuilder().addComponents(
    button(`tk:reopen:${id}`, "Reopen", "🔓", ButtonStyle.Success),
    button(`tk:transcript:${id}`, "Transcript", "📄"),
    button(`tk:delete:${id}`, "Delete channel", "🗑️", ButtonStyle.Danger),
  ),
];

const controlPayload = (row) => ({ embeds: [controlEmbed(row)], components: controlComponents(row), allowedMentions: { parse: [] } });

async function refresh(id, guildId) {
  const row = await ticketById(guildId, id);
  if (!row) return null;
  const event = await db.one("SELECT detail FROM devops_ticket_events WHERE ticket_id=? AND event_type='control' ORDER BY id DESC LIMIT 1", [row.id]);
  const messageId = parseJson(event?.detail, {})?.message;
  const channel = await fetchChannel(row);
  const message = messageId && channel ? await channel.messages.fetch(String(messageId)).catch(() => null) : null;
  if (message) await message.edit(controlPayload(row)).catch(() => {});
  return row;
}

/* ------------------------------------------------------------------ creating */

export function intakeModal(type) {
  if (!TICKET_TYPES[type]) throw new Error("Unknown ticket type.");
  const spec = typeSpec(type);
  const modal = new ModalBuilder().setCustomId(`ticket:modal:${type}`).setTitle(spec.label.slice(0, 45));
  for (const [id, label, style, required, max] of spec.fields.slice(0, 5))
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(required).setMaxLength(max),
      ),
    );
  return modal;
}

export async function create(guild, user, type, form) {
  if (!TICKET_TYPES[type]) throw new Error("Unknown ticket type.");
  const spec = typeSpec(type);
  const cfg = await config();
  const maxOpen = Number(cfg.settings.maxOpen ?? 3);
  const count = await db.one("SELECT COUNT(*) count FROM devops_tickets WHERE guild_id=? AND author_id=? AND status<>'closed'", [guild.id, user.id]);
  if (Number(count?.count || 0) >= maxOpen) throw new Error(`You already have the maximum of ${maxOpen} open tickets.`);
  const cooldown = Number(cfg.settings.cooldownSeconds ?? 60);
  const latest = await db.one("SELECT created_at FROM devops_tickets WHERE guild_id=? AND author_id=? ORDER BY id DESC LIMIT 1", [guild.id, user.id]);
  if (latest && Date.now() - Number(latest.created_at) < cooldown * 1000) throw new Error(`Please wait ${cooldown} seconds between tickets.`);
  const subject = line(form.subject || form.item || form.transaction || Object.values(form).find(Boolean) || spec.label, 100);
  const createdAt = Date.now();
  const dueAt = createdAt + priority(spec.priority).sla * 60000;
  const insert = await db.query(
    "INSERT INTO devops_tickets(guild_id,author_id,type,subject,status,priority,due_at,form_data,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    [guild.id, user.id, type, subject, "open", spec.priority, dueAt, JSON.stringify(form), createdAt],
  );
  const ticket = { id: insert.insertId, guild_id: guild.id, type };
  const perms = await overwrites(guild, { author_id: user.id, type }, [user.id]);
  try {
    // Categories are frequently replaced while the server layout is being
    // rebuilt. Never send a stale ID to Discord: it rejects the entire create
    // request with the unhelpful "Unknown Channel" error. Prefer the configured
    // ticket category, then the live category containing the ticket panel, and
    // finally allow Discord to create the ticket at the guild root.
    const configuredParent = cfg.categories?.[type] || cfg.categories?.all;
    const configuredCategory = configuredParent
      ? await guild.channels.fetch(String(configuredParent)).catch(() => null)
      : null;
    const panelId = cfg.channels?.tickets;
    const panel = panelId ? await guild.channels.fetch(String(panelId)).catch(() => null) : null;
    const panelCategory = panel?.parentId
      ? await guild.channels.fetch(String(panel.parentId)).catch(() => null)
      : null;
    const parent = configuredCategory?.type === ChannelType.GuildCategory
      ? configuredCategory.id
      : panelCategory?.type === ChannelType.GuildCategory
        ? panelCategory.id
        : undefined;
    const slug = String(user.username).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16) || "user";
    const channel = await guild.channels.create({
      name: `${type}-${insert.insertId}-${slug}`,
      type: ChannelType.GuildText,
      parent,
      topic: `FBRP DevOps ${spec.label} #${insert.insertId} | owner ${user.id} | priority ${priority(spec.priority).label}`,
      permissionOverwrites: perms,
      reason: `Ticket opened by ${user.tag}`,
    });
    await db.query("UPDATE devops_tickets SET channel_id=? WHERE id=?", [channel.id, insert.insertId]);
    await db.query("INSERT IGNORE INTO devops_ticket_participants(ticket_id,user_id,added_by,added_at) VALUES(?,?,?,?)", [insert.insertId, user.id, user.id, Date.now()]);
    const row = await ticketById(guild.id, insert.insertId);
    const pingRoles = (await supportRoleIds(guild, type)).filter((id) => id !== cfg.roles.leadership);
    const message = await channel.send({
      content: `${mention(user.id)}${pingRoles.length ? ` ${pingRoles.map((id) => `<@&${id}>`).join(" ")}` : ""}`,
      ...controlPayload(row),
      allowedMentions: { users: [user.id], roles: pingRoles },
    });
    await message
      .pin()
      .then(() => channel.messages.fetch({ limit: 3 }))
      .then((recent) => recent.find((m) => m.system && m.type === 6)?.delete())
      .catch(() => {});
    await addEvent(ticket, "control", client.user.id, { message: message.id });
    await addEvent(ticket, "open", user.id, { type, subject, form });
    await ticketLog(guild, row, {
      title: "Ticket opened",
      color: C.green,
      actor: user.id,
      fields: [["Ticket", `**#${insert.insertId}** · ${channel}`], ["Type", `${spec.emoji} ${spec.label}`], ["Priority", `${priorityEmoji(spec.priority)} ${priority(spec.priority).label}`], ["Subject", subject, false]],
    });
    return channel;
  } catch (error) {
    await db.query("DELETE FROM devops_tickets WHERE id=?", [insert.insertId]);
    throw error;
  }
}

/* ------------------------------------------------------------------ transcripts */

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Self-contained HTML archive of a ticket channel. */
async function buildTranscript(row, channel) {
  const messages = [];
  let before;
  while (messages.length < 2000) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  messages.reverse();
  const spec = typeSpec(row.type);
  const body = messages
    .filter((m) => !m.system)
    .map((m) => {
      const embeds = m.embeds
        .map(
          (e) =>
            `<div class="embed" style="border-color:#${(e.color ?? 0x5865f2).toString(16).padStart(6, "0")}">${e.author?.name ? `<div class="ea">${esc(e.author.name)}</div>` : ""}${e.title ? `<div class="et">${esc(e.title)}</div>` : ""}${e.description ? `<div class="ed">${esc(e.description)}</div>` : ""}${e.fields.map((f) => `<div class="ef"><b>${esc(f.name)}</b><br>${esc(f.value)}</div>`).join("")}</div>`,
        )
        .join("");
      const files = [...m.attachments.values()].map((a) => `<div class="att">📎 <a href="${esc(a.url)}">${esc(a.name)}</a></div>`).join("");
      return `<div class="m"><img src="${esc(m.author.displayAvatarURL({ extension: "png", size: 64 }))}" alt=""><div><div class="h"><span class="n">${esc(m.member?.displayName || m.author.globalName || m.author.username)}</span>${m.author.bot ? '<span class="bot">BOT</span>' : ""}<span class="t">${new Date(m.createdTimestamp).toISOString().replace("T", " ").slice(0, 19)} UTC</span></div><div class="c">${esc(m.cleanContent)}</div>${embeds}${files}</div></div>`;
    })
    .join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ticket #${row.id} · ${esc(spec.label)}</title><style>
body{margin:0;background:#0f1218;color:#dbdee1;font:15px/1.45 system-ui,Segoe UI,sans-serif}
header{padding:20px 24px;border-bottom:1px solid #232834;background:#151a22}
header h1{margin:0 0 4px;font-size:20px;color:#43e8d8}header p{margin:0;color:#8b95a7}
main{max-width:900px;margin:0 auto;padding:16px 24px 64px}
.m{display:flex;gap:12px;padding:8px 0}.m img{width:40px;height:40px;border-radius:50%;flex:none}
.h{display:flex;gap:8px;align-items:baseline}.n{font-weight:600;color:#fff}.t{font-size:12px;color:#8b95a7}
.bot{font-size:10px;background:#5865f2;color:#fff;border-radius:3px;padding:1px 4px}
.c{white-space:pre-wrap;word-break:break-word}
.embed{margin-top:6px;border-left:4px solid #5865f2;background:#151a22;border-radius:4px;padding:8px 12px;max-width:620px}
.ea{font-size:12px;color:#8b95a7}.et{font-weight:600;color:#fff}.ed{white-space:pre-wrap}.ef{margin-top:6px;white-space:pre-wrap}
.att a{color:#43e8d8}
</style></head><body><header><h1>${esc(spec.emoji)} ${esc(spec.label)} · Ticket #${row.id}</h1><p>${esc(row.subject)} · opened ${new Date(Number(row.created_at)).toISOString().slice(0, 16).replace("T", " ")} UTC · ${messages.filter((m) => !m.system).length} messages</p></header><main>
${body}
</main></body></html>`;
  return { html, count: messages.filter((m) => !m.system).length };
}

async function transcriptFile(row, channel) {
  const { html, count } = await buildTranscript(row, channel);
  return { file: new AttachmentBuilder(Buffer.from(html, "utf8"), { name: `ticket-${row.id}-transcript.html` }), count };
}

/* ------------------------------------------------------------------ lifecycle */

async function claim(guild, row, actorId, claimed = row.claimed_by !== actorId) {
  if (row.status === "closed") throw new Error("This ticket is closed. Reopen it first.");
  await db.query("UPDATE devops_tickets SET status=?,claimed_by=?,claimed_at=?,first_response_at=COALESCE(first_response_at,?) WHERE id=?", [
    claimed ? "claimed" : "open",
    claimed ? actorId : null,
    claimed ? Date.now() : null,
    claimed ? Date.now() : null,
    row.id,
  ]);
  await addEvent(row, claimed ? "claim" : "release", actorId);
  await refresh(row.id, guild.id);
  const channel = await fetchChannel(row);
  await notice(channel, claimed ? `🙋 ${mention(actorId)} has claimed this ticket and will be assisting you.` : `↩️ ${mention(actorId)} released this ticket back to the queue.`, claimed ? C.green : C.amber);
  await ticketLog(guild, row, {
    title: claimed ? "Ticket claimed" : "Ticket released",
    color: claimed ? C.green : C.amber,
    actor: actorId,
    fields: [["Ticket", `**#${row.id}**${row.channel_id ? ` · <#${row.channel_id}>` : ""}`], ["Owner", mention(row.author_id)]],
  });
  return card(claimed ? "Ticket claimed" : "Ticket released", { color: claimed ? C.green : C.amber, description: claimed ? `You are now handling ticket **#${row.id}**.` : `Ticket **#${row.id}** is back in the queue.` });
}

async function close(guild, row, actorId, reasonText) {
  if (row.status === "closed") throw new Error("This ticket is already closed.");
  const reason = clip(reasonText || "No reason given", 300);
  const closedAt = Date.now();
  await db.query("UPDATE devops_tickets SET status='closed',closed_at=?,closed_by=?,close_reason=? WHERE id=?", [closedAt, actorId, reason, row.id]);
  const channel = await fetchChannel(row);
  const participants = await db.query("SELECT user_id FROM devops_ticket_participants WHERE ticket_id=?", [row.id]);
  for (const id of new Set([String(row.author_id), ...participants.map((p) => String(p.user_id))]))
    await channel?.permissionOverwrites.edit(id, { SendMessages: false }, "Ticket closed").catch(() => {});
  await addEvent(row, "close", actorId, { reason });
  const updated = (await refresh(row.id, guild.id)) || { ...row, status: "closed", closed_at: closedAt, closed_by: actorId, close_reason: reason };
  const archive = channel ? await transcriptFile(updated, channel).catch((e) => (console.warn(`[DevOps] transcript #${row.id}: ${e.message}`), null)) : null;
  const summary = [
    ["Opened by", mention(row.author_id)],
    ["Handled by", row.claimed_by ? mention(row.claimed_by) : "Unclaimed"],
    ["Open for", duration(closedAt - Number(row.created_at))],
  ];
  await channel
    ?.send({
      embeds: [card("Ticket closed", { color: C.amber, description: `🔒 Closed by ${mention(actorId)} ${when(closedAt)}.\n> ${reason}`, fields: summary, footer: `${BRAND} · Ticket #${row.id}` })],
      components: closedComponents(row.id),
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
  await channel?.setName(`closed-${row.id}-${row.type}`).catch(() => {});
  const logged = await post(guild, "transcripts", {
    embeds: [
      card(`📄 Transcript · Ticket #${row.id}`, {
        color: C.grey,
        fields: [["Type", `${typeSpec(row.type).emoji} ${typeSpec(row.type).label}`], ...summary, ["Subject", clip(row.subject, 200), false], ["Reason", reason, false]],
      }),
    ],
    files: archive ? [archive.file] : [],
  });
  await ticketLog(guild, row, {
    title: "Ticket closed",
    color: C.amber,
    actor: actorId,
    target: row.author_id,
    fields: [["Ticket", `**#${row.id}**${row.channel_id ? ` · <#${row.channel_id}>` : ""}`], ...summary.slice(1), ["Reason", reason, false], ["Transcript", logged ? `Archived in <#${logged.channelId}> (${archive?.count || 0} messages)` : "Unavailable", false]],
  });
  const owner = await client.users.fetch(String(row.author_id)).catch(() => null);
  await owner
    ?.send({
      embeds: [
        card(`Your ticket #${row.id} was closed`, {
          color: C.amber,
          description: `Your **${typeSpec(row.type).label}** ticket in **${guild.name}** has been closed.\n> ${reason}\n\nNeed more help? Open a new ticket from the support panel at any time.`,
          fields: [["Subject", clip(row.subject, 200), false], ["Handled by", row.claimed_by ? mention(row.claimed_by) : "Unclaimed"], ["Open for", duration(closedAt - Number(row.created_at))]],
          footer: `${BRAND} · Ticket #${row.id}`,
        }),
      ],
      files: archive ? [new AttachmentBuilder(Buffer.from(await archive.file.attachment), { name: archive.file.name })] : [],
    })
    .catch(() => {});
  return card("Ticket closed", { color: C.amber, description: `Ticket **#${row.id}** is now read-only.${archive ? ` A transcript was archived (${archive.count} messages).` : ""}\n> ${reason}` });
}

async function reopen(guild, row, actorId) {
  if (row.status !== "closed") throw new Error("This ticket is not closed.");
  const channel = await fetchChannel(row);
  if (!channel) throw new Error("The ticket channel was deleted, so it cannot be reopened.");
  await db.query("UPDATE devops_tickets SET status=?,closed_at=NULL,closed_by=NULL,close_reason=NULL,reopen_count=reopen_count+1,overdue_notified=0 WHERE id=?", [row.claimed_by ? "claimed" : "open", row.id]);
  const participants = await db.query("SELECT user_id FROM devops_ticket_participants WHERE ticket_id=?", [row.id]);
  for (const id of new Set([String(row.author_id), ...participants.map((p) => String(p.user_id))]))
    await channel.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true }, "Ticket reopened").catch(() => {});
  await channel.setName(`${row.type}-${row.id}-reopened`).catch(() => {});
  await addEvent(row, "reopen", actorId);
  await refresh(row.id, guild.id);
  await notice(channel, `🔓 ${mention(actorId)} reopened this ticket.`, C.green);
  await ticketLog(guild, row, { title: "Ticket reopened", color: C.green, actor: actorId, target: row.author_id, fields: [["Ticket", `**#${row.id}** · ${channel}`]] });
  return card("Ticket reopened", { color: C.green, description: `Ticket **#${row.id}** is open again.` });
}

async function addMembers(guild, row, actorId, userIds) {
  const channel = await fetchChannel(row);
  if (!channel) throw new Error("The ticket channel is unavailable.");
  const added = [];
  for (const id of userIds) {
    if (String(id) === String(row.author_id)) continue;
    await db.query("INSERT IGNORE INTO devops_ticket_participants(ticket_id,user_id,added_by,added_at) VALUES(?,?,?,?)", [row.id, id, actorId, Date.now()]);
    const ok = await channel.permissionOverwrites
      .edit(id, { ViewChannel: true, SendMessages: row.status !== "closed", ReadMessageHistory: true, AttachFiles: true }, "Ticket participant added")
      .then(() => true, () => false);
    if (ok) added.push(id);
  }
  if (!added.length) throw new Error("Nobody new was added.");
  await addEvent(row, "participant_add", actorId, { users: added });
  await notice(channel, `➕ ${added.map(mention).join(", ")} ${added.length === 1 ? "was" : "were"} added to this ticket by ${mention(actorId)}.`);
  return card("Members added", { color: C.green, description: `${added.map(mention).join(", ")} can now see ticket **#${row.id}**.` });
}

async function removeMember(guild, row, actorId, userId) {
  if (String(userId) === String(row.author_id)) throw new Error("The ticket owner cannot be removed.");
  const channel = await fetchChannel(row);
  await db.query("DELETE FROM devops_ticket_participants WHERE ticket_id=? AND user_id=?", [row.id, userId]);
  await channel?.permissionOverwrites.delete(userId, "Ticket participant removed").catch(() => {});
  await addEvent(row, "participant_remove", actorId, { user: userId });
  await notice(channel, `➖ ${mention(userId)} was removed from this ticket by ${mention(actorId)}.`, C.amber);
  return card("Member removed", { color: C.amber, description: `${mention(userId)} no longer has access to ticket **#${row.id}**.` });
}

async function setPriority(guild, row, actorId, level, reason = null) {
  if (!PRIORITIES[level]) throw new Error("Unknown priority level.");
  const due = Date.now() + PRIORITIES[level].sla * 60000;
  await db.query("UPDATE devops_tickets SET priority=?,due_at=?,overdue_notified=0 WHERE id=?", [level, due, row.id]);
  await addEvent(row, "priority", actorId, { level, reason });
  await refresh(row.id, guild.id);
  await notice(await fetchChannel(row), `⚡ Priority set to **${priorityEmoji(level)} ${PRIORITIES[level].label}** by ${mention(actorId)}. New response target ${when(due)}.${reason ? `\n> ${clip(reason, 300)}` : ""}`);
  return card("Priority updated", { color: C.green, description: `Ticket **#${row.id}** is now **${priorityEmoji(level)} ${PRIORITIES[level].label}**.\nResponse target ${when(due)}.` });
}

async function addNote(row, actorId, text) {
  const body = clip(text, 1000);
  if (!body) throw new Error("The note is empty.");
  await db.query("INSERT INTO devops_ticket_notes(ticket_id,author_id,body,created_at) VALUES(?,?,?,?)", [row.id, actorId, body, Date.now()]);
  await addEvent(row, "note", actorId);
  return card("Private note saved", { color: C.green, description: `Only staff can see notes on ticket **#${row.id}**.\n> ${clip(body, 300).replace(/\n/g, "\n> ")}` });
}

async function notesEmbed(row) {
  const notes = await db.query("SELECT * FROM devops_ticket_notes WHERE ticket_id=? ORDER BY id DESC LIMIT 15", [row.id]);
  const blocks = notes.map((n) => `${mention(n.author_id)} · ${when(n.created_at)}\n> ${clip(n.body, 400).replace(/\n/g, "\n> ")}`);
  return card(`Private notes · Ticket #${row.id}`, { description: pages(blocks, 4000)[0] || "No private notes yet. Add one with the **Add note** button.", footer: `${BRAND} · Staff only` });
}

/* ------------------------------------------------------------------ slash commands */

export async function command(i, sub) {
  if (sub === "open") throw new Error("Pick a category from the ticket panel to open a ticket.");
  if (sub === "mine") {
    const rows = await db.query("SELECT * FROM devops_tickets WHERE guild_id=? AND author_id=? ORDER BY id DESC LIMIT 25", [i.guildId, i.user.id]);
    const items = rows.map((r) => `${(STATUS[r.status] || STATUS.open).icon} **#${r.id}** · ${typeSpec(r.type).label}${r.channel_id && r.status !== "closed" ? ` · <#${r.channel_id}>` : ""}\n${clip(r.subject, 80)} · ${when(r.created_at)}`);
    return card("Your tickets", { description: pages(items, 4000)[0] || "You have no tickets. Open one from the support panel." });
  }
  if (sub === "list") {
    if (!(await access(i, "all"))) throw new Error("You need ticket staff access to see the queue.");
    const rows = await db.query("SELECT * FROM devops_tickets WHERE guild_id=? AND status<>'closed' ORDER BY priority,due_at LIMIT 50", [i.guildId]);
    const items = rows.map(
      (r) => `${priorityEmoji(r.priority)} **#${r.id}** · <#${r.channel_id}> · ${priority(r.priority).label}\n${mention(r.author_id)} · ${r.claimed_by ? `claimed by ${mention(r.claimed_by)}` : "**unclaimed**"} · due ${when(r.due_at || r.created_at)}`,
    );
    return card("Open support tickets", {
      description: pages(items, 3900)[0] || "No open tickets. 🎉",
      fields: rows.length
        ? [["Open", String(rows.length)], ["Unclaimed", String(rows.filter((r) => !r.claimed_by).length)], ["Overdue", String(rows.filter((r) => !r.first_response_at && Number(r.due_at) < Date.now()).length)]]
        : [],
    });
  }
  if (sub === "reopen") {
    const row = await ticketById(i.guildId, i.options.getInteger("id", true));
    if (!row || row.status !== "closed") throw new Error("Closed ticket not found.");
    if (!(await access(i, row.type))) throw new Error("You need ticket support access.");
    return reopen(i.guild, row, i.user.id);
  }
  const id = i.options.getInteger("id");
  const row = id
    ? await ticketById(i.guildId, id)
    : await db.one(`SELECT * FROM devops_tickets WHERE guild_id=? AND channel_id=?${sub === "transcript" ? "" : " AND status<>'closed'"}`, [i.guildId, i.channelId]);
  if (!row) throw new Error("This is not an active ticket channel.");
  const owner = row.author_id === i.user.id;
  const isStaff = await access(i, row.type);
  if (sub === "request-close") {
    if (!owner && !isStaff) throw new Error("Only the ticket owner or support staff may request closure.");
    const reason = clip(i.options.getString("reason", true), 300);
    await db.query("UPDATE devops_tickets SET close_requested_by=?,close_requested_at=? WHERE id=?", [i.user.id, Date.now(), row.id]);
    await addEvent(row, "close_request", i.user.id, { reason });
    await notice(i.channel, `📨 ${mention(i.user.id)} asked for this ticket to be closed.\n> ${reason}`, C.amber, {
      components: [new ActionRowBuilder().addComponents(button(`tk:close:${row.id}`, "Close ticket", "🔒", ButtonStyle.Danger))],
    });
    return card("Closure requested", { color: C.amber, description: "Staff have been asked to close this ticket." });
  }
  if (sub === "transcript") {
    if (!owner && !isStaff) throw new Error("Only ticket participants or support staff can view this transcript.");
    const channel = await fetchChannel(row);
    if (!channel) throw new Error("The ticket channel is unavailable.");
    const archive = await transcriptFile(row, channel);
    await addEvent(row, "transcript", i.user.id, { messages: archive.count });
    return { embeds: [card("Transcript ready", { color: C.green, description: `Ticket **#${row.id}** · ${archive.count} messages. Open the attached file in any browser.` })], files: [archive.file] };
  }
  if (sub === "close") {
    if (!owner && !isStaff) throw new Error("Only the ticket owner or support staff may close it.");
    return close(i.guild, row, i.user.id, i.options.getString("reason", true));
  }
  if (!isStaff) throw new Error("You need ticket support access.");
  if (sub === "claim") return claim(i.guild, row, i.user.id, i.options.getBoolean("claimed") ?? row.claimed_by !== i.user.id);
  if (sub === "transfer") {
    const user = i.options.getUser("member", true);
    await db.query("UPDATE devops_tickets SET status='claimed',claimed_by=?,claimed_at=?,first_response_at=COALESCE(first_response_at,?) WHERE id=?", [user.id, Date.now(), Date.now(), row.id]);
    await addEvent(row, "transfer", i.user.id, { to: user.id });
    await refresh(row.id, i.guildId);
    await notice(i.channel, `🔁 ${mention(i.user.id)} transferred this ticket to ${mention(user.id)}.`);
    await ticketLog(i.guild, row, { title: "Ticket transferred", actor: i.user.id, target: user.id, fields: [["Ticket", `**#${row.id}** · ${i.channel}`]] });
    return card("Ticket transferred", { color: C.green, description: `Ticket **#${row.id}** is now assigned to ${mention(user.id)}.` });
  }
  if (sub === "add") return addMembers(i.guild, row, i.user.id, [i.options.getUser("member", true).id]);
  if (sub === "remove") return removeMember(i.guild, row, i.user.id, i.options.getUser("member", true).id);
  if (sub === "priority") return setPriority(i.guild, row, i.user.id, Number(i.options.getString("level", true)), clip(i.options.getString("reason", true), 300));
  if (sub === "move") {
    const type = i.options.getString("type", true);
    if (!TICKET_TYPES[type]) throw new Error("Unknown ticket type.");
    const cfg = await config();
    const category = cfg.categories?.[type] || cfg.categories?.all;
    await db.query("UPDATE devops_tickets SET type=? WHERE id=?", [type, row.id]);
    if (category) await i.channel.setParent(String(category), { lockPermissions: false }).catch(() => {});
    await syncPermissions(i.guild, { ...row, type });
    await addEvent(row, "move", i.user.id, { from: row.type, to: type });
    await refresh(row.id, i.guildId);
    await notice(i.channel, `📂 ${mention(i.user.id)} moved this ticket to **${typeSpec(type).emoji} ${typeSpec(type).label}**.`);
    return card("Ticket moved", { color: C.green, description: `Ticket **#${row.id}** is now **${typeSpec(type).label}**.` });
  }
  if (sub === "rename") {
    const name = String(i.options.getString("name", true)).toLowerCase().replace(/[^a-z0-9-_ ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
    if (!name) throw new Error("Use letters, numbers and dashes.");
    await i.channel.setName(name);
    await addEvent(row, "rename", i.user.id, { name });
    return card("Ticket renamed", { color: C.green, description: `This channel is now **${name}**.` });
  }
  if (sub === "note") return addNote(row, i.user.id, i.options.getString("text", true));
  if (sub === "notes") return notesEmbed(row);
  throw new Error("Unsupported ticket action.");
}

/** /support: panel, config, category, role, limit. Admins and ticket managers only. */
export async function supportCommand(i, sub) {
  if (!(await access(i, "all", true))) throw new Error("You need a ticket manager role or Administrator.");
  if (sub === "panel") {
    const channel = i.options.getChannel("channel", true);
    if (!channel.isTextBased()) throw new Error("Choose a text channel.");
    const cfg = await config();
    await setConfig("channels", { ...cfg.channels, tickets: channel.id }, i.user.id);
    await setConfig("panel:tickets", { channelId: channel.id, messageId: null }, i.user.id);
    await ensurePanel(i.guild);
    return card("Ticket panel updated", { color: C.green, description: `The ticket panel is live in ${channel}.` });
  }
  const cfg = await config();
  if (sub === "category") {
    const type = clip(i.options.getString("type", true), 24);
    const category = i.options.getChannel("category", true);
    if (type !== "all" && !TICKET_TYPES[type]) throw new Error("Type must be `general`, `purchase` or `all`.");
    if (category.type !== ChannelType.GuildCategory) throw new Error("Choose a Discord category.");
    await setConfig("categories", { ...cfg.categories, [type]: category.id }, i.user.id);
    return card("Ticket category updated", { color: C.green, description: `**${type}** tickets will be created under **${category.name}**.` });
  }
  if (sub === "role") {
    const type = clip(i.options.getString("type", true), 24);
    const role = i.options.getRole("role", true);
    const level = i.options.getString("level", true);
    const mode = i.options.getString("mode", true);
    if (type !== "all" && !TICKET_TYPES[type]) throw new Error("Type must be `general`, `purchase` or `all`.");
    const rest = (cfg.ticketRoles || []).filter((r) => !(r.type === type && String(r.roleId) === role.id));
    await setConfig("ticketRoles", mode === "add" ? [...rest, { type, roleId: role.id, level }] : rest, i.user.id);
    return card("Support role updated", { color: C.green, fields: [["Role", `${role}`], ["Ticket type", `\`${type}\``], ["Level", humanize(level)], ["Action", mode === "add" ? "Added" : "Removed"]] });
  }
  if (sub === "limit") {
    const max = i.options.getInteger("max_open", true);
    const cooldown = i.options.getInteger("cooldown_seconds", true);
    await setConfig("settings", { ...cfg.settings, maxOpen: max, cooldownSeconds: cooldown }, i.user.id);
    return card("Ticket limits updated", { color: C.green, fields: [["Maximum open", String(max)], ["Cooldown", `${cooldown}s`]] });
  }
  return card("Ticket configuration", {
    fields: [
      ["Types", Object.entries(TICKET_TYPES).map(([key, v]) => `${v.emoji} **${v.label}** · \`${key}\` · ${priority(v.priority).label}`).join("\n"), false],
      ["Priorities", PRIORITIES.map((p, level) => `${priorityEmoji(level)} **${p.label}** · ${p.sla} min target`).join("\n"), false],
      ["Limits", `Max open **${cfg.settings.maxOpen}** · cooldown **${cfg.settings.cooldownSeconds}s**`, false],
      ["Categories", Object.entries(cfg.categories || {}).map(([k, v]) => `\`${k}\` · <#${v}>`).join("\n") || "None", false],
      ["Support roles", (cfg.ticketRoles || []).map((r) => `<@&${r.roleId}> · \`${r.type}\` · ${r.level}`).join("\n") || "Leadership only", false],
    ],
  });
}

/* ------------------------------------------------------------------ panel */

export async function ensurePanel(guild) {
  const cfg = await config();
  const channelId = cfg.channels.tickets;
  if (!channelId) return null;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error("The ticket panel channel is unavailable.");
  const types = Object.entries(TICKET_TYPES);
  const panel = new EmbedBuilder()
    .setColor(C.teal)
    .setTitle("FBRP DevOps Support")
    .setDescription("Need a hand from the team? Pick the category that best matches your request from the menu below and fill out the short form. A private channel will be opened just for you and our staff.")
    .setFooter({ text: `${BRAND} · Support` });
  if (guild.iconURL()) panel.setThumbnail(guild.iconURL({ size: 256 }));
  panel.addFields(
    { name: "Categories", value: types.map(([, s]) => `${s.emoji} **${s.label}**\n${s.description}`).join("\n\n"), inline: false },
    { name: "Before you open a ticket", value: "• One ticket per issue, please\n• Include IDs, order numbers and screenshots\n• Staff will reply as soon as possible, no need to ping", inline: false },
  );
  const components = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("ticket:select")
        .setPlaceholder("Choose a ticket category")
        .addOptions(types.map(([value, s]) => ({ label: s.label, description: s.description.slice(0, 100), value, emoji: s.emoji }))),
    ),
  ];
  const payload = { embeds: [panel], components };
  const saved = cfg.panels.tickets;
  let message = saved?.messageId && saved.channelId === channel.id ? await channel.messages.fetch(String(saved.messageId)).catch(() => null) : null;
  if (message) await message.edit(payload);
  else message = await channel.send(payload);
  await setConfig("panel:tickets", { channelId: channel.id, messageId: message.id });
  return message;
}

/* ------------------------------------------------------------------ components */

const failure = (i, error) => {
  const payload = { embeds: [card("Something went wrong", { color: C.red, description: clip(error?.message || error, 1000) })], components: [] };
  return (i.deferred || i.replied ? i.editReply(payload) : i.reply({ ...payload, ...EPH })).catch(() => {});
};

const textModal = (id, title, inputId, label, { required = true, max = 1000, placeholder } = {}) => {
  const input = new TextInputBuilder().setCustomId(inputId).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(required).setMaxLength(max);
  if (placeholder) input.setPlaceholder(placeholder);
  return new ModalBuilder().setCustomId(id).setTitle(title).addComponents(new ActionRowBuilder().addComponents(input));
};

async function ticketComponent(i) {
  const [, action, rawId] = i.customId.split(":");
  const row = await ticketById(i.guildId, Number(rawId));
  if (!row) return failure(i, new Error("This ticket no longer exists."));
  const owner = String(row.author_id) === i.user.id;
  const ownerOrStaff = async () => {
    if (!owner && !(await access(i, row.type))) throw new Error("Only the ticket owner or support staff can do that.");
  };
  const staffOnly = async () => {
    if (!(await access(i, row.type))) throw new Error("Only support staff can do that.");
  };
  try {
    if (action === "close") {
      await ownerOrStaff();
      if (row.status === "closed") throw new Error("This ticket is already closed.");
      return i.showModal(textModal(`tk:closemodal:${row.id}`, `Close ticket #${row.id}`, "reason", "Reason for closing", { required: false, max: 300, placeholder: "Resolved, duplicate, no response…" }));
    }
    if (action === "note") {
      await staffOnly();
      return i.showModal(textModal(`tk:notemodal:${row.id}`, `Private note · #${row.id}`, "note", "Note (only staff can see this)"));
    }
    if (action === "closemodal") {
      await i.deferReply(EPH);
      await ownerOrStaff();
      return i.editReply({ embeds: [await close(i.guild, row, i.user.id, i.fields.getTextInputValue("reason"))] });
    }
    if (action === "notemodal") {
      await i.deferReply(EPH);
      await staffOnly();
      return i.editReply({ embeds: [await addNote(row, i.user.id, i.fields.getTextInputValue("note"))] });
    }
    if (action === "add") {
      await staffOnly();
      return i.reply({
        ...EPH,
        embeds: [card("Add members", { description: `Pick up to five people to add to ticket **#${row.id}**.` })],
        components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`tk:addpick:${row.id}`).setPlaceholder("Choose members").setMinValues(1).setMaxValues(5))],
      });
    }
    if (action === "priority") {
      await staffOnly();
      return i.reply({
        ...EPH,
        embeds: [card("Change priority", { description: `Ticket **#${row.id}** is currently **${priorityEmoji(row.priority)} ${priority(row.priority).label}**.` })],
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`tk:prioritypick:${row.id}`)
              .setPlaceholder("Choose a priority")
              .addOptions(PRIORITIES.map((p, level) => ({ label: p.label, description: `${p.sla} minute response target`, value: String(level), emoji: priorityEmoji(level), default: Number(row.priority) === level }))),
          ),
        ],
      });
    }
    await i.deferReply(EPH);
    if (action === "addpick") {
      await staffOnly();
      return i.editReply({ embeds: [await addMembers(i.guild, row, i.user.id, i.values)], components: [] });
    }
    if (action === "prioritypick") {
      await staffOnly();
      return i.editReply({ embeds: [await setPriority(i.guild, row, i.user.id, Number(i.values[0]))], components: [] });
    }
    if (action === "claim") {
      await staffOnly();
      return i.editReply({ embeds: [await claim(i.guild, row, i.user.id)] });
    }
    if (action === "notes") {
      await staffOnly();
      return i.editReply({ embeds: [await notesEmbed(row)] });
    }
    if (action === "reopen") {
      await staffOnly();
      return i.editReply({ embeds: [await reopen(i.guild, row, i.user.id)] });
    }
    if (action === "transcript") {
      await ownerOrStaff();
      const channel = await fetchChannel(row);
      if (!channel) throw new Error("The ticket channel is unavailable.");
      const archive = await transcriptFile(row, channel);
      await addEvent(row, "transcript", i.user.id, { messages: archive.count });
      return i.editReply({ embeds: [card("Transcript ready", { color: C.green, description: `Ticket **#${row.id}** · ${archive.count} messages. Open the attached file in any browser.` })], files: [archive.file] });
    }
    if (action === "delete") {
      await staffOnly();
      if (row.status !== "closed") throw new Error("Close the ticket before deleting its channel.");
      const channel = await fetchChannel(row);
      if (!channel) throw new Error("The ticket channel is already gone.");
      await notice(channel, `🗑️ ${mention(i.user.id)} is deleting this channel in 5 seconds.`, C.red);
      await addEvent(row, "delete", i.user.id);
      await ticketLog(i.guild, row, { title: "Ticket channel deleted", color: C.red, actor: i.user.id, fields: [["Ticket", `**#${row.id}** · ${channel.name}`]] });
      setTimeout(() => void channel.delete(`Ticket #${row.id} deleted by ${i.user.tag}`).catch(() => {}), 5000);
      return i.editReply({ embeds: [card("Deleting ticket", { color: C.red, description: `The channel for ticket **#${row.id}** will be deleted in 5 seconds.` })] });
    }
    throw new Error("Unknown ticket action.");
  } catch (error) {
    return failure(i, error);
  }
}

/** Returns true when the interaction belonged to the ticket system. */
export async function component(i) {
  if (i.isStringSelectMenu() && i.customId === "ticket:select") {
    try {
      await i.showModal(intakeModal(i.values[0]));
    } catch (error) {
      await i.reply({ ...EPH, embeds: [card("Could not open ticket", { color: C.red, description: clip(error.message || error, 1000) })] }).catch(() => {});
    }
    // Reset the menu so the same category can be picked again.
    await i.message?.edit({ components: i.message.components }).catch(() => {});
    return true;
  }
  if (i.isModalSubmit() && i.customId.startsWith("ticket:modal:")) {
    const type = i.customId.slice("ticket:modal:".length);
    await i.deferReply(EPH);
    try {
      const spec = typeSpec(type);
      const form = Object.fromEntries(spec.fields.slice(0, 5).map(([id]) => [id, i.fields.getTextInputValue(id)]));
      const channel = await create(i.guild, i.user, type, form);
      await i.editReply({ embeds: [card("Ticket opened", { color: C.green, description: `Your private ticket is ready in ${channel}. Staff will be with you shortly.` })] });
    } catch (error) {
      await i.editReply({ embeds: [card("Could not open ticket", { color: C.red, description: clip(error.message || error, 1000) })] });
    }
    return true;
  }
  if ((i.isButton() || i.isModalSubmit() || i.isAnySelectMenu()) && i.customId.startsWith("tk:")) {
    await ticketComponent(i);
    return true;
  }
  return false;
}

export async function autocomplete(i) {
  const focused = i.options.getFocused(true);
  const value = String(focused.value).toLowerCase();
  if (focused.name === "level")
    return i.respond(PRIORITIES.map((p, level) => ({ name: `${p.label} · ${p.sla} min target`, value: String(level) })).filter((o) => o.name.toLowerCase().includes(value)));
  if (focused.name !== "type") return i.respond([]);
  const types = Object.entries(TICKET_TYPES).map(([key, spec]) => ({ name: spec.label, value: key }));
  if (i.commandName === "support") types.unshift({ name: "All ticket types", value: "all" });
  return i.respond(types.filter((o) => o.name.toLowerCase().includes(value) || o.value.includes(value)).slice(0, 25));
}

/* ------------------------------------------------------------------ background */

/** First staff reply counts as the first response. */
export async function onMessage(message) {
  if (message.author.bot || !message.guild || !message.channel.parentId) return;
  const cfg = await config();
  if (!Object.values(cfg.categories || {}).includes(message.channel.parentId)) return;
  const row = await db.one("SELECT * FROM devops_tickets WHERE channel_id=? AND status<>'closed' AND first_response_at IS NULL", [message.channelId]);
  if (!row || String(row.author_id) === message.author.id) return;
  const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;
  const roles = await supportRoleIds(message.guild, row.type);
  const staff = roles.some((id) => member.roles.cache.has(id)) || (await authority(member)).admin;
  if (!staff) return;
  await db.query("UPDATE devops_tickets SET first_response_at=? WHERE id=?", [Date.now(), row.id]);
  await refresh(row.id, message.guild.id);
}

/** Pings support when a ticket passes its response target without an answer. */
export async function slaTick(guild) {
  const cfg = await config();
  if (!cfg.settings.slaReminders) return;
  const rows = await db.query("SELECT * FROM devops_tickets WHERE guild_id=? AND status<>'closed' AND first_response_at IS NULL AND overdue_notified=0 AND due_at<?", [guild.id, Date.now()]);
  for (const row of rows) {
    const channel = await fetchChannel(row);
    if (!channel) continue;
    const roles = (await supportRoleIds(guild, row.type)).filter((id) => id !== cfg.roles.leadership);
    await notice(channel, `⏰ This ticket passed its **${priority(row.priority).label}** response target ${when(row.due_at)}. ${roles.map((id) => `<@&${id}>`).join(" ")} please take a look.`, C.amber, { allowedMentions: { roles } });
    await db.query("UPDATE devops_tickets SET overdue_notified=1 WHERE id=?", [row.id]);
    await ticketLog(guild, row, { title: "Ticket overdue", color: C.amber, fields: [["Ticket", `**#${row.id}** · ${channel}`], ["Priority", `${priorityEmoji(row.priority)} ${priority(row.priority).label}`]] });
  }
}
