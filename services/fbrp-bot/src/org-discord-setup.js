/**
 * Build an organization's Discord server and its website roster ranks from one blueprint.
 *
 * The blueprint lists the rank roles (each one becomes an organization rank on the orgs website,
 * with its permissions and the Discord role bound to it), the other roles, and the categories and
 * channels with who can see and write in them. Applying it is idempotent: roles and channels are
 * matched by name and only created when missing, existing ones get the blueprint's permissions, and
 * nothing is ever deleted.
 */

import { PermissionFlagsBits as P, ChannelType } from "discord.js";

const everyone = "@everyone";
const bits = (...names) => names.reduce((total, name) => total | P[name], 0n);

const MEMBER_PERMS = bits("ViewChannel", "SendMessages", "SendMessagesInThreads", "EmbedLinks", "AttachFiles", "ReadMessageHistory", "AddReactions", "UseExternalEmojis", "Connect", "Speak", "UseVAD", "ChangeNickname", "UseApplicationCommands", "CreateInstantInvite");
const LEADER_PERMS = bits("ManageMessages", "KickMembers", "ModerateMembers", "ManageNicknames", "MentionEveryone", "ManageEvents", "ManageThreads", "MuteMembers", "MoveMembers", "ViewAuditLog", "CreateInstantInvite", "PrioritySpeaker");
const MANAGER_PERMS = bits("ManageMessages", "ModerateMembers", "ManageNicknames", "ManageThreads", "MuteMembers", "MoveMembers", "PrioritySpeaker");

const ALL = true;
const flags = (...keys) => Object.fromEntries(keys.map((key) => [key, true]));

/** Palm Beach Hotrods: a hotrod build shop and dealership (organization slug `pbh`). */
export const PALM_BEACH_HOTRODS = Object.freeze({
  orgSlug: "pbh",
  name: "Palm Beach Hotrods",
  brand: "#a92323",
  // Highest first. `perms` are the website rank permissions; ranks without `bind` have no Discord role.
  roles: [
    { key: "owner", name: "Owner", color: "#a92323", hoist: true, permissions: LEADER_PERMS, mentionable: false },
    {
      key: "coowner", name: "Co-Owner", color: "#d1453b", hoist: true, permissions: LEADER_PERMS,
      rank: { level: 90, description: "Runs the business alongside the owner.", perms: { spend: ALL, sell: ALL, roster: ALL, ranks: ALL, motd: ALL, announce: ALL, discipline: ALL, applications: ALL, profile: ALL, ledger: ALL, armory: ALL, garage: ALL }, spendLimit: null },
    },
    {
      key: "gm", name: "General Manager", color: "#e07b39", hoist: true, permissions: LEADER_PERMS,
      rank: { level: 80, description: "Runs day-to-day operations, hiring and the roster.", perms: { spend: ALL, sell: ALL, roster: ALL, ranks: ALL, motd: ALL, announce: ALL, discipline: ALL, applications: ALL, profile: ALL, ledger: ALL, armory: ALL, garage: ALL }, spendLimit: 250000 },
    },
    {
      key: "manager", name: "Shop Manager", color: "#e0b13b", hoist: true, permissions: MANAGER_PERMS,
      rank: { level: 65, description: "Leads a shift: schedules builds, promotes staff and reviews applications.", perms: flags("spend", "roster", "motd", "announce", "discipline", "applications", "ledger", "armory", "garage"), spendLimit: 100000 },
    },
    {
      key: "lead", name: "Lead Builder", color: "#3b9ee0", hoist: true, permissions: 0n,
      rank: { level: 50, description: "Senior fabricator who signs off builds and trains the crew.", perms: flags("spend", "motd", "ledger", "armory", "garage"), spendLimit: 25000 },
    },
    {
      key: "mechanic", name: "Mechanic", color: "#4fbf8a", hoist: true, permissions: 0n,
      rank: { level: 35, description: "Certified mechanic on the shop floor.", perms: flags("armory", "garage"), spendLimit: null },
    },
    {
      key: "apprentice", name: "Apprentice", color: "#9aa5b1", hoist: true, permissions: 0n,
      rank: { level: 20, description: "New hire learning the shop.", perms: flags("garage"), spendLimit: null },
    },
    { key: "vip", name: "VIP Client", color: "#d4af37", hoist: false, permissions: 0n },
    { key: "customer", name: "Customer", color: "#6c7a89", hoist: false, permissions: 0n },
    { key: "announce", name: "Announcements", color: null, hoist: false, permissions: 0n, mentionable: true },
    { key: "meets", name: "Car Meets", color: null, hoist: false, permissions: 0n, mentionable: true },
  ],
  // Who counts as shop staff and as management, for channel permissions (role keys).
  staff: ["owner", "coowner", "gm", "manager", "lead", "mechanic", "apprentice"],
  management: ["owner", "coowner", "gm", "manager"],
  // `view`: roles that see the channel ("everyone" or role keys); `write`: roles that can send (default: all viewers).
  categories: [
    {
      name: "📌 INFORMATION", view: "everyone", write: "management",
      channels: [
        { name: "welcome", topic: "Start here: what Palm Beach Hotrods is and how to get a build.", post: "welcome" },
        { name: "rules", topic: "Server and shop rules.", post: "rules" },
        { name: "announcements", topic: "Shop news, sales and events.", write: "management" },
        { name: "services-and-prices", topic: "What we build, tune and sell.", post: "services" },
      ],
    },
    {
      name: "🏁 SHOWROOM", view: "everyone", write: "everyone",
      channels: [
        { name: "general", topic: "Talk hotrods with the community." },
        { name: "build-showcase", topic: "Show off your build. Screenshots and clips only." },
        { name: "car-meets", topic: "Meet times, locations and cruise photos." },
        { name: "commission-requests", topic: "Customers: describe the build you want and a mechanic will pick it up.", view: ["customer", "vip", "staff"] },
        { name: "vip-lounge", topic: "VIP clients and the crew.", view: ["vip", "staff"] },
      ],
    },
    {
      name: "🔧 SHOP FLOOR", view: "staff", write: "staff",
      channels: [
        { name: "shop-announcements", topic: "Memos from management.", write: "management" },
        { name: "employee-chat", topic: "Crew chat." },
        { name: "work-orders", topic: "One post per customer build: parts, price, status." },
        { name: "shift-log", topic: "Clock in/out notes and shift hand-offs." },
        { name: "parts-and-inventory", topic: "Parts on hand, orders and pickups." },
        { name: "training-resources", topic: "Guides for new hires.", write: "management" },
        { name: "Garage Bay 1", type: "voice" },
        { name: "Garage Bay 2", type: "voice" },
        { name: "Employee Lounge", type: "voice" },
      ],
    },
    {
      name: "🛡️ MANAGEMENT", view: "management", write: "management",
      channels: [
        { name: "management-chat", topic: "Managers only." },
        { name: "hiring-and-applications", topic: "Review and discuss applicants." },
        { name: "payroll-and-wallet", topic: "Business wallet, payroll and purchases." },
        { name: "member-files", topic: "Commendations, strikes and notes. Keep it professional." },
        { name: "audit-log", topic: "Automated roster and rank logs.", write: [] },
        { name: "Management Office", type: "voice" },
      ],
    },
    {
      name: "🔊 VOICE", view: "everyone", write: "everyone",
      channels: [
        { name: "Showroom Floor", type: "voice" },
        { name: "Car Meet 1", type: "voice" },
        { name: "Car Meet 2", type: "voice" },
      ],
    },
  ],
  messages: {
    welcome: {
      title: "Welcome to Palm Beach Hotrods",
      description: "Florida Bay's home for custom hotrods, muscle builds and show-stopping paint. Walk the showroom, request a commission, or join the crew.",
      fields: [
        { name: "Get a build", value: "Head to <#commission-requests> once a staff member gives you the **Customer** role and tell us what you want." },
        { name: "Join the crew", value: "When we are hiring, apply to Palm Beach Hotrods on the Florida Bay organizations website. Your rank on the roster decides your role and channels here." },
        { name: "Stay in the loop", value: "Watch <#announcements> for sales and car meets." },
      ],
    },
    rules: {
      title: "Rules",
      description: [
        "1. Follow the Florida Bay RP server rules at all times, in the city and here.",
        "2. Be respectful. No harassment, hate speech or drama.",
        "3. No advertising, scams or self-promotion outside the showcase.",
        "4. Keep roleplay in-character in the city. Keep out-of-character talk in these channels.",
        "5. Staff channels and customer details stay private.",
        "6. Management decisions are final; take disputes to a Shop Manager or above.",
      ].join("\n"),
    },
    services: {
      title: "Services",
      description: "Ask in <#commission-requests> for a quote.",
      fields: [
        { name: "Custom builds", value: "Ground-up hotrod and muscle builds to your spec." },
        { name: "Performance tuning", value: "Engine, transmission, suspension and brakes." },
        { name: "Paint and wraps", value: "Custom paint, liveries and finishes." },
        { name: "Sales", value: "Ready-to-drive showroom stock." },
      ],
    },
  },
});

/** Convert a hex colour to the integer Discord expects, or 0 for none. */
export const colorInt = (hex) => (/^#[0-9a-f]{6}$/i.test(String(hex || "")) ? parseInt(hex.slice(1), 16) : 0);

/** Resolve a `view`/`write` selector into role keys: "everyone", "staff", "management", a key, or a list of these. */
export function resolveAudience(blueprint, selector) {
  if (selector === "everyone") return { everyone: true, keys: [] };
  const list = Array.isArray(selector) ? selector : [selector];
  const keys = [];
  for (const item of list) {
    if (item === "staff") keys.push(...blueprint.staff);
    else if (item === "management") keys.push(...blueprint.management);
    else if (blueprint.roles.some((role) => role.key === item)) keys.push(item);
    else throw new Error(`Unknown audience "${item}".`);
  }
  return { everyone: false, keys: [...new Set(keys)] };
}

const FULL_TEXT = bits("ViewChannel", "SendMessages", "SendMessagesInThreads", "EmbedLinks", "AttachFiles", "ReadMessageHistory", "AddReactions");
const READ_TEXT = bits("ViewChannel", "ReadMessageHistory", "AddReactions");
const VOICE = bits("ViewChannel", "Connect", "Speak", "UseVAD", "Stream");
const WRITE_ONLY = bits("SendMessages", "SendMessagesInThreads", "EmbedLinks", "AttachFiles", "CreateInstantInvite");

/**
 * The permission overwrites for one channel as { role key | "everyone": {allow, deny} }.
 * Staff always see the categories they work in; management can write wherever it can view.
 */
export function channelOverwrites(blueprint, category, channel) {
  const voice = channel.type === "voice";
  const view = resolveAudience(blueprint, channel.view ?? category.view);
  const write = resolveAudience(blueprint, channel.write ?? category.write);
  const out = {};
  const viewMask = voice ? VOICE : READ_TEXT;
  if (view.everyone) out[everyone] = { allow: viewMask, deny: 0n };
  else {
    out[everyone] = { allow: 0n, deny: P.ViewChannel };
    for (const key of view.keys) out[key] = { allow: viewMask, deny: 0n };
  }
  if (!voice) {
    if (write.everyone && view.everyone) out[everyone] = { allow: out[everyone].allow | FULL_TEXT, deny: 0n };
    else {
      // Everyone who may view but not write is read-only; writers must also be able to view.
      const writers = write.everyone ? view.keys : write.keys.filter((key) => view.everyone || view.keys.includes(key));
      out[everyone] = { allow: out[everyone].allow, deny: out[everyone].deny | WRITE_ONLY };
      for (const key of view.keys) if (!writers.includes(key)) out[key] = { allow: out[key].allow, deny: WRITE_ONLY };
      for (const key of writers) out[key] = { allow: (out[key]?.allow || 0n) | FULL_TEXT, deny: 0n };
    }
  }
  return out;
}

/** Validate a blueprint: unique role/channel names, known audiences and rank levels in order. Exported for tests. */
export function validateBlueprint(blueprint) {
  const keys = new Set();
  const names = new Set();
  for (const role of blueprint.roles) {
    if (keys.has(role.key)) throw new Error(`Duplicate role key ${role.key}.`);
    if (names.has(role.name.toLowerCase())) throw new Error(`Duplicate role name ${role.name}.`);
    keys.add(role.key);
    names.add(role.name.toLowerCase());
  }
  const levels = blueprint.roles.filter((role) => role.rank).map((role) => role.rank.level);
  if (levels.some((level, index) => !(level >= 1 && level <= 99) || (index && level >= levels[index - 1]))) throw new Error("Rank levels must be 1-99 and descend in role order.");
  for (const role of blueprint.roles.filter((entry) => entry.rank))
    if (/^(leader|member|owner|command)$/i.test(role.name)) throw new Error(`"${role.name}" is a reserved rank name.`);
  const channelNames = new Set();
  for (const category of blueprint.categories) {
    resolveAudience(blueprint, category.view);
    resolveAudience(blueprint, category.write);
    for (const channel of category.channels) {
      const id = `${channel.type === "voice" ? "v" : "t"}:${channel.name.toLowerCase()}`;
      if (channelNames.has(id)) throw new Error(`Duplicate channel ${channel.name}.`);
      channelNames.add(id);
      channelOverwrites(blueprint, category, channel);
    }
  }
  return true;
}

const typeOf = (channel) => (channel.type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText);
const text = (value) => String(value ?? "");

/** Replace <#channel-name> placeholders in a message with real channel mentions. */
function mentionChannels(value, channelIds) {
  return text(value).replace(/<#([a-z0-9-]+)>/g, (match, name) => (channelIds.get(name) ? `<#${channelIds.get(name)}>` : `#${name}`));
}

/**
 * Create or update the server's roles, categories and channels. `api` is a thin wrapper
 * ({ get, post, patch, put }) over the Discord REST routes. Returns what changed.
 */
export async function applyGuild(api, guildId, blueprint, { log = () => {}, dryRun = false, botId = null } = {}) {
  validateBlueprint(blueprint);
  const result = { rolesCreated: [], rolesUpdated: [], categoriesCreated: [], channelsCreated: [], channelsUpdated: [], posted: [], roleIds: {} };
  const send = async (method, route, body) => (dryRun ? { id: `dry-${Math.random().toString(36).slice(2)}` } : api[method](route, body));

  const guild = await api.get(`/guilds/${guildId}`);
  const existingRoles = await api.get(`/guilds/${guildId}/roles`);
  const me = botId ? await api.get(`/guilds/${guildId}/members/${botId}`).catch(() => null) : null;
  const myTop = me ? Math.max(0, ...me.roles.map((id) => existingRoles.find((role) => role.id === id)?.position ?? 0)) : null;

  // @everyone: a safe baseline (no @everyone mentions, no invites by strangers beyond invite creation).
  const baseline = existingRoles.find((role) => role.id === guild.id);
  if (baseline && BigInt(baseline.permissions) !== MEMBER_PERMS) {
    await send("patch", `/guilds/${guildId}/roles/${guild.id}`, { permissions: String(MEMBER_PERMS) });
    result.rolesUpdated.push(everyone);
  }

  for (const role of blueprint.roles) {
    const found = existingRoles.find((entry) => entry.name.toLowerCase() === role.name.toLowerCase() && !entry.managed);
    const body = { name: role.name, color: colorInt(role.color), hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), permissions: String(role.permissions) };
    if (found) {
      const same = found.color === body.color && found.hoist === body.hoist && found.mentionable === body.mentionable && BigInt(found.permissions) === role.permissions;
      if (!same) { await send("patch", `/guilds/${guildId}/roles/${found.id}`, body); result.rolesUpdated.push(role.name); }
      result.roleIds[role.key] = found.id;
    } else {
      const created = await send("post", `/guilds/${guildId}/roles`, body);
      result.rolesCreated.push(role.name);
      result.roleIds[role.key] = created.id;
    }
    log(`role ${role.name}`);
  }

  // Order the roles under the bot's highest role, in blueprint order (first = highest).
  if (!dryRun && myTop != null && myTop > 1) {
    const ordered = blueprint.roles.map((role) => result.roleIds[role.key]);
    const count = ordered.length;
    if (myTop - 1 >= count) {
      const positions = ordered.map((id, index) => ({ id, position: myTop - 1 - index }));
      await api.patch(`/guilds/${guildId}/roles`, positions);
    } else log(`bot role is too low to order ${count} roles under it (position ${myTop}); move the bot's role up`);
  }

  const idFor = (key) => (key === "everyone" ? guild.id : result.roleIds[key]);
  const toOverwrites = (map) => Object.entries(map).map(([key, { allow, deny }]) => ({ id: key === everyone ? guild.id : idFor(key), type: 0, allow: String(allow), deny: String(deny) }));
  const botOverwrite = botId ? [{ id: botId, type: 1, allow: String(FULL_TEXT | VOICE | P.ManageChannels | P.ManageMessages), deny: "0" }] : [];

  const channels = await api.get(`/guilds/${guildId}/channels`);
  const channelIds = new Map();
  const toPost = [];

  for (const category of blueprint.categories) {
    let parent = channels.find((entry) => entry.type === ChannelType.GuildCategory && entry.name.toLowerCase() === category.name.toLowerCase());
    const categoryAudience = resolveAudience(blueprint, category.view);
    const categoryOverwrites = [
      ...toOverwrites(categoryAudience.everyone
        ? { [everyone]: { allow: P.ViewChannel, deny: 0n } }
        : { [everyone]: { allow: 0n, deny: P.ViewChannel }, ...Object.fromEntries(categoryAudience.keys.map((key) => [key, { allow: P.ViewChannel, deny: 0n }])) }),
      ...botOverwrite,
    ];
    if (!parent) {
      parent = await send("post", `/guilds/${guildId}/channels`, { name: category.name, type: ChannelType.GuildCategory, permission_overwrites: categoryOverwrites });
      result.categoriesCreated.push(category.name);
    } else await send("patch", `/channels/${parent.id}`, { permission_overwrites: categoryOverwrites });
    log(`category ${category.name}`);

    for (const channel of category.channels) {
      const type = typeOf(channel);
      const slug = channel.type === "voice" ? channel.name : channel.name.toLowerCase();
      const overwrites = [...toOverwrites(channelOverwrites(blueprint, category, channel)), ...botOverwrite];
      let found = channels.find((entry) => entry.type === type && entry.name.toLowerCase() === slug.toLowerCase() && (entry.parent_id === parent.id || !entry.parent_id));
      const body = { name: slug, type, parent_id: parent.id, permission_overwrites: overwrites, ...(channel.topic ? { topic: channel.topic.slice(0, 1024) } : {}) };
      if (!found) {
        found = await send("post", `/guilds/${guildId}/channels`, body);
        result.channelsCreated.push(channel.name);
        if (channel.post) toPost.push({ channel: found, message: channel.post, created: true });
      } else {
        const { name: _name, type: _type, ...patch } = body;
        await send("patch", `/channels/${found.id}`, patch);
        result.channelsUpdated.push(channel.name);
        if (channel.post) toPost.push({ channel: found, message: channel.post, created: false });
      }
      channelIds.set(slug.toLowerCase().replace(/\s+/g, "-"), found.id);
    }
  }

  // Intro messages go in once, only into empty channels.
  for (const entry of toPost) {
    const template = blueprint.messages[entry.message];
    if (!template || dryRun) continue;
    const history = entry.created ? [] : await api.get(`/channels/${entry.channel.id}/messages?limit=1`).catch(() => [null]);
    if (history.length) continue;
    await api.post(`/channels/${entry.channel.id}/messages`, {
      embeds: [{
        title: template.title,
        description: mentionChannels(template.description, channelIds),
        color: colorInt(blueprint.brand),
        fields: (template.fields || []).map((field) => ({ name: field.name, value: mentionChannels(field.value, channelIds) })),
        footer: { text: blueprint.name },
      }],
      allowed_mentions: { parse: [] },
    });
    result.posted.push(entry.message);
  }
  return result;
}

/**
 * Create or update the organization's ranks and bind each to its Discord role. `query` is the
 * database query function (rows for SELECT, a result with insertId for INSERT).
 */
export async function applyRanks(query, org, guildId, roleIds, blueprint, { actorId = "system", now = Date.now(), dryRun = false } = {}) {
  const columns = ["spend", "sell", "roster", "ranks", "motd", "announce", "discipline", "applications", "profile", "ledger", "armory", "garage"];
  const defaults = { ledger: false, armory: false, garage: false };
  const out = [];
  for (const role of blueprint.roles.filter((entry) => entry.rank)) {
    const { level, description, perms, spendLimit } = role.rank;
    const flagsOf = columns.map((key) => Boolean(Object.hasOwn(perms, key) ? perms[key] : defaults[key] ?? false));
    const cols = columns.map((key) => `can_${key}`);
    const existing = (await query("SELECT id FROM org_ranks WHERE org_id=? AND name=?", [org.id, role.name]))[0];
    let rankId = existing?.id ? Number(existing.id) : 0;
    if (dryRun) { out.push({ name: role.name, level, rankId, created: !rankId }); continue; }
    if (rankId) {
      await query(`UPDATE org_ranks SET level=?,color=?,description=?,${cols.map((c) => `${c}=?`).join(",")},spend_limit=? WHERE id=? AND org_id=?`,
        [level, role.color, description, ...flagsOf, spendLimit, rankId, org.id]);
    } else {
      const inserted = await query(`INSERT INTO org_ranks(org_id,name,level,color,description,${cols.join(",")},spend_limit,created_by,created_at) VALUES(?,?,?,?,?,${cols.map(() => "?").join(",")},?,?,?)`,
        [org.id, role.name, level, role.color, description, ...flagsOf, spendLimit, actorId, now]);
      rankId = Number(inserted.insertId);
    }
    const roleId = roleIds[role.key];
    await query("DELETE FROM org_rank_roles WHERE org_id=? AND rank_id=?", [org.id, rankId]);
    if (roleId) await query("INSERT INTO org_rank_roles(rank_id,org_id,guild_id,role_id,added_by,added_at) VALUES(?,?,?,?,?,?)", [rankId, org.id, guildId, roleId, actorId, now]);
    out.push({ name: role.name, level, rankId, created: !existing, roleId });
  }
  return out;
}
