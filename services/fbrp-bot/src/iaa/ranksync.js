import { ORG } from "./quota.js";
import { allMembers, config, db, ranks, tierRoleIdsUpTo } from "./store.js";

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
 * Command tiers stack: every member holds the tier role of their rank and of every tier below it
 * (High Command carries Trial High Command, Low Command and Supervisor). Only ever adds roles, so a
 * manual edit never fights the bot; /iaa promote and /iaa demote rebuild the set from scratch.
 */
export async function cascadeTiers(guild) {
  const cfg = await config();
  const ladder = await ranks();
  let granted = 0;
  for (const member of (await allMembers(guild)).values()) {
    if (member.user.bot) continue;
    if (cfg.roles.suspended && member.roles.cache.has(cfg.roles.suspended)) continue;
    const rank = ladder.find((r) => member.roles.cache.has(r.role_id));
    if (!rank) continue;
    const missing = tierRoleIdsUpTo(cfg, rank).filter((id) => !member.roles.cache.has(id) && guild.roles.cache.get(id)?.editable);
    if (!missing.length) continue;
    const ok = await member.roles.add(missing, "IAA tier cascade: command tiers include every tier below").then(() => true, () => false);
    if (ok) granted += missing.length;
  }
  return granted;
}

export async function sync(guild) {
  await cascadeTiers(guild).catch((e) => console.warn(`[IAA] tier cascade: ${e.message}`));
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
