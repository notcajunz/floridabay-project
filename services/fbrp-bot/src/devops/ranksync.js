import { allMembers, config, db, history, ranks } from "./store.js";
import { movement, setRoles } from "./roster.js";
import { refreshPanels } from "./panels.js";
import { rankOf } from "./store.js";

/**
 * Keeps the roster honest when roles are edited by hand: group roles follow the rank, and manual
 * rank changes are recorded and logged to the movements channel as "(manual)".
 */

let busy = false;
export async function sync(guild) {
  if (busy) return { changed: 0 };
  busy = true;
  try {
    const cfg = await config();
    if (!cfg.ready) return { changed: 0 };
    const ladder = await ranks();
    const members = await allMembers(guild);
    const records = Object.fromEntries((await db.query("SELECT * FROM devops_members")).map((r) => [r.discord_id, r]));
    const byId = new Map(ladder.map((r) => [r.role_id, r]));
    let changed = 0;
    const now = Date.now();

    for (const member of members.values()) {
      if (member.user.bot) continue;
      const rank = await rankOf(member);
      const record = records[member.id];
      if (rank) {
        // Group roles follow the rank (and a second rank role is dropped).
        const wantLeadership = rank.tier === "leadership";
        // Development Team is for developers only: management must not hold it (see roster.js setRoles).
        const hasBase = !cfg.roles.base || member.roles.cache.has(cfg.roles.base) === !wantLeadership;
        const hasLeadership = !cfg.roles.leadership || member.roles.cache.has(cfg.roles.leadership) === wantLeadership;
        const extraRanks = ladder.filter((r) => r.role_id !== rank.role_id && member.roles.cache.has(r.role_id));
        if (!hasBase || !hasLeadership || extraRanks.length) {
          await setRoles(member, { rank }, "DevOps role sync").catch((e) => console.warn(`[DevOps] sync roles ${member.user.username}: ${e.message}`));
          changed++;
        }
        if (!record || record.status === "removed") {
          await db.query(
            `INSERT INTO devops_members(discord_id,username,rank_role_id,status,joined_at,rank_changed_at,trial_ends_at,trial_notified,updated_at) VALUES(?,?,?,'active',?,?,?,0,?)
             ON DUPLICATE KEY UPDATE username=VALUES(username),rank_role_id=VALUES(rank_role_id),status='active',rank_changed_at=VALUES(rank_changed_at),trial_ends_at=VALUES(trial_ends_at),trial_notified=0,removed_at=NULL,updated_at=VALUES(updated_at)`,
            [member.id, member.user.username, rank.role_id, now, now, rank.level === 1 ? now + cfg.settings.trialDays * 86400000 : null, now],
          );
          await history(member.id, "sync_add", "system", { to: rank.role_id, reason: "Rank assigned outside the bot" });
          await movement(guild, "sync", { member, to: rank, actorId: null, label: `${rank.name} (manual)` });
          changed++;
        } else if (record.status === "active" && record.rank_role_id !== rank.role_id) {
          const from = byId.get(record.rank_role_id) || null;
          await db.query("UPDATE devops_members SET rank_role_id=?,rank_changed_at=?,trial_ends_at=?,trial_notified=0,updated_at=? WHERE discord_id=?", [
            rank.role_id,
            now,
            rank.level === 1 ? now + cfg.settings.trialDays * 86400000 : null,
            now,
            member.id,
          ]);
          await history(member.id, "sync", "system", { from: record.rank_role_id, to: rank.role_id, reason: "Rank changed outside the bot" });
          await movement(guild, "sync", { member, from, to: rank, actorId: null, label: `${rank.name} (manual)` });
          changed++;
        }
      } else if (record?.status === "active") {
        // Lost the rank role by hand: close their record and drop the access roles.
        await db.query("UPDATE devops_members SET status='removed',rank_role_id=NULL,trial_ends_at=NULL,removed_at=?,updated_at=? WHERE discord_id=?", [now, now, member.id]);
        await history(member.id, "sync_remove", "system", { from: record.rank_role_id, reason: "Rank removed outside the bot" });
        await setRoles(member, { remove: [cfg.roles.base, cfg.roles.leadership] }, "DevOps role sync: no rank").catch(() => null);
        await movement(guild, "sync", { member, from: byId.get(record.rank_role_id) || null, to: null, actorId: null, label: "Removed (manual)" });
        changed++;
      }
    }

    // Someone who left the server while on the roster.
    for (const record of Object.values(records)) {
      if (record.status !== "active" && record.status !== "suspended") continue;
      if (members.has(record.discord_id)) continue;
      if (!guild.members.cache.has(record.discord_id) && (await guild.members.fetch(record.discord_id).catch(() => null))) continue;
      await db.query("UPDATE devops_members SET status='left',removed_at=?,updated_at=? WHERE discord_id=?", [now, now, record.discord_id]);
      await history(record.discord_id, "left", "system", { from: record.rank_role_id, reason: "Left the server" });
      changed++;
    }
    if (changed) refreshPanels(guild, "chain");
    return { changed };
  } finally {
    busy = false;
  }
}

const timers = new Map();
/** Debounced: a burst of role edits runs one sync a few seconds later. */
export function queue(guild, delay = 8000) {
  clearTimeout(timers.get(guild.id));
  timers.set(
    guild.id,
    setTimeout(() => {
      timers.delete(guild.id);
      sync(guild).catch((e) => console.warn(`[DevOps] rank sync: ${e.message}`));
    }, delay),
  );
}
