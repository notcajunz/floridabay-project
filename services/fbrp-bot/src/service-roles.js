/**
 * Agency roles in the main Florida Bay server that are driven by another bot's roster.
 *
 * The IAA and DOHS bots live in their own servers, so they cannot edit the main server. They ask
 * the main bot instead: requests go into `network_role_queue` (carried out by staff-queue.js) and
 * only for the fixed roles listed here, so a service token can never hand out any other role.
 */
import { db } from "./database.js";

const MAIN_GUILD_ID = "1557594282976747550"; // Florida Bay Roleplay (network_guilds kind 'main')

export const SERVICE_ROLES = {
  dohs: {
    guildId: MAIN_GUILD_ID,
    roles: {
      base: "1557692420269936660", // FBRP | DHS
      supervisor: "1557692388737028196", // FBRP | DHS Supervisor
      high_command: "1560396125125742684", // FBRP | DHS High Command
    },
  },
  iaa: {
    guildId: MAIN_GUILD_ID,
    roles: {
      base: "1558232639247356035", // FBRP | IAA
      supervisor: "1558232729764503583", // FBRP | IAA Supervisor
      high_command: "1560396128065683466", // FBRP | IAA High Command
    },
  },
};

export const MAX_CHANGES_PER_REQUEST = 200;

export function serviceDefinition(service) {
  const def = SERVICE_ROLES[String(service || "")];
  if (!def) throw Object.assign(new Error("Unknown service."), { status: 404 });
  return def;
}

/** Who currently holds each of the service's main-server roles, from the member cache. */
export async function serviceRoleHolders(service) {
  const def = serviceDefinition(service);
  const wanted = new Set(Object.values(def.roles));
  const holders = Object.fromEntries([...wanted].map((id) => [id, []]));
  const rows = await db.query("SELECT discord_id,roles FROM discord_member_cache WHERE guild_id=?", [def.guildId]);
  for (const row of rows) {
    const roles = typeof row.roles === "string" ? JSON.parse(row.roles || "[]") : row.roles || [];
    for (const id of roles) if (wanted.has(String(id))) holders[String(id)].push(String(row.discord_id));
  }
  return { guildId: def.guildId, roles: def.roles, holders, cached: rows.length };
}

/**
 * Queues role adds/removes for the main bot. Anything outside the service's role list or with a
 * malformed id is rejected, not skipped, so a caller bug is visible.
 */
export async function queueServiceRoles(service, changes, { requestedBy, reason = "" } = {}) {
  const def = serviceDefinition(service);
  if (!Array.isArray(changes) || changes.length > MAX_CHANGES_PER_REQUEST)
    throw Object.assign(new Error(`Send at most ${MAX_CHANGES_PER_REQUEST} changes at a time.`), { status: 400 });
  const allowed = new Set(Object.values(def.roles));
  const clean = changes.map((change) => {
    const discordId = String(change?.discord_id ?? "");
    const roleId = String(change?.role_id ?? "");
    const action = String(change?.action ?? "");
    if (!/^\d{5,24}$/.test(discordId)) throw Object.assign(new Error("Invalid discord_id."), { status: 400 });
    if (!allowed.has(roleId)) throw Object.assign(new Error("That role is not managed by this service."), { status: 403 });
    if (action !== "add" && action !== "remove") throw Object.assign(new Error("action must be add or remove."), { status: 400 });
    return { discordId, roleId, action, reason: String(change?.reason || reason || `${service} roster`).replace(/[\u0000-\u001f]/g, " ").slice(0, 200) };
  });
  const now = Date.now();
  for (const item of clean)
    await db.query(
      `INSERT INTO network_role_queue(guild_id,discord_id,role_id,action,reason,requested_by,requested_at,attempts)
       VALUES(?,?,?,?,?,?,?,0)
       ON DUPLICATE KEY UPDATE action=VALUES(action),reason=VALUES(reason),requested_by=VALUES(requested_by),requested_at=VALUES(requested_at),attempts=0`,
      [def.guildId, item.discordId, item.roleId, item.action, item.reason, String(requestedBy || service).slice(0, 32), now],
    );
  return clean.length;
}
