import { db } from "../database.js";
import { createQueueLog } from "../queue-log.js";

/**
 * Role changes for the staff bot. The staff bot is only in the staff server, so a role in any other
 * server is never edited from here: the request goes into `network_role_queue` and the main bot (which
 * is in every server) carries it out within a few seconds. Roles in servers this bot is in are
 * applied directly. Member state for servers it is not in comes from the main bot's
 * `discord_member_cache`.
 */

let client = null;
let queueLog = null;
let pending = [];
let flushTimer = null;
export const bindRoleOps = (discord) => {
  client = discord;
  queueLog = createQueueLog({ client, db });
};

/** Queued requests are posted to the private queue channel in one message every few seconds. */
export function noteQueued(line) {
  pending.push(line);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const lines = pending;
    pending = [];
    void queueLog?.post("Queued for the main bot", lines, 0xf0b232).catch(() => {});
  }, 3000);
  flushTimer.unref?.();
}

const inServer = (guildId) => client?.guilds.cache.get(String(guildId)) || null;

/** The ID of a role by ID or by name, from the live server or from the main bot's role list. */
export async function resolveRoleId(guildId, { roleId = null, roleName = null } = {}) {
  if (roleId) return String(roleId);
  if (!roleName) return null;
  const guild = inServer(guildId);
  const live = guild?.roles.cache.find((role) => role.name === roleName);
  if (live) return live.id;
  const row = await db
    .one("SELECT role_id FROM discord_guild_roles WHERE guild_id=? AND name=? LIMIT 1", [String(guildId), roleName])
    .catch(() => null);
  return row ? String(row.role_id) : null;
}

async function enqueue({ guildId, discordId, roleId, add, reason, requestedBy }) {
  await db.query(
    `INSERT INTO network_role_queue(guild_id,discord_id,role_id,action,reason,requested_by,requested_at,attempts)
     VALUES(?,?,?,?,?,?,?,0)
     ON DUPLICATE KEY UPDATE action=VALUES(action),reason=VALUES(reason),requested_by=VALUES(requested_by),requested_at=VALUES(requested_at),attempts=0`,
    [String(guildId), String(discordId), String(roleId), add ? "add" : "remove", String(reason).slice(0, 200), String(requestedBy), Date.now()],
  );
  const line = await queueLog.roleLine({ guild_id: guildId, discord_id: discordId, role_id: roleId, action: add ? "add" : "remove" });
  noteQueued(`${line}
> ${String(reason).slice(0, 120)} · by \`${requestedBy}\``);
}

/** Adds or removes one role. Returns "done", "queued", "skipped" (nothing to do) or "missing" (no such role). */
export async function applyRole({ guildId, discordId, roleId = null, roleName = null, add, reason = "FBRP staff bot", requestedBy = "staff-bot" }) {
  if (!guildId) return "skipped";
  const resolved = await resolveRoleId(guildId, { roleId, roleName });
  if (!resolved) return "missing";
  const guild = inServer(guildId);
  if (!guild) {
    await enqueue({ guildId, discordId, roleId: resolved, add, reason, requestedBy });
    return "queued";
  }
  const member = await guild.members.fetch(String(discordId)).catch(() => null);
  if (!member || member.user.bot || member.roles.cache.has(resolved) === add) return "skipped";
  await (add ? member.roles.add(resolved, reason) : member.roles.remove(resolved, reason)).catch((error) =>
    console.error(`[FBRP staff] role ${resolved} for ${discordId}:`, error.message || error),
  );
  return "done";
}

/** Everyone holding a role: [{ id, displayName, username }]. Uses the live server or the cache. */
export async function roleHolders(guildId, roleId) {
  const guild = inServer(guildId);
  if (guild) {
    const role = guild.roles.cache.get(String(roleId)) || (await guild.roles.fetch(String(roleId)).catch(() => null));
    return role ? [...role.members.values()].filter((m) => !m.user.bot).map((m) => ({ id: m.id, displayName: m.displayName, username: m.user.username })) : [];
  }
  const rows = await db.query("SELECT discord_id,nickname,username,roles FROM discord_member_cache WHERE guild_id=?", [String(guildId)]).catch(() => []);
  return rows
    .filter((row) => parseRoles(row.roles).has(String(roleId)))
    .map((row) => ({ id: String(row.discord_id), displayName: row.nickname || row.username, username: row.username }));
}

export function parseRoles(value) {
  if (Array.isArray(value)) return new Set(value.map(String));
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

/** Role sets of every cached member of a server: Map(discordId -> Set(roleId)). */
export async function cachedRoles(guildId) {
  const guild = inServer(guildId);
  if (guild && guild.members.cache.size > 1)
    return new Map([...guild.members.cache.values()].filter((m) => !m.user.bot).map((m) => [m.id, new Set(m.roles.cache.keys())]));
  const rows = await db.query("SELECT discord_id,roles FROM discord_member_cache WHERE guild_id=?", [String(guildId)]).catch(() => []);
  return new Map(rows.map((row) => [String(row.discord_id), parseRoles(row.roles)]));
}

/**
 * Makes `wanted` (a Set of Discord IDs) exactly the holders of a role. With `removeOthers` false it
 * only adds. A server with no member data at all is left alone, so an outage cannot strip a role.
 * `maxRemovals` is a safety valve: more removals than that in one pass are skipped and reported.
 */
export async function reconcileRole({ guildId, roleId = null, roleName = null, wanted, removeOthers = true, reason = "FBRP staff bot", requestedBy = "staff-bot", maxRemovals = 30 }) {
  const resolved = await resolveRoleId(guildId, { roleId, roleName });
  if (!resolved) return { added: [], removed: [], skipped: "role not found" };
  const members = await cachedRoles(guildId);
  if (!members.size) return { added: [], removed: [], skipped: "no member data" };
  const toAdd = [...wanted].filter((id) => members.has(id) && !members.get(id).has(resolved));
  let toRemove = removeOthers ? [...members].filter(([id, roles]) => roles.has(resolved) && !wanted.has(id)).map(([id]) => id) : [];
  let skipped = null;
  if (toRemove.length > maxRemovals) {
    skipped = `${toRemove.length} removals held back (limit ${maxRemovals})`;
    toRemove = [];
  }
  for (const id of toAdd) await applyRole({ guildId, discordId: id, roleId: resolved, add: true, reason, requestedBy });
  for (const id of toRemove) await applyRole({ guildId, discordId: id, roleId: resolved, add: false, reason, requestedBy });
  return { added: toAdd, removed: toRemove, skipped };
}
