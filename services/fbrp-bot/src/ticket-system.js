import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import { BRAND, chunkLines, clip, field, humanize, stamp, when } from "./ui.js";

/** Built-in defaults; the live configuration is the ticket_types table (editable in the control panel). */
export const TICKET_TYPES = {
  support: { label: "General Support", description: "Questions, account problems, and anything else.", priority: 3, fields: [["subject","Subject","short",true,100],["description","Describe what you need","paragraph",true,1000],["tried","What have you already tried?","paragraph",false,500]] },
  store: { label: "Store / Purchase", description: "Package grants, purchases, and missing items.", priority: 1, fields: [["transaction","Transaction or receipt ID","short",false,80],["item","Package or item","short",true,100],["issue","What went wrong?","paragraph",true,1000]] },
  report: { label: "Player Report", description: "Rule violations, exploits, or abuse by another player.", priority: 0, fields: [["player","Player name or server ID","short",true,80],["scene","Scene, time, or server ID","short",false,80],["what","What happened?","paragraph",true,1000],["evidence","Evidence links","paragraph",false,500]] },
  iaa: { label: "IAA Ticket", description: "Transfer and merge requests for staff, departments, gangs, and other server roles.", priority: 2, fields: [["subject","Transfer or merge request","short",true,100],["origin","Current server, department, or role","short",true,120],["request","Describe the transfer or merge","paragraph",true,1000],["evidence","Proof or supporting links","paragraph",false,500]] },
  bug: { label: "Bug Report", description: "Report a reproducible server or bot problem.", priority: 3, fields: [["what","What is broken?","paragraph",true,1000],["steps","Steps to reproduce","paragraph",true,1000],["clip","Screenshot or video link","short",false,300]] },
  creator: { label: "Partnership / Creator", description: "Creator, community, or partnership proposals.", priority: 2, fields: [["organisation","Organization or channel","short",true,100],["audience","Audience and reach","short",true,100],["proposal","Your proposal","paragraph",true,1000],["links","Relevant links","paragraph",false,500]] },
  security: { label: "Security Ticket", description: "Privately disclose a security concern.", priority: 1, fields: [["subject","Security concern","short",true,100],["description","Detailed description","paragraph",true,1000],["affected","Affected systems","short",false,200],["evidence","Private evidence links","paragraph",false,500]] },
  management: { label: "Management Ticket", description: "Escalations and requests for server management.", priority: 2, fields: [["subject","Subject","short",true,100],["description","Detailed request","paragraph",true,1000],["area","Department or area","short",false,100],["outcome","Requested outcome","paragraph",false,500]] },
};
const PRIORITY_DEFAULTS = [{label:"Critical",sla:10},{label:"High",sla:30},{label:"Priority",sla:60},{label:"Standard",sla:240}];
const TYPE_EMOJI = { support: "🛠️", store: "🛒", report: "🚨", appeal: "⚖️", iaa: "🔄", bug: "🐛", creator: "🎥", security: "🔐", management: "📋" };
const PRIORITY_EMOJI = ["🔴", "🟠", "🟡", "🔵"];
const STATUS = {
  open: { icon: "🟢", label: "Open", color: 0x43e8d8 },
  claimed: { icon: "🟣", label: "Claimed", color: 0x9b8cff },
  closed: { icon: "🔒", label: "Closed", color: 0x8b95a7 },
};
const parseJson = (value, fallback) => { if (typeof value !== "string") return value ?? fallback; try { return JSON.parse(value); } catch { return fallback; } };
const typeEmoji = (key) => TYPE_EMOJI[key] || "🎫";
const priorityEmoji = (level) => PRIORITY_EMOJI[Number(level)] || "⚪";

/** `2h 14m`, `3d 4h`, `45s`. */
function duration(ms) {
  const s = Math.max(0, Math.floor(Number(ms) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/** Quote-styled answer block for a form field. */
const quote = (value) => clip(value, 1000).split("\n").map((row) => `> ${row}`).join("\n");

const button = (id, label, emoji, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);

const publicBase = () => String(process.env.FBRP_PUBLIC_URL || "https://floridabay.net").replace(/\/$/, "");
const transcriptUrl = (id) => `${publicBase()}/transcript.html?id=${Number(id)}`;
const transcriptLink = (id, label = "View hosted transcript") => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setLabel(label).setEmoji("📄").setStyle(ButtonStyle.Link).setURL(transcriptUrl(id)),
);

export function createTicketSystem(ctx) {
  const { client, db, audit, hasPermission, requireMinimumStaffRank, clean, safeName, embed, card, colors, log } = ctx;
  const mention = (id) => `<@${id}>`;
  /** type key → {label, description, priority, enabled, fields:[[id,label,style,required,max]]} */
  const ticketTypes = async ({ includeDisabled = false } = {}) => {
    const rows = await db.query("SELECT * FROM ticket_types ORDER BY sort_order,label").catch(() => []);
    if (!rows.length) return Object.fromEntries(Object.entries(TICKET_TYPES).map(([key, spec]) => [key, { ...spec, enabled: true }]));
    return Object.fromEntries(rows.filter((row) => includeDisabled || row.enabled).map((row) => [row.type_key, {
      label: row.label,
      description: row.description || row.label,
      priority: Number(row.priority),
      enabled: Boolean(row.enabled),
      fields: (parseJson(row.fields, []) || []).map((f) => [f.id, f.label, f.style, Boolean(f.required), Number(f.max) || 1000]),
    }]));
  };
  const ticketType = async (type, options) => {
    const spec = (await ticketTypes(options))[type];
    if (!spec) throw new Error("Unknown or disabled ticket type.");
    return spec;
  };
  /** level → {label, sla (minutes)} */
  const priorities = async () => {
    const rows = await db.query("SELECT * FROM ticket_priorities ORDER BY level").catch(() => []);
    if (!rows.length) return PRIORITY_DEFAULTS;
    const out = [];
    for (const row of rows) out[Number(row.level)] = { label: row.label, sla: Number(row.sla_minutes) };
    return out;
  };
  const priority = (list, level) => list[Number(level)] || { label: `Level ${level}`, sla: 240 };
  const setting = async (guild, key, fallback = null) => {
    const row = await db.one("SELECT value FROM ticket_settings WHERE guild_id=? AND `key`=?", [guild,key]);
    if (!row) return fallback;
    if (typeof row.value !== "string") return row.value;
    // MariaDB/mysql2 may decode a JSON string to its bare scalar. Discord
    // snowflakes must stay strings: parsing a 19-digit ID as a Number loses
    // precision and makes Discord silently create the channel uncategorized.
    if (/^\d{16,22}$/.test(row.value)) return row.value;
    try { return JSON.parse(row.value); } catch { return fallback; }
  };
  const setSetting = (guild,key,value) => db.query("INSERT INTO ticket_settings(guild_id,`key`,value) VALUES(?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)", [guild,key,JSON.stringify(value)]);
  const addEvent = (ticket,type,actor,detail={}) => db.query("INSERT INTO ticket_events(ticket_id,guild_id,event_type,actor_id,detail,created_at) VALUES(?,?,?,?,?,?)", [ticket?.id||null,ticket?.guild_id||detail.guild,type,actor||null,JSON.stringify(detail),Date.now()]);
  const staff = (id, object="fbrp.tickets.support") => hasPermission(id,object);
  const configuredTicketRoles = (guildId, type) => db.query(
    "SELECT role_id,level FROM ticket_support_roles WHERE guild_id=? AND ticket_type IN (?, 'all')",
    [guildId,type],
  );
  const ownerIds = () => new Set(String(process.env.FBRP_SUPERUSER_IDS||"").split(",").map((id)=>id.trim()).filter(Boolean));
  const ticketAccess = async (i, type = "all", object = "fbrp.tickets.support", managersOnly = false) => {
    const configured = await configuredTicketRoles(i.guildId, type);
    if (configured.length) {
      if (ownerIds().has(String(i.user.id))) return true;
      const member = await i.guild.members.fetch(i.user.id).catch(() => null);
      if (!member) return false;
      return configured
        .filter((row) => !managersOnly || row.level === "manager")
        .some((row) => member.roles.cache.has(String(row.role_id)));
    }
    if (await staff(i.user.id, object)) return true;
    const member = await i.guild.members.fetch(i.user.id).catch(() => null);
    if (!member) return false;
    const rows = await db.query(
      `SELECT role_id FROM ticket_support_roles WHERE guild_id=? AND ticket_type IN (?, 'all')${managersOnly ? " AND level='manager'" : ""}`,
      [i.guildId, type],
    );
    return rows.some((row) => member.roles.cache.has(String(row.role_id)));
  };
  const ticketRoleIds = async (guild, type) => {
    const configured = await configuredTicketRoles(guild.id, type);
    const rows = configured.length ? configured : await db.query(
      "SELECT DISTINCT b.role_id FROM discord_role_bindings b JOIN ace_entries e ON e.group_name=b.group_name WHERE b.guild_id=? AND e.mode='allow' AND e.object IN ('*','fbrp.*','fbrp.tickets','fbrp.tickets.*','fbrp.tickets.support')",
      [guild.id],
    );
    return [...new Set(rows.map((row)=>String(row.role_id)))].filter((id)=>guild.roles.cache.has(id));
  };
  const ticketOverwrites = async (guild, row, participantIds = []) => {
    const allow = [PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.EmbedLinks];
    const overwrites = new Map();
    overwrites.set(guild.roles.everyone.id,{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]});
    for (const id of new Set([String(row.author_id),...participantIds.map(String)])) overwrites.set(id,{id,allow});
    overwrites.set(client.user.id,{id:client.user.id,allow:[...allow,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageMessages]});
    for (const id of await ticketRoleIds(guild,row.type)) overwrites.set(id,{id,allow});
    for (const id of ownerIds()) if (!overwrites.has(id)) overwrites.set(id,{id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
    return [...overwrites.values()];
  };
  const syncTicketPermissions = async (guild, row) => {
    const channel = await guild.channels.fetch(String(row.channel_id)).catch(()=>null);
    if (!channel) throw new Error("The ticket channel is unavailable.");
    const participants = await db.query("SELECT user_id FROM ticket_participants WHERE ticket_id=?",[row.id]);
    await channel.permissionOverwrites.set(
      await ticketOverwrites(guild,row,participants.map((entry)=>entry.user_id)),
      `Sync support roles for ticket #${row.id}`,
    );
  };
  const ticketById = (guildId, id) => db.one("SELECT * FROM support_tickets WHERE guild_id=? AND id=?", [guildId, id]);
  const fetchChannel = (row) => (row?.channel_id ? client.channels.fetch(String(row.channel_id)).catch(() => null) : null);
  /** Compact description-only embed posted in the ticket channel so the member sees what staff did. */
  const notice = (channel, text, color = colors.primary, extra = {}) =>
    channel?.send({ embeds: [new EmbedBuilder().setColor(color).setDescription(clip(text, 4096))], allowedMentions: { parse: [] }, ...extra }).catch(() => null);
  const ticketLog = (guild, row, spec) => log(guild, { footer: `${BRAND} · Ticket #${row.id}`, ...spec }, "tickets");

  /** The pinned-to-the-top control message: status, owner, staff and the form answers. */
  function controlEmbed(row, spec, levels) {
    const status = STATUS[row.status] || STATUS.open;
    const p = priority(levels, row.priority);
    const form = parseJson(row.form_data, {}) || {};
    const labels = Object.fromEntries((spec?.fields || []).map(([id, label]) => [id, label]));
    const closed = row.status === "closed";
    const description = closed
      ? `This ticket was closed by ${mention(row.closed_by)} ${when(row.closed_at)}.${row.close_reason ? `\n> ${clip(row.close_reason, 300)}` : ""}`
      : `Thanks for reaching out, ${mention(row.author_id)}. A member of staff will be with you shortly.\nShare any extra details, screenshots or evidence below while you wait.`;
    const responded = row.first_response_at ? `Answered ${when(row.first_response_at)}` : row.due_at ? when(row.due_at) : "None";
    const e = new EmbedBuilder()
      .setColor(status.color)
      .setAuthor({ name: `${typeEmoji(row.type)} ${spec?.label || humanize(row.type)} · Ticket #${row.id}` })
      .setTitle(clip(row.subject || spec?.label || "Support ticket", 256).replace(/\n/g, " "))
      .setDescription(description)
      .addFields(
        field("Status", `${status.icon} ${status.label}`),
        field("Priority", `${priorityEmoji(row.priority)} ${p.label}`),
        field(closed ? "Open for" : "Response target", closed ? duration(Number(row.closed_at) - Number(row.created_at)) : responded),
        field("Opened by", mention(row.author_id)),
        field("Claimed by", row.claimed_by ? mention(row.claimed_by) : "Unclaimed"),
        field("Opened", stamp(row.created_at)),
      )
      .setFooter({ text: `${BRAND} · Ticket #${row.id}` })
      .setTimestamp(Number(row.created_at) || Date.now());
    const answers = Object.entries(form).filter(([, value]) => String(value || "").trim() && String(value).trim() !== String(row.subject || "").trim()).slice(0, 18);
    if (answers.length) e.addFields(answers.map(([key, value]) => field(labels[key] || humanize(key), quote(value), false)));
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

  async function controlPayload(row) {
    const [types, levels] = await Promise.all([ticketTypes({ includeDisabled: true }), priorities()]);
    return { embeds: [controlEmbed(row, types[row.type], levels)], components: controlComponents(row), allowedMentions: { parse: [] } };
  }

  /** Re-renders the control message after any change (claim, priority, close, reopen…). */
  async function refresh(id, guildId) {
    const row = await ticketById(guildId, id);
    if (!row) return null;
    const event = await db.one("SELECT detail FROM ticket_events WHERE ticket_id=? AND event_type='control' ORDER BY id DESC LIMIT 1", [row.id]);
    const messageId = parseJson(event?.detail, {})?.message;
    const channel = await fetchChannel(row);
    const message = messageId && channel ? await channel.messages.fetch(String(messageId)).catch(() => null) : null;
    if (message) await message.edit(await controlPayload(row)).catch(() => {});
    return row;
  }

  /** Gives tickets opened before the button panel existed a control message of their own. */
  async function backfillControls() {
    const rows = await db.query(
      "SELECT t.* FROM support_tickets t WHERE t.status<>'closed' AND t.channel_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ticket_events e WHERE e.ticket_id=t.id AND e.event_type='control')",
    );
    for (const row of rows) {
      const channel = await fetchChannel(row);
      if (!channel?.isTextBased()) continue;
      const message = await channel.send(await controlPayload(row)).catch(() => null);
      if (message) await addEvent(row, "control", client.user.id, { message: message.id, backfill: true });
    }
    return rows.length;
  }

  async function modal(type) {
    const spec = await ticketType(type);
    const result = new ModalBuilder().setCustomId(`ticket:modal:${type}`).setTitle(spec.label.slice(0, 45));
    for (const [id,label,style,required,max] of spec.fields.slice(0, 5))
      result.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(style==="paragraph"?TextInputStyle.Paragraph:TextInputStyle.Short).setRequired(required).setMaxLength(max)));
    return result;
  }

  async function create(guild,user,type,form) {
    const spec = await ticketType(type);
    const levels = await priorities();
    const maxOpen = Number(await setting(guild.id,"max_open",3));
    const count = await db.one("SELECT COUNT(*) count FROM support_tickets WHERE guild_id=? AND author_id=? AND status<>'closed'",[guild.id,user.id]);
    if (Number(count?.count||0)>=maxOpen) throw new Error(`You already have the maximum of ${maxOpen} open tickets.`);
    const cooldown = Number(await setting(guild.id,"cooldown_seconds",60));
    const latest = await db.one("SELECT created_at FROM support_tickets WHERE guild_id=? AND author_id=? ORDER BY id DESC LIMIT 1",[guild.id,user.id]);
    if (latest && Date.now()-Number(latest.created_at)<cooldown*1000) throw new Error(`Please wait ${cooldown} seconds between tickets.`);
    const subject = clean(form.subject||form.item||form.player||form.what||form.organisation||Object.values(form).find(Boolean)||spec.label,100);
    const createdAt = Date.now();
    const dueAt = createdAt+priority(levels,spec.priority).sla*60000;
    const insert = await db.query("INSERT INTO support_tickets(guild_id,author_id,type,subject,status,priority,due_at,form_data,created_at,last_activity) VALUES(?,?,?,?,?,?,?,?,?,?)",[guild.id,user.id,type,subject,"open",spec.priority,dueAt,JSON.stringify(form),createdAt,createdAt]);
    const ticket = {id:insert.insertId,guild_id:guild.id,type};
    const overwrites = await ticketOverwrites(guild,{author_id:user.id,type},[user.id]);
    try {
      const category = await setting(guild.id,`category_${type}`,await setting(guild.id,"category_all",null));
      const panelBinding = await db.one("SELECT channel_id FROM discord_channel_bindings WHERE purpose='ticket_panel'");
      const panel = panelBinding ? await client.channels.fetch(String(panelBinding.channel_id)).catch(()=>null) : null;
      const channel = await guild.channels.create({
        name:`${type}-${insert.insertId}-${safeName(user.username,"username").slice(0,16)}`,
        type:ChannelType.GuildText,parent:category||(panel?.guildId===guild.id?panel.parentId:undefined)||undefined,
        topic:`FBRP ${spec.label} #${insert.insertId} | owner ${user.id} | priority ${priority(levels,spec.priority).label}`,
        permissionOverwrites:overwrites,reason:`Ticket opened by ${user.tag}`,
      });
      await db.query("UPDATE support_tickets SET channel_id=? WHERE id=?",[channel.id,insert.insertId]);
      await db.query("INSERT IGNORE INTO ticket_participants(ticket_id,user_id,added_by,added_at) VALUES(?,?,?,?)",[insert.insertId,user.id,user.id,Date.now()]);
      const row = await ticketById(guild.id, insert.insertId);
      const message = await channel.send({ content: mention(user.id), ...(await controlPayload(row)), allowedMentions: { users: [user.id] } });
      await message.pin().then(() => channel.messages.fetch({ limit: 3 })).then((recent) => recent.find((m) => m.system && m.type === 6)?.delete()).catch(() => {});
      await addEvent(ticket,"control",client.user.id,{message:message.id});
      await addEvent(ticket,"open",user.id,{type,subject,form});
      await audit(user.id,"ticket.open",insert.insertId,{channel:channel.id,type,subject});
      await ticketLog(guild,row,{title:"Ticket opened",color:colors.success,actor:user.id,fields:[["Ticket",`**#${insert.insertId}** · ${channel}`],["Type",`${typeEmoji(type)} ${spec.label}`],["Priority",`${priorityEmoji(spec.priority)} ${priority(levels,spec.priority).label}`],["Subject",subject,false]]});
      return channel;
    } catch (error) { await db.query("DELETE FROM support_tickets WHERE id=?",[insert.insertId]); throw error; }
  }

  /** Captures a ticket as structured data and stores it for the authenticated website viewer. */
  async function hostTranscript(row, actorId = client.user.id, channel) {
    channel ??= await fetchChannel(row);
    if (!channel?.isTextBased()) throw new Error("The ticket channel is unavailable.");
    const messages=[]; let before;
    while(messages.length<2000){const batch=await channel.messages.fetch({limit:100,before});if(!batch.size)break;messages.push(...batch.values());before=batch.last().id;if(batch.size<100)break;}
    messages.reverse();
    const types = await ticketTypes({ includeDisabled: true });
    const visible = messages.filter((m) => !m.system).map((m) => ({
      id: String(m.id),
      at: Number(m.createdTimestamp),
      content: String(m.cleanContent || ""),
      author: {
        id: String(m.author.id),
        name: String(m.member?.displayName || m.author.globalName || m.author.username),
        username: String(m.author.username),
        avatar: m.author.displayAvatarURL({ extension: "webp", size: 128 }),
        bot: Boolean(m.author.bot),
      },
      embeds: m.embeds.map((e) => ({
        author: e.author?.name || null, title: e.title || null, description: e.description || null,
        color: e.color || null, fields: e.fields.map((f) => ({ name: f.name, value: f.value, inline: Boolean(f.inline) })),
      })),
      attachments: [...m.attachments.values()].map((a) => ({ name: a.name, url: a.url, contentType: a.contentType, size: a.size })),
      reactions: [...m.reactions.cache.values()].map((r) => ({ emoji: r.emoji.toString(), count: r.count })),
    }));
    const content = {
      version: 1,
      ticket: {
        id: Number(row.id), type: row.type, typeLabel: types[row.type]?.label || row.type,
        subject: row.subject, authorId: String(row.author_id), claimedBy: row.claimed_by ? String(row.claimed_by) : null,
        status: row.status, createdAt: Number(row.created_at), closedAt: row.closed_at ? Number(row.closed_at) : null,
        closedBy: row.closed_by ? String(row.closed_by) : null, closeReason: row.close_reason || null,
        guildId: String(row.guild_id), guildName: channel.guild?.name || BRAND,
      },
      messages: visible,
    };
    const generatedAt = Date.now();
    await db.query(
      `INSERT INTO ticket_transcripts(ticket_id,content,message_count,generated_at,generated_by,revision) VALUES(?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE content=VALUES(content),message_count=VALUES(message_count),generated_at=VALUES(generated_at),generated_by=VALUES(generated_by),revision=revision+1`,
      [row.id, JSON.stringify(content), visible.length, generatedAt, String(actorId || client.user.id)],
    );
    return { url: transcriptUrl(row.id), count: visible.length, generatedAt, content };
  }

  /** Preserves a useful lifecycle archive when an older ticket channel was already deleted. */
  async function fallbackTranscript(row, actorId = client.user.id) {
    const [types, events] = await Promise.all([
      ticketTypes({ includeDisabled: true }),
      db.query("SELECT event_type,actor_id,detail,created_at FROM ticket_events WHERE ticket_id=? ORDER BY id", [row.id]),
    ]);
    const form = parseJson(row.form_data, {}) || {};
    const messages = [];
    const archiveAuthor = { id: String(client.user.id), name: "Florida Bay Archive", username: "archive", avatar: `${publicBase()}/logo-128.webp`, bot: true };
    const answers = Object.entries(form).filter(([, value]) => String(value || "").trim());
    if (answers.length) messages.push({
      id: `form-${row.id}`, at: Number(row.created_at), author: archiveAuthor,
      content: "Original ticket form",
      embeds: [{ title: row.subject, description: null, color: 4372696, fields: answers.map(([name, value]) => ({ name: humanize(name), value: String(value), inline: false })) }],
      attachments: [], reactions: [],
    });
    const labels = { open: "Ticket opened", claim: "Ticket claimed", release: "Ticket released", transfer: "Ticket transferred", close_request: "Closure requested", close: "Ticket closed", reopen: "Ticket reopened", priority: "Priority changed", move: "Category changed", add: "Participant added", remove: "Participant removed", rename: "Ticket renamed" };
    for (const [index, event] of events.filter((item) => !["control", "transcript", "note"].includes(item.event_type)).entries()) {
      const detail = parseJson(event.detail, {}) || {};
      const notes = [detail.reason, detail.subject, detail.to && `To: ${detail.to}`, detail.from && `From: ${detail.from}`].filter(Boolean).join(" · ");
      messages.push({ id: `event-${row.id}-${index}`, at: Number(event.created_at), author: archiveAuthor, content: `${labels[event.event_type] || humanize(event.event_type)}${notes ? ` — ${notes}` : ""}`, embeds: [], attachments: [], reactions: [] });
    }
    const generatedAt = Date.now();
    const content = {
      version: 1, partial: true,
      archiveNotice: "The original Discord channel had already been deleted or was unavailable. This archive was rebuilt from the preserved ticket form and lifecycle history.",
      ticket: { id: Number(row.id), type: row.type, typeLabel: types[row.type]?.label || row.type, subject: row.subject, authorId: String(row.author_id), claimedBy: row.claimed_by ? String(row.claimed_by) : null, status: row.status, createdAt: Number(row.created_at), closedAt: row.closed_at ? Number(row.closed_at) : null, closedBy: row.closed_by ? String(row.closed_by) : null, closeReason: row.close_reason || null, guildId: String(row.guild_id), guildName: BRAND },
      messages,
    };
    await db.query(
      `INSERT INTO ticket_transcripts(ticket_id,content,message_count,generated_at,generated_by,revision) VALUES(?,?,?,?,?,1)
       ON DUPLICATE KEY UPDATE content=VALUES(content),message_count=VALUES(message_count),generated_at=VALUES(generated_at),generated_by=VALUES(generated_by),revision=revision+1`,
      [row.id, JSON.stringify(content), messages.length, generatedAt, String(actorId || client.user.id)],
    );
    return { url: transcriptUrl(row.id), count: messages.length, generatedAt, content, partial: true };
  }

  const captureTranscript = (row, actorId, channel) => hostTranscript(row, actorId, channel).catch(() => fallbackTranscript(row, actorId));

  async function websiteTranscript(ticketId, actorId, { refresh = false } = {}) {
    const row = await db.one("SELECT * FROM support_tickets WHERE id=?", [Number(ticketId)]);
    if (!row) throw new Error("Ticket not found.");
    let stored = !refresh && await db.one("SELECT * FROM ticket_transcripts WHERE ticket_id=?", [row.id]);
    if (!stored) await captureTranscript(row, actorId);
    stored = await db.one("SELECT * FROM ticket_transcripts WHERE ticket_id=?", [row.id]);
    if (!stored) throw new Error("Transcript is unavailable.");
    return { ...parseJson(stored.content, {}), messageCount: Number(stored.message_count), generatedAt: Number(stored.generated_at), revision: Number(stored.revision) };
  }

  async function backfillTranscripts() {
    const rows = await db.query("SELECT t.* FROM support_tickets t LEFT JOIN ticket_transcripts x ON x.ticket_id=t.id WHERE x.ticket_id IS NULL AND t.channel_id IS NOT NULL ORDER BY t.id");
    let saved = 0;
    for (const row of rows) {
      if (await captureTranscript(row, client.user.id).then(() => true, () => false)) saved += 1;
    }
    return { found: rows.length, saved };
  }

  async function claim(guild, row, actorId, claimed = row.claimed_by !== actorId) {
    if (row.status === "closed") throw new Error("This ticket is closed. Reopen it first.");
    await db.query("UPDATE support_tickets SET status=?,claimed_by=?,claimed_at=?,first_response_at=COALESCE(first_response_at,?) WHERE id=?",[claimed?"claimed":"open",claimed?actorId:null,claimed?Date.now():null,claimed?Date.now():null,row.id]);
    await addEvent(row,claimed?"claim":"release",actorId);
    await audit(actorId,`ticket.${claimed?"claim":"release"}`,row.id,{});
    await refresh(row.id, guild.id);
    const channel = await fetchChannel(row);
    await notice(channel, claimed ? `🙋 ${mention(actorId)} has claimed this ticket and will be assisting you.` : `↩️ ${mention(actorId)} released this ticket back to the queue.`, claimed ? colors.success : colors.warning);
    await ticketLog(guild,row,{title:claimed?"Ticket claimed":"Ticket released",color:claimed?colors.success:colors.warning,actor:actorId,fields:[["Ticket",`**#${row.id}**${row.channel_id?` · <#${row.channel_id}>`:""}`],["Owner",mention(row.author_id)]]});
    return card(claimed ? "Ticket claimed" : "Ticket released", { color: claimed ? colors.success : colors.warning, description: claimed ? `You are now handling ticket **#${row.id}**.` : `Ticket **#${row.id}** is back in the queue.` });
  }

  async function close(guild, row, actorId, reasonText) {
    if (row.status === "closed") throw new Error("This ticket is already closed.");
    const reason = clean(reasonText || "No reason given", 300);
    const closedAt = Date.now();
    await db.query("UPDATE support_tickets SET status='closed',closed_at=?,closed_by=?,close_reason=? WHERE id=?",[closedAt,actorId,reason,row.id]);
    const channel = await fetchChannel(row);
    const participants = await db.query("SELECT user_id FROM ticket_participants WHERE ticket_id=?",[row.id]);
    for (const id of new Set([String(row.author_id), ...participants.map((p) => String(p.user_id))]))
      await channel?.permissionOverwrites.edit(id,{SendMessages:false},"Ticket closed").catch(()=>{});
    if(row.claimed_by)await db.query("UPDATE staff_roster_members SET tickets_handled=tickets_handled+1,updated_at=? WHERE discord_id=?",[Date.now(),row.claimed_by]);
    await addEvent(row,"close",actorId,{reason});
    await audit(actorId,"ticket.close",row.id,{reason});
    const updated = await refresh(row.id, guild.id) || { ...row, status: "closed", closed_at: closedAt, closed_by: actorId, close_reason: reason };
    const hosted = await captureTranscript(updated, actorId, channel).catch(() => null);
    const summary = [
      ["Opened by", mention(row.author_id)],
      ["Handled by", row.claimed_by ? mention(row.claimed_by) : "Unclaimed"],
      ["Open for", duration(closedAt - Number(row.created_at))],
    ];
    await channel?.send({
      embeds: [card("Ticket closed", { color: colors.warning, description: `🔒 Closed by ${mention(actorId)} ${when(closedAt)}.\n> ${reason}`, rows: summary, footer: `${BRAND} · Ticket #${row.id}` })],
      components: closedComponents(row.id),
      allowedMentions: { parse: [] },
    }).catch(() => {});
    await channel?.setName(`closed-${row.id}-${row.type}`).catch(()=>{});
    await ticketLog(guild,row,{title:"Ticket closed",color:colors.warning,actor:actorId,target:row.author_id,fields:[["Ticket",`**#${row.id}**${row.channel_id?` · <#${row.channel_id}>`:""}`],...summary.slice(1),["Reason",reason,false],["Transcript",hosted?`[View ${hosted.count}-message hosted transcript](${hosted.url})`:"Unavailable",false]]});
    const owner = await client.users.fetch(String(row.author_id)).catch(() => null);
    const types = await ticketTypes({ includeDisabled: true });
    await owner?.send({
      embeds: [card(`Your ticket #${row.id} was closed`, {
        color: colors.warning,
        description: `Your **${types[row.type]?.label || row.type}** ticket in **${guild.name}** has been closed.\n> ${reason}\n\nNeed more help? Open a new ticket from the support panel at any time.`,
        rows: [["Subject", clip(row.subject, 200), false], ["Handled by", row.claimed_by ? mention(row.claimed_by) : "Unclaimed"], ["Open for", duration(closedAt - Number(row.created_at))]],
        footer: `${BRAND} · Ticket #${row.id}`,
      })],
      components: hosted ? [transcriptLink(row.id)] : [],
    }).catch(() => {});
    return card("Ticket closed", { color: colors.warning, description: `Ticket **#${row.id}** is now read-only.${hosted ? ` The transcript is hosted securely at ${hosted.url}.` : ""}\n> ${reason}` });
  }

  async function reopen(guild, row, actorId) {
    if (row.status !== "closed") throw new Error("This ticket is not closed.");
    const channel = await fetchChannel(row);
    if (!channel) throw new Error("The ticket channel was deleted, so it cannot be reopened.");
    await db.query("UPDATE support_tickets SET status=?,closed_at=NULL,closed_by=NULL,close_reason=NULL,reopen_count=reopen_count+1 WHERE id=?",[row.claimed_by?"claimed":"open",row.id]);
    const participants = await db.query("SELECT user_id FROM ticket_participants WHERE ticket_id=?",[row.id]);
    for (const id of new Set([String(row.author_id), ...participants.map((p) => String(p.user_id))]))
      await channel.permissionOverwrites.edit(id,{ViewChannel:true,SendMessages:true},"Ticket reopened").catch(()=>{});
    await channel.setName(`${row.type}-${row.id}-reopened`).catch(()=>{});
    await addEvent(row,"reopen",actorId);
    await audit(actorId,"ticket.reopen",row.id,{});
    await refresh(row.id, guild.id);
    await notice(channel, `🔓 ${mention(actorId)} reopened this ticket.`, colors.success);
    await ticketLog(guild,row,{title:"Ticket reopened",color:colors.success,actor:actorId,target:row.author_id,fields:[["Ticket",`**#${row.id}** · ${channel}`]]});
    return card("Ticket reopened", { color: colors.success, description: `Ticket **#${row.id}** is open again.` });
  }

  async function addMembers(guild, row, actorId, userIds) {
    const channel = await fetchChannel(row);
    if (!channel) throw new Error("The ticket channel is unavailable.");
    const added = [];
    for (const id of userIds) {
      if (String(id) === String(row.author_id)) continue;
      await db.query("INSERT IGNORE INTO ticket_participants(ticket_id,user_id,added_by,added_at) VALUES(?,?,?,?)",[row.id,id,actorId,Date.now()]);
      const ok = await channel.permissionOverwrites.edit(id,{ViewChannel:true,SendMessages:row.status!=="closed",ReadMessageHistory:true,AttachFiles:true},"Ticket participant added").then(()=>true,()=>false);
      if (ok) added.push(id);
    }
    if (!added.length) throw new Error("Nobody new was added.");
    await addEvent(row,"participant_add",actorId,{users:added});
    await notice(channel, `➕ ${added.map(mention).join(", ")} ${added.length === 1 ? "was" : "were"} added to this ticket by ${mention(actorId)}.`);
    return card("Members added", { color: colors.success, description: `${added.map(mention).join(", ")} can now see ticket **#${row.id}**.` });
  }

  async function removeMember(guild, row, actorId, userId) {
    if (String(userId) === String(row.author_id)) throw new Error("The ticket owner cannot be removed.");
    const channel = await fetchChannel(row);
    await db.query("DELETE FROM ticket_participants WHERE ticket_id=? AND user_id=?",[row.id,userId]);
    await channel?.permissionOverwrites.delete(userId,"Ticket participant removed").catch(()=>{});
    await addEvent(row,"participant_remove",actorId,{user:userId});
    await notice(channel, `➖ ${mention(userId)} was removed from this ticket by ${mention(actorId)}.`, colors.warning);
    return card("Member removed", { color: colors.warning, description: `${mention(userId)} no longer has access to ticket **#${row.id}**.` });
  }

  async function setPriority(guild, row, actorId, level, reason = null) {
    const levels = await priorities();
    if (!levels[level]) throw new Error("Unknown priority level.");
    const due = Date.now()+levels[level].sla*60000;
    await db.query("UPDATE support_tickets SET priority=?,due_at=? WHERE id=?",[level,due,row.id]);
    await addEvent(row,"priority",actorId,{level,reason});
    await refresh(row.id, guild.id);
    await notice(await fetchChannel(row), `⚡ Priority set to **${priorityEmoji(level)} ${levels[level].label}** by ${mention(actorId)}. New response target ${when(due)}.${reason ? `\n> ${clip(reason, 300)}` : ""}`);
    return card("Priority updated", { color: colors.success, description: `Ticket **#${row.id}** is now **${priorityEmoji(level)} ${levels[level].label}**.\nResponse target ${when(due)}.` });
  }

  async function addNote(row, actorId, text) {
    const body = clip(text, 1000);
    if (!body) throw new Error("The note is empty.");
    await db.query("INSERT INTO ticket_notes(ticket_id,author_id,body,created_at) VALUES(?,?,?,?)",[row.id,actorId,body,Date.now()]);
    await addEvent(row,"note",actorId);
    return card("Private note saved", { color: colors.success, description: `Only staff can see notes on ticket **#${row.id}**.\n> ${clip(body, 300).replace(/\n/g, "\n> ")}` });
  }

  async function notesEmbed(row) {
    const notes = await db.query("SELECT * FROM ticket_notes WHERE ticket_id=? ORDER BY id DESC LIMIT 15",[row.id]);
    const blocks = notes.map((n) => `${mention(n.author_id)} · ${when(n.created_at)}\n> ${clip(n.body, 400).replace(/\n/g, "\n> ")}`);
    return card(`Private notes · Ticket #${row.id}`, { description: chunkLines(blocks, 4000, "\n\n")[0] || "No private notes yet. Add one with the **Add note** button.", footer: `${BRAND} · Staff only` });
  }

  async function command(i,sub) {
    if(sub==="open") throw new Error("The ticket form should have opened. Please try again.");
    if(sub==="mine"){
      const rows=await db.query("SELECT * FROM support_tickets WHERE guild_id=? AND author_id=? ORDER BY id DESC LIMIT 25",[i.guildId,i.user.id]);
      const types=await ticketTypes({includeDisabled:true});
      const items=rows.map((r)=>`${(STATUS[r.status]||STATUS.open).icon} **#${r.id}** · ${types[r.type]?.label||r.type}${r.channel_id&&r.status!=="closed"?` · <#${r.channel_id}>`:""}\n${clip(r.subject,80)} · ${when(r.created_at)}`);
      return card("Your tickets",{description:chunkLines(items,4000,"\n\n")[0]||"You have no tickets. Open one from the support panel."});
    }
    if(sub==="list"){
      if(!(await ticketAccess(i,"all","fbrp.tickets"))) throw new Error("You need ticket staff access or the `fbrp.tickets` ACE permission.");
      const rows=await db.query("SELECT * FROM support_tickets WHERE guild_id=? AND status<>'closed' ORDER BY priority,due_at LIMIT 50",[i.guildId]);
      const levels=await priorities();
      const items=rows.map((r)=>`${priorityEmoji(r.priority)} **#${r.id}** · <#${r.channel_id}> · ${priority(levels,r.priority).label}\n${mention(r.author_id)} · ${r.claimed_by?`claimed by ${mention(r.claimed_by)}`:"**unclaimed**"} · due ${when(r.due_at||r.created_at)}`);
      const chunks=chunkLines(items,3900,"\n\n");
      return card("Open support tickets",{description:(chunks[0]||"No open tickets. 🎉")+(chunks.length>1?`\n…and ${rows.length-chunks[0].split("\n\n").length} more.`:""),rows:rows.length?[["Open",String(rows.length)],["Unclaimed",String(rows.filter((r)=>!r.claimed_by).length)],["Overdue",String(rows.filter((r)=>!r.first_response_at&&Number(r.due_at)<Date.now()).length)]]:[]});
    }
    if(sub==="reopen"){
      const row=await ticketById(i.guildId,i.options.getInteger("id",true));
      if(!row||row.status!=="closed") throw new Error("Closed ticket not found.");
      if(!(await ticketAccess(i,row.type))) throw new Error("You need ticket support access.");
      return reopen(i.guild,row,i.user.id);
    }
    const id=i.options.getInteger("id");
    const row=id?await ticketById(i.guildId,id):await db.one(`SELECT * FROM support_tickets WHERE guild_id=? AND channel_id=?${sub==="transcript"?"":" AND status<>'closed'"}`,[i.guildId,i.channelId]);
    if(!row) throw new Error("This is not an active ticket channel.");
    const owner=row.author_id===i.user.id, isStaff=await ticketAccess(i,row.type);
    if(sub==="request-close"){
      if(!owner&&!isStaff)throw new Error("Only the ticket owner or support staff may request closure.");
      const reason=clean(i.options.getString("reason",true),300);
      await db.query("UPDATE support_tickets SET close_requested_by=?,close_requested_at=? WHERE id=?",[i.user.id,Date.now(),row.id]);
      await addEvent(row,"close_request",i.user.id,{reason});
      await notice(i.channel,`📨 ${mention(i.user.id)} asked for this ticket to be closed.\n> ${reason}`,colors.warning,{components:[new ActionRowBuilder().addComponents(button(`tk:close:${row.id}`,"Close ticket","🔒",ButtonStyle.Danger))]});
      return card("Closure requested",{color:colors.warning,description:"Staff have been asked to close this ticket."});
    }
    if(sub==="transcript"){
      if(!owner&&!isStaff)throw new Error("Only ticket participants or support staff can view this transcript.");
      const hosted=await captureTranscript(row,i.user.id);
      await addEvent(row,"transcript",i.user.id,{messages:hosted.count,hosted:true});
      return {embeds:[card("Transcript hosted",{color:colors.success,description:`Ticket **#${row.id}** · ${hosted.count} messages. Sign in with Discord to view it securely.`})],components:[transcriptLink(row.id)]};
    }
    if(sub==="close"){
      if(!owner&&!isStaff)throw new Error("Only the ticket owner or support staff may close it.");
      return close(i.guild,row,i.user.id,i.options.getString("reason",true));
    }
    if(!isStaff)throw new Error("You need ticket support access.");
    if(sub==="claim") return claim(i.guild,row,i.user.id,i.options.getBoolean("claimed")??row.claimed_by!==i.user.id);
    if(sub==="transfer"){
      const user=i.options.getUser("member",true);
      await db.query("UPDATE support_tickets SET status='claimed',claimed_by=?,claimed_at=?,first_response_at=COALESCE(first_response_at,?) WHERE id=?",[user.id,Date.now(),Date.now(),row.id]);
      await addEvent(row,"transfer",i.user.id,{to:user.id});
      await refresh(row.id,i.guildId);
      await notice(i.channel,`🔁 ${mention(i.user.id)} transferred this ticket to ${mention(user.id)}.`);
      await ticketLog(i.guild,row,{title:"Ticket transferred",actor:i.user.id,target:user.id,fields:[["Ticket",`**#${row.id}** · ${i.channel}`]]});
      return card("Ticket transferred",{color:colors.success,description:`Ticket **#${row.id}** is now assigned to ${mention(user.id)}.`});
    }
    if(sub==="add") return addMembers(i.guild,row,i.user.id,[i.options.getUser("member",true).id]);
    if(sub==="remove") return removeMember(i.guild,row,i.user.id,i.options.getUser("member",true).id);
    if(sub==="priority") return setPriority(i.guild,row,i.user.id,Number(i.options.getString("level",true)),clean(i.options.getString("reason",true),300));
    if(sub==="move"){
      const type=i.options.getString("type",true),spec=await ticketType(type,{includeDisabled:true}),category=await setting(i.guildId,`category_${type}`,await setting(i.guildId,"category_all",null));
      await db.query("UPDATE support_tickets SET type=? WHERE id=?",[type,row.id]);if(category)await i.channel.setParent(String(category),{lockPermissions:false}).catch(()=>{});await syncTicketPermissions(i.guild,{...row,type});await addEvent(row,"move",i.user.id,{from:row.type,to:type});
      await refresh(row.id,i.guildId);
      await notice(i.channel,`📂 ${mention(i.user.id)} moved this ticket to **${typeEmoji(type)} ${spec.label}**.`);
      return card("Ticket moved",{color:colors.success,description:`Ticket **#${row.id}** is now **${spec.label}**.`});
    }
    if(sub==="rename"){const name=safeName(i.options.getString("name",true),"channel name");await i.channel.setName(name);await addEvent(row,"rename",i.user.id,{name});return card("Ticket renamed",{color:colors.success,description:`This channel is now **${name}**.`});}
    if(sub==="note") return addNote(row,i.user.id,i.options.getString("text",true));
    if(sub==="notes") return notesEmbed(row);
    throw new Error("Unsupported ticket action.");
  }

  async function supportCommand(i,sub){
    await requireMinimumStaffRank(i,"Co-Owner","configure the ticket system");
    if(!(await ticketAccess(i,"all","fbrp.tickets.manage",true)))throw new Error("You need a ticket manager role or the `fbrp.tickets.manage` ACE permission.");
    if(sub==="panel"){const channel=i.options.getChannel("channel",true);if(!channel.isTextBased())throw new Error("Choose a text channel.");await db.query("INSERT INTO discord_channel_bindings(purpose,guild_id,channel_id,updated_by,updated_at) VALUES('ticket_panel',?,?,?,?) ON DUPLICATE KEY UPDATE guild_id=VALUES(guild_id),channel_id=VALUES(channel_id),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",[i.guildId,channel.id,i.user.id,Date.now()]);await ensurePanel();return card("Ticket panel updated",{color:colors.success,description:`The ticket panel is live in ${channel}.`});}
    if(sub==="category"){const type=clean(i.options.getString("type",true),24),category=i.options.getChannel("category",true);if(type!=="all"&&!(await ticketTypes({includeDisabled:true}))[type])throw new Error("Type must be a configured ticket type or `all`.");if(category.type!==ChannelType.GuildCategory)throw new Error("Choose a Discord category.");await setSetting(i.guildId,`category_${type}`,category.id);return card("Ticket category updated",{color:colors.success,description:`**${type}** tickets will be created under **${category.name}**.`});}
    if(sub==="role"){const type=clean(i.options.getString("type",true),24),role=i.options.getRole("role",true),level=i.options.getString("level",true),mode=i.options.getString("mode",true);if(type!=="all"&&!(await ticketTypes({includeDisabled:true}))[type])throw new Error("Type must be a configured ticket type or `all`.");if(mode==="add")await db.query("INSERT INTO ticket_support_roles(guild_id,ticket_type,role_id,level) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE level=VALUES(level)",[i.guildId,type,role.id,level]);else await db.query("DELETE FROM ticket_support_roles WHERE guild_id=? AND ticket_type=? AND role_id=?",[i.guildId,type,role.id]);return card("Support role updated",{color:colors.success,rows:[["Role",`${role}`],["Ticket type",`\`${type}\``],["Level",humanize(level)],["Action",mode==="add"?"Added":"Removed"]]});}
    if(sub==="limit"){const max=i.options.getInteger("max_open",true),cooldown=i.options.getInteger("cooldown_seconds",true);await Promise.all([setSetting(i.guildId,"max_open",max),setSetting(i.guildId,"cooldown_seconds",cooldown)]);return card("Ticket limits updated",{color:colors.success,rows:[["Maximum open",String(max)],["Cooldown",`${cooldown}s`]]});}
    const [settings,roles]=await Promise.all([db.query("SELECT `key`,value FROM ticket_settings WHERE guild_id=? ORDER BY `key`",[i.guildId]),db.query("SELECT * FROM ticket_support_roles WHERE guild_id=? ORDER BY ticket_type,level",[i.guildId])]);
    const [types,levels]=await Promise.all([ticketTypes({includeDisabled:true}),priorities()]);
    return card("Ticket configuration",{rows:[
      ["Types",chunkLines(Object.entries(types).map(([key,v])=>`${typeEmoji(key)} **${v.label}** · \`${key}\` · ${priority(levels,v.priority).label}${v.enabled?"":" · *disabled*"}`))[0]||"None",false],
      ["Priorities",levels.map((p,level)=>p&&`${priorityEmoji(level)} **${p.label}** · ${p.sla} min target`).filter(Boolean).join("\n")||"Defaults",false],
      ["Settings",chunkLines(settings.map((r)=>`\`${r.key}\` · ${clean(typeof r.value==="string"?r.value:JSON.stringify(r.value),100)}`))[0]||"Defaults",false],
      ["Support roles",chunkLines(roles.map((r)=>`<@&${r.role_id}> · \`${r.ticket_type}\` · ${r.level}`))[0]||"ACE permission fallback only",false],
    ]});
  }

  async function ensurePanel(){
    const binding=await db.one("SELECT guild_id,channel_id FROM discord_channel_bindings WHERE purpose='ticket_panel'");if(!binding)return;
    const channel=await client.channels.fetch(String(binding.channel_id)).catch(()=>null);if(!channel?.isTextBased())throw new Error("Configured ticket panel channel is unavailable.");
    const config=await db.one("SELECT value FROM bot_config WHERE `key`='ticket_panel'");let value=config?.value||{};if(typeof value==="string")try{value=JSON.parse(value);}catch{value={};}
    const types=Object.entries(await ticketTypes()).slice(0,25);
    const title=await setting(binding.guild_id,"panel_title","Florida Bay Support");
    const description=await setting(binding.guild_id,"panel_description","Need a hand from the team? Pick the category that best matches your request from the menu below and fill out the short form. A private channel will be opened just for you and our staff.");
    const placeholder=await setting(binding.guild_id,"panel_placeholder","Choose a ticket category");
    const components=types.length?[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("ticket:select").setPlaceholder(String(placeholder).slice(0,150)).addOptions(types.map(([value,spec])=>({label:spec.label.slice(0,100),description:String(spec.description||spec.label).slice(0,100),value,emoji:typeEmoji(value)}))))]:[];
    const panel=new EmbedBuilder()
      .setColor(colors.primary)
      .setTitle(String(title).slice(0,256))
      .setDescription(clip(types.length?description:"Tickets are currently closed. Please check back later.",4096))
      .setFooter({text:`${BRAND} · Support`});
    if(channel.guild?.iconURL?.()) panel.setThumbnail(channel.guild.iconURL({size:256}));
    if(types.length){
      const categories=chunkLines(types.map(([key,spec])=>`${typeEmoji(key)} **${spec.label}**\n${clip(spec.description||spec.label,120)}`),1024,"\n\n");
      panel.addFields(categories.slice(0,3).map((value,n)=>field(n?"​":"Categories",value,false)));
      panel.addFields(field("Before you open a ticket","• One ticket per issue, please\n• Include IDs, timestamps and evidence links\n• Staff will reply as soon as possible, no need to ping",false));
    }
    const payload={embeds:[panel],components};
    let message=value.message_id?await channel.messages.fetch(String(value.message_id)).catch(()=>null):null;if(message)await message.edit(payload);else message=await channel.send(payload);
    await db.query("INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES('ticket_panel',?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",[JSON.stringify({channel_id:channel.id,message_id:message.id}),client.user.id,Date.now()]);
  }

  const fail = (i, error) => {
    const payload = { embeds: [embed("Something went wrong", clip(error?.message || error, 1000), colors.danger)], components: [] };
    return (i.deferred || i.replied ? i.editReply(payload) : i.reply({ ...payload, ephemeral: true })).catch(() => {});
  };
  const textModal = (id, title, inputId, label, { required = true, max = 1000, placeholder } = {}) => {
    const input = new TextInputBuilder().setCustomId(inputId).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(required).setMaxLength(max);
    if (placeholder) input.setPlaceholder(placeholder);
    return new ModalBuilder().setCustomId(id).setTitle(title).addComponents(new ActionRowBuilder().addComponents(input));
  };

  /** Ticket buttons, menus and modals (`tk:<action>:<ticket id>`). */
  async function ticketComponent(i) {
    const [, action, rawId] = i.customId.split(":");
    const row = await ticketById(i.guildId, Number(rawId));
    if (!row) return fail(i, "This ticket no longer exists.");
    const owner = String(row.author_id) === i.user.id;
    const ownerOrStaff = async () => {
      if (!owner && !(await ticketAccess(i, row.type))) throw new Error("Only the ticket owner or support staff can do that.");
    };
    const staffOnly = async () => {
      if (!(await ticketAccess(i, row.type))) throw new Error("Only support staff can do that.");
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
        await i.deferReply({ ephemeral: true });
        await ownerOrStaff();
        return i.editReply({ embeds: [await close(i.guild, row, i.user.id, i.fields.getTextInputValue("reason"))] });
      }
      if (action === "notemodal") {
        await i.deferReply({ ephemeral: true });
        await staffOnly();
        return i.editReply({ embeds: [await addNote(row, i.user.id, i.fields.getTextInputValue("note"))] });
      }
      if (action === "add") {
        await staffOnly();
        return i.reply({
          ephemeral: true,
          embeds: [card("Add members", { description: `Pick up to five people to add to ticket **#${row.id}**.` })],
          components: [new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`tk:addpick:${row.id}`).setPlaceholder("Choose members").setMinValues(1).setMaxValues(5))],
        });
      }
      if (action === "priority") {
        await staffOnly();
        const levels = await priorities();
        return i.reply({
          ephemeral: true,
          embeds: [card("Change priority", { description: `Ticket **#${row.id}** is currently **${priorityEmoji(row.priority)} ${priority(levels, row.priority).label}**.` })],
          components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`tk:prioritypick:${row.id}`).setPlaceholder("Choose a priority").addOptions(levels.map((p, level) => p && ({ label: p.label.slice(0, 100), description: `${p.sla} minute response target`, value: String(level), emoji: priorityEmoji(level), default: Number(row.priority) === level })).filter(Boolean)))],
        });
      }
      await i.deferReply({ ephemeral: true });
      if (action === "addpick") { await staffOnly(); return i.editReply({ embeds: [await addMembers(i.guild, row, i.user.id, i.values)], components: [] }); }
      if (action === "prioritypick") { await staffOnly(); return i.editReply({ embeds: [await setPriority(i.guild, row, i.user.id, Number(i.values[0]))], components: [] }); }
      if (action === "claim") { await staffOnly(); return i.editReply({ embeds: [await claim(i.guild, row, i.user.id)] }); }
      if (action === "notes") { await staffOnly(); return i.editReply({ embeds: [await notesEmbed(row)] }); }
      if (action === "reopen") { await staffOnly(); return i.editReply({ embeds: [await reopen(i.guild, row, i.user.id)] }); }
      if (action === "transcript") {
        await ownerOrStaff();
        const hosted = await captureTranscript(row, i.user.id);
        await addEvent(row, "transcript", i.user.id, { messages: hosted.count, hosted: true });
        return i.editReply({ embeds: [card("Transcript hosted", { color: colors.success, description: `Ticket **#${row.id}** · ${hosted.count} messages. Sign in with Discord to view it securely.` })], components: [transcriptLink(row.id)] });
      }
      if (action === "delete") {
        await staffOnly();
        if (row.status !== "closed") throw new Error("Close the ticket before deleting its channel.");
        const channel = await fetchChannel(row);
        if (!channel) throw new Error("The ticket channel is already gone.");
        await notice(channel, `🗑️ ${mention(i.user.id)} is deleting this channel in 5 seconds.`, colors.danger);
        await addEvent(row, "delete", i.user.id);
        await audit(i.user.id, "ticket.delete", row.id, { channel: channel.id });
        await ticketLog(i.guild, row, { title: "Ticket channel deleted", color: colors.danger, actor: i.user.id, fields: [["Ticket", `**#${row.id}** · ${channel.name}`]] });
        setTimeout(() => void channel.delete(`Ticket #${row.id} deleted by ${i.user.tag}`).catch(() => {}), 5000);
        return i.editReply({ embeds: [card("Deleting ticket", { color: colors.danger, description: `The channel for ticket **#${row.id}** will be deleted in 5 seconds.` })] });
      }
      throw new Error("Unknown ticket action.");
    } catch (error) {
      return fail(i, error);
    }
  }

  async function component(i){
    if(i.isStringSelectMenu()&&i.customId==="ticket:select"){
      try{await i.showModal(await modal(i.values[0]));}
      catch(error){await i.reply({embeds:[embed("Could not open ticket",clip(error.message||error,1000),colors.danger)],ephemeral:true}).catch(()=>{});}
      // Reset the menu so the same category can be picked again.
      await i.message?.edit({ components: i.message.components }).catch(() => {});
      return true;
    }
    if(i.isModalSubmit()&&i.customId.startsWith("ticket:modal:")){
      const type=i.customId.slice("ticket:modal:".length);await i.deferReply({ephemeral:true});
      try{const spec=await ticketType(type);const form=Object.fromEntries(spec.fields.slice(0,5).map(([id])=>[id,i.fields.getTextInputValue(id)]));const channel=await create(i.guild,i.user,type,form);await i.editReply({embeds:[card("Ticket opened",{color:colors.success,description:`Your private ticket is ready in ${channel}. Staff will be with you shortly.`})]});}
      catch(error){await i.editReply({embeds:[embed("Could not open ticket",clip(error.message||error,1000),colors.danger)]});}
      return true;
    }
    if((i.isButton()||i.isModalSubmit()||i.isAnySelectMenu())&&i.customId.startsWith("tk:")){
      await ticketComponent(i);
      return true;
    }
    return false;
  }
  /** Ticket type and priority pickers read the live configuration, so new types need no command re-registration. */
  async function autocomplete(i){
    const focused=i.options.getFocused(true),value=String(focused.value).toLowerCase();
    if(focused.name==="level"){
      const levels=await priorities();
      return i.respond(levels.map((p,level)=>p&&({name:`${p.label} · ${p.sla} min target`.slice(0,100),value:String(level)})).filter(Boolean).filter((o)=>o.name.toLowerCase().includes(value)).slice(0,25));
    }
    if(focused.name!=="type")return i.respond([]);
    const staffSide=i.commandName==="support"||i.options.getSubcommand(false)==="move";
    const types=Object.entries(await ticketTypes({includeDisabled:staffSide})).map(([key,spec])=>({name:`${spec.label}${spec.enabled?"":" (disabled)"}`.slice(0,100),value:key}));
    if(i.commandName==="support")types.unshift({name:"All ticket types",value:"all"});
    return i.respond(types.filter((o)=>o.name.toLowerCase().includes(value)||o.value.includes(value)).slice(0,25));
  }
  /** Staff-portal bridge. Authorization is performed by the portal before this is called. */
  async function webAction(ticketId, actorId, action, input = {}) {
    const row = await db.one("SELECT * FROM support_tickets WHERE id=?", [Number(ticketId)]);
    if (!row) throw new Error("Ticket not found.");
    const guild = client.guilds.cache.get(String(row.guild_id));
    if (!guild) throw new Error("The ticket's Discord server is unavailable.");
    if (action === "claim") await claim(guild, row, actorId, true);
    else if (action === "release") await claim(guild, row, actorId, false);
    else if (action === "close") await close(guild, row, actorId, input.reason);
    else if (action === "reopen") await reopen(guild, row, actorId);
    else if (action === "priority") await setPriority(guild, row, actorId, Number(input.level), input.reason);
    else if (action === "note") await addNote(row, actorId, input.note);
    else throw new Error("Unknown ticket action.");
    return db.one("SELECT * FROM support_tickets WHERE id=?", [row.id]);
  }
  return {command,supportCommand,ensurePanel,backfillControls,backfillTranscripts,component,modal,create,autocomplete,ticketTypes,priorities,webAction,websiteTranscript};
}
