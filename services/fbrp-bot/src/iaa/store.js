import { PermissionFlagsBits } from "discord.js";
import { db } from "../database.js";
import { UserError } from "./util.js";

export { db };

/** Who may do what, as the lowest tier allowed. Admins (Administrator, Bot Permissions, owner) may do everything. */
export const PERMISSIONS = {
  "roster.manage": { tier: "supervisor", label: "Add, promote, demote, callsigns, orientation" },
  "roster.remove": { tier: "low_command", label: "Remove members from the agency" },
  "discipline.warn": { tier: "supervisor", label: "Warnings and strikes" },
  "discipline.suspend": { tier: "low_command", label: "Suspensions and revoking discipline" },
  "discipline.blacklist": { tier: "high_command", label: "IAA blacklist" },
  "case.open": { tier: "supervisor", label: "Open and work investigations (Investigation Division also)", investigator: true },
  "case.close": { tier: "supervisor", label: "Close investigations with a verdict" },
  "intel.lookup": { tier: "supervisor", label: "Intel lookups (Investigation Division also)", investigator: true },
  "intel.manage": { tier: "low_command", label: "Watchlist and blacklisted servers" },
  "leave.decide": { tier: "supervisor", label: "Approve or deny leave" },
  "activity.manage": { tier: "low_command", label: "Activity reports and inactivity warnings" },
  "award.give": { tier: "low_command", label: "Commendations" },
  "award.medal": { tier: "high_command", label: "Medals and Agent of the Month" },
  admin: { tier: "high_command", label: "Bot setup and configuration" },
};

export const DEFAULT_SETTINGS = {
  nicknameSync: true,
  quotas: { agent: 120, supervisor: 120, low_command: 90, trial_high_command: 90, high_command: 60 },
  perms: {},
  strikeDays: 60,
  inactivityDays: 14,
  staleHours: 72,
  // Fixed callsign slots for Low Command and above, by rank name. IA-06 is intentionally unassigned.
  callsignPlan: {
    overseer: [0, 0],
    director: [1, 1],
    "deputy director": [2, 2],
    "assistant deputy director": [3, 3],
    "assistant director": [4, 4],
    "chief of staff": [5, 5],
    "section chief": [7, 10],
    "special agent in charge": [11, 19],
    "asst. special agent in charge": [20, 29],
  },
  // Every other rank is numbered in rank order from here.
  callsignStart: 30,
  // Given to everyone appointed through /iaa add.
  addRoles: ["1558227271754457122", "1558227271754457121", "1558227271662309573", "1558227271662309572"],
};

/* ------------------------------------------------------------------ config */

let cache = null;
export async function config() {
  if (cache) return cache;
  const rows = await db.query("SELECT config_key,config_value FROM iaa_config");
  const map = Object.fromEntries(rows.map((r) => [r.config_key, JSON.parse(r.config_value)]));
  cache = {
    roles: map.roles || {},
    channels: map.channels || {},
    tiers: map.tiers || [],
    settings: { ...DEFAULT_SETTINGS, ...(map.settings || {}), quotas: { ...DEFAULT_SETTINGS.quotas, ...(map.settings?.quotas || {}) } },
    panels: Object.fromEntries(Object.entries(map).filter(([k]) => k.startsWith("panel:")).map(([k, v]) => [k.slice(6), v])),
    ready: Boolean(map.tiers),
  };
  return cache;
}

export async function setConfig(key, value, actorId = null) {
  await db.query(
    "INSERT INTO iaa_config(config_key,config_value,updated_by,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
    [key, JSON.stringify(value), actorId, Date.now()],
  );
  cache = null;
  rankCache = null;
}

export async function updateSettings(patch, actorId) {
  const current = (await config()).settings;
  await setConfig("settings", { ...current, ...patch }, actorId);
}

/* ------------------------------------------------------------------ ranks */

let rankCache = null;
/** Rank ladder, highest first. */
export async function ranks() {
  if (rankCache) return rankCache;
  rankCache = (await db.query("SELECT * FROM iaa_ranks ORDER BY level DESC")).map((r) => ({ ...r, level: Number(r.level) }));
  return rankCache;
}
export const invalidateRanks = () => {
  rankCache = null;
};

export async function rankById(roleId) {
  return (await ranks()).find((r) => r.role_id === String(roleId)) || null;
}

/** Highest rank the member holds, or null. */
export async function rankOf(member) {
  if (!member) return null;
  return (await ranks()).find((r) => member.roles.cache.has(r.role_id)) || null;
}

/** Tier roles a rank holder carries: its own tier's role plus every lower tier's (High Command includes Low Command). */
export function tierRoleIdsUpTo(cfg, rank) {
  const own = cfg.tiers.find((t) => t.key === rank?.tier);
  const ids = cfg.tiers.filter((t) => t.roleId && own && t.index <= own.index).map((t) => t.roleId);
  if (rank?.tier_role_id) ids.push(rank.tier_role_id);
  return [...new Set(ids)];
}

export async function tierIndex(key) {
  const tiers = (await config()).tiers;
  const found = tiers.find((t) => t.key === key);
  return found ? found.index : -1;
}

export async function tierLabel(key) {
  return (await config()).tiers.find((t) => t.key === key)?.label || "Agents";
}

/** All role IDs the bot treats as "agency" roles: stripped on removal, saved on suspension. */
export async function agencyRoleIds() {
  const cfg = await config();
  const r = cfg.roles;
  const ids = new Set([
    ...(await ranks()).map((x) => x.role_id),
    ...cfg.tiers.map((t) => t.roleId).filter(Boolean),
    ...(r.divisions || []),
    ...(r.positions || []),
    ...(r.notify || []),
    r.base,
    r.investigationDivision,
    r.orientation,
    r.loa,
    r.inactivity,
    r.firstStrike,
    r.underInvestigation,
    r.reducedHours,
  ]);
  ids.delete(undefined);
  ids.delete(null);
  return ids;
}

/* ------------------------------------------------------------------ authority */

/**
 * The acting member's standing. `level` is their rank level (admins count as above everything).
 */
export async function authority(member) {
  const cfg = await config();
  const rank = await rankOf(member);
  const admin =
    member.guild.ownerId === member.id ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    Boolean(cfg.roles.botPermissions && member.roles.cache.has(cfg.roles.botPermissions)) ||
    (cfg.settings.adminRoles || []).some((id) => member.roles.cache.has(id));
  return {
    id: member.id,
    member,
    rank,
    level: admin ? Number.MAX_SAFE_INTEGER : rank?.level || 0,
    tierIndex: rank ? await tierIndex(rank.tier) : -1,
    admin,
    investigator: Boolean(cfg.roles.investigationDivision && member.roles.cache.has(cfg.roles.investigationDivision)),
  };
}

export async function can(actor, perm) {
  if (actor.admin) return true;
  const rule = PERMISSIONS[perm];
  if (!rule) return false;
  if (rule.investigator && actor.investigator) return true;
  const cfg = await config();
  const tier = cfg.settings.perms?.[perm] || rule.tier;
  const needed = await tierIndex(tier);
  return needed >= 0 && actor.tierIndex >= needed;
}

export async function demand(actor, perm) {
  if (await can(actor, perm)) return;
  const cfg = await config();
  const tier = cfg.settings.perms?.[perm] || PERMISSIONS[perm]?.tier;
  throw new UserError(`You need **${await tierLabel(tier)}** or higher to do that.`);
}

/** Actors can only act on members strictly below them. */
export function outranks(actor, targetLevel) {
  return actor.admin || actor.level > (targetLevel || 0);
}

export async function demandOutranks(actor, targetMember) {
  if (targetMember?.id === actor.id && !actor.admin) throw new UserError("You cannot do that to yourself.");
  const target = targetMember ? await rankOf(targetMember) : null;
  if (!outranks(actor, target?.level)) throw new UserError(`${targetMember} holds **${target.name}**, which is not below your rank.`);
  return target;
}

/* ------------------------------------------------------------------ logging */

/**
 * Sends to the configured channel for `key`, falling back through `fallbacks`. Never throws.
 */
export async function post(guild, key, payload, ...fallbacks) {
  const cfg = await config();
  for (const k of [key, ...fallbacks]) {
    const id = cfg.channels[k];
    if (!id) continue;
    const channel = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
    if (!channel?.isTextBased()) continue;
    return channel.send(payload).catch((error) => {
      console.warn(`[IAA] post to ${k} failed: ${error.message}`);
      return null;
    });
  }
  return null;
}

export async function history(discordId, action, actorId, { from = null, to = null, reason = null } = {}) {
  await db.query("INSERT INTO iaa_history(discord_id,action,from_role,to_role,actor_id,reason,created_at) VALUES(?,?,?,?,?,?,?)", [
    String(discordId),
    action,
    from,
    to,
    String(actorId),
    reason ? String(reason).slice(0, 500) : null,
    Date.now(),
  ]);
}

/** DMs a member. Silently ignores closed DMs. */
export async function dm(user, payload) {
  return user.send(payload).then(
    () => true,
    () => false,
  );
}

/**
 * Every member of the server. A full fetch is gateway rate-limited (one per 30s), and the member
 * cache stays current through the GuildMembers intent, so refetch at most every ten minutes.
 */
const fullFetch = new Map();
export async function allMembers(guild) {
  if (Date.now() - (fullFetch.get(guild.id) || 0) > 600000) {
    fullFetch.set(guild.id, Date.now());
    try {
      return await guild.members.fetch();
    } catch (error) {
      console.warn(`[IAA] member fetch: ${error.message}`);
    }
  }
  return guild.members.cache;
}
