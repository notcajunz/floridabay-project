import { PermissionFlagsBits } from "discord.js";
import { db } from "../database.js";
import { UserError } from "./util.js";

export { db };

/** The rank ladder the server is built with. Level is the rank's weight: higher outranks lower. */
export const RANKS = [
  { name: "Trial Developer", level: 1, tier: "developer", color: 0x95a5a6, blurb: "On probation. Learning the codebase and workflow." },
  { name: "Developer", level: 2, tier: "developer", color: 0x3498db, blurb: "Full member of the development team." },
  { name: "Senior Developer", level: 3, tier: "developer", color: 0x1abc9c, blurb: "Trusted to ship and review major work." },
  { name: "Head Developer", level: 4, tier: "leadership", color: 0x9b59b6, blurb: "Leads a stream of work and runs the team day to day." },
  { name: "Development Manager", level: 5, tier: "leadership", color: 0xe67e22, blurb: "Owns the roadmap, staffing and discipline." },
  { name: "Development Director", level: 6, tier: "leadership", color: 0xf1c40f, blurb: "Final say on the development department." },
];

/** Who may do what, as the lowest rank level allowed. Admins (Administrator, owner, superusers) may do everything. */
export const PERMISSIONS = {
  "roster.manage": { level: 4, label: "Add, promote and demote developers" },
  "roster.remove": { level: 5, label: "Remove developers from the team" },
  "discipline.warn": { level: 4, label: "Warnings and strikes" },
  "discipline.suspend": { level: 5, label: "Suspensions and revoking discipline" },
  "leave.decide": { level: 4, label: "Approve or deny leave" },
  "award.give": { level: 3, label: "Commendations" },
  "award.dotm": { level: 5, label: "Developer of the Month" },
  "task.manage": { level: 3, label: "Create tasks for others, reassign and delete" },
  "release.post": { level: 2, label: "Post release notes" },
  "announce.post": { level: 4, label: "Post announcements" },
  "incident.manage": { level: 2, label: "Open, update and resolve incidents" },
  "trial.review": { level: 4, label: "Decide trial reviews" },
  "ticket.view": { level: 2, label: "See the ticket queue" },
  admin: { level: 5, label: "Bot setup and configuration" },
};

export const DEFAULT_SETTINGS = {
  trialDays: 14,
  strikeDays: 60,
  strikesBeforeReview: 3,
  nicknameSync: false,
  adminRoles: [],
  perms: {},
  maxOpen: 3,
  cooldownSeconds: 60,
  slaReminders: true,
};

/* ------------------------------------------------------------------ config */

let cache = null;
export async function config() {
  if (cache) return cache;
  const rows = await db.query("SELECT config_key,config_value FROM devops_config");
  const map = Object.fromEntries(
    rows.map((r) => {
      try {
        return [r.config_key, JSON.parse(r.config_value)];
      } catch {
        return [r.config_key, null];
      }
    }),
  );
  cache = {
    roles: map.roles || {},
    channels: map.channels || {},
    categories: map.categories || {},
    ticketRoles: map.ticketRoles || [],
    settings: { ...DEFAULT_SETTINGS, ...(map.settings || {}) },
    panels: Object.fromEntries(Object.entries(map).filter(([k]) => k.startsWith("panel:")).map(([k, v]) => [k.slice(6), v])),
    ready: Boolean(map.ready),
  };
  return cache;
}

export async function setConfig(key, value, actorId = null) {
  await db.query(
    "INSERT INTO devops_config(config_key,config_value,updated_by,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
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
  rankCache = (await db.query("SELECT * FROM devops_ranks ORDER BY level DESC")).map((r) => ({ ...r, level: Number(r.level) }));
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

/** Every role the bot treats as "team" roles: stripped on removal, saved on suspension. */
export async function teamRoleIds() {
  const { roles } = await config();
  const ids = new Set([
    ...(await ranks()).map((x) => x.role_id),
    roles.base,
    roles.leadership,
    roles.warned,
    roles.loa,
    ...(roles.divisions || []),
  ]);
  ids.delete(undefined);
  ids.delete(null);
  return ids;
}

/* ------------------------------------------------------------------ authority */

const superusers = () =>
  new Set(
    String(process.env.FBRP_SUPERUSER_IDS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );

/** The acting member's standing. Admins count as above everything. */
export async function authority(member) {
  const cfg = await config();
  const rank = await rankOf(member);
  const admin =
    member.guild.ownerId === member.id ||
    superusers().has(member.id) ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    (cfg.settings.adminRoles || []).some((id) => member.roles.cache.has(id));
  return {
    id: member.id,
    member,
    rank,
    level: admin ? Number.MAX_SAFE_INTEGER : rank?.level || 0,
    admin,
  };
}

export const requiredLevel = async (perm) => {
  const rule = PERMISSIONS[perm];
  const override = (await config()).settings.perms?.[perm];
  return Number.isFinite(Number(override)) && override ? Number(override) : rule?.level ?? Number.MAX_SAFE_INTEGER;
};

export async function can(actor, perm) {
  if (actor.admin) return true;
  if (!PERMISSIONS[perm]) return false;
  return actor.level >= (await requiredLevel(perm));
}

export async function demand(actor, perm) {
  if (await can(actor, perm)) return;
  const needed = await requiredLevel(perm);
  const rank = (await ranks()).filter((r) => r.level >= needed).pop();
  throw new UserError(`You need **${rank?.name || "a higher rank"}** or higher to do that.`);
}

/** Actors can only act on members strictly below them. */
export const outranks = (actor, targetLevel) => actor.admin || actor.level > (targetLevel || 0);

export async function demandOutranks(actor, targetMember) {
  if (targetMember?.id === actor.id && !actor.admin) throw new UserError("You cannot do that to yourself.");
  const target = targetMember ? await rankOf(targetMember) : null;
  if (!outranks(actor, target?.level)) throw new UserError(`${targetMember} holds **${target.name}**, which is not below your rank.`);
  return target;
}

/* ------------------------------------------------------------------ logging */

/** Sends to the configured channel for `key`, falling back through `fallbacks`. Never throws. */
export async function post(guild, key, payload, ...fallbacks) {
  const cfg = await config();
  for (const k of [key, ...fallbacks]) {
    const id = cfg.channels[k];
    if (!id) continue;
    const channel = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
    if (!channel?.isTextBased()) continue;
    return channel.send({ allowedMentions: { parse: [] }, ...payload }).catch((error) => {
      console.warn(`[DevOps] post to ${k} failed: ${error.message}`);
      return null;
    });
  }
  return null;
}

export async function history(discordId, action, actorId, { from = null, to = null, reason = null } = {}) {
  await db.query("INSERT INTO devops_history(discord_id,action,from_role,to_role,actor_id,reason,created_at) VALUES(?,?,?,?,?,?,?)", [
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
export const dm = (user, payload) =>
  user.send(payload).then(
    () => true,
    () => false,
  );

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
      console.warn(`[DevOps] member fetch: ${error.message}`);
    }
  }
  return guild.members.cache;
}
