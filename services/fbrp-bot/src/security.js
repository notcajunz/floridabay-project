import { AuditLogEvent, ChannelType, GuildVerificationLevel, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { db, audit, staffLevel } from "./database.js";
import { isProtectedRoleManagerId } from "./access-control.js";
import { COLORS, card, clip, roleRef, serverRef, when, who } from "./ui.js";

/* ------------------------------------------------------------------------------------------------
 * Settings. One network-wide policy stored in bot_config('security_settings'); every value has a
 * safe default so the guards work before anyone touches /security config.
 * ---------------------------------------------------------------------------------------------- */

export const SECURITY_SETTINGS = {
  antinuke: { type: "bool", label: "Anti-nuke", default: true },
  nuke_limit: { type: "int", label: "Anti-nuke: actions of one kind", default: 3, min: 1, max: 50 },
  nuke_total: { type: "int", label: "Anti-nuke: danger points of any kind", default: 6, min: 2, max: 100 },
  nuke_window: { type: "int", label: "Anti-nuke: window (seconds)", default: 20, min: 5, max: 300 },
  // Strip (all roles removed plus a 7-day timeout) in every network server, instead of a network-wide ban.
  nuke_punishment: { type: "enum", label: "Anti-nuke: punishment", default: "strip", values: ["strip", "kick", "ban"] },
  nuke_restore: { type: "bool", label: "Anti-nuke: undo the damage (restore deleted, remove created)", default: true },
  nuke_network_ban: { type: "bool", label: "Anti-nuke: contain the attacker in every network server", default: true },
  nuke_network_scale: { type: "int", label: "Anti-nuke: network budget (× per-server limits, shared by all servers)", default: 1, min: 1, max: 10 },
  nuke_exempt_ceiling: { type: "int", label: "Anti-nuke: still quarantine exempt accounts at this many × the limits (0 = never)", default: 3, min: 0, max: 20 },
  nuke_failsafe_lockdown: { type: "bool", label: "Anti-nuke: lock the server down if the attacker cannot be stopped", default: true },
  permission_guard: { type: "bool", label: "Permission guard (dangerous role permissions)", default: true },
  admin_grant_guard: { type: "bool", label: "Admin grant guard (dangerous roles given out)", default: true },
  webhook_guard: { type: "bool", label: "Webhook guard (lockdown and webhook spam)", default: true },
  // Opt in to recurring health alerts. Manual `/security health` checks remain available when this is off.
  health_watch: { type: "bool", label: "Health watch: alert when the bot loses the power to stop a nuke", default: false },
  antiraid: { type: "bool", label: "Anti-raid", default: true },
  raid_joins: { type: "int", label: "Anti-raid: joins", default: 10, min: 3, max: 100 },
  raid_window: { type: "int", label: "Anti-raid: window (seconds)", default: 30, min: 5, max: 600 },
  raid_suspicious_joins: { type: "int", label: "Anti-raid: high-risk joins", default: 5, min: 2, max: 100 },
  raid_suspicious_window: { type: "int", label: "Anti-raid: high-risk window (seconds)", default: 180, min: 30, max: 3600 },
  raid_message_accounts: { type: "int", label: "Anti-raid: new accounts posting the same message", default: 4, min: 2, max: 50 },
  raid_lockdown: { type: "bool", label: "Anti-raid: lock the server down", default: true },
  raid_kick_new: { type: "bool", label: "Anti-raid: act on new or high-risk raiders", default: true },
  raid_action: { type: "enum", label: "Anti-raid: action against raiders", default: "kick", values: ["kick", "ban", "timeout"] },
  raid_account_days: { type: "int", label: "Anti-raid: new account age (days)", default: 7, min: 0, max: 365 },
  lockdown_minutes: { type: "int", label: "Lockdown: auto-unlock after (minutes, 0 = manual)", default: 15, min: 0, max: 1440 },
  young_account_days: { type: "int", label: "Young account age (days, 0 = off)", default: 3, min: 0, max: 365 },
  young_account_action: { type: "enum", label: "Young account action", default: "log", values: ["off", "log", "timeout", "kick"] },
  antispam: { type: "bool", label: "Anti-spam", default: true },
  spam_messages: { type: "int", label: "Anti-spam: messages", default: 6, min: 3, max: 50 },
  spam_window: { type: "int", label: "Anti-spam: window (seconds)", default: 5, min: 2, max: 60 },
  spam_mentions: { type: "int", label: "Anti-spam: mentions in one message", default: 6, min: 2, max: 50 },
  spam_duplicates: { type: "int", label: "Anti-spam: identical messages", default: 4, min: 2, max: 20 },
  spam_channels: { type: "int", label: "Anti-spam: same message across channels", default: 3, min: 2, max: 20 },
  spam_lines: { type: "int", label: "Anti-spam: lines in one message (wall of text)", default: 40, min: 10, max: 200 },
  spam_timeout: { type: "int", label: "Anti-spam: timeout (minutes)", default: 10, min: 1, max: 10080 },
  spam_escalate: { type: "bool", label: "Anti-spam: double the timeout for repeat offenders", default: true },
  scam_filter: { type: "bool", label: "Scam link filter (fake Nitro/Steam)", default: true },
  invite_filter: { type: "bool", label: "Invite link filter", default: false },
};

let settingsCache = null;
let settingsAt = 0;

export async function getSecuritySettings() {
  if (settingsCache && Date.now() - settingsAt < 30000) return settingsCache;
  const row = await db.one("SELECT value FROM bot_config WHERE `key`='security_settings'").catch(() => null);
  let stored = row?.value || {};
  if (typeof stored === "string") try { stored = JSON.parse(stored); } catch { stored = {}; }
  settingsCache = Object.fromEntries(Object.entries(SECURITY_SETTINGS).map(([key, meta]) => [key, stored[key] ?? meta.default]));
  settingsAt = Date.now();
  return settingsCache;
}

/** Parses and stores one setting; returns the new value. */
export async function setSecuritySetting(key, raw, actorId) {
  const meta = SECURITY_SETTINGS[key];
  if (!meta) throw new Error("Unknown security setting.");
  const text = String(raw ?? "").trim().toLowerCase();
  let value;
  if (meta.type === "bool") {
    if (["on", "true", "yes", "enable", "enabled", "1"].includes(text)) value = true;
    else if (["off", "false", "no", "disable", "disabled", "0"].includes(text)) value = false;
    else throw new Error("Use `on` or `off`.");
  } else if (meta.type === "int") {
    value = Number.parseInt(text, 10);
    if (!Number.isFinite(value) || value < meta.min || value > meta.max) throw new Error(`Enter a whole number from ${meta.min} to ${meta.max}.`);
  } else {
    if (!meta.values.includes(text)) throw new Error(`Use one of: ${meta.values.map((v) => `\`${v}\``).join(", ")}.`);
    value = text;
  }
  const current = { ...(await getSecuritySettings()), [key]: value };
  await db.query(
    "INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES('security_settings',?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
    [JSON.stringify(current), actorId, Date.now()],
  );
  settingsCache = current;
  settingsAt = Date.now();
  await audit(actorId, "security.config", key, { value });
  return value;
}

export const settingText = (key, value) => {
  const meta = SECURITY_SETTINGS[key];
  if (meta?.type === "bool") return value ? "On" : "Off";
  return String(value);
};

/** Autocomplete for /security config (there are more settings than Discord allows as fixed choices). */
export function settingChoices(query) {
  const needle = String(query || "").toLowerCase();
  return Object.entries(SECURITY_SETTINGS)
    .filter(([key, meta]) => `${key} ${meta.label}`.toLowerCase().includes(needle))
    .slice(0, 25)
    .map(([key, meta]) => ({ name: meta.label.slice(0, 100), value: key }));
}

/* ------------------------------------------------------------------------------------------------
 * Shared helpers
 * ---------------------------------------------------------------------------------------------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const perms = (bits) => new PermissionsBitField(bits).toArray().map((name) => name.replace(/([a-z])([A-Z])/g, "$1 $2"));

/** Permissions that can wreck a server when handed to the wrong account. */
const DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ModerateMembers,
];
const GRANT_DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
];

const registeredCache = new Map();
async function registered(guildId) {
  const hit = registeredCache.get(guildId);
  if (hit && Date.now() - hit.at < 60000) return hit.value;
  const value = Boolean(await db.one("SELECT 1 FROM network_guilds WHERE guild_id=?", [guildId]).catch(() => null));
  registeredCache.set(guildId, { value, at: Date.now() });
  return value;
}

const exemptCache = new Map();
/** Global ('*') exemptions apply everywhere; a guild ID applies only there. Cached briefly because the audit stream asks often. */
async function exempt(guildId, discordId) {
  if (String(discordId) === String(process.env.FBRP_OWNER_DISCORD_ID || "")) return true;
  const key = `${guildId}:${discordId}`;
  const hit = exemptCache.get(key);
  if (hit && Date.now() - hit.at < 15000) return hit.value;
  const value = Boolean(
    await db.one("SELECT 1 FROM discord_security_exemption_scopes WHERE discord_id=? AND guild_id IN ('*',?) LIMIT 1", [discordId, String(guildId)]),
  );
  exemptCache.set(key, { value, at: Date.now() });
  return value;
}

/**
 * Everyone is scanned. Only the bot itself and accounts with a /security exemption are skipped.
 * Server owners and bot superusers are scanned too: grant them an exemption if they need one.
 */
async function trusted(guild, userId) {
  if (!userId) return false;
  const id = String(userId);
  if (id === String(guild.client.user.id)) return true;
  return exempt(guild.id, id);
}

/** Discord never lets a bot act against the server owner, so owners are detected and reported but not reverted or punished. */
const isOwner = (guild, userId) => String(userId) === String(guild.ownerId);

async function securityEvent(guildId, type, actor, target, outcome, details = {}) {
  await db
    .query(
      "INSERT INTO network_security_events(guild_id,event_type,actor_id,target_id,outcome,details,created_at) VALUES(?,?,?,?,?,?,?)",
      [guildId, type, actor || null, target || null, outcome, JSON.stringify(details), Date.now()],
    )
    .catch((error) => console.error("[FBRP security] event:", error.message || error));
}

/** Most recent audit-log entry of a type (optionally for one target) from the last few seconds. */
async function auditEntry(guild, type, targetId = null, maxAge = 15000, delay = 900) {
  if (delay) await sleep(delay);
  const logs = await guild.fetchAuditLogs({ type, limit: 6 }).catch(() => null);
  return (
    logs?.entries.find(
      (entry) =>
        (!targetId || String(entry.target?.id ?? entry.targetId) === String(targetId)) &&
        Date.now() - entry.createdTimestamp < maxAge,
    ) || null
  );
}

/** DMs the owners of the given server(s) and the bot owner. Used only for anti-nuke, raid and health alerts. */
async function alertOwners(guilds, e) {
  const list = Array.isArray(guilds) ? guilds : [guilds];
  const ids = new Set([...list.map((guild) => String(guild.ownerId)), String(process.env.FBRP_OWNER_DISCORD_ID || "")].filter(Boolean));
  const guild = list[0];
  if (!guild) return;
  for (const id of ids) {
    const user = await guild.client.users.fetch(id).catch(() => null);
    await user?.send({ embeds: [e] }).catch(() => {});
  }
}

const accountAge = (user) => (Date.now() - user.createdTimestamp) / 86400000;
const ageText = (user) => {
  const days = accountAge(user);
  return days < 1 ? `${Math.max(1, Math.round(days * 24))} hour(s) old` : `${Math.floor(days)} day(s) old`;
};
export const YOUNG_ACCOUNT_ALERT_DAYS = 14;
export const requiresYoungAccountAlert = (user, at = Date.now()) =>
  (at - Number(user.createdTimestamp)) / 86400000 < YOUNG_ACCOUNT_ALERT_DAYS;

/** This alert is unconditional: exemptions disable enforcement, not visibility of a new account joining. */
async function alertYoungAccount(member, log, { age, risk = null, flags = [], action = "Alert only", exempted = false } = {}) {
  await securityEvent(member.guild.id, "young_account", null, member.id, action === "Alert only" ? "alerted" : action.toLowerCase(), {
    age,
    alertDays: YOUNG_ACCOUNT_ALERT_DAYS,
    ...(risk === null ? {} : { risk, flags }),
    exempted,
  });
  await log(member.guild, {
    title: "Young account joined",
    color: COLORS.warning,
    thumbnail: member.user.displayAvatarURL(),
    fields: [
      ["Member", who(member.id)],
      ["Account age", `${ageText(member.user)}\nCreated ${when(member.user.createdTimestamp)}`],
      ["Alert rule", `Account is under ${YOUNG_ACCOUNT_ALERT_DAYS} days old`],
      ...(risk === null ? [] : [["Risk", `${risk} · ${flags.join(", ") || "none"}`]]),
      ...(exempted ? [["Security exemption", "Exempt from automated action; alert still sent"]] : []),
      ["Action", action],
    ],
  });
}

/* ------------------------------------------------------------------------------------------------
 * Bot Guard
 * ---------------------------------------------------------------------------------------------- */

async function trustedBotAdder(guild, userId) {
  if (!userId) return false;
  if (isOwner(guild, userId) || (await trusted(guild, userId))) return true;
  if (
    await db.one(
      "SELECT 1 FROM network_bot_adder_allowlist WHERE guild_id IN ('*',?) AND subject_type='user' AND subject_id=?",
      [guild.id, userId],
    )
  )
    return true;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;
  const rows = await db.query(
    "SELECT subject_id FROM network_bot_adder_allowlist WHERE guild_id IN ('*',?) AND subject_type='role'",
    [guild.id],
  );
  return rows.some((row) => member.roles.cache.has(String(row.subject_id)));
}

export async function guardBot(member, log) {
  if (!member.user.bot) return;
  if (!(await registered(member.guild.id))) return;
  const entry = await auditEntry(member.guild, AuditLogEvent.BotAdd, member.id, 20000, 1200);
  const actor = entry?.executorId || null;
  const appAllowed = Boolean(await db.one("SELECT 1 FROM network_allowed_bots WHERE bot_id=?", [member.id]));
  const adderAllowed = await trustedBotAdder(member.guild, actor);
  if (appAllowed && adderAllowed) {
    await securityEvent(member.guild.id, "bot_add", actor, member.id, "allowed", { appAllowed, adderAllowed });
    return;
  }
  const removed = await member
    .kick("Florida Bay Bot Guard: unapproved bot or adder")
    .then(() => true)
    .catch(() => false);
  await securityEvent(member.guild.id, "bot_add", actor, member.id, removed ? "blocked" : "failed", { appAllowed, adderAllowed });
  await log(member.guild, {
    title: removed ? "Unapproved bot removed" : "Unapproved bot could not be removed",
    color: removed ? COLORS.warning : COLORS.danger,
    description: removed
      ? `<@${member.id}> was kicked by Bot Guard.`
      : `Bot Guard could not kick <@${member.id}>. Move the Florida Bay bot role above it.`,
    fields: [
      ["Bot", who(member.id)],
      ["Added by", actor ? who(actor) : "Unknown"],
      ["Application approved", appAllowed ? "Yes" : "No"],
      ["Adder approved", adderAllowed ? "Yes" : "No"],
    ],
  });
  if (actor && !adderAllowed) await nukeAction(member.guild, "bot_add", actor, member.id, log, { label: member.user.tag });
}

export async function sweepBots(guild) {
  const allowed = new Set((await db.query("SELECT bot_id FROM network_allowed_bots")).map((row) => String(row.bot_id)));
  let removed = 0,
    failed = 0;
  const members = await guild.members.fetch();
  for (const member of members.values())
    if (member.user.bot && member.id !== guild.client.user.id && !allowed.has(member.id)) {
      await member
        .kick("Florida Bay Bot Guard sweep")
        .then(() => removed++)
        .catch(() => failed++);
    }
  await audit(guild.client.user.id, "botguard.sweep", guild.id, { removed, failed });
  return { removed, failed };
}

/* ------------------------------------------------------------------------------------------------
 * Protected roles
 * ---------------------------------------------------------------------------------------------- */

async function protectedAccess(guild, actorId, roleId) {
  if (!actorId) return false;
  if (String(actorId) === String(guild.client.user.id)) return true;
  if (!isProtectedRoleManagerId(actorId)) return false;
  const [level, coOwner] = await Promise.all([
    staffLevel(actorId),
    db.one("SELECT rank_order FROM ace_groups WHERE name='co_owner'"),
  ]);
  return level >= Number(coOwner?.rank_order ?? 950);
}

export async function enforceProtectedRoles(oldMember, newMember, log) {
  if (oldMember.user.bot || oldMember.partial) return;
  const rows = await db.query("SELECT role_id FROM protected_roles WHERE guild_id=?", [newMember.guild.id]);
  for (const row of rows) {
    const id = String(row.role_id),
      before = oldMember.roles.cache.has(id),
      after = newMember.roles.cache.has(id);
    if (before === after) continue;
    const entry = await auditEntry(newMember.guild, AuditLogEvent.MemberRoleUpdate, newMember.id);
    const actor = entry?.executorId;
    if (await protectedAccess(newMember.guild, actor, id)) continue;
    let restored = false;
    if (before && !after)
      restored = await newMember.roles.add(id, "Protected role enforcement").then(() => true).catch(() => false);
    if (!before && after)
      restored = await newMember.roles.remove(id, "Protected role enforcement").then(() => true).catch(() => false);
    await securityEvent(newMember.guild.id, "protected_role", actor, newMember.id, restored ? "reverted" : "failed", {
      roleId: id,
      change: after ? "added" : "removed",
    });
    await log(newMember.guild, {
      title: restored ? "Protected role change reverted" : "Protected role change not reverted",
      color: restored ? COLORS.warning : COLORS.danger,
      description: `${roleRef(id)} was ${after ? "granted to" : "removed from"} <@${newMember.id}> without authorization.\n${restored ? "The bot reverted the change." : "The bot could not revert it. Move the bot role above this role."}`,
      fields: [
        ["Member", who(newMember.id)],
        ["Changed by", actor ? who(actor) : "Unknown"],
        ["Role", roleRef(id)],
        ["Change", after ? "Granted" : "Removed"],
      ],
    });
  }
}

/* ------------------------------------------------------------------------------------------------
 * Anti-nuke. Every audit-log entry in a network server is scored against the account that made
 * it. Each kind of action has its own limit and a weight toward a shared danger budget, and the
 * budget is shared by the whole network: an attacker who spreads the damage over several servers
 * is caught just like one who hits a single server. Crossing a limit stops the account in every
 * network server at once, undoes the damage everywhere it acted, and puts the account on the
 * offender list: from then on any action it makes, and any server it joins, is handled instantly.
 * ---------------------------------------------------------------------------------------------- */

/** scale multiplies nuke_limit for that kind; weight counts toward nuke_total; log records each one below the limit. */
const NUKE_RULES = {
  channel_delete: { label: "Channel deleted", scale: 1, weight: 2, log: true },
  role_delete: { label: "Role deleted", scale: 1, weight: 2, log: true },
  member_ban: { label: "Member banned", scale: 1, weight: 2, log: true },
  member_kick: { label: "Member kicked", scale: 1.5, weight: 1.5, log: true },
  member_prune: { label: "Members pruned", scale: 1, weight: 3, log: true },
  member_unban: { label: "Member unbanned", scale: 2, weight: 1, log: true },
  member_timeout: { label: "Member timed out", scale: 3, weight: 1 },
  member_roles: { label: "Roles removed from a member", scale: 3, weight: 0.5 },
  voice_disconnect: { label: "Voice members disconnected or moved", scale: 4, weight: 0.5 },
  channel_create: { label: "Channel created", scale: 2, weight: 1 },
  role_create: { label: "Role created", scale: 2, weight: 1 },
  channel_update: { label: "Channel edited", scale: 3, weight: 0.5 },
  channel_permissions: { label: "Channel permissions edited", scale: 3, weight: 0.5 },
  role_update: { label: "Role edited", scale: 3, weight: 0.5 },
  thread_delete: { label: "Thread deleted", scale: 2, weight: 1 },
  message_purge: { label: "Messages bulk-deleted", scale: 2, weight: 1 },
  emoji_delete: { label: "Emoji or sticker deleted", scale: 1.5, weight: 1, log: true },
  webhook_create: { label: "Webhook created", scale: 1, weight: 1.5, log: true },
  webhook_update: { label: "Webhook edited", scale: 2, weight: 1 },
  webhook_delete: { label: "Webhook deleted", scale: 2, weight: 1 },
  webhook_spam: { label: "Webhook spam", scale: 1, weight: 3, log: true },
  integration_create: { label: "Integration added", scale: 1, weight: 2, log: true },
  integration_delete: { label: "Integration removed", scale: 1.5, weight: 1, log: true },
  invite_create: { label: "Invite created", scale: 5, weight: 0.25 },
  automod_change: { label: "AutoMod rule removed or edited", scale: 1, weight: 2, log: true },
  guild_update: { label: "Server settings changed", scale: 1, weight: 2, log: true },
  permission_escalation: { label: "Dangerous permissions added to a role", scale: 1, weight: 2 },
  dangerous_grant: { label: "Dangerous role granted", scale: 1, weight: 2 },
  bot_add: { label: "Unapproved bot added", scale: 1, weight: 3 },
};
const ACTION_LABEL = Object.fromEntries(Object.entries(NUKE_RULES).map(([key, rule]) => [key, rule.label]));
const NUKE_REASON = "Florida Bay anti-nuke";
const QUARANTINE_MS = 7 * 86400000;

/** `${guildId}:${actorId}` → actions inside the window. */
const destructive = new Map();
/** actorId → { at, punishment }: mirror of the active rows in network_nuke_offenders. */
const offenders = new Map();
/** `${guildId}:${actorId}` → { at, promise } so concurrent entries never act on the same account twice. */
const containing = new Map();
/** `${guildId}:${actorId}` → queued zero-tolerance log lines, flushed as one entry. */
const zeroLogs = new Map();

export const isNukeOffender = (id) => offenders.has(String(id));

export async function loadOffenders() {
  const rows = await db.query("SELECT discord_id,punishment,created_at FROM network_nuke_offenders WHERE active=TRUE");
  offenders.clear();
  for (const row of rows) offenders.set(String(row.discord_id), { at: Number(row.created_at), punishment: row.punishment });
  return offenders.size;
}

async function networkGuilds(client) {
  const rows = await db.query("SELECT guild_id FROM network_guilds").catch(() => []);
  return rows.map((row) => client.guilds.cache.get(String(row.guild_id))).filter(Boolean);
}

/** Every server's window for one account, oldest entries dropped. */
function actorWindows(actorId, windowMs) {
  const groups = new Map();
  for (const [key, list] of destructive) {
    if (!key.endsWith(`:${actorId}`)) continue;
    const live = list.filter((item) => Date.now() - item.at < windowMs);
    if (live.length) groups.set(key.slice(0, key.indexOf(":")), live);
  }
  return groups;
}

async function nukeAction(guild, type, actorId, targetId, log, detail = {}) {
  const s = await getSecuritySettings();
  if (!s.antinuke) return null;
  actorId = String(actorId);
  const rule = NUKE_RULES[type] || { scale: 1, weight: 1 };
  const item = {
    type,
    at: Date.now(),
    guild: guild.id,
    target: targetId ? String(targetId) : null,
    label: detail.label || null,
    weight: detail.weight ?? rule.weight,
    changes: detail.changes || null,
    extra: detail.extra || null,
  };
  // A known attacker gets no second window: contain and undo on the first action, in any server.
  if (offenders.has(actorId)) return zeroTolerance(guild, actorId, item, log);
  // Exempt accounts are trusted, not unlimited: a compromised staff account is the most common nuke.
  const scale = detail.exempt ? s.nuke_exempt_ceiling : 1;
  if (!scale) return null;
  const windowMs = s.nuke_window * 1000;
  const key = `${guild.id}:${actorId}`;
  const recent = (destructive.get(key) || []).filter((entry) => Date.now() - entry.at < windowMs);
  recent.push(item);
  destructive.set(key, recent);
  const count = recent.filter((entry) => entry.type === type).length;
  const limit = Math.max(1, Math.round(s.nuke_limit * rule.scale * scale));
  const total = s.nuke_total * scale;
  const points = recent.reduce((sum, entry) => sum + entry.weight, 0);
  // Network view: one budget for every server the account touched. Acting on the same target in
  // several servers (banning one troll everywhere) counts once.
  const groups = actorWindows(actorId, windowMs);
  const seen = new Set();
  const spread = [...groups.values()].flat().filter((entry) => {
    const id = `${entry.type}:${entry.target || entry.label || entry.at}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const netCount = spread.filter((entry) => entry.type === type).length;
  const netPoints = spread.reduce((sum, entry) => sum + entry.weight, 0);
  const netLimit = Math.max(1, Math.round(limit * s.nuke_network_scale));
  const netTotal = total * s.nuke_network_scale;
  const local = count >= limit || points >= total;
  const network = groups.size > 1 && (netCount >= netLimit || netPoints >= netTotal);
  const tripped = local || network;
  if (!detail.exempt)
    void securityEvent(guild.id, type, actorId, targetId, tripped ? "threshold" : "observed", { count, points, netPoints, servers: groups.size, label: detail.label || null });
  if (!tripped) {
    if (rule.log && !detail.exempt)
      await log(guild, {
        title: rule.label || type,
        color: COLORS.muted,
        fields: [
          ["By", who(actorId)],
          ["Target", detail.label ? clip(detail.label, 200) : targetId ? `\`${targetId}\`` : "Unknown"],
          [
            "Anti-nuke",
            `${count}/${limit} of this kind · ${Math.round(points * 10) / 10}/${Math.round(total * 10) / 10} points · ${s.nuke_window}s window` +
              (groups.size > 1 ? `\nNetwork: ${Math.round(netPoints * 10) / 10}/${Math.round(netTotal * 10) / 10} points across ${groups.size} servers` : ""),
          ],
        ],
      });
    return { count, limit, punished: false };
  }
  // Mark the account before anything is awaited so every entry still in flight meets zero tolerance.
  const ownsAttacked = [...groups.keys()].some((id) => isOwner(guild.client.guilds.cache.get(id) || guild, actorId));
  const mode = detail.exempt || ownsAttacked ? "strip" : s.nuke_punishment;
  offenders.set(actorId, { at: Date.now(), punishment: mode });
  for (const id of groups.keys()) destructive.delete(`${id}:${actorId}`);
  await punish(guild, actorId, groups, { mode, exempt: Boolean(detail.exempt), network: network && !local }, log);
  return { count, limit, punished: true };
}

/** Stops one account in one server: ban/kick per policy, falling back to stripping roles and a timeout. */
async function contain(guild, actorId, mode, reason) {
  if (isOwner(guild, actorId)) return { result: "Server owner · Discord does not let bots act against the owner", stopped: false, owner: true, stripped: [] };
  const member = guild.members.cache.get(actorId) || (await guild.members.fetch(actorId).catch(() => null));
  // Banning first is one API call and ends every permission at once; stripping is the fallback.
  if (mode === "ban" && (await guild.members.ban(actorId, { reason, deleteMessageSeconds: 3600 }).then(() => true, () => false)))
    return { result: member ? "Banned" : "Banned pre-emptively", stopped: true, acted: true, present: Boolean(member), stripped: [] };
  if (!member) return { result: mode === "ban" ? "Ban failed · not a member" : "Not a member", stopped: true, acted: false, present: false, stripped: [] };
  if (mode === "kick" && (await member.kick(reason).then(() => true, () => false)))
    return { result: "Kicked", stopped: true, acted: true, present: true, stripped: [] };
  const strippable = member.roles.cache.filter((role) => role.id !== guild.id && !role.managed && role.editable);
  const updated = strippable.size ? await member.roles.remove([...strippable.keys()], reason).catch(() => null) : member;
  const stripped = updated && strippable.size ? [...strippable.keys()] : [];
  const current = updated || member;
  // A timeout removes every permission except reading, which also covers roles the bot cannot reach.
  const timedOut = current.moderatable ? await current.timeout(QUARANTINE_MS, reason).then(() => true, () => false) : false;
  const stillDangerous = DANGEROUS.some((flag) => current.permissions.has(flag));
  const parts = [];
  if (mode !== "strip") parts.push(`${mode === "ban" ? "Ban" : "Kick"} failed`);
  parts.push(stripped.length ? `${stripped.length} role(s) stripped` : "No roles stripped");
  if (timedOut) parts.push("timed out 7 days");
  if (stillDangerous && !timedOut) parts.push("**still holds dangerous permissions**");
  return { result: parts.join(" · "), stopped: timedOut || !stillDangerous, acted: Boolean(stripped.length || timedOut), present: true, stripped, timedOut };
}

function containOnce(guild, actorId, mode, reason) {
  const key = `${guild.id}:${actorId}`;
  const hit = containing.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.promise;
  const promise = contain(guild, actorId, mode, reason).catch((error) => ({ result: `Failed · ${clip(error.message || error, 80)}`, stopped: false, stripped: [] }));
  containing.set(key, { at: Date.now(), promise });
  return promise;
}

async function punish(origin, actorId, groups, ctx, log) {
  const s = await getSecuritySettings();
  const client = origin.client;
  const total = [...groups.values()].reduce((n, list) => n + list.length, 0);
  const across = groups.size > 1 ? ` across ${groups.size} servers` : "";
  const reason = `${NUKE_REASON}: ${total} destructive actions in ${s.nuke_window}s${across}`;
  const attacked = [...groups.keys()].map((id) => client.guilds.cache.get(id)).filter(Boolean);
  const others = s.nuke_network_ban ? (await networkGuilds(client)).filter((g) => !groups.has(g.id)) : [];

  // 1. Stop the account everywhere at the same moment: the servers it attacked and every other network server.
  const outcomes = new Map();
  await Promise.all([
    ...attacked.map(async (g) => outcomes.set(g.id, await containOnce(g, actorId, ctx.mode, reason))),
    ...others.map(async (g) => {
      if (!ctx.exempt && (await exempt(g.id, actorId))) return outcomes.set(g.id, { result: "Exempt in this server", stopped: false, skipped: true, stripped: [] });
      outcomes.set(g.id, await containOnce(g, actorId, ctx.mode, `${reason} (network containment)`));
    }),
  ]);

  // 2. Undo the damage in every server it touched.
  const recoveries = new Map();
  await Promise.all(
    attacked.map(async (g) => {
      const owner = isOwner(g, actorId);
      const recovery = await recover(g, groups.get(g.id), reason, s.nuke_restore && !owner);
      if (!owner) {
        const left = await purgeLeftovers(g, actorId, `${reason} · recovery`);
        if (left.webhooks) recovery.lines.push(`✅ Deleted ${left.webhooks} other webhook(s) the attacker owned`);
        if (left.invites) recovery.lines.push(`✅ Revoked ${left.invites} invite(s) the attacker created`);
      }
      recoveries.set(g.id, recovery);
    }),
  );

  // 3. Failsafe: lock down any attacked server where the account could not be stopped. Sequential: one shared state row.
  const locked = new Set();
  for (const g of attacked) {
    const out = outcomes.get(g.id);
    if (out.stopped || out.owner || !s.nuke_failsafe_lockdown || (await lockdownStates())[g.id]) continue;
    if (await lockdown(g, { reason: `Anti-nuke could not stop <@${actorId}>`, actorId: client.user.id, minutes: 0, log }).then(() => true, () => false)) locked.add(g.id);
  }

  // 4. Remember the account network-wide (survives restarts; lifted with /security pardon).
  const stripped = Object.fromEntries([...outcomes].filter(([, o]) => o.stripped?.length).map(([id, o]) => [id, o.stripped]));
  const timedOut = [...outcomes].filter(([, o]) => o.timedOut).map(([id]) => id);
  const counts = {};
  for (const item of [...groups.values()].flat()) counts[item.type] = (counts[item.type] || 0) + 1;
  await db
    .query(
      `INSERT INTO network_nuke_offenders(discord_id,origin_guild_id,reason,punishment,details,active,created_at,cleared_by,cleared_at)
       VALUES(?,?,?,?,?,TRUE,?,NULL,NULL)
       ON DUPLICATE KEY UPDATE origin_guild_id=VALUES(origin_guild_id),reason=VALUES(reason),punishment=VALUES(punishment),details=VALUES(details),active=TRUE,created_at=VALUES(created_at),cleared_by=NULL,cleared_at=NULL`,
      [actorId, origin.id, clip(reason, 300), ctx.mode, JSON.stringify({ counts, servers: [...groups.keys()], stripped, timedOut, exempt: ctx.exempt }), Date.now()],
    )
    .catch((error) => console.error("[FBRP security] offender record:", error.message || error));

  // 5. Report: a full entry in every attacked server, a short one wherever the account was contained.
  const elsewhere = others.map((g) => [g, outcomes.get(g.id)]).filter(([, o]) => o && !o.skipped);
  const elsewhereActed = elsewhere.filter(([, o]) => o.acted).length;
  const elsewhereFailed = elsewhere.filter(([, o]) => o.present && !o.stopped);
  const networkLine = others.length
    ? `Contained in ${elsewhereActed}/${others.length} other server(s)${elsewhereFailed.length ? `\n❌ Could not stop them in: ${elsewhereFailed.map(([g]) => clip(g.name, 40)).join(", ")}` : ""}`
    : s.nuke_network_ban ? "No other network servers" : "Off";
  const serverLines = [];
  for (const g of attacked) {
    const out = outcomes.get(g.id);
    const owner = Boolean(out.owner);
    const items = groups.get(g.id);
    const local = {};
    for (const item of items) local[item.type] = (local[item.type] || 0) + 1;
    const recovery = recoveries.get(g.id);
    serverLines.push(`**${clip(g.name, 60)}** · ${items.length} action(s) · ${out.result}`);
    await securityEvent(g.id, "antinuke_punish", actorId, null, out.stopped && !owner ? "punished" : owner ? "owner" : "failed", {
      result: out.result,
      counts: local,
      stripped: out.stripped,
      recovery: { ...recovery, lines: undefined },
      network: ctx.network,
      servers: groups.size,
      contained: elsewhereActed,
    });
    await log(g, {
      title: out.stopped && !owner ? "Anti-nuke triggered" : owner ? "Anti-nuke triggered · server owner" : "Anti-nuke triggered · action failed",
      color: COLORS.danger,
      description: owner
        ? `The server owner <@${actorId}> made ${items.length} destructive actions here${across ? ` (${total}${across})` : ""}. If this was not them, **their account is compromised**: reset its password and 2FA now. They have been quarantined in every other network server.`
        : out.stopped
          ? `<@${actorId}> was stopped after ${total} destructive actions in ${s.nuke_window} seconds${across}.${ctx.network ? " No single server crossed its limit: the **network-wide** budget caught them." : ""}${ctx.exempt ? " This account has a security exemption, but crossed the exempt ceiling, so it was quarantined rather than banned." : ""}`
          : `<@${actorId}> made ${items.length} destructive actions here and the bot could not fully stop them.\n**Check the role hierarchy immediately:** the Florida Bay bot role must sit above every staff role. Run \`/security health\`.`,
      fields: [
        ["Account", who(actorId)],
        ["Result here", out.result],
        ["Roles stripped", out.stripped?.length ? out.stripped.map((id) => roleRef(id)).join(" ").slice(0, 1000) : "None"],
        ["What happened here", Object.entries(local).map(([type, n]) => `${n}× ${ACTION_LABEL[type] || type}`).join("\n"), false],
        ...(recovery.lines.length ? [["Damage undone", recovery.lines.join("\n").slice(0, 1024), false]] : []),
        ...(groups.size > 1 ? [["Also attacked", attacked.filter((x) => x.id !== g.id).map((x) => clip(x.name, 60)).join("\n") || "Unknown", false]] : []),
        ["Network", networkLine, false],
        ...(locked.has(g.id) ? [["Failsafe", "Server locked down until `/security unlock`"]] : []),
        ["Offender list", "Any further action or join anywhere in the network is stopped instantly. Lift with `/security pardon`."],
      ],
    });
  }
  for (const [g, out] of elsewhere)
    if (out.present || out.acted)
      await log(g, {
        title: "Anti-nuke network containment",
        color: out.stopped ? COLORS.warning : COLORS.danger,
        description: `<@${actorId}> attacked ${attacked.map((x) => `**${clip(x.name, 60)}**`).join(", ")}. They were contained here before they could do the same.`,
        fields: [["Account", who(actorId)], ["Result here", out.result], ...(out.stripped?.length ? [["Roles stripped", out.stripped.map((id) => roleRef(id)).join(" ").slice(0, 1000)]] : [])],
      });
  const summary = Object.entries(counts).map(([type, n]) => `${n}× ${ACTION_LABEL[type] || type}`).join("\n");
  await alertOwners(
    attacked,
    card(`Anti-nuke triggered${across ? across : ` in ${origin.name}`}`, {
      color: COLORS.danger,
      description: `<@${actorId}> made ${total} destructive actions in ${s.nuke_window} seconds${across}.${ctx.network ? " Caught by the network-wide budget." : ""}`,
      rows: [
        ["Account", who(actorId)],
        ["Punishment", ctx.mode],
        ["Servers attacked", serverLines.join("\n").slice(0, 1024), false],
        ["What happened", summary.slice(0, 1024), false],
        ["Network", networkLine, false],
        ...(locked.size ? [["Failsafe lockdown", attacked.filter((g) => locked.has(g.id)).map((g) => clip(g.name, 60)).join("\n")]] : []),
      ],
    }),
  );
}

/** A known attacker acted again: contain them in this server and undo the action straight away. */
async function zeroTolerance(guild, actorId, item, log) {
  // The owner of this server cannot be acted against here; they are quarantined everywhere else.
  if (isOwner(guild, actorId)) return { punished: false };
  const s = await getSecuritySettings();
  const reason = `${NUKE_REASON}: known attacker`;
  const offender = offenders.get(actorId);
  const [outcome, recovery] = await Promise.all([
    containOnce(guild, actorId, offender?.punishment || s.nuke_punishment, reason),
    recover(guild, [item], reason, s.nuke_restore),
  ]);
  void securityEvent(guild.id, item.type, actorId, item.target, "zero_tolerance", { label: item.label, result: outcome.result });
  queueZeroLog(guild, actorId, `${ACTION_LABEL[item.type] || item.type}${item.label ? ` · ${clip(item.label, 60)}` : ""}${recovery.lines.length ? ` · ${recovery.lines.map((line) => line.replace(/^\S+\s/, "")).join("; ")}` : ""}`, outcome, log);
  return { punished: true };
}

function queueZeroLog(guild, actorId, line, outcome, log) {
  const key = `${guild.id}:${actorId}`;
  const queued = zeroLogs.get(key);
  if (queued) {
    queued.lines.push(line);
    queued.outcome = outcome;
    return;
  }
  const entry = { lines: [line], outcome };
  zeroLogs.set(key, entry);
  setTimeout(() => {
    zeroLogs.delete(key);
    void log(guild, {
      title: "Known attacker stopped",
      color: COLORS.danger,
      description: `<@${actorId}> is on the anti-nuke offender list, so their actions here were handled instantly without waiting for a limit.`,
      fields: [["Account", who(actorId)], ["Result", entry.outcome.result], ["Actions", entry.lines.slice(0, 15).join("\n").slice(0, 1024), false]],
    }).catch(() => {});
  }, 4000).unref?.();
}

/** Deletes every webhook the attacker owns and every invite they created, not just those in the window. */
async function purgeLeftovers(guild, actorId, why) {
  const out = { webhooks: 0, invites: 0 };
  const hooks = await guild.fetchWebhooks().catch(() => null);
  for (const hook of hooks?.values() || [])
    if (String(hook.owner?.id) === actorId && (await hook.delete(why).then(() => true, () => false))) out.webhooks++;
  const invites = await guild.invites.fetch().catch(() => null);
  for (const invite of invites?.values() || [])
    if (String(invite.inviterId) === actorId && (await invite.delete(why).then(() => true, () => false))) out.invites++;
  return out;
}

/** Re-applies the offender list in one server (or all): a join, a restart, or a server joining the network. */
export async function enforceOffenders(client, log, onlyGuild = null) {
  if (!offenders.size) return 0;
  let acted = 0;
  const guilds = onlyGuild ? [onlyGuild] : await networkGuilds(client);
  for (const guild of guilds) {
    if (!(await registered(guild.id))) continue;
    for (const [id, offender] of offenders) {
      if (isOwner(guild, id) || (await exempt(guild.id, id))) continue;
      if (offender.punishment === "ban") {
        if (await guild.bans.fetch(id).catch(() => null)) continue;
      } else if (!guild.members.cache.has(id)) continue;
      const out = await containOnce(guild, id, offender.punishment, `${NUKE_REASON}: offender list`);
      if (out.acted) {
        acted++;
        await log(guild, { title: "Anti-nuke offender contained", color: COLORS.warning, fields: [["Account", who(id)], ["Result", out.result]] });
      }
    }
  }
  return acted;
}

export async function listOffenders(limit = 25) {
  return db.query(`SELECT * FROM network_nuke_offenders WHERE active=TRUE ORDER BY created_at DESC LIMIT ${Number(limit) | 0}`);
}

/** Lifts an offender: unbans anti-nuke bans, ends quarantine timeouts and gives stripped roles back. */
export async function pardonOffender(client, userId, actorId, log) {
  const id = String(userId);
  const row = await db.one("SELECT * FROM network_nuke_offenders WHERE discord_id=? AND active=TRUE", [id]);
  if (!row) throw new Error("That account is not on the anti-nuke offender list.");
  let details = row.details || {};
  if (typeof details === "string") try { details = JSON.parse(details); } catch { details = {}; }
  offenders.delete(id);
  for (const key of [...containing.keys()]) if (key.endsWith(`:${id}`)) containing.delete(key);
  await db.query("UPDATE network_nuke_offenders SET active=FALSE,cleared_by=?,cleared_at=? WHERE discord_id=?", [actorId, Date.now(), id]);
  const why = `${NUKE_REASON}: pardoned by ${actorId}`;
  const lines = [];
  for (const guild of await networkGuilds(client)) {
    const steps = [];
    const ban = await guild.bans.fetch(id).catch(() => null);
    if (ban?.reason?.startsWith(NUKE_REASON) && (await guild.members.unban(id, why).then(() => true, () => false))) steps.push("unbanned");
    const member = guild.members.cache.get(id) || (await guild.members.fetch(id).catch(() => null));
    if (member?.isCommunicationDisabled() && (await member.timeout(null, why).then(() => true, () => false))) steps.push("timeout lifted");
    const roles = (details.stripped?.[guild.id] || []).filter((roleId) => guild.roles.cache.get(roleId)?.editable);
    if (member && roles.length && (await member.roles.add(roles, why).then(() => true, () => false))) steps.push(`${roles.length} role(s) restored`);
    if (steps.length) {
      lines.push(`**${clip(guild.name, 60)}** · ${steps.join(", ")}`);
      await log(guild, { title: "Anti-nuke offender pardoned", color: COLORS.success, fields: [["Account", who(id)], ["Pardoned by", who(actorId)], ["Here", steps.join(", ")]] });
    }
  }
  await audit(actorId, "security.nuke.pardon", id, { lines });
  return lines;
}

/* Snapshots of deleted channels and roles, kept for a few minutes so anti-nuke can rebuild them. */
const deletedChannels = new Map();
const deletedRoles = new Map();

export function rememberChannel(channel) {
  if (!channel?.guild || channel.isThread?.()) return;
  deletedChannels.set(`${channel.guild.id}:${channel.id}`, {
    at: Date.now(),
    id: channel.id,
    name: channel.name,
    type: channel.type,
    topic: channel.topic ?? undefined,
    nsfw: channel.nsfw ?? undefined,
    bitrate: channel.bitrate ?? undefined,
    userLimit: channel.userLimit ?? undefined,
    rateLimitPerUser: channel.rateLimitPerUser ?? undefined,
    parentId: channel.parentId ?? null,
    position: channel.rawPosition ?? channel.position ?? undefined,
    overwrites: [...(channel.permissionOverwrites?.cache.values() || [])].map((o) => ({
      id: o.id,
      type: o.type,
      allow: o.allow.bitfield,
      deny: o.deny.bitfield,
    })),
  });
}

export function rememberRole(role) {
  if (!role?.guild || role.managed) return;
  deletedRoles.set(`${role.guild.id}:${role.id}`, {
    at: Date.now(),
    id: role.id,
    name: role.name,
    color: role.colors?.primaryColor ?? 0,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield,
    position: role.position,
    unicodeEmoji: role.unicodeEmoji ?? undefined,
    // Discord sends no member updates when a role is deleted, so the cached members still list it.
    members: [...role.guild.members.cache.values()].filter((m) => m._roles?.includes(role.id)).map((m) => m.id),
  });
}

const old = (item, key) => item.changes?.find((c) => c.key === key)?.old;
const hasOld = (item, key) => item.changes?.some((c) => c.key === key && c.old !== undefined);
/** Overwrite options that reproduce an exact allow/deny pair (null = inherit). */
const overwriteOptions = (allow, deny) =>
  Object.fromEntries(Object.entries(PermissionFlagsBits).map(([name, flag]) => [name, (bits(allow) & flag) === flag ? true : (bits(deny) & flag) === flag ? false : null]));
const ids = (list) => (Array.isArray(list) ? list.map((x) => String(x?.id ?? x)) : undefined);
const autoModMeta = (m) =>
  m && {
    keywordFilter: m.keyword_filter,
    regexPatterns: m.regex_patterns,
    presets: m.presets,
    allowList: m.allow_list,
    mentionTotalLimit: m.mention_total_limit,
    mentionRaidProtectionEnabled: m.mention_raid_protection_enabled,
  };
const autoModActions = (list) =>
  Array.isArray(list)
    ? list.map((a) => ({ type: a.type, metadata: { channel: a.metadata?.channel_id, durationSeconds: a.metadata?.duration_seconds, customMessage: a.metadata?.custom_message } }))
    : undefined;
const undefinedless = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Puts back what one edit changed. Returns true when something was reverted. */
async function revertEdit(guild, item, why) {
  const ok = (p) => p.then(() => true, () => false);
  switch (item.type) {
    case "member_roles": {
      const roles = (item.changes?.find((c) => c.key === "$remove")?.new || []).map((r) => String(r.id)).filter((id) => guild.roles.cache.get(id)?.editable);
      const member = roles.length ? await guild.members.fetch(item.target).catch(() => null) : null;
      return member ? ok(member.roles.add(roles, why)) : false;
    }
    case "member_timeout": {
      const member = await guild.members.fetch(item.target).catch(() => null);
      return member?.isCommunicationDisabled() ? ok(member.timeout(null, why)) : false;
    }
    case "member_unban":
      return ok(guild.members.ban(item.target, { reason: `${why} · unbanned by the attacker` }));
    case "role_update":
    case "permission_escalation": {
      const role = guild.roles.cache.get(item.target);
      if (!role?.editable || !item.changes) return false;
      const edit = undefinedless({
        name: hasOld(item, "name") ? old(item, "name") : undefined,
        permissions: hasOld(item, "permissions") ? bits(old(item, "permissions")) : undefined,
        colors: hasOld(item, "color") ? { primaryColor: Number(old(item, "color")) || 0 } : undefined,
        hoist: hasOld(item, "hoist") ? old(item, "hoist") : undefined,
        mentionable: hasOld(item, "mentionable") ? old(item, "mentionable") : undefined,
      });
      return Object.keys(edit).length ? ok(role.edit({ ...edit, reason: why })) : false;
    }
    case "channel_update": {
      const channel = guild.channels.cache.get(item.target);
      if (!channel || !item.changes) return false;
      const edit = undefinedless({
        name: hasOld(item, "name") ? old(item, "name") : undefined,
        topic: hasOld(item, "topic") ? old(item, "topic") : undefined,
        nsfw: hasOld(item, "nsfw") ? old(item, "nsfw") : undefined,
        rateLimitPerUser: hasOld(item, "rate_limit_per_user") ? old(item, "rate_limit_per_user") : undefined,
        bitrate: hasOld(item, "bitrate") ? old(item, "bitrate") : undefined,
        userLimit: hasOld(item, "user_limit") ? old(item, "user_limit") : undefined,
        parent: hasOld(item, "parent_id") ? old(item, "parent_id") : undefined,
      });
      return Object.keys(edit).length ? ok(channel.edit({ ...edit, reason: why })) : false;
    }
    case "channel_permissions": {
      const channel = guild.channels.cache.get(item.target);
      const id = item.extra?.id;
      if (!channel?.permissionOverwrites || !id) return false;
      if (item.extra.action === AuditLogEvent.ChannelOverwriteCreate) return ok(channel.permissionOverwrites.delete(id, why));
      const type = item.extra.type ?? (guild.roles.cache.has(id) ? 0 : 1);
      const allow = hasOld(item, "allow") ? old(item, "allow") : channel.permissionOverwrites.cache.get(id)?.allow.bitfield;
      const deny = hasOld(item, "deny") ? old(item, "deny") : channel.permissionOverwrites.cache.get(id)?.deny.bitfield;
      return ok(channel.permissionOverwrites.create(id, overwriteOptions(allow, deny), { reason: why, type }));
    }
    case "guild_update": {
      const edit = undefinedless({
        name: hasOld(item, "name") ? old(item, "name") : undefined,
        verificationLevel: hasOld(item, "verification_level") ? old(item, "verification_level") : undefined,
        explicitContentFilter: hasOld(item, "explicit_content_filter") ? old(item, "explicit_content_filter") : undefined,
        defaultMessageNotifications: hasOld(item, "default_message_notifications") ? old(item, "default_message_notifications") : undefined,
      });
      return Object.keys(edit).length ? ok(guild.edit({ ...edit, reason: why })) : false;
    }
    case "invite_create":
      return item.extra?.code ? ok(guild.invites.delete(item.extra.code, why)) : false;
    case "automod_change": {
      if (!item.changes) return false;
      const rules = guild.autoModerationRules;
      if (item.extra?.action === AuditLogEvent.AutoModerationRuleUpdate) {
        const edit = undefinedless({
          name: hasOld(item, "name") ? old(item, "name") : undefined,
          enabled: hasOld(item, "enabled") ? old(item, "enabled") : undefined,
          eventType: hasOld(item, "event_type") ? old(item, "event_type") : undefined,
          triggerMetadata: hasOld(item, "trigger_metadata") ? autoModMeta(old(item, "trigger_metadata")) : undefined,
          actions: hasOld(item, "actions") ? autoModActions(old(item, "actions")) : undefined,
          exemptRoles: hasOld(item, "exempt_roles") ? ids(old(item, "exempt_roles")) : undefined,
          exemptChannels: hasOld(item, "exempt_channels") ? ids(old(item, "exempt_channels")) : undefined,
        });
        return Object.keys(edit).length ? ok(rules.edit(item.target, { ...edit, reason: why })) : false;
      }
      if (!hasOld(item, "trigger_type")) return false;
      return ok(
        rules.create(
          undefinedless({
            name: old(item, "name") || "Restored rule",
            eventType: old(item, "event_type") ?? 1,
            triggerType: old(item, "trigger_type"),
            triggerMetadata: autoModMeta(old(item, "trigger_metadata")),
            actions: autoModActions(old(item, "actions")) || [{ type: 1 }],
            enabled: old(item, "enabled") ?? true,
            exemptRoles: ids(old(item, "exempt_roles"))?.filter((id) => guild.roles.cache.has(id)),
            exemptChannels: ids(old(item, "exempt_channels"))?.filter((id) => guild.channels.cache.has(id)),
            reason: why,
          }),
        ),
      );
    }
    default:
      return false;
  }
}

/** Rebuilds deleted roles and channels, removes what the attacker created, reverts their edits and lifts their bans. */
async function recover(guild, recent, reason, restore) {
  const why = `${reason} · recovery`;
  const lines = [];
  const done = { webhooks: 0, roles: 0, channels: 0, removed: 0, unbanned: 0, reverted: 0, failed: 0 };
  for (const item of recent.filter((entry) => entry.type === "webhook_create" && entry.target)) {
    const hook = await guild.client.fetchWebhook(item.target).catch(() => null);
    if (hook && (await hook.delete(why).then(() => true, () => false))) done.webhooks++;
  }
  if (restore) {
    // The delete event and its audit entry race; give a missing snapshot a moment to arrive.
    const missing = recent.some(
      (entry) =>
        (entry.type === "role_delete" && !deletedRoles.has(`${guild.id}:${entry.target}`)) ||
        (entry.type === "channel_delete" && !deletedChannels.has(`${guild.id}:${entry.target}`)),
    );
    if (missing) await sleep(1500);
    const roleMap = new Map();
    for (const item of recent.filter((entry) => entry.type === "role_delete" && entry.target).slice(0, 25)) {
      const snap = deletedRoles.get(`${guild.id}:${item.target}`);
      if (!snap) continue;
      deletedRoles.delete(`${guild.id}:${item.target}`);
      const role = await guild.roles
        .create({ name: snap.name, colors: { primaryColor: snap.color }, hoist: snap.hoist, mentionable: snap.mentionable, permissions: snap.permissions, unicodeEmoji: snap.unicodeEmoji, reason: why })
        .catch(() => null);
      if (!role) { done.failed++; continue; }
      done.roles++;
      roleMap.set(snap.id, role.id);
      const top = guild.members.me?.roles.highest.position ?? 1;
      await role.setPosition(Math.max(1, Math.min(snap.position, top - 1)), { reason: why }).catch(() => {});
      // Giving the role back to its members can take a while; let it run after the report.
      void (async () => {
        for (const id of snap.members.slice(0, 300)) {
          const member = guild.members.cache.get(id);
          if (member) await member.roles.add(role.id, why).catch(() => {});
        }
      })();
    }
    const channels = recent
      .filter((entry) => entry.type === "channel_delete" && entry.target)
      .map((entry) => deletedChannels.get(`${guild.id}:${entry.target}`))
      .filter(Boolean)
      .slice(0, 50)
      .sort((a, b) => (a.type === ChannelType.GuildCategory ? 0 : 1) - (b.type === ChannelType.GuildCategory ? 0 : 1));
    const channelMap = new Map();
    for (const snap of channels) {
      deletedChannels.delete(`${guild.id}:${snap.id}`);
      const overwrites = snap.overwrites
        .map((o) => ({ ...o, id: roleMap.get(o.id) || o.id }))
        .filter((o) => guild.roles.cache.has(o.id) || guild.members.cache.has(o.id));
      const parent = snap.parentId ? channelMap.get(snap.parentId) || snap.parentId : null;
      const channel = await guild.channels
        .create({
          name: snap.name,
          type: snap.type,
          topic: snap.topic,
          nsfw: snap.nsfw,
          bitrate: snap.bitrate,
          userLimit: snap.userLimit,
          rateLimitPerUser: snap.rateLimitPerUser,
          parent: parent && guild.channels.cache.has(parent) ? parent : null,
          position: snap.position,
          permissionOverwrites: overwrites,
          reason: why,
        })
        .catch(() => null);
      if (channel) {
        done.channels++;
        channelMap.set(snap.id, channel.id);
      } else done.failed++;
    }
    for (const item of recent.filter((entry) => ["channel_create", "role_create"].includes(entry.type) && entry.target)) {
      const made = item.type === "channel_create" ? guild.channels.cache.get(item.target) : guild.roles.cache.get(item.target);
      if (made && (await made.delete(why).then(() => true, () => false))) done.removed++;
    }
    for (const item of recent.filter((entry) => entry.type === "member_ban" && entry.target))
      if (await guild.members.unban(item.target, why).then(() => true, () => false)) done.unbanned++;
    // Newest edit last, so several edits to the same thing end on its original state.
    for (const item of [...recent].reverse().filter((entry) => entry.target || entry.extra))
      if (await revertEdit(guild, item, why).catch(() => false)) done.reverted++;
  }
  if (done.roles) lines.push(`✅ Rebuilt ${done.roles} deleted role(s) and gave them back to their members`);
  if (done.channels) lines.push(`✅ Rebuilt ${done.channels} deleted channel(s)`);
  if (done.removed) lines.push(`✅ Removed ${done.removed} channel(s)/role(s) the attacker created`);
  if (done.unbanned) lines.push(`✅ Unbanned ${done.unbanned} member(s) the attacker banned`);
  if (done.reverted) lines.push(`✅ Reverted ${done.reverted} edit(s): roles, channels, permissions, settings, AutoMod, unbans, timeouts`);
  if (done.webhooks) lines.push(`✅ Deleted ${done.webhooks} webhook(s) the attacker created`);
  if (done.failed) lines.push(`❌ ${done.failed} item(s) could not be rebuilt`);
  return { ...done, lines };
}

/* ---- Audit-log stream: one handler sees every moderation action in every network server ---- */

const change = (entry, key) => entry.changes?.find((item) => item.key === key);
const bits = (value) => {
  try { return BigInt(value ?? 0); } catch { return 0n; }
};

function classify(entry) {
  const A = AuditLogEvent;
  const target = entry.targetId ?? entry.target?.id ?? null;
  const name = entry.target?.name ?? change(entry, "name")?.old ?? change(entry, "name")?.new ?? null;
  switch (entry.action) {
    case A.ChannelCreate: return { type: "channel_create", target, label: name && `#${name}` };
    case A.ChannelDelete: return { type: "channel_delete", target, label: name && `#${name}` };
    case A.ChannelUpdate: return { type: "channel_update", target, label: name && `#${name}` };
    case A.ChannelOverwriteCreate:
    case A.ChannelOverwriteUpdate:
    case A.ChannelOverwriteDelete: {
      const id = entry.extra?.id ?? change(entry, "id")?.old ?? change(entry, "id")?.new ?? null;
      const type = entry.extra?.type ?? change(entry, "type")?.old ?? change(entry, "type")?.new;
      return { type: "channel_permissions", target, label: name && `#${name}`, extra: id && { id: String(id), type: type === undefined ? undefined : Number(type), action: entry.action } };
    }
    case A.RoleCreate: return { type: "role_create", target, label: name };
    case A.RoleDelete: return { type: "role_delete", target, label: name && `@${name}` };
    case A.RoleUpdate: return { type: "role_update", target, label: name };
    case A.MemberBanAdd: return { type: "member_ban", target, label: entry.target?.tag || entry.target?.username };
    case A.MemberBanRemove: return { type: "member_unban", target, label: entry.target?.tag || entry.target?.username };
    case A.MemberKick: return { type: "member_kick", target, label: entry.target?.tag || entry.target?.username };
    case A.MemberPrune: {
      const removed = Number(entry.extra?.removed ?? 0);
      return { type: "member_prune", target, label: `${removed} member(s) pruned`, weight: removed >= 5 ? 1000 : 3 };
    }
    // Role grants are only interesting when dangerous (checked in handleAuditEntry); removals are scored.
    case A.MemberRoleUpdate: return { type: "member_roles", target, label: entry.target?.tag, unscored: !change(entry, "$remove") };
    case A.MemberUpdate: {
      const timeout = change(entry, "communication_disabled_until");
      return timeout?.new ? { type: "member_timeout", target, label: entry.target?.tag } : null;
    }
    case A.MemberDisconnect:
    case A.MemberMove: return { type: "voice_disconnect", target, label: `${entry.extra?.count ?? 1} member(s)` };
    case A.ThreadDelete: return { type: "thread_delete", target, label: name };
    case A.MessageBulkDelete: return { type: "message_purge", target, label: `${entry.extra?.count ?? "?"} message(s)` };
    case A.EmojiDelete:
    case A.StickerDelete: return { type: "emoji_delete", target, label: name };
    case A.WebhookCreate: return { type: "webhook_create", target, label: name };
    case A.WebhookUpdate: return { type: "webhook_update", target, label: name };
    case A.WebhookDelete: return { type: "webhook_delete", target, label: name };
    case A.IntegrationCreate: return { type: "integration_create", target, label: name };
    case A.IntegrationDelete: return { type: "integration_delete", target, label: name };
    case A.InviteCreate: {
      const code = change(entry, "code")?.new ?? entry.target?.code ?? null;
      return { type: "invite_create", target: target ?? code, label: code, extra: code && { code } };
    }
    case A.AutoModerationRuleDelete:
    case A.AutoModerationRuleUpdate: return { type: "automod_change", target, label: name, extra: { action: entry.action } };
    case A.GuildUpdate: return { type: "guild_update", target, label: (entry.changes || []).map((c) => c.key).join(", ") };
    default: return null;
  }
}

const isBotOwner = (id) => String(id) === String(process.env.FBRP_OWNER_DISCORD_ID || "");

/** Entry point for the guildAuditLogEntryCreate event. */
export async function handleAuditEntry(entry, guild, log) {
  const actor = entry.executorId;
  if (!guild || !actor || actor === guild.client.user.id || isBotOwner(actor)) return;
  const kind = classify(entry);
  if (!kind || !(await registered(guild.id))) return;
  const detail = { label: kind.label, weight: kind.weight, changes: entry.changes || null, extra: kind.extra || null };
  // Known attackers skip every check: their first action anywhere is undone.
  if (offenders.has(String(actor))) return nukeAction(guild, kind.type, actor, kind.target, log, detail);
  if (await trusted(guild, actor)) {
    // Exempt accounts are not reverted or logged, only counted against the (much higher) exempt ceiling.
    if (entry.action === AuditLogEvent.MemberRoleUpdate && kind.unscored) return;
    return nukeAction(guild, kind.type, actor, kind.target, log, { ...detail, exempt: true });
  }
  const owner = isOwner(guild, actor);
  const s = await getSecuritySettings();

  if (entry.action === AuditLogEvent.RoleUpdate || entry.action === AuditLogEvent.RoleCreate) {
    const p = change(entry, "permissions");
    const watched = entry.action === AuditLogEvent.RoleUpdate ? DANGEROUS : GRANT_DANGEROUS;
    const added = p ? watched.filter((flag) => (bits(p.new) & flag) === flag && (bits(p.old) & flag) !== flag) : [];
    if (added.length) {
      if (owner) await reportOwnerChange(guild, actor, "Dangerous permissions added to a role", kind.label, perms(added).join("\n"), log);
      else if (s.permission_guard) await revertRolePermissions(guild, kind.target, added, actor, log);
      return nukeAction(guild, "permission_escalation", actor, kind.target, log, detail);
    }
  }
  if (entry.action === AuditLogEvent.MemberRoleUpdate) {
    const granted = (change(entry, "$add")?.new || [])
      .map((r) => guild.roles.cache.get(String(r.id)))
      .filter((role) => role && GRANT_DANGEROUS.some((flag) => role.permissions.has(flag, false)));
    if (granted.length && !isOwner(guild, kind.target) && !(await trusted(guild, kind.target))) {
      if (owner) await reportOwnerChange(guild, actor, "Dangerous role granted", `<@${kind.target}>`, granted.map((r) => roleRef(r.id)).join(" "), log);
      else if (s.admin_grant_guard) await revertDangerousGrant(guild, kind.target, granted, actor, log);
      await nukeAction(guild, "dangerous_grant", actor, kind.target, log, { label: granted.map((role) => role.name).join(", ") });
    }
    if (kind.unscored) return;
  }
  if (entry.action === AuditLogEvent.WebhookCreate && s.webhook_guard && !owner && (await lockdownStates())[guild.id] && kind.target) {
    const hook = await guild.client.fetchWebhook(kind.target).catch(() => null);
    const deleted = hook ? await hook.delete("Florida Bay webhook guard: server is locked down").then(() => true, () => false) : false;
    await log(guild, {
      title: deleted ? "Webhook removed during lockdown" : "Webhook created during lockdown",
      color: COLORS.danger,
      fields: [["Created by", who(actor)], ["Webhook", clip(kind.label || kind.target, 200)], ["Result", deleted ? "Deleted" : "Could not delete"]],
    });
  }
  await nukeAction(guild, kind.type, actor, kind.target, log, detail);
}

async function reportOwnerChange(guild, actor, title, subject, detail, log) {
  await log(guild, {
    title: `${title} · by the server owner`,
    color: COLORS.warning,
    description: "Server owners are scanned but cannot be reverted or punished by a bot. Exempt them with `/security exempt-add` to silence this.",
    fields: [["Owner", who(actor)], ["Target", clip(subject || "Unknown", 200)], ["Detail", clip(detail, 500)]],
  });
}

async function revertRolePermissions(guild, roleId, added, actor, log) {
  const role = guild.roles.cache.get(String(roleId)) || (await guild.roles.fetch(String(roleId)).catch(() => null));
  if (!role) return;
  const reverted = role.editable
    ? await role.setPermissions(role.permissions.remove(added), "Florida Bay permission guard").then(() => true, () => false)
    : false;
  await securityEvent(guild.id, "permission_escalation", actor, role.id, reverted ? "reverted" : "failed", { added: perms(added) });
  await log(guild, {
    title: reverted ? "Dangerous permissions reverted" : "Dangerous permissions not reverted",
    color: reverted ? COLORS.warning : COLORS.danger,
    description: `${role.id === guild.id ? "@everyone" : roleRef(role.id)} was given dangerous permissions by an account without a security exemption.\n${reverted ? "The bot removed them again." : "The bot could not remove them. Move the bot role above this role."}`,
    fields: [
      ["Changed by", who(actor)],
      ["Role", role.id === guild.id ? "@everyone" : `${roleRef(role.id)}\n${clip(role.name, 100)}`],
      ["Permissions added", perms(added).join("\n")],
    ],
  });
}

async function revertDangerousGrant(guild, memberId, granted, actor, log) {
  const member = await guild.members.fetch(String(memberId)).catch(() => null);
  if (!member) return;
  const removable = granted.filter((role) => role.editable && !role.managed && member.roles.cache.has(role.id));
  const removed = removable.length
    ? await member.roles.remove(removable.map((role) => role.id), "Florida Bay admin grant guard").then(() => true, () => false)
    : false;
  await securityEvent(guild.id, "dangerous_grant", actor, member.id, removed ? "reverted" : "failed", { roles: granted.map((role) => role.id) });
  await log(guild, {
    title: removed ? "Dangerous role grant reverted" : "Dangerous role grant not reverted",
    color: removed ? COLORS.warning : COLORS.danger,
    description: `An account without a security exemption gave <@${member.id}> a role with dangerous permissions.\n${removed ? "The bot removed it again." : "The bot could not remove it. Move the bot role above it."}\nTrusted staff can be exempted with \`/security exempt-add\`.`,
    fields: [
      ["Member", who(member.id)],
      ["Granted by", who(actor)],
      ["Roles", granted.map((role) => roleRef(role.id)).join(" ")],
    ],
  });
}

/** Watches server-wide settings: name, vanity URL, verification, content filter and 2FA requirement. Scoring happens in the audit stream. */
export async function guardGuildUpdate(oldGuild, newGuild, log) {
  if (!(await registered(newGuild.id))) return;
  const changes = [];
  if (oldGuild.name !== newGuild.name) changes.push(["Name", `${clip(oldGuild.name, 100)} → ${clip(newGuild.name, 100)}`]);
  if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) changes.push(["Vanity URL", `${oldGuild.vanityURLCode || "none"} → ${newGuild.vanityURLCode || "none"}`]);
  if (oldGuild.icon !== newGuild.icon) changes.push(["Icon", "Changed"]);
  const lowered = newGuild.verificationLevel < oldGuild.verificationLevel;
  if (lowered) changes.push(["Verification level", `${GuildVerificationLevel[oldGuild.verificationLevel]} → ${GuildVerificationLevel[newGuild.verificationLevel]}`]);
  if (newGuild.explicitContentFilter < oldGuild.explicitContentFilter) changes.push(["Content filter", "Lowered"]);
  if (newGuild.mfaLevel < oldGuild.mfaLevel) changes.push(["2FA for moderation", "Disabled"]);
  if (!changes.length) return;
  const entry = await auditEntry(newGuild, AuditLogEvent.GuildUpdate, null);
  const actor = entry?.executorId;
  if (!actor || (await trusted(newGuild, actor))) return;
  // Lowering verification is the first step of most raids; put it back (except for the owner, whom a bot cannot overrule).
  const restored = lowered && !isOwner(newGuild, actor)
    ? await newGuild.setVerificationLevel(oldGuild.verificationLevel, "Florida Bay security: verification lowered by an account without an exemption").then(() => true, () => false)
    : false;
  await log(newGuild, {
    title: `Server settings changed${isOwner(newGuild, actor) ? " by the server owner" : " by an account without an exemption"}`,
    color: COLORS.warning,
    description: restored ? "The verification level was restored." : undefined,
    fields: [["Changed by", who(actor)], ...changes],
  });
}

/* ------------------------------------------------------------------------------------------------
 * Lockdown: strips chat permissions from @everyone, closes channels that explicitly allow
 * @everyone to talk, raises verification and pauses invites. Everything is recorded so unlock
 * puts back exactly what was there.
 * ---------------------------------------------------------------------------------------------- */

const LOCKDOWN_DENY = [
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.CreateInstantInvite,
];

export async function lockdownStates() {
  const row = await db.one("SELECT value FROM bot_config WHERE `key`='security_lockdowns'").catch(() => null);
  let value = row?.value || {};
  if (typeof value === "string") try { value = JSON.parse(value); } catch { value = {}; }
  return value && typeof value === "object" ? value : {};
}

async function saveLockdowns(map, actorId) {
  await db.query(
    "INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES('security_lockdowns',?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
    [JSON.stringify(map), String(actorId || "system").slice(0, 24), Date.now()],
  );
}

export async function lockdown(guild, { reason, actorId, minutes = 0, log }) {
  const states = await lockdownStates();
  if (states[guild.id]) throw new Error(`**${guild.name}** is already locked down.`);
  const everyone = guild.roles.everyone;
  const state = {
    at: Date.now(),
    by: actorId,
    reason: clip(reason, 300),
    until: minutes ? Date.now() + minutes * 60000 : null,
    removed: new PermissionsBitField(LOCKDOWN_DENY.filter((flag) => everyone.permissions.has(flag))).bitfield.toString(),
    verification: guild.verificationLevel,
    raisedVerification: false,
    pausedInvites: false,
    channels: [],
  };
  states[guild.id] = state;
  await saveLockdowns(states, actorId);
  const steps = [];
  const why = `Florida Bay lockdown: ${clip(reason, 200)}`;
  steps.push((await everyone.setPermissions(everyone.permissions.remove(LOCKDOWN_DENY), why).then(() => true, () => false)) ? "✅ @everyone can no longer chat, react or invite" : "❌ Could not change @everyone permissions");
  for (const channel of guild.channels.cache.values()) {
    if (state.channels.length >= 75) break;
    const overwrite = channel.permissionOverwrites?.cache.get(guild.id);
    if (!overwrite?.allow.has(PermissionFlagsBits.SendMessages)) continue;
    if (await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }, why).then(() => true, () => false)) state.channels.push(channel.id);
  }
  if (state.channels.length) steps.push(`✅ Closed ${state.channels.length} channel(s) that allowed @everyone to chat`);
  if (guild.verificationLevel < GuildVerificationLevel.VeryHigh) {
    state.raisedVerification = await guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, why).then(() => true, () => false);
    steps.push(state.raisedVerification ? "✅ Verification raised to phone-verified only" : "❌ Could not raise verification");
  }
  if (!guild.features.includes("INVITES_DISABLED")) {
    state.pausedInvites = await guild.disableInvites(true).then(() => true, () => false);
    steps.push(state.pausedInvites ? "✅ Invites paused" : "❌ Could not pause invites");
  }
  states[guild.id] = state;
  await saveLockdowns(states, actorId);
  await securityEvent(guild.id, "lockdown", actorId, null, "locked", { reason: state.reason, until: state.until });
  await log?.(guild, {
    title: "🔒 Server locked down",
    color: COLORS.danger,
    description: `> ${state.reason}`,
    fields: [
      ["Locked by", who(actorId)],
      ["Auto-unlock", state.until ? when(state.until) : "Manual (`/security unlock`)"],
      ["Changes", steps.join("\n"), false],
    ],
  });
  return { state, steps };
}

export async function unlock(guild, { actorId, reason = "Lockdown lifted", log }) {
  const states = await lockdownStates();
  const state = states[guild.id];
  if (!state) throw new Error(`**${guild.name}** is not locked down.`);
  const why = `Florida Bay lockdown lifted: ${clip(reason, 200)}`;
  const steps = [];
  const everyone = guild.roles.everyone;
  steps.push((await everyone.setPermissions(everyone.permissions.add(BigInt(state.removed || 0)), why).then(() => true, () => false)) ? "✅ @everyone permissions restored" : "❌ Could not restore @everyone permissions");
  let reopened = 0;
  for (const id of state.channels || []) {
    const channel = guild.channels.cache.get(String(id));
    if (channel && (await channel.permissionOverwrites.edit(guild.id, { SendMessages: true }, why).then(() => true, () => false))) reopened++;
  }
  if (reopened) steps.push(`✅ Reopened ${reopened} channel(s)`);
  if (state.raisedVerification && guild.verificationLevel === GuildVerificationLevel.VeryHigh)
    steps.push((await guild.setVerificationLevel(state.verification, why).then(() => true, () => false)) ? "✅ Verification level restored" : "❌ Could not restore verification");
  if (state.pausedInvites) steps.push((await guild.disableInvites(false).then(() => true, () => false)) ? "✅ Invites resumed" : "❌ Could not resume invites");
  delete states[guild.id];
  await saveLockdowns(states, actorId);
  await securityEvent(guild.id, "lockdown", actorId, null, "unlocked", { reason });
  await log?.(guild, {
    title: "🔓 Lockdown lifted",
    color: COLORS.success,
    description: `> ${clip(reason, 300)}`,
    fields: [
      ["Lifted by", who(actorId)],
      ["Locked for", `${Math.max(1, Math.round((Date.now() - Number(state.at)) / 60000))} min`],
      ["Changes", steps.join("\n"), false],
    ],
  });
  return { steps };
}

/** Lifts lockdowns whose timer ran out. Runs on an interval from index.js. */
export async function expireLockdowns(client, log) {
  const states = await lockdownStates();
  for (const [guildId, state] of Object.entries(states)) {
    if (!state.until || Number(state.until) > Date.now()) continue;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    await unlock(guild, { actorId: client.user.id, reason: "Lockdown timer expired", log }).catch((error) =>
      console.error("[FBRP security] auto-unlock:", error.message || error),
    );
  }
}

/* ------------------------------------------------------------------------------------------------
 * Anti-raid. Every join is risk-scored (account age, default avatar, names and creation times
 * shared with other recent joins). A raid is a burst of joins, a slower trickle of high-risk
 * joins, or several new accounts posting the same message.
 * ---------------------------------------------------------------------------------------------- */

const joins = new Map();
const raidUntil = new Map();
const HIGH_RISK = 4;

const nameStem = (user) =>
  String(user.username || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z]/g, "")
    .slice(0, 6);

function joinRisk(user, recent, s) {
  const flags = [];
  let score = 0;
  const age = accountAge(user);
  if (age < 1) { score += 3; flags.push("account under a day old"); }
  else if (age < s.raid_account_days) { score += 2; flags.push(`account under ${s.raid_account_days} days old`); }
  if (!user.avatar) { score += 1; flags.push("default avatar"); }
  const stem = nameStem(user);
  if (stem.length >= 3 && recent.some((item) => item.id !== user.id && item.stem === stem)) { score += 2; flags.push("name matches another recent join"); }
  if (recent.filter((item) => item.id !== user.id && Math.abs(item.created - user.createdTimestamp) < 30 * 60000).length >= 2) {
    score += 2;
    flags.push("created alongside other recent joins");
  }
  return { score, flags, stem };
}

/** Kicks, bans or times out one raider according to raid_action. */
async function actOnRaider(guild, memberId, s, why) {
  const member = await guild.members.fetch(memberId).catch(() => null);
  if (!member || isOwner(guild, member.id) || (await trusted(guild, member.id))) return false;
  if (s.raid_action === "ban") return guild.members.ban(member.id, { reason: why, deleteMessageSeconds: 3600 }).then(() => true, () => false);
  if (s.raid_action === "timeout") return member.timeout(24 * 3600000, why).then(() => true, () => false);
  return member.kick(why).then(() => true, () => false);
}
const actionText = (s) => ({ kick: "Kicked", ban: "Banned", timeout: "Timed out for 24h" })[s.raid_action] || "Removed";

/** Returns true when the member was removed, so the caller can skip the usual join sync. */
export async function guardJoin(member, log) {
  if (member.user.bot) return false;
  const guild = member.guild;
  const age = accountAge(member.user);
  const shouldAlert = requiresYoungAccountAlert(member.user);
  if (!(await registered(guild.id))) {
    if (shouldAlert) await alertYoungAccount(member, log, { age });
    return false;
  }
  // Anti-nuke offenders are stopped on arrival in every network server and never re-synced.
  const offender = offenders.get(String(member.id));
  if (offender && !isOwner(guild, member.id)) {
    const out = await containOnce(guild, String(member.id), offender.punishment, `${NUKE_REASON}: known attacker joined`);
    void securityEvent(guild.id, "offender_join", null, member.id, out.stopped ? "contained" : "failed", { result: out.result });
    await log(guild, {
      title: "Anti-nuke offender joined",
      color: COLORS.danger,
      description: "This account is on the anti-nuke offender list. Lift it with `/security pardon` if this is a mistake.",
      fields: [["Member", who(member.id)], ["Result", out.result]],
    });
    return true;
  }
  if (await trusted(guild, member.id)) {
    if (shouldAlert) await alertYoungAccount(member, log, { age, exempted: true });
    return false;
  }
  const s = await getSecuritySettings();
  const keep = Math.max(s.raid_window, s.raid_suspicious_window) * 1000;
  const recent = (joins.get(guild.id) || []).filter((item) => Date.now() - item.at < keep);
  const risk = joinRisk(member.user, recent, s);
  recent.push({ id: member.id, at: Date.now(), age, score: risk.score, stem: risk.stem, created: member.user.createdTimestamp });
  joins.set(guild.id, recent);
  // Send the dedicated under-14-day alert before raid/lockdown enforcement can return early.
  if (shouldAlert) await alertYoungAccount(member, log, { age, risk: risk.score, flags: risk.flags });
  const locked = (await lockdownStates())[guild.id];
  if (locked && s.raid_kick_new && (age < s.raid_account_days || risk.score >= HIGH_RISK)) {
    const removed = await actOnRaider(guild, member.id, s, "Florida Bay lockdown: new or high-risk account joined during lockdown");
    await securityEvent(guild.id, "raid_join", null, member.id, removed ? s.raid_action : "failed", { age, risk: risk.score, flags: risk.flags });
    await log(guild, {
      title: removed ? "Risky account removed during lockdown" : "Risky account joined during lockdown",
      color: COLORS.warning,
      fields: [
        ["Member", who(member.id)],
        ["Account age", ageText(member.user)],
        ["Risk", `${risk.score} · ${risk.flags.join(", ") || "none"}`],
        ["Result", removed ? actionText(s) : "Could not act"],
      ],
    });
    if (removed && s.raid_action !== "timeout") return true;
  }
  if (s.antiraid && !locked && Date.now() > (raidUntil.get(guild.id) || 0)) {
    const burst = recent.filter((item) => Date.now() - item.at < s.raid_window * 1000);
    const risky = recent.filter((item) => item.score >= HIGH_RISK && Date.now() - item.at < s.raid_suspicious_window * 1000);
    let cause = null;
    if (burst.length >= s.raid_joins) cause = { participants: burst, text: `${burst.length} accounts joined in ${s.raid_window} seconds` };
    else if (risky.length >= s.raid_suspicious_joins)
      cause = { participants: risky, text: `${risky.length} high-risk accounts joined in ${Math.round(s.raid_suspicious_window / 60)} min` };
    if (cause) {
      raidUntil.set(guild.id, Date.now() + s.raid_window * 1000);
      const removed = await raidDetected(guild, cause, s, log);
      if (removed.has(member.id)) return true;
    }
  }
  const configuredYoungAccount = s.young_account_action !== "off" && s.young_account_days > 0 && age < s.young_account_days;
  if (configuredYoungAccount) {
    let result = "Alert only";
    if (s.young_account_action === "kick")
      result = (await member.kick(`Florida Bay security: account younger than ${s.young_account_days} days`).then(() => true, () => false)) ? "Kicked" : "Could not kick";
    else if (s.young_account_action === "timeout")
      result = (await member.timeout(60 * 60000, `Florida Bay security: account younger than ${s.young_account_days} days`).then(() => true, () => false)) ? "Timed out for 1 hour" : "Could not time out";
    // The fixed alert already covered accounts under 14 days; only send a second entry when an
    // automated action occurred. Configured wider thresholds still retain their own alert.
    if (!shouldAlert || result !== "Alert only")
      await alertYoungAccount(member, log, { age, risk: risk.score, flags: risk.flags, action: result });
    return result === "Kicked";
  } else if (risk.score >= HIGH_RISK) {
    await securityEvent(guild.id, "risky_join", null, member.id, "flagged", { age, risk: risk.score, flags: risk.flags });
    await log(guild, {
      title: "High-risk account joined",
      color: COLORS.muted,
      thumbnail: member.user.displayAvatarURL(),
      fields: [["Member", who(member.id)], ["Account age", ageText(member.user)], ["Risk", `${risk.score} · ${risk.flags.join(", ")}`]],
    });
  }
  return false;
}

/** Locks down and removes the raiders. Returns the IDs that were removed. */
async function raidDetected(guild, cause, s, log) {
  const participants = cause.participants;
  const targets = participants.filter((item) => item.age < s.raid_account_days || item.score >= HIGH_RISK || cause.message);
  await securityEvent(guild.id, "raid", null, null, "detected", { cause: cause.text, accounts: participants.length, targets: targets.length });
  const description = `**${cause.text}.** ${targets.length} of them are new or high-risk accounts.`;
  const joiners = participants
    .slice(-15)
    .map((item) => `<@${item.id}> · ${item.age < 1 ? "<1" : Math.floor(item.age)}d${item.score !== undefined ? ` · risk ${item.score}` : ""}`)
    .join("\n");
  let locked = null;
  if (s.raid_lockdown)
    locked = await lockdown(guild, { reason: `Raid detected: ${cause.text}`, actorId: guild.client.user.id, minutes: s.lockdown_minutes, log }).catch(() => null);
  const removed = new Set();
  if (s.raid_kick_new)
    for (const item of targets)
      if (await actOnRaider(guild, item.id, s, `Florida Bay anti-raid: ${cause.text}`)) removed.add(item.id);
  const entry = {
    title: "🚨 Raid detected",
    color: COLORS.danger,
    description,
    fields: [
      ["Lockdown", locked ? `Active${locked.state.until ? ` · lifts ${when(locked.state.until)}` : ""}` : s.raid_lockdown ? "Failed or already active" : "Off"],
      [`Raiders ${s.raid_action === "timeout" ? "timed out" : s.raid_action === "ban" ? "banned" : "kicked"}`, `${removed.size}/${targets.length}`],
      ["Accounts", joiners || "None", false],
    ],
  };
  await log(guild, entry);
  await alertOwners(guild, card(`Raid detected in ${guild.name}`, { color: COLORS.danger, description, rows: [["Server", serverRef(guild)], ...entry.fields.slice(0, 2)] }));
  return removed;
}

/* ------------------------------------------------------------------------------------------------
 * Anti-spam (floods, mass mentions, repeats, cross-channel copies, walls of text, scam links),
 * webhook spam, message raids and the invite filter. Everyone is scanned except exempt accounts.
 * ---------------------------------------------------------------------------------------------- */

const messages = new Map();
const recentlyPunished = new Map();
const offenses = new Map();
const webhookFlood = new Map();
const newcomerPosts = new Map();
const INVITE = /(discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
const URL_HOST = /https?:\/\/([^/\s<>"')]+)/gi;
const OFFICIAL = /(^|\.)(discord\.com|discord\.gg|discordapp\.com|discordapp\.net|discord\.media|discord\.new|discord\.gift|discord\.gifts|discord\.dev|discordstatus\.com|steampowered\.com|steamcommunity\.com|steamstatic\.com)$/i;
const SCAM_TEXT = [
  /\b(free|claim|gift(ed)?|giveaway)\b[^\n]{0,60}\bnitro\b/i,
  /\bnitro\b[^\n]{0,60}\b(free|claim|gift|giveaway)\b/i,
  /\b(steam|cs2|csgo)\b[^\n]{0,40}\b(gift|free|skins?)\b/i,
  /\b(i'?m|i am) leaving (cs|csgo|cs2|steam|this game)\b/i,
];

function scamLink(content) {
  const hosts = [...String(content || "").matchAll(URL_HOST)].map((m) => m[1].toLowerCase().replace(/:\d+$/, ""));
  if (!hosts.length) return null;
  for (const host of hosts) {
    if (OFFICIAL.test(host)) continue;
    // Look-alikes of discord/steam/nitro domains are the most common account-stealing links.
    if (/d[il1|][s5]c[o0]r[dcl]|dlscord|discrod|disocrd|d1scord|discorcl|nitro|steamc[o0]m+[uv]n|stearn|steamcomunity/.test(host)) return `Look-alike link: ${host}`;
  }
  if (SCAM_TEXT.some((re) => re.test(content))) return "Free Nitro/Steam scam message";
  return null;
}

const ZALGO = /[̀-ͯ҉᪰-᫿᷀-᷿⃐-⃿︠-︯]/g;

export async function guardMessage(message, log) {
  if (!message.guild || message.system || message.author?.id === message.client.user.id) return;
  if (!(await registered(message.guild.id))) return;
  const s = await getSecuritySettings();
  if (message.webhookId && message.webhookId !== message.applicationId) return guardWebhookMessage(message, s, log);
  if (message.webhookId) return;
  if (await trusted(message.guild, message.author.id)) return;
  const member = message.member;
  if (!member) return;
  const bot = message.author.bot;
  const key = `${message.guild.id}:${message.author.id}`;
  const content = String(message.content || "").trim().toLowerCase();
  const list = (messages.get(key) || []).filter((item) => Date.now() - item.at < Math.max(30, s.spam_window) * 1000);
  list.push({ at: Date.now(), id: message.id, channel: message.channelId, content });
  messages.set(key, list);
  if (Date.now() < (recentlyPunished.get(key) || 0)) {
    await message.delete().catch(() => {});
    return;
  }
  if (!bot) await trackNewcomerPost(message, member, content, s, log);
  const reasons = [];
  if (s.antispam) {
    // Bots get four times the headroom and are not checked for repeats: log bots post fast and alike.
    const rate = list.filter((item) => Date.now() - item.at < s.spam_window * 1000);
    const limit = bot ? s.spam_messages * 4 : s.spam_messages;
    if (rate.length >= limit) reasons.push(`${rate.length} messages in ${s.spam_window}s`);
    const mentionCount = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 5 : 0);
    if (mentionCount >= s.spam_mentions) reasons.push(`${mentionCount} mentions in one message${message.mentions.everyone ? " (incl. @everyone/@here)" : ""}`);
    if (!bot && content) {
      const duplicates = rate.filter((item) => item.content === content).length;
      if (duplicates >= s.spam_duplicates) reasons.push(`Same message ${duplicates} times`);
      const channels = new Set(list.filter((item) => item.content === content).map((item) => item.channel));
      if (content.length >= 8 && channels.size >= s.spam_channels) reasons.push(`Same message in ${channels.size} channels`);
      const lines = content.split("\n").length;
      if (lines >= s.spam_lines) reasons.push(`Wall of text (${lines} lines)`);
      if ((message.content.match(ZALGO) || []).length >= 40) reasons.push("Zalgo/glitch text");
    }
  }
  if (s.scam_filter && !bot) {
    const scam = scamLink(message.content);
    if (scam) reasons.push(scam);
  }
  if (!reasons.length) {
    if (s.invite_filter && !bot && INVITE.test(message.content || "")) {
      const deleted = await message.delete().then(() => true, () => false);
      await securityEvent(message.guild.id, "invite_link", message.author.id, message.channelId, deleted ? "deleted" : "failed", {});
      await log(message.guild, {
        title: "Invite link removed",
        color: COLORS.muted,
        fields: [["Member", who(message.author.id)], ["Channel", `<#${message.channelId}>`], ["Message", clip(message.content, 300), false]],
      });
    }
    return;
  }
  recentlyPunished.set(key, Date.now() + 30000);
  messages.delete(key);
  // Repeat offenders within a day get double the previous timeout (capped at 28 days).
  const history = (offenses.get(key) || []).filter((at) => Date.now() - at < 86400000);
  history.push(Date.now());
  offenses.set(key, history);
  const minutes = Math.min(40320, s.spam_escalate ? s.spam_timeout * 2 ** (history.length - 1) : s.spam_timeout);
  const timedOut = member.moderatable
    ? await member.timeout(minutes * 60000, `Florida Bay anti-spam: ${reasons.join(", ")}`).then(() => true, () => false)
    : false;
  let removed = 0;
  const byChannel = new Map();
  for (const item of list) byChannel.set(item.channel, [...(byChannel.get(item.channel) || []), item.id]);
  for (const [channelId, ids] of byChannel) {
    const channel = message.guild.channels.cache.get(channelId);
    const done = channel?.bulkDelete ? await channel.bulkDelete(ids, true).catch(() => null) : null;
    removed += done?.size || 0;
  }
  await securityEvent(message.guild.id, "spam", message.author.id, message.channelId, timedOut ? "timeout" : "failed", { reasons, removed, offense: history.length, bot });
  await log(message.guild, {
    title: bot ? "Bot spam stopped" : "Spam stopped",
    color: COLORS.warning,
    fields: [
      ["Member", who(message.author.id)],
      ["Channel", `<#${message.channelId}>`],
      ["Action", timedOut ? `Timed out for ${minutes >= 1440 ? `${Math.round(minutes / 1440)} day(s)` : `${minutes} min`}` : isOwner(message.guild, message.author.id) ? "Server owner · cannot time out" : "Could not time out"],
      ["Trigger", reasons.join("\n")],
      ["Messages removed", String(removed)],
      ["Offenses today", String(history.length)],
    ],
  });
}

/** Several freshly joined accounts posting the same thing is a raid even if they joined slowly. */
async function trackNewcomerPost(message, member, content, s, log) {
  if (!s.antiraid || !content || !member.joinedTimestamp || Date.now() - member.joinedTimestamp > 30 * 60000) return;
  const guild = message.guild;
  const key = `${guild.id}:${content.slice(0, 200)}`;
  const posts = (newcomerPosts.get(key) || []).filter((item) => Date.now() - item.at < 60000);
  if (!posts.some((item) => item.id === member.id)) posts.push({ id: member.id, at: Date.now(), age: accountAge(member.user), score: undefined });
  newcomerPosts.set(key, posts);
  if (posts.length < s.raid_message_accounts || Date.now() < (raidUntil.get(guild.id) || 0)) return;
  raidUntil.set(guild.id, Date.now() + s.raid_window * 1000);
  newcomerPosts.delete(key);
  await raidDetected(guild, { participants: posts, message: true, text: `${posts.length} new accounts posted the same message within a minute` }, s, log);
}

/** Webhooks have no member to time out: a flooding webhook is deleted and its creator scored for anti-nuke. */
async function guardWebhookMessage(message, s, log) {
  if (!s.webhook_guard) return;
  const key = message.webhookId;
  const list = (webhookFlood.get(key) || []).filter((item) => Date.now() - item.at < s.spam_window * 1000);
  list.push({ at: Date.now(), everyone: message.mentions.everyone });
  webhookFlood.set(key, list);
  const floods = list.length >= s.spam_messages * 2 || list.filter((item) => item.everyone).length >= 2;
  if (!floods) return;
  webhookFlood.delete(key);
  const hook = await message.fetchWebhook().catch(() => null);
  const creator = hook?.owner?.id || null;
  if (creator && (await trusted(message.guild, creator))) return;
  const deleted = hook ? await hook.delete("Florida Bay webhook guard: webhook spam").then(() => true, () => false) : false;
  await securityEvent(message.guild.id, "webhook_spam", creator, key, deleted ? "deleted" : "failed", { messages: list.length });
  await log(message.guild, {
    title: deleted ? "Spamming webhook deleted" : "Spamming webhook could not be deleted",
    color: COLORS.danger,
    fields: [
      ["Webhook", `${clip(hook?.name || message.author.username, 80)}\n\`${key}\``],
      ["Channel", `<#${message.channelId}>`],
      ["Created by", creator ? who(creator) : "Unknown"],
      ["Trigger", `${list.length} messages in ${s.spam_window}s${list.some((item) => item.everyone) ? " with @everyone" : ""}`],
    ],
  });
  if (creator && creator !== message.client.user.id) await nukeAction(message.guild, "webhook_spam", creator, key, log, { label: hook?.name });
}

// Keep the sliding-window maps small.
setInterval(() => {
  const now = Date.now();
  for (const [key, list] of messages) if (!list.some((item) => now - item.at < 60000)) messages.delete(key);
  for (const [key, until] of recentlyPunished) if (until < now) recentlyPunished.delete(key);
  for (const [key, list] of offenses) if (!list.some((at) => now - at < 86400000)) offenses.delete(key);
  for (const [key, list] of joins) if (!list.some((item) => now - item.at < 3600000)) joins.delete(key);
  for (const [key, list] of destructive) if (!list.some((item) => now - item.at < 300000)) destructive.delete(key);
  for (const [key, hit] of containing) if (now - hit.at > 120000) containing.delete(key);
  for (const [key, list] of webhookFlood) if (!list.some((item) => now - item.at < 60000)) webhookFlood.delete(key);
  for (const [key, list] of newcomerPosts) if (!list.some((item) => now - item.at < 60000)) newcomerPosts.delete(key);
  for (const [key, snap] of deletedChannels) if (now - snap.at > 600000) deletedChannels.delete(key);
  for (const [key, snap] of deletedRoles) if (now - snap.at > 600000) deletedRoles.delete(key);
  for (const [key, hit] of exemptCache) if (now - hit.at > 60000) exemptCache.delete(key);
}, 60000).unref();

/* ------------------------------------------------------------------------------------------------
 * Health: whether the bot can actually stop a nuke in each network server. Anti-nuke is only as
 * strong as the bot's role position and permissions, so this is checked on demand and watched.
 * ---------------------------------------------------------------------------------------------- */

const NEEDED = [
  ["Ban Members", PermissionFlagsBits.BanMembers],
  ["Kick Members", PermissionFlagsBits.KickMembers],
  ["Manage Roles", PermissionFlagsBits.ManageRoles],
  ["Manage Channels", PermissionFlagsBits.ManageChannels],
  ["Manage Webhooks", PermissionFlagsBits.ManageWebhooks],
  ["Manage Server", PermissionFlagsBits.ManageGuild],
  ["View Audit Log", PermissionFlagsBits.ViewAuditLog],
  ["Moderate Members", PermissionFlagsBits.ModerateMembers],
];

export async function securityHealth(client) {
  const report = [];
  const locks = await lockdownStates();
  for (const guild of await networkGuilds(client)) {
    const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    if (!me) {
      report.push({ guild, grade: "critical", problems: ["The bot is not a member"], warnings: [] });
      continue;
    }
    const problems = [];
    const warnings = [];
    const missing = NEEDED.filter(([, flag]) => !me.permissions.has(flag)).map(([name]) => name);
    if (missing.length) problems.push(`Bot is missing: ${missing.join(", ")}`);
    const top = me.roles.highest;
    const above = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id && role.comparePositionTo(top) > 0 && DANGEROUS.some((flag) => role.permissions.has(flag)))
      .sort((a, b) => b.position - a.position);
    if (above.length) problems.push(`${above.length} dangerous role(s) above the bot: ${above.slice(0, 6).map((role) => roleRef(role.id)).join(" ")}`);
    const unstoppable = [];
    for (const member of guild.members.cache.values()) {
      if (member.id === me.id || isOwner(guild, member.id) || member.manageable) continue;
      if (!DANGEROUS.some((flag) => member.permissions.has(flag))) continue;
      if (isBotOwner(member.id) || (await exempt(guild.id, member.id))) continue;
      unstoppable.push(member.id);
    }
    if (unstoppable.length) problems.push(`${unstoppable.length} account(s) with dangerous permissions the bot cannot stop: ${unstoppable.slice(0, 8).map((id) => `<@${id}>`).join(" ")}`);
    const everyone = DANGEROUS.filter((flag) => guild.roles.everyone.permissions.has(flag));
    if (everyone.length) problems.push(`@everyone has dangerous permissions: ${perms(everyone).join(", ")}`);
    if (guild.mfaLevel === 0) warnings.push("2FA is not required for moderators (Server Settings → Safety Setup)");
    if (guild.verificationLevel < GuildVerificationLevel.Medium) warnings.push(`Verification level is ${GuildVerificationLevel[guild.verificationLevel]}`);
    const adminBots = guild.members.cache.filter((m) => m.user.bot && m.id !== me.id && m.permissions.has(PermissionFlagsBits.Administrator)).size;
    if (adminBots) warnings.push(`${adminBots} other bot(s) have Administrator`);
    report.push({
      guild,
      grade: problems.length ? "critical" : warnings.length ? "warning" : "ok",
      problems,
      warnings,
      admins: guild.members.cache.filter((m) => !m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator)).size,
      rank: `${guild.roles.cache.size - top.position}/${guild.roles.cache.size}`,
      locked: Boolean(locks[guild.id]),
    });
  }
  return report;
}

const healthState = new Map();
/** Runs on an interval from index.js: logs (and DMs owners) when a server's protection gets worse. */
export async function watchHealth(client, log) {
  if (!(await getSecuritySettings()).health_watch) return;
  for (const item of await securityHealth(client)) {
    const key = item.problems.join("|");
    const before = healthState.get(item.guild.id);
    healthState.set(item.guild.id, key);
    if (before === key || (before === undefined && !key)) continue;
    if (!key) {
      await log(item.guild, { title: "Security health restored", color: COLORS.success, description: "The bot can stop a nuke in this server again." });
      continue;
    }
    void securityEvent(item.guild.id, "health", null, null, "degraded", { problems: item.problems });
    const e = {
      title: "⚠️ Anti-nuke cannot fully protect this server",
      color: COLORS.danger,
      description: "Anti-nuke can only stop accounts below the Florida Bay bot role. Fix these, then run `/security health`.",
      fields: [["Problems", item.problems.join("\n").slice(0, 1024), false], ...(item.warnings.length ? [["Also", item.warnings.join("\n").slice(0, 1024), false]] : [])],
    };
    await log(item.guild, e);
    // The first check after a restart only logs; later regressions also reach the owners.
    if (before !== undefined) await alertOwners(item.guild, card(`Anti-nuke weakened in ${item.guild.name}`, { color: COLORS.danger, description: e.description, rows: [["Server", serverRef(item.guild)], ...e.fields] }));
  }
}

/* ------------------------------------------------------------------------------------------------
 * Reporting
 * ---------------------------------------------------------------------------------------------- */

export const EVENT_LABEL = {
  ...ACTION_LABEL,
  antinuke_punish: "Anti-nuke punishment",
  offender_join: "Anti-nuke offender joined",
  health: "Security health",
  protected_role: "Protected role change",
  lockdown: "Lockdown",
  raid: "Raid",
  raid_join: "Join during lockdown",
  risky_join: "High-risk join",
  young_account: "Young account",
  spam: "Spam",
  invite_link: "Invite link",
};

export async function securityEvents(guildId = null, limit = 15) {
  return db.query(
    `SELECT * FROM network_security_events${guildId ? " WHERE guild_id=?" : ""} ORDER BY id DESC LIMIT ${Number(limit) | 0}`,
    guildId ? [guildId] : [],
  );
}
