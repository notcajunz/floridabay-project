import { ORG } from "./quota.js";
import { agencyRoleIds, allMembers, config, db, post, ranks, tierRoleIdsUpTo } from "./store.js";
import { C, card, mention } from "./util.js";

/**
 * Keeps each IAA agent's in-game organization rank (org_ranks, the spend/roster/armory permissions)
 * in step with their Discord rank role. The Discord rank is authoritative: a member's game rank
 * becomes the one for their command tier, and is cleared when they no longer hold an IAA rank role.
 * Only members who already hold the organization's access role are touched (the main bot's role
 * sync owns who is on the roster), and leaders are never changed.
 */

const TIER_RANKS = { agent: "Agent", supervisor: "Supervisor", low_command: "Low Command", trial_high_command: "Trial High Command", high_command: "High Command" };

async function refreshGame() {
  const base = String(process.env.FBRP_FIVEM_ORIGIN || "http://127.0.0.1:30120/fbrp_core").replace(/\/$/, "");
  await fetch(`${base}/economy/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.FBRP_SERVICE_TOKEN || ""}` },
    body: "{}",
    signal: AbortSignal.timeout(3500),
  }).catch(() => null);
}

/**
 * These access roles are entirely derived from an IAA rank. A member with no rank gets none; an
 * agent gets the base role; command tiers stack up through the member's current rank tier.
 */
export function rosterRolePlan(cfg, rank, suspended = false) {
  const managed = new Set([cfg.roles.base, ...cfg.tiers.map((tier) => tier.roleId)].filter(Boolean));
  const expected = new Set();
  if (rank && !suspended) {
    if (cfg.roles.base) expected.add(cfg.roles.base);
    for (const id of tierRoleIdsUpTo(cfg, rank)) expected.add(id);
  }
  return { managed, expected };
}

export const isCurrentRosterMember = (rank, record) =>
  Boolean(rank || ["active", "suspended"].includes(String(record?.status || "")));

/** Enforces the roster-derived access roles for one member and warns on unauthorized additions. */
export async function enforceRosterRoles(member, { warnFor = [] } = {}) {
  const cfg = await config();
  const ladder = await ranks();
  const suspended = Boolean(cfg.roles.suspended && member.roles.cache.has(cfg.roles.suspended));
  const rank = suspended ? null : ladder.find((row) => member.roles.cache.has(row.role_id));
  const record = rank ? null : await db.one("SELECT status FROM iaa_members WHERE discord_id=?", [member.id]);
  const { managed, expected } = rosterRolePlan(cfg, rank, suspended);
  const remove = new Set([...managed].filter((id) => member.roles.cache.has(id) && !expected.has(id)));
  if (!isCurrentRosterMember(rank, record))
    for (const id of await agencyRoleIds()) if (member.roles.cache.has(id)) remove.add(id);
  const add = [...expected].filter((id) => !member.roles.cache.has(id));

  if (remove.size) await member.roles.remove([...remove], "IAA roster-bound role enforcement");
  if (add.length) await member.roles.add(add, "IAA roster-bound role enforcement");

  const warned = [...remove].filter((id) => warnFor.includes(id));
  if (warned.length) {
    const names = warned.map((id) => member.guild.roles.cache.get(id)?.name || id);
    await member.send({ embeds: [card("IAA roster-controlled role removed", {
      color: C.red,
      description: `The following role${names.length === 1 ? " was" : "s were"} added to your account without the required IAA roster rank and ${names.length === 1 ? "has" : "have"} been removed:\n\n${names.map((name) => `• **${name}**`).join("\n")}\n\nIAA access roles are assigned automatically from your roster rank.`,
    })] }).catch(() => null);
    await post(member.guild, "security", {
      embeds: [card("🔒 Unauthorized IAA role removed", {
        color: C.red,
        description: `${mention(member.id)} \`${member.id}\` received roster-controlled role${names.length === 1 ? "" : "s"} without a matching rank.\n\n${names.map((name) => `• **${name}**`).join("\n")}`,
      })],
    }, "botLogs");
  }
  return { added: add.length, removed: remove.size, warned: warned.length };
}

/** Periodically repairs missing roles and removes stale or over-level access roles. */
export async function reconcileRosterRoles(guild) {
  let changed = 0;
  for (const member of (await allMembers(guild)).values()) {
    if (member.user.bot) continue;
    const result = await enforceRosterRoles(member);
    changed += result.added + result.removed;
  }
  return changed;
}

// Kept as an API alias for callers that used the old add-only tier cascade.
export const cascadeTiers = reconcileRosterRoles;

export async function sync(guild) {
  await reconcileRosterRoles(guild).catch((e) => console.warn(`[IAA] roster role sync: ${e.message}`));
  const orgs = await db.query(`SELECT o.id FROM organizations o WHERE o.active=TRUE AND ${ORG}`, [guild.id, guild.id]);
  if (!orgs.length) return 0;
  const ladder = await ranks();
  const want = new Map(); // discord id -> game rank name
  for (const member of (await allMembers(guild)).values()) {
    if (member.user.bot) continue;
    const rank = ladder.find((r) => member.roles.cache.has(r.role_id));
    if (rank && TIER_RANKS[rank.tier]) want.set(member.id, TIER_RANKS[rank.tier]);
  }

  let changed = 0;
  for (const { id: orgId } of orgs) {
    const gameRanks = await db.query("SELECT id,name FROM org_ranks WHERE org_id=?", [orgId]);
    const byName = Object.fromEntries(gameRanks.map((r) => [r.name, Number(r.id)]));
    const ours = new Set(Object.values(TIER_RANKS).map((n) => byName[n]).filter(Boolean));
    if (!ours.size) continue;
    const holders = new Set(
      (
        await db.query(
          `SELECT DISTINCT c.discord_id FROM organization_role_requirements r
             JOIN discord_member_cache c ON c.guild_id=r.guild_id AND JSON_CONTAINS(c.roles, JSON_QUOTE(r.role_id))
            WHERE r.org_id=?`,
          [orgId],
        )
      ).map((r) => r.discord_id),
    );
    const current = new Map((await db.query("SELECT discord_id,manager,rank_id FROM organization_members WHERE org_id=?", [orgId])).map((r) => [r.discord_id, r]));

    for (const [discordId, name] of want) {
      const rankId = byName[name];
      const row = current.get(discordId);
      if (!rankId || !holders.has(discordId) || Number(row?.manager)) continue;
      if (row && Number(row.rank_id) === rankId) continue;
      await db.query(
        `INSERT INTO organization_members(org_id,discord_id,rank_name,rank_id,manager,added_by,added_at) VALUES(?,?,?,?,FALSE,'iaa-sync',?)
         ON DUPLICATE KEY UPDATE rank_id=VALUES(rank_id),rank_name=VALUES(rank_name)`,
        [orgId, discordId, name, rankId, Date.now()],
      );
      changed++;
    }
    for (const row of current.values()) {
      if (Number(row.manager) || !row.rank_id || !ours.has(Number(row.rank_id)) || want.has(row.discord_id)) continue;
      await db.query("UPDATE organization_members SET rank_id=NULL,rank_name='Member' WHERE org_id=? AND discord_id=?", [orgId, row.discord_id]);
      changed++;
    }
  }
  if (changed) await refreshGame();
  return changed;
}

let timer = null;
/** Runs a sync a few seconds from now; a burst of role edits collapses into one run. */
export function queue(guild) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    sync(guild).catch((e) => console.warn(`[IAA] rank sync: ${e.message}`));
  }, 5000);
}
