import { AuditLogEvent, ChannelType, GuildVerificationLevel, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { db, audit } from "./database.js";
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
  nuke_punishment: { type: "enum", label: "Anti-nuke: punishment", default: "ban", values: ["ban", "kick", "strip"] },
  nuke_restore: { type: "bool", label: "Anti-nuke: undo the damage (restore deleted, remove created)", default: true },
  nuke_network_ban: { type: "bool", label: "Anti-nuke: ban the attacker in every network server", default: true },
  nuke_failsafe_lockdown: { type: "bool", label: "Anti-nuke: lock the server down if the attacker cannot be stopped", default: true },
  permission_guard: { type: "bool", label: "Permission guard (dangerous role permissions)", default: true },
  admin_grant_guard: { type: "bool", label: "Admin grant guard (dangerous roles given out)", default: true },
  webhook_guard: { type: "bool", label: "Webhook guard (lockdown and webhook spam)", default: true },
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

/** DMs the server owner and the bot owner. Used only for anti-nuke and raid alerts. */
async function alertOwners(guild, e) {
  const ids = new Set([String(guild.ownerId), String(process.env.FBRP_OWNER_DISCORD_ID || "")].filter(Boolean));
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
  if (isOwner(guild, actorId) || (await trusted(guild, actorId))) return true;
  if (
    await db.one(
      "SELECT 1 FROM protected_role_access WHERE guild_id=? AND role_id=? AND subject_type='user' AND subject_id=?",
      [guild.id, roleId, actorId],
    )
  )
    return true;
  const actor = await guild.members.fetch(actorId).catch(() => null);
  if (!actor) return false;
  const rows = await db.query(
    "SELECT subject_id FROM protected_role_access WHERE guild_id=? AND role_id=? AND subject_type='role'",
    [guild.id, roleId],
  );
  return rows.some((row) => actor.roles.cache.has(String(row.subject_id)));
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
 * it (only the bot and exempt accounts are skipped). Each kind of action has its own limit and a
 * weight toward a shared danger budget; crossing either strips the account, bans it, undoes the
 * damage and, if the account cannot be stopped, locks the server down.
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

const destructive = new Map();

async function nukeAction(guild, type, actorId, targetId, log, detail = {}) {
  const s = await getSecuritySettings();
  if (!s.antinuke) return null;
  const rule = NUKE_RULES[type] || { scale: 1, weight: 1 };
  const key = `${guild.id}:${actorId}`;
  const windowMs = s.nuke_window * 1000;
  const recent = (destructive.get(key) || []).filter((item) => Date.now() - item.at < windowMs);
  const weight = detail.weight ?? rule.weight;
  recent.push({ type, at: Date.now(), target: targetId ? String(targetId) : null, label: detail.label || null, weight });
  destructive.set(key, recent);
  const count = recent.filter((item) => item.type === type).length;
  const limit = Math.max(1, Math.round(s.nuke_limit * rule.scale));
  const points = recent.reduce((sum, item) => sum + item.weight, 0);
  const tripped = count >= limit || points >= s.nuke_total;
  await securityEvent(guild.id, type, actorId, targetId, tripped ? "threshold" : "observed", { count, points, label: detail.label || null });
  if (!tripped) {
    if (rule.log)
      await log(guild, {
        title: rule.label || type,
        color: COLORS.muted,
        fields: [
          ["By", who(actorId)],
          ["Target", detail.label ? clip(detail.label, 200) : targetId ? `\`${targetId}\`` : "Unknown"],
          ["Anti-nuke", `${count}/${limit} of this kind · ${Math.round(points * 10) / 10}/${s.nuke_total} points · ${s.nuke_window}s window`],
        ],
      });
    return { count, limit, punished: false };
  }
  destructive.delete(key);
  await punish(guild, actorId, recent, log);
  return { count, limit, punished: true };
}

async function punish(guild, actorId, recent, log) {
  const s = await getSecuritySettings();
  const reason = `Florida Bay anti-nuke: ${recent.length} destructive actions in ${s.nuke_window}s`;
  const owner = isOwner(guild, actorId);
  const member = owner ? null : await guild.members.fetch(actorId).catch(() => null);
  // Quarantine first: removing the roles stops the damage even when a ban is not possible.
  const strippable = member ? member.roles.cache.filter((role) => role.id !== guild.id && !role.managed && role.editable) : null;
  const stripped = strippable?.size
    ? await member.roles.remove([...strippable.keys()], reason).then(() => [...strippable.values()], () => [])
    : [];
  const unstrippable = member ? member.roles.cache.filter((role) => role.id !== guild.id && !strippable.has(role.id)).size : 0;
  let result = stripped.length ? "Roles stripped" : "Nothing stripped";
  if (owner) result = "Server owner · Discord does not let bots act against the owner";
  else if (s.nuke_punishment === "ban")
    result = (await guild.members.ban(actorId, { reason, deleteMessageSeconds: 3600 }).then(() => true, () => false)) ? "Banned" : `Ban failed · ${result.toLowerCase()}`;
  else if (s.nuke_punishment === "kick" && member)
    result = (await member.kick(reason).then(() => true, () => false)) ? "Kicked" : `Kick failed · ${result.toLowerCase()}`;
  const success = !owner && (/^(Banned|Kicked)$/.test(result) || (s.nuke_punishment === "strip" && stripped.length > 0 && !unstrippable));

  // Undo the damage: webhooks always go, everything else follows the restore setting.
  const recovery = await recover(guild, recent, reason, s.nuke_restore && !owner);

  // One attack is enough: keep the account out of every other network server as well.
  let networkBans = 0;
  if (!owner && s.nuke_network_ban && s.nuke_punishment === "ban" && success)
    networkBans = await networkBan(guild, actorId, `Florida Bay anti-nuke: attacked ${guild.name}`);

  let locked = null;
  if (!success && !owner && s.nuke_failsafe_lockdown && !(await lockdownStates())[guild.id])
    locked = await lockdown(guild, { reason: `Anti-nuke could not stop <@${actorId}>`, actorId: guild.client.user.id, minutes: 0, log }).catch(() => null);

  const counts = {};
  for (const item of recent) counts[item.type] = (counts[item.type] || 0) + 1;
  const summary = Object.entries(counts).map(([type, n]) => `${n}× ${ACTION_LABEL[type] || type}`).join("\n");
  await securityEvent(guild.id, "antinuke_punish", actorId, null, success ? "punished" : owner ? "owner" : "failed", {
    result,
    counts,
    stripped: stripped.map((r) => r.id),
    recovery,
    networkBans,
  });
  const entry = {
    title: success ? "Anti-nuke triggered" : owner ? "Anti-nuke triggered · server owner" : "Anti-nuke triggered · action failed",
    color: COLORS.danger,
    description: success
      ? `<@${actorId}> was stopped after ${recent.length} destructive actions in ${s.nuke_window} seconds.`
      : owner
        ? `The server owner <@${actorId}> made ${recent.length} destructive actions in ${s.nuke_window} seconds. If this was not them, **their account is compromised**: reset its password and 2FA now.`
        : `<@${actorId}> made ${recent.length} destructive actions in ${s.nuke_window} seconds and the bot could not fully stop them.\n**Check the role hierarchy immediately:** the Florida Bay bot role must sit above every staff role.`,
    fields: [
      ["Account", who(actorId)],
      ["Result", result],
      ["Roles stripped", stripped.length ? stripped.map((role) => roleRef(role.id)).join(" ").slice(0, 1000) : "None"],
      ["What happened", summary, false],
      ...(recovery.lines.length ? [["Damage undone", recovery.lines.join("\n"), false]] : []),
      ...(networkBans ? [["Network ban", `Banned in ${networkBans} other server(s)`]] : []),
      ...(locked ? [["Failsafe", "Server locked down until `/security unlock`"]] : []),
    ],
  };
  await log(guild, entry);
  await alertOwners(
    guild,
    card(`Anti-nuke triggered in ${guild.name}`, {
      color: COLORS.danger,
      description: entry.description,
      rows: [["Server", serverRef(guild)], ...entry.fields],
    }),
  );
}

async function networkBan(guild, actorId, reason) {
  const rows = await db.query("SELECT guild_id FROM network_guilds").catch(() => []);
  let banned = 0;
  for (const row of rows) {
    const other = guild.client.guilds.cache.get(String(row.guild_id));
    if (!other || other.id === guild.id || isOwner(other, actorId) || (await exempt(other.id, actorId))) continue;
    if (await other.members.ban(actorId, { reason, deleteMessageSeconds: 3600 }).then(() => true, () => false)) banned++;
  }
  return banned;
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

/** Rebuilds deleted roles and channels, removes what the attacker created and lifts their bans. */
async function recover(guild, recent, reason, restore) {
  const why = `${reason} · recovery`;
  const lines = [];
  const done = { webhooks: 0, roles: 0, channels: 0, removed: 0, unbanned: 0, failed: 0 };
  for (const item of recent.filter((entry) => entry.type === "webhook_create" && entry.target)) {
    const hook = await guild.client.fetchWebhook(item.target).catch(() => null);
    if (hook && (await hook.delete(why).then(() => true, () => false))) done.webhooks++;
  }
  if (restore) {
    const roleMap = new Map();
    for (const item of recent.filter((entry) => entry.type === "role_delete" && entry.target).slice(0, 25)) {
      const snap = deletedRoles.get(`${guild.id}:${item.target}`);
      if (!snap) continue;
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
  }
  if (done.roles) lines.push(`✅ Rebuilt ${done.roles} deleted role(s) and gave them back to their members`);
  if (done.channels) lines.push(`✅ Rebuilt ${done.channels} deleted channel(s)`);
  if (done.removed) lines.push(`✅ Removed ${done.removed} channel(s)/role(s) the attacker created`);
  if (done.unbanned) lines.push(`✅ Unbanned ${done.unbanned} member(s) the attacker banned`);
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
    case A.ChannelOverwriteDelete: return { type: "channel_permissions", target, label: name && `#${name}` };
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
    case A.InviteCreate: return { type: "invite_create", target, label: change(entry, "code")?.new };
    case A.AutoModerationRuleDelete:
    case A.AutoModerationRuleUpdate: return { type: "automod_change", target, label: name };
    case A.GuildUpdate: return { type: "guild_update", target, label: (entry.changes || []).map((c) => c.key).join(", ") };
    default: return null;
  }
}

/** Entry point for the guildAuditLogEntryCreate event. */
export async function handleAuditEntry(entry, guild, log) {
  const actor = entry.executorId;
  if (!guild || !actor || actor === guild.client.user.id) return;
  const kind = classify(entry);
  if (!kind || !(await registered(guild.id))) return;
  if (await trusted(guild, actor)) return;
  const owner = isOwner(guild, actor);
  const s = await getSecuritySettings();

  if (entry.action === AuditLogEvent.RoleUpdate || entry.action === AuditLogEvent.RoleCreate) {
    const p = change(entry, "permissions");
    const watched = entry.action === AuditLogEvent.RoleUpdate ? DANGEROUS : GRANT_DANGEROUS;
    const added = p ? watched.filter((flag) => (bits(p.new) & flag) === flag && (bits(p.old) & flag) !== flag) : [];
    if (added.length) {
      if (owner) await reportOwnerChange(guild, actor, "Dangerous permissions added to a role", kind.label, perms(added).join("\n"), log);
      else if (s.permission_guard) await revertRolePermissions(guild, kind.target, added, actor, log);
      return nukeAction(guild, "permission_escalation", actor, kind.target, log, { label: kind.label });
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
  await nukeAction(guild, kind.type, actor, kind.target, log, { label: kind.label, weight: kind.weight });
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
  if (member.user.bot || !(await registered(member.guild.id))) return false;
  const guild = member.guild;
  if (await trusted(guild, member.id)) return false;
  const s = await getSecuritySettings();
  const age = accountAge(member.user);
  const keep = Math.max(s.raid_window, s.raid_suspicious_window) * 1000;
  const recent = (joins.get(guild.id) || []).filter((item) => Date.now() - item.at < keep);
  const risk = joinRisk(member.user, recent, s);
  recent.push({ id: member.id, at: Date.now(), age, score: risk.score, stem: risk.stem, created: member.user.createdTimestamp });
  joins.set(guild.id, recent);
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
  if (s.young_account_action !== "off" && s.young_account_days > 0 && age < s.young_account_days) {
    let result = "Flagged";
    if (s.young_account_action === "kick")
      result = (await member.kick(`Florida Bay security: account younger than ${s.young_account_days} days`).then(() => true, () => false)) ? "Kicked" : "Could not kick";
    if (s.young_account_action === "timeout")
      result = (await member.timeout(60 * 60000, `Florida Bay security: account younger than ${s.young_account_days} days`).then(() => true, () => false)) ? "Timed out for 1 hour" : "Could not time out";
    await securityEvent(guild.id, "young_account", null, member.id, result.toLowerCase(), { age, risk: risk.score });
    await log(guild, {
      title: "Young account joined",
      color: COLORS.muted,
      thumbnail: member.user.displayAvatarURL(),
      fields: [
        ["Member", who(member.id)],
        ["Account age", `${ageText(member.user)}\nCreated ${when(member.user.createdTimestamp)}`],
        ["Risk", `${risk.score} · ${risk.flags.join(", ") || "none"}`],
        ["Action", result],
      ],
    });
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
  for (const [key, list] of webhookFlood) if (!list.some((item) => now - item.at < 60000)) webhookFlood.delete(key);
  for (const [key, list] of newcomerPosts) if (!list.some((item) => now - item.at < 60000)) newcomerPosts.delete(key);
  for (const [key, snap] of deletedChannels) if (now - snap.at > 600000) deletedChannels.delete(key);
  for (const [key, snap] of deletedRoles) if (now - snap.at > 600000) deletedRoles.delete(key);
  for (const [key, hit] of exemptCache) if (now - hit.at > 60000) exemptCache.delete(key);
}, 60000).unref();

/* ------------------------------------------------------------------------------------------------
 * Reporting
 * ---------------------------------------------------------------------------------------------- */

export const EVENT_LABEL = {
  ...ACTION_LABEL,
  antinuke_punish: "Anti-nuke punishment",
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
