import { db } from "../database.js";
import { applyRole, cachedRoles, reconcileRole } from "./roleops.js";
import { MAIN_GUILD_ID, MANAGER_ROLE_RULES, NETWORK_TOP_ROLE_IDS, STAFF_GUILD_ID } from "./config.js";

/**
 * "<sector> manager and above" roles in the main server. Who qualifies comes from the role holders of
 * each sector's own server (the main bot's member cache, or live data for the staff server). The roles
 * themselves are in the main server, which this bot is not in, so changes are queued for the main bot.
 *
 * The bot only ever takes a role away from someone it gave it to, so a role handed out by hand is
 * never stripped. Who it granted is remembered in bot_config (`staff_manager_roles`).
 */
const STATE_KEY = "staff_manager_roles";

async function loadGranted() {
  const row = await db.one("SELECT value FROM bot_config WHERE `key`=?", [STATE_KEY]).catch(() => null);
  if (!row) return {};
  try {
    const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function saveGranted(state) {
  await db.query(
    "INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES(?,?,'staff-bot',?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
    [STATE_KEY, JSON.stringify(state), Date.now()],
  );
}

/**
 * Active DevOps roster members whose rank is `minLevel` or higher (Map-compatible Set of Discord IDs),
 * or null when the rank ladder is empty so an unconfigured DevOps server can never strip the role.
 */
export async function devopsManagerIds(minLevel, database = db) {
  const ranks = await database.query("SELECT role_id FROM devops_ranks WHERE level>=?", [minLevel]).catch(() => []);
  if (!ranks.length) return null;
  const rows = await database
    .query(
      `SELECT m.discord_id FROM devops_members m JOIN devops_ranks r ON r.role_id=m.rank_role_id
        WHERE m.status='active' AND r.level>=?`,
      [minLevel],
    )
    .catch(() => null);
  return rows ? new Set(rows.map((row) => String(row.discord_id))) : null;
}

/** Returns one report row per rule: { key, label, wanted, added, removed, skipped }. */
export async function reconcileManagerRoles({ requestedBy = "staff-bot-managers", dryRun = false } = {}) {
  const staff = await cachedRoles(STAFF_GUILD_ID);
  const top = new Set([...staff].filter(([, roles]) => NETWORK_TOP_ROLE_IDS.some((id) => roles.has(id))).map(([id]) => id));
  const main = await cachedRoles(MAIN_GUILD_ID);
  const granted = await loadGranted();
  const report = [];
  for (const rule of MANAGER_ROLE_RULES) {
    let wanted;
    if (rule.devopsMinLevel) {
      wanted = await devopsManagerIds(rule.devopsMinLevel);
      if (!wanted) {
        report.push({ ...rule, wanted: [], added: [], removed: [], skipped: "no DevOps roster data" });
        continue;
      }
    } else {
      const members = await cachedRoles(rule.sourceGuild);
      if (!members.size) {
        report.push({ ...rule, wanted: [], added: [], removed: [], skipped: "no member data for the source server" });
        continue;
      }
      wanted = new Set([...members].filter(([, roles]) => rule.sourceRoles.some((id) => roles.has(id))).map(([id]) => id));
    }
    if (rule.networkTop !== false) for (const id of top) wanted.add(id);
    const tracked = new Set((granted[rule.key] || []).map(String));
    const inMain = (id) => main.has(id);
    const holds = (id) => main.get(id)?.has(rule.targetRole);
    const added = [...wanted].filter((id) => inMain(id) && !holds(id));
    const removed = [...tracked].filter((id) => !wanted.has(id) && holds(id));
    if (!dryRun) {
      await reconcileRole({ guildId: MAIN_GUILD_ID, roleId: rule.targetRole, wanted, removeOthers: false, reason: `${rule.label} (staff bot)`, requestedBy });
      for (const id of removed)
        await applyRole({ guildId: MAIN_GUILD_ID, discordId: id, roleId: rule.targetRole, add: false, reason: `No longer ${rule.label} (staff bot)`, requestedBy });
      // Keep tracking whoever we granted and who still qualifies; stop tracking everyone else.
      granted[rule.key] = [...new Set([...[...tracked].filter((id) => wanted.has(id)), ...added])];
    }
    report.push({ key: rule.key, label: rule.label, targetRole: rule.targetRole, wanted: [...wanted], added, removed, skipped: null });
  }
  if (!dryRun) await saveGranted(granted);
  return report;
}
