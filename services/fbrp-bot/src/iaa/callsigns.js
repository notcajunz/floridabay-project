import { allMembers, config, db, history, post, ranks } from "./store.js";
import { UserError, mention } from "./util.js";

/**
 * Callsigns are derived from the roster, never hand-picked:
 *  - Low Command and above have fixed slots (settings.callsignPlan, by rank name):
 *    Overseer IA-00, Director IA-01, Deputy Director IA-02, Assistant Deputy Director IA-03,
 *    Assistant Director IA-04, Chief of Staff IA-05, Section Chief IA-07 to IA-10,
 *    Special Agent In Charge IA-011 to IA-019, Asst. Special Agent in Charge IA-020 to IA-029.
 *  - Everyone else is numbered in rank order from settings.callsignStart (IA-030), highest rank first,
 *    and by time in rank within a rank. A promotion therefore shifts everyone between the old and
 *    new position by one, and resequence() renumbers them.
 * Suspended agents keep their number. Members who left the server keep theirs until removed.
 */

// Single digits keep two digits (IA-07). Two-digit numbers get a leading zero (IA-020).
export const format = (n) => `IA-${n >= 10 && n < 100 ? "0" : ""}${String(n).padStart(2, "0")}`;

async function plan() {
  const { settings } = await config();
  const ladder = await ranks();
  const fixed = new Map();
  for (const r of ladder) {
    const range = settings.callsignPlan?.[r.name.toLowerCase()];
    if (range) fixed.set(r.role_id, Array.from({ length: range[1] - range[0] + 1 }, (_, k) => range[0] + k));
  }
  return { ladder, fixed, start: settings.callsignStart };
}

/** Throws if a fixed-slot rank has no free callsign for `discordId`. */
export async function demandSlot(rank, discordId) {
  const { fixed } = await plan();
  const slots = fixed.get(rank.role_id);
  if (!slots) return;
  const holders = await db.query("SELECT discord_id FROM iaa_members WHERE rank_role_id=? AND status IN ('active','suspended') AND discord_id<>?", [rank.role_id, String(discordId)]);
  if (holders.length < slots.length)
    return;
  const signs = slots.map(format).join(", ");
  throw new UserError(
    `**${rank.name}** has ${slots.length === 1 ? `one callsign (${signs})` : `${slots.length} callsigns (${signs})`} and ${slots.length === 1 ? "it is" : "all are"} held by ${holders.map((h) => mention(h.discord_id)).join(", ")}. Move ${slots.length === 1 ? "them" : "one of them"} first.`,
  );
}

/** "IA-07 | Name" nicknames. Owners and members above the bot cannot be renamed, which is fine. */
export async function syncNickname(member, callsign) {
  const { settings } = await config();
  if (!settings.nicknameSync) return;
  const base = (member.nickname || member.user.globalName || member.user.username).replace(/^[A-Z]{1,4}-\d{1,4}\s*[|·-]\s*/, "");
  const nick = callsign ? `${callsign} | ${base}`.slice(0, 32) : base.slice(0, 32);
  if (nick !== member.nickname) await member.setNickname(nick, "IAA callsign").catch(() => null);
}

/**
 * Brings the roster table in line with Discord roles, so rank roles granted or removed by hand
 * still get (or lose) a callsign.
 */
async function reconcile(guild) {
  const ladder = await ranks();
  const members = await allMembers(guild);
  const records = new Map((await db.query("SELECT * FROM iaa_members")).map((r) => [r.discord_id, r]));
  const now = Date.now();
  for (const member of members.values()) {
    if (member.user.bot) continue;
    const held = ladder.find((r) => member.roles.cache.has(r.role_id));
    const rec = records.get(member.id);
    if (held) {
      if (!rec)
        await db.query("INSERT INTO iaa_members(discord_id,username,rank_role_id,status,joined_at,rank_changed_at,updated_at) VALUES(?,?,?,'active',?,?,?)", [
          member.id,
          member.user.username,
          held.role_id,
          now,
          now,
          now,
        ]);
      else if (rec.status !== "active" || rec.rank_role_id !== held.role_id)
        await db.query(
          // MariaDB applies SET left to right, so compare against the old values before overwriting them.
          "UPDATE iaa_members SET rank_changed_at=IF(rank_role_id<=>?,rank_changed_at,?),joined_at=IF(status='removed',?,joined_at),status='active',rank_role_id=?,removed_at=NULL,updated_at=? WHERE discord_id=?",
          [held.role_id, now, now, held.role_id, now, member.id],
        );
    } else if (rec?.status === "active") {
      await db.query("UPDATE iaa_members SET status='removed',rank_role_id=NULL,callsign=NULL,removed_at=?,updated_at=? WHERE discord_id=?", [now, now, member.id]);
    }
  }
}

let lock = Promise.resolve();

/**
 * Recomputes every callsign and applies the differences (database, nicknames, one log post).
 * Runs one at a time. Returns [{ id, from, to }].
 */
export function resequence(guild, { actorId = null, reason = null } = {}) {
  const run = lock.then(() => apply(guild, actorId, reason));
  lock = run.catch(() => null);
  return run;
}

async function apply(guild, actorId, reason) {
  await reconcile(guild);
  const { ladder, fixed, start } = await plan();
  const level = new Map(ladder.map((r) => [r.role_id, r.level]));
  const rows = (await db.query("SELECT discord_id,callsign,rank_role_id,rank_changed_at,joined_at FROM iaa_members WHERE status IN ('active','suspended') AND rank_role_id IS NOT NULL"))
    .filter((r) => level.has(r.rank_role_id))
    .sort(
      (a, b) =>
        level.get(b.rank_role_id) - level.get(a.rank_role_id) ||
        Number(a.rank_changed_at) - Number(b.rank_changed_at) ||
        Number(a.joined_at) - Number(b.joined_at) ||
        a.discord_id.localeCompare(b.discord_id),
    );
  const desired = new Map();
  const used = new Map();
  let next = start;
  for (const row of rows) {
    const slots = fixed.get(row.rank_role_id);
    if (slots) {
      const k = used.get(row.rank_role_id) || 0;
      used.set(row.rank_role_id, k + 1);
      desired.set(row.discord_id, k < slots.length ? format(slots[k]) : null);
    } else desired.set(row.discord_id, format(next++));
  }
  const changes = rows.filter((r) => (r.callsign || null) !== desired.get(r.discord_id)).map((r) => ({ id: r.discord_id, from: r.callsign || null, to: desired.get(r.discord_id) }));
  // Stale callsigns on removed members would block the unique key.
  await db.query("UPDATE iaa_members SET callsign=NULL WHERE status='removed' AND callsign IS NOT NULL");
  if (!changes.length) return [];

  await db.transaction(async (q) => {
    await q(`UPDATE iaa_members SET callsign=NULL WHERE discord_id IN (${changes.map(() => "?").join(",")})`, changes.map((c) => c.id));
    for (const c of changes) await q("UPDATE iaa_members SET callsign=?,updated_at=? WHERE discord_id=?", [c.to, Date.now(), c.id]);
  });
  for (const c of changes) {
    await history(c.id, "callsign", actorId || guild.client.user.id, { reason: `${c.from || "none"} → ${c.to || "none"}${reason ? ` · ${reason}` : ""}` });
    const member = guild.members.cache.get(c.id);
    if (member) await syncNickname(member, c.to);
  }
  // Same feed as the main bot's staff callsigns: one `@member --> IA-12` line per change, no pings.
  for (const c of changes.filter((x) => x.to))
    await post(guild, "callsigns", { content: `${mention(c.id)} --> ${c.to}`, allowedMentions: { parse: [] } }, "botLogs");
  const overflow = changes.filter((c) => !c.to);
  if (overflow.length)
    await post(guild, "botLogs", { content: `⚠️ No callsign slot left for ${overflow.map((c) => mention(c.id)).join(", ")}: their rank's fixed callsigns are all taken.`, allowedMentions: { parse: [] } });
  return changes;
}

/** Debounced resequence for manual role edits made outside the bot. */
let timer = null;
export function scheduleResequence(guild) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    resequence(guild, { reason: "Rank roles changed manually" }).catch((e) => console.warn(`[IAA] resequence: ${e.message}`));
  }, 5000);
}

/** One-line summary of a member's own change plus how many others moved. */
export function describe(changes, discordId) {
  const own = changes.find((c) => c.id === discordId);
  const others = changes.filter((c) => c.id !== discordId).length;
  return { callsign: own?.to, others };
}
