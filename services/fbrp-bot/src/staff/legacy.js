import { EmbedBuilder } from "discord.js";
import { audit, db, hasPermission, safeName, staffLevel, superuserIds } from "../database.js";
import { callGame, refreshGame, reconcileManagementMembership, staffDisplayGroups, staffRankInfo } from "../sync.js";
import { requireOwnerId } from "../access-control.js";
import { rebalanceCallsigns } from "../callsigns.js";
import { createStaffExams } from "../staff-exams.js";
import { SECTORS, clearSectorRoster, sectorCoordRoles } from "./sectors.js";
import { applyRole, bindRoleOps, noteQueued, cachedRoles, reconcileRole, resolveRoleId, roleHolders } from "./roleops.js";
import { COORD_ACE_ORIGIN, COORD_RANKS, COORD_TEAM_GROUP, LEADERSHIP_ROLE_ID, STAFF_GUILD_ID, TEAM_ROLE_ID } from "./config.js";
import { COLORS, card, chunkLines, humanize, logEmbed, roleRef, when, who } from "../ui.js";

/**
 * Staff management commands that used to live in the main bot: /staff, /roster, /callsign, /exam and
 * /coordall. The handlers are the main bot's originals; only the plumbing differs (this process has its
 * own Discord client, and network-wide role syncing is delegated to the main bot through a queue).
 */

let client = null;
let staffExams = null;

export function bindClient(discord) {
  client = discord;
  bindRoleOps(discord);
  staffExams = createStaffExams({ client, db, audit, log });
}
export const getStaffExams = () => staffExams;

/**
 * The member a command is about: the picked user, or a Discord ID typed into `discord_id` (also a
 * pasted mention), so someone who is not in the staff server can still be added or removed.
 */
export async function targetUser(i) {
  const picked = i.options.getUser("member");
  const raw = i.options.getString("discord_id");
  if (picked && raw) throw new Error("Give either a member or a Discord ID, not both.");
  if (picked) return picked;
  if (!raw) throw new Error("Pick a member or enter their Discord ID.");
  const id = String(raw).match(/\d{15,25}/)?.[0];
  if (!id) throw new Error("That is not a Discord ID. Use the 17 to 19 digit number (Developer Mode > Copy User ID).");
  const user = await client.users.fetch(id).catch(() => null);
  if (!user) throw new Error(`No Discord account has the ID \`${id}\`.`);
  return user;
}

const clean = (value, max = 1000) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
const mention = (id) => `<@${id}>`;
const group = (value) => safeName(value, "group name");

/** Posts an audit entry. A purpose whose channel this bot cannot reach falls back to the staff audit channel. */
export async function log(guild, entry, purpose = "staff_audit") {
  const tried = new Set();
  for (const key of [purpose, "staff_audit"]) {
    if (tried.has(key)) continue;
    tried.add(key);
    const binding = await db.one("SELECT channel_id FROM discord_channel_bindings WHERE purpose=?", [key]).catch(() => null);
    const channel = binding ? await client.channels.fetch(String(binding.channel_id)).catch(() => null) : null;
    if (!channel?.isTextBased()) continue;
    if (entry?.content) return channel.send({ content: entry.content, allowedMentions: { parse: [] } }).catch(() => {});
    const payload = entry instanceof EmbedBuilder ? entry : logEmbed(key, typeof entry === "string" ? { description: entry } : entry, guild);
    return channel
      .send({
        embeds: [payload],
        ...(entry?.files?.length ? { files: entry.files } : {}),
        ...(entry?.components?.length ? { components: entry.components } : {}),
        allowedMentions: { parse: [] },
      })
      .catch((error) => console.error(`[FBRP staff] ${key} log:`, error.message || error));
  }
}

const dm = (user, title, rows, color = COLORS.warning, description) =>
  user.send({ embeds: [card(title, { description, color, rows })] }).catch(() => {});

async function requirePermission(interaction, object) {
  if (await hasPermission(interaction.user.id, object)) return;
  throw new Error(`You need the \`${object}\` ACE permission.`);
}

function requireOwner(interaction, action = "make this change") {
  requireOwnerId(interaction.user.id, action);
}

/**
 * Asks the main bot to re-sync one member's ACE-driven roles in every network server. The staff bot is
 * only in a few servers, so the main bot (which is in all of them) picks the request up within seconds.
 */
export async function syncNetwork(discordId, requestedBy = "staff-bot") {
  await db.query(
    "INSERT INTO network_sync_queue(discord_id,requested_by,requested_at) VALUES(?,?,?) ON DUPLICATE KEY UPDATE requested_by=VALUES(requested_by),requested_at=VALUES(requested_at)",
    [String(discordId), String(requestedBy), Date.now()],
  );
  noteQueued(`🔄 network role re-sync · <@${discordId}> · by \`${requestedBy}\``);
}

/** Staff movement line: `@member --> Rank | @actor | date`. */
const movementLine = (targetId, rankName, actorId) =>
  `${mention(targetId)} --> ${rankName} | ${mention(actorId)} | <t:${Math.floor(Date.now() / 1000)}:D>`;

/** Common reasons offered while typing /staff remove reason. Anything else typed is used as is. */
const REMOVAL_REASONS = ["Resigned", "Terminated", "Retired", "Inactive", "Failed probation", "Demoted out of staff", "Removed"];

/** The word shown after the arrow in the movement message: the reason, trimmed to one short line. */
export function removalLabel(reason) {
  const line = String(reason ?? "").replace(/\s+/g, " ").trim();
  if (!line) return "Removed";
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

async function staffRemovalAutocomplete(i) {
  const needle = String(i.options.getFocused() || "").toLowerCase();
  return i.respond(REMOVAL_REASONS.filter((reason) => reason.toLowerCase().includes(needle)).map((reason) => ({ name: reason, value: reason })));
}

/** Staff callsign feed: every new or changed callsign is posted here as `@member --> 123`. */
const CALLSIGN_CHANNEL_ID = "1558275244567961690";
async function announceCallsign(discordId, callsign) {
  if (callsign === null || callsign === undefined || callsign === "") return;
  const channel = await client.channels.fetch(CALLSIGN_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) return console.warn("[FBRP bot] callsign channel is unavailable.");
  await channel
    .send({ content: `${mention(discordId)} --> ${callsign}`, allowedMentions: { parse: [] } })
    .catch((error) => console.error("[FBRP bot] callsign announcement:", error));
}

/** Apply rank-ordered callsigns and optionally publish each changed assignment. */
async function rebalanceStaffCallsigns(actorId, { announce = true } = {}) {
  const result = await rebalanceCallsigns(db, actorId);
  if (announce)
    for (const row of result.changes) await announceCallsign(row.discordId, row.callsign);
  return result;
}

/** Enforces a live staff-rank threshold using the roster rank's mapped ACE group. */
async function requireMinimumStaffRank(i, rankName, action) {
  const [level, threshold] = await Promise.all([
    staffLevel(i.user.id),
    db.one(
      `SELECT g.rank_order
         FROM staff_roster_ranks r JOIN ace_groups g ON g.name=r.ace_group
        WHERE LOWER(r.name)=LOWER(?)
        ORDER BY g.rank_order DESC LIMIT 1`,
      [rankName],
    ),
  ]);
  if (!threshold) throw new Error(`The ${rankName} staff rank is not configured.`);
  if (level < Number(threshold.rank_order))
    throw new Error(`Only ${rankName} and higher can ${action}.`);
}

/** Core configuration is reserved for Co-Owners even if a lower rank is accidentally granted an ACE. */
async function requireCoOwnerControl(i, permission, action) {
  await requireMinimumStaffRank(i, "Co-Owner", action);
  await requirePermission(i, permission);
}

/** Community Director and above: republish every Trial Head Administrator+ callsign, including unchanged ones. */
async function callsignCommand(i, sub) {
  if (sub !== "sync") throw new Error("Unknown callsign action.");
  await requireMinimumStaffRank(i, "Community Director", "synchronize callsigns");

  const rebalance = await rebalanceStaffCallsigns(i.user.id, { announce: false });
  const channel = await client.channels.fetch(CALLSIGN_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) throw new Error("The staff callsigns channel is unavailable.");
  const members = await db.query(
    `SELECT m.discord_id,m.callsign,m.status
       FROM staff_roster_members m
       LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id
       LEFT JOIN staff_roster_categories c ON c.id=r.category_id
      WHERE m.status<>'removed'
      ORDER BY COALESCE(c.sort_order,9999),COALESCE(r.sort_order,9999),m.callsign,m.display_name`,
  );
  const eligibleIds = new Set(rebalance.assignments.filter((member) => member.eligible).map((member) => member.discordId));
  const assigned = members.filter((member) => eligibleIds.has(String(member.discord_id)) && member.callsign !== null && member.callsign !== undefined && member.callsign !== "");
  const missing = members.filter((member) => eligibleIds.has(String(member.discord_id)) && !assigned.includes(member));
  for (const member of assigned)
    await channel.send({ content: `${mention(member.discord_id)} --> ${member.callsign}`, allowedMentions: { parse: [] } });

  await audit(i.user.id, "callsign.sync", channel.id, { posted: assigned.length, changed: rebalance.changes.length, missing: missing.map((member) => member.discord_id) });
  await log(i.guild, {
    title: "Staff callsigns synchronized",
    color: COLORS.success,
    actor: i.user.id,
    fields: [
      ["Callsigns posted", String(assigned.length)],
      ["Rank-order changes", String(rebalance.changes.length)],
      ["Destination", `<#${channel.id}>`],
      ...(missing.length ? [["Missing callsigns", missing.map((member) => mention(member.discord_id)).join(" "), false]] : []),
    ],
  }, "staff_audit");
  return card("Callsigns synchronized", {
    color: COLORS.success,
    description: `Rank-ordered and republished **${assigned.length}** staff callsign${assigned.length === 1 ? "" : "s"} in ${channel}.`,
    rows: missing.length ? [["Not posted", `${missing.length} staff member${missing.length === 1 ? " has" : "s have"} no assigned callsign.`]] : [],
  });
}


const levelText = (level) =>
  level === Number.POSITIVE_INFINITY ? "bot owner" : level < 0 ? "no staff rank" : `rank ${level}`;

/** /staff and /global may only act on members strictly below the actor's highest ACE group rank. */
async function requireOutranks(i, targetId, verb = "manage") {
  if (String(targetId) === i.user.id) throw new Error(`You cannot ${verb} yourself.`);
  if (superuserIds().has(String(targetId))) throw new Error(`You cannot ${verb} a bot owner.`);
  const [actor, target] = await Promise.all([staffLevel(i.user.id), staffLevel(targetId)]);
  if (actor !== Number.POSITIVE_INFINITY && target >= actor)
    throw new Error(`That member (${levelText(target)}) is equal to or above you (${levelText(actor)}).`);
  return { actor, target };
}


/** Roster rank joined with its category range and ACE group rank. */
async function staffRank(id) {
  const row = await db.one(
    `SELECT r.*,c.name category_name,c.callsign_start,c.callsign_end,g.rank_order group_rank,g.label group_label,g.staff_only group_staff_only
     FROM staff_roster_ranks r JOIN staff_roster_categories c ON c.id=r.category_id
     LEFT JOIN ace_groups g ON g.name=r.ace_group WHERE r.id=?`,
    [id],
  );
  if (!row) throw new Error("Staff rank not found. Pick one from the list.");
  if (!row.ace_group) throw new Error(`${row.name} has no ACE group. Set one with /roster rank-upsert ace_group or the web panel (Roster ranks).`);
  return row;
}

/** Autocomplete for /staff add and /staff move rank: only ranks whose ACE group sits below the caller. */
async function staffRankAutocomplete(i) {
  const needle = String(i.options.getFocused() || "").toLowerCase();
  const level = await staffLevel(i.user.id);
  const rows = await db.query(
    `SELECT r.id,r.name,r.ace_group,g.rank_order,c.name category FROM staff_roster_ranks r
     JOIN staff_roster_categories c ON c.id=r.category_id JOIN ace_groups g ON g.name=r.ace_group
     ORDER BY g.rank_order DESC,c.sort_order,r.sort_order`,
  );
  return i.respond(
    rows
      .filter((row) => Number(row.rank_order) < level && `${row.name} ${row.ace_group} ${row.category}`.toLowerCase().includes(needle))
      .slice(0, 25)
      .map((row) => ({ name: `${row.name} · ${row.category} · ${row.ace_group}`.slice(0, 100), value: String(row.id) })),
  );
}

/** Rank roles may live in the main server, so the change goes through applyRole (queued for the main bot there). */
async function setRankRole(rank, discordId, add) {
  if (!rank?.discord_role_id || !rank?.discord_guild_id) return;
  await applyRole({ guildId: rank.discord_guild_id, discordId, roleId: rank.discord_role_id, add, reason: "FBRP /staff rank" });
}

/** Removes a rank's Discord role if the member wears it. */
async function dropRankRole(rank, discordId) {
  await setRankRole(rank, discordId, false);
}

/** Every active roster member wears this role in each staff Discord that has one by this name. */
const STAFF_TEAM_ROLE = "FBRP | Staff Member";
// "FBRP | Staff Team" is the name of the staff server itself, not a role; kept as a fallback for any server that names it that way.
const STAFF_TEAM_ROLE_FALLBACKS = ["FBRP | Staff Team"];

/** The Staff Member role of one staff Discord, or null when that server has none. */
async function staffTeamRoleId(guildId) {
  for (const roleName of [STAFF_TEAM_ROLE, ...STAFF_TEAM_ROLE_FALLBACKS]) {
    const roleId = await resolveRoleId(guildId, { roleName });
    if (roleId) return roleId;
  }
  return null;
}

async function staffGuildIds() {
  return (await db.query("SELECT guild_id FROM network_guilds WHERE kind='staff'")).map((row) => String(row.guild_id));
}

const activeStaff = async (discordId) =>
  Boolean(await db.one("SELECT 1 ok FROM staff_roster_members WHERE discord_id=? AND status<>'removed'", [String(discordId)]));

/** Adds or removes the Staff Team role for one member in every staff Discord (queued where this bot is not). */
async function setStaffTeamRole(discordId, add) {
  for (const guildId of await staffGuildIds()) {
    const roleId = await staffTeamRoleId(guildId);
    if (!roleId) {
      console.error(`[FBRP staff] No "${STAFF_TEAM_ROLE}" role in staff server ${guildId}.`);
      continue;
    }
    await applyRole({
      guildId,
      discordId,
      roleId,
      add,
      reason: add ? "FBRP staff roster member" : "Removed from the FBRP staff roster",
    }).catch((error) => console.error(`[FBRP staff] Staff Team role for ${discordId}:`, error.message || error));
  }
}

/** Keeps a roster member's staff jobs in line with the Discord roles the jobs are bound to. */
async function reconcileJobRows(discordId, roleIds, jobs) {
  for (const job of jobs) {
    if (roleIds.has(String(job.discord_role_id)))
      await db.query("INSERT IGNORE INTO staff_roster_member_jobs(discord_id,job_id,assigned_by,assigned_at) VALUES(?,?,?,?)", [discordId, job.id, "role-sync", Date.now()]);
    else
      await db.query("DELETE FROM staff_roster_member_jobs WHERE discord_id=? AND job_id=?", [discordId, job.id]);
  }
}

async function reconcileRosterJobs(member, jobs = null) {
  if (!member || member.user.bot) return;
  const rows = jobs || (await db.query(
    "SELECT id,discord_role_id FROM staff_roster_jobs WHERE discord_role_id IS NOT NULL AND discord_guild_id=?",
    [member.guild.id],
  ));
  if (!rows.length) return;
  if (!(await db.one("SELECT 1 ok FROM staff_roster_members WHERE discord_id=? AND status<>'removed'", [member.id]))) return;
  await reconcileJobRows(member.id, new Set(member.roles.cache.keys()), rows);
}

/** Every bound job, in servers this bot is in or (from the main bot's member cache) in servers it is not. */
async function reconcileAllRosterJobs() {
  const jobs = await db.query("SELECT id,discord_role_id,discord_guild_id FROM staff_roster_jobs WHERE discord_role_id IS NOT NULL AND discord_guild_id IS NOT NULL");
  const active = new Set((await db.query("SELECT discord_id FROM staff_roster_members WHERE status<>'removed'")).map((row) => String(row.discord_id)));
  for (const guildId of new Set(jobs.map((job) => String(job.discord_guild_id)))) {
    const here = jobs.filter((job) => String(job.discord_guild_id) === guildId);
    const members = await cachedRoles(guildId);
    for (const [id, roleIds] of members) if (active.has(id)) await reconcileJobRows(id, roleIds, here);
  }
}

/** Every active roster member wears the Staff Team role in each staff Discord (startup, every 10 minutes, /roster sync). */
async function syncStaffTeamRoles() {
  const wanted = new Set((await db.query("SELECT discord_id FROM staff_roster_members WHERE status<>'removed'")).map((row) => String(row.discord_id)));
  for (const guildId of await staffGuildIds()) {
    const roleId = await staffTeamRoleId(guildId);
    if (!roleId) continue;
    await reconcileRole({ guildId, roleId, wanted, removeOthers: false, reason: "FBRP staff roster member" }).catch((error) =>
      console.error(`[FBRP staff] Staff Team role in ${guildId}:`, error.message || error),
    );
  }
}

/** The rank plus every staff rank whose ACE group sits below it; /staff add grants all of them. */
async function staffLadder(rank) {
  return db.query(
    `SELECT r.*,g.rank_order group_rank FROM staff_roster_ranks r JOIN ace_groups g ON g.name=r.ace_group
     WHERE r.id=? OR g.rank_order<? ORDER BY g.rank_order DESC`,
    [rank.id, Number(rank.group_rank)],
  );
}

/** Every ACE group a staff rank maps to; /staff moves members between these. */
const STAFF_GROUPS_SQL = "SELECT DISTINCT ace_group FROM staff_roster_ranks WHERE ace_group IS NOT NULL";

/** /staff add, or /staff move (existing staff only: no welcome DM, optional reason). */
async function staffAdd(i, move = false) {
  await requirePermission(i, "fbrp.staff.assign");
  const user = await targetUser(i);
  if (user.bot) throw new Error("Bots cannot be staff.");
  const rank = await staffRank(Number(i.options.getString("rank", true)));
  const { actor } = await requireOutranks(i, user.id, "change the staff rank of");
  if (actor !== Number.POSITIVE_INFINITY && Number(rank.group_rank) >= actor)
    throw new Error(`You can only add members to groups below your own rank. ${rank.name} uses \`${rank.ace_group}\` (rank ${rank.group_rank}); your highest group is rank ${actor}.`);
  const previous = await db.one(
    `SELECT m.*,r.discord_role_id,r.discord_guild_id FROM staff_roster_members m
     LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id WHERE m.discord_id=?`,
    [user.id],
  );
  const active = previous && previous.status !== "removed";
  const reason = move ? clean(i.options.getString("reason") || "", 300) || null : null;
  if (move && !active) throw new Error("That member is not on the staff roster. Use /staff add instead.");
  if (move && Number(previous.rank_id) === Number(rank.id)) throw new Error(`That member is already ${rank.name}.`);
  const ladder = await staffLadder(rank);
  const groups = [...new Set(ladder.map((row) => String(row.ace_group)))];
  const marks = groups.map(() => "?").join(",");
  const removedGroups = await db.transaction(async (q) => {
    const old = await q(
      `SELECT DISTINCT group_name FROM ace_memberships WHERE discord_id=? AND origin='manual' AND group_name NOT IN (${marks}) AND group_name IN (${STAFF_GROUPS_SQL})`,
      [user.id, ...groups],
    );
    await q(
      `DELETE FROM ace_memberships WHERE discord_id=? AND origin='manual' AND group_name NOT IN (${marks}) AND group_name IN (${STAFF_GROUPS_SQL})`,
      [user.id, ...groups],
    );
    for (const name of groups)
      await q(
        "INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,'manual',?,?)",
        [user.id, name, i.user.id, Date.now()],
      );
    const stamp = Date.now();
    await q(
      `INSERT INTO staff_roster_members(discord_id,display_name,username,rank_name,rank_id,callsign,status,joined_at,rank_changed_at,updated_at,added_by)
       VALUES(?,?,?,?,?,?,'active',?,?,?,?)
       ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),username=VALUES(username),rank_name=VALUES(rank_name),
         rank_changed_at=IF(rank_id<=>VALUES(rank_id) AND status<>'removed',rank_changed_at,VALUES(rank_changed_at)),
         joined_at=IF(status='removed',VALUES(joined_at),joined_at),rank_id=VALUES(rank_id),callsign=VALUES(callsign),status='active',
         updated_at=VALUES(updated_at),removed_at=NULL,removed_by=NULL,removal_reason=NULL`,
      [user.id, user.globalName || user.username, user.username, rank.name, rank.id, null, stamp, stamp, stamp, i.user.id],
    );
    await q(
      "INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at) VALUES(?,?,?,?,?)",
      [user.id, move ? "staff_move" : "staff_add", i.user.id, JSON.stringify({ rank: rank.id, group: rank.ace_group, callsign: "rank_ordered", from: previous?.rank_id || null, ...(reason ? { reason } : {}) }), stamp],
    );
    return old.map((row) => String(row.group_name));
  });
  await reconcileManagementMembership(user.id, i.user.id);
  // The member keeps every lower rank's ACE group but wears only their own rank role (management also wears Head Administrator).
  const wear = staffDisplayGroups(String(rank.ace_group), await staffRankInfo());
  const allRanks = await db.query("SELECT id,discord_role_id,discord_guild_id,ace_group FROM staff_roster_ranks");
  for (const row of allRanks) {
    if (Number(row.id) === Number(rank.id) || wear.has(String(row.ace_group))) await setRankRole(row, user.id, true);
    else await dropRankRole(row, user.id);
  }
  await setStaffTeamRole(user.id, true);
  const rebalance = await rebalanceStaffCallsigns(i.user.id);
  const callsign = rebalance.assignments.find((row) => row.discordId === user.id)?.callsign ?? null;
  await audit(i.user.id, move ? "staff.move" : "staff.add", user.id, { rank: rank.id, rankName: rank.name, from: previous?.rank_name || null, group: rank.ace_group, groups, callsign, removedGroups, reason });
  await refreshGame();
  await syncNetwork(user.id);
  const welcome = move ? null : await queueStaffWelcome(user, rank, callsign, i.user.id);
  const rows = [
    ["Rank", `${clean(rank.name)}\n${clean(rank.category_name)}`],
    ["ACE group", `\`${rank.ace_group}\` (rank ${rank.group_rank})`],
    ...(groups.length > 1 ? [["Lower ranks included", groups.filter((g) => g !== rank.ace_group).map((g) => `\`${g}\``).join(" ")]] : []),
    ["Callsign", callsign === null ? "Not assigned (Trial Head Administrator and above only)" : String(callsign)],
    ...(active && previous.rank_name && Number(previous.rank_id) !== Number(rank.id) ? [["Previous rank", clean(previous.rank_name)]] : []),
    ...(removedGroups.length ? [["Left groups", removedGroups.map((g) => `\`${g}\``).join(" ")]] : []),
    ...(welcome ? [["Welcome DM", "Queued: the main bot sends it with a single-use staff-server invite, and the result is posted in the staff audit log"]] : []),
    ...(reason ? [["Reason", reason, false]] : []),
  ];
  await log(i.guild, { content: movementLine(user.id, clean(rank.name), i.user.id) }, "roster");
  await log(i.guild, { title: "Staff ACE membership set", color: COLORS.success, actor: i.user.id, target: user.id, fields: [["Groups", groups.map((g) => `\`${g}\``).join(" ")], ...(removedGroups.length ? [["Removed from", removedGroups.map((g) => `\`${g}\``).join(" ")]] : [])] }, "role_sync");
  return card(move ? "Staff member moved" : active ? "Staff rank changed" : "Staff member added", {
    color: COLORS.success,
    description: `${mention(user.id)} now has the ${clean(rank.name)} permissions${rank.group_staff_only ? " (in game they apply while clocked in)" : ""}.`,
    rows: [["Member", who(user.id)], ...rows],
  });
}

async function staffRemove(i) {
  await requirePermission(i, "fbrp.staff.assign");
  const user = await targetUser(i);
  const reason = clean(i.options.getString("reason", true), 300);
  await requireOutranks(i, user.id, "remove");
  const roster = await db.one(
    `SELECT m.*,r.discord_role_id,r.discord_guild_id FROM staff_roster_members m
     LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id WHERE m.discord_id=?`,
    [user.id],
  );
  const groups = (
    await db.query(
      `SELECT DISTINCT group_name FROM ace_memberships WHERE discord_id=? AND origin='manual' AND group_name IN (${STAFF_GROUPS_SQL})`,
      [user.id],
    )
  ).map((row) => String(row.group_name));
  if (!groups.length && (!roster || roster.status === "removed")) throw new Error("That member is not staff.");
  const stamp = Date.now();
  await db.transaction(async (q) => {
    await q(`DELETE FROM ace_memberships WHERE discord_id=? AND origin='manual' AND group_name IN (${STAFF_GROUPS_SQL})`, [user.id]);
    await q(
      "UPDATE staff_roster_members SET status='removed',callsign=NULL,removed_at=?,removed_by=?,removal_reason=?,updated_at=? WHERE discord_id=?",
      [stamp, i.user.id, reason, stamp, user.id],
    );
    await q(
      "INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at) VALUES(?,?,?,?,?)",
      [user.id, "staff_remove", i.user.id, JSON.stringify({ reason, groups, callsign: roster?.callsign ?? null }), stamp],
    );
    await q(
      "UPDATE staff_shifts SET ended_at=heartbeat_at,seconds=GREATEST(0,FLOOR((heartbeat_at-started_at)/1000)),end_reason='forceout',actor_id=?,note=? WHERE discord_id=? AND ended_at IS NULL",
      [i.user.id, "Removed from staff", user.id],
    );
  });
  await reconcileManagementMembership(user.id, i.user.id);
  await setRankRole(roster, user.id, false);
  await setStaffTeamRole(user.id, false);
  await rebalanceStaffCallsigns(i.user.id);
  await callGame("/forceout", { discord: user.id, actor: i.user.id, reason: "Removed from staff" }).catch(() => {});
  await audit(i.user.id, "staff.remove", user.id, { reason, groups, rank: roster?.rank_name || null, callsign: roster?.callsign ?? null });
  await refreshGame();
  await syncNetwork(user.id);
  const rows = [
    ["Rank", clean(roster?.rank_name) || "None"],
    ["Callsign released", roster?.callsign ? String(roster.callsign) : "None"],
    ["ACE groups removed", groups.map((g) => `\`${g}\``).join(" ") || "None"],
    ["Reason", reason, false],
  ];
  await log(i.guild, { content: movementLine(user.id, removalLabel(reason), i.user.id) }, "roster");
  await log(i.guild, { title: "Staff ACE membership removed", color: COLORS.warning, actor: i.user.id, target: user.id, fields: [["Groups", groups.map((g) => `\`${g}\``).join(" ") || "None"]] }, "role_sync");
  return card("Staff member removed", { color: COLORS.warning, rows: [["Member", who(user.id)], ...rows] });
}

async function staffCommand(i, sub) {
  if (sub === "add") return staffAdd(i);
  if (sub === "move") return staffAdd(i, true);
  if (sub === "remove") return staffRemove(i);
  await requirePermission(i, "fbrp.staff.manage");
  const cutoff = Date.now() - 7 * 86400000;
  if (sub === "hours") {
    const user = i.options.getUser("member", true),
      row = await db.one(
        "SELECT COUNT(*) shifts,COALESCE(SUM(CASE WHEN ended_at IS NULL THEN FLOOR((?-started_at)/1000) ELSE seconds END),0) seconds FROM staff_shifts WHERE discord_id=? AND started_at>=?",
        [Date.now(), user.id, cutoff],
      );
    return card("Staff hours", {
      rows: [["Member", who(user.id)], ["Time on duty", `${(Number(row.seconds) / 3600).toFixed(1)} hours`], ["Shifts", String(row.shifts)]],
      footer: "Florida Bay Roleplay \u00b7 Last 7 days",
    });
  }
  if (sub === "leaderboard") {
    const days = i.options.getInteger("days") || 7,
      start = Date.now() - days * 86400000,
      rows = await db.query(
        "SELECT discord_id,MAX(name) name,COUNT(*) shifts,SUM(CASE WHEN ended_at IS NULL THEN FLOOR((?-started_at)/1000) ELSE seconds END) seconds FROM staff_shifts WHERE started_at>=? GROUP BY discord_id ORDER BY seconds DESC LIMIT 20",
        [Date.now(), start],
      );
    return card("Staff leaderboard", {
      description:
        rows
          .map(
            (row, index) =>
              `\`${String(index + 1).padStart(2, "0")}\` · **${clean(row.name)}** · ${(Number(row.seconds) / 3600).toFixed(1)}h across ${row.shifts} shift${Number(row.shifts) === 1 ? "" : "s"}`,
          )
          .join("\n") || "No recorded shifts.",
      footer: `Florida Bay Roleplay \u00b7 Last ${days} days`,
    });
  }
  const user = i.options.getUser("member", true),
    reason = i.options.getString("reason", true),
    stamp = Date.now();
  const result = await db.query(
    "UPDATE staff_shifts SET ended_at=heartbeat_at,seconds=GREATEST(0,FLOOR((heartbeat_at-started_at)/1000)),end_reason='forceout',actor_id=?,note=? WHERE discord_id=? AND ended_at IS NULL",
    [i.user.id, reason, user.id],
  );
  await callGame("/forceout", {
    discord: user.id,
    actor: i.user.id,
    reason,
  }).catch(() => {});
  await audit(i.user.id, "staff.forceout", user.id, {
    reason,
    rows: result.affectedRows,
    stamp,
  });
  await log(i.guild, { title: "Staff clock-out enforced", color: COLORS.warning, actor: i.user.id, target: user.id, fields: [["Shifts closed", String(result.affectedRows)], ["Reason", clean(reason, 300), false]] }, "staff_duty");
  return card("Staff clock-out enforced", {
    color: COLORS.warning,
    rows: [["Member", who(user.id)], ["Shifts closed", String(result.affectedRows)], ["Reason", clean(reason, 300), false]],
  });
}


/** /exam: Assistant Community Director and above open an exam for one member for 60 minutes. */
async function examCommand(i, sub) {
  if (sub === "give") {
    const member = i.options.getUser("member", true);
    const result = await staffExams.give(i.user.id, member.id, i.options.getString("exam", true));
    return card(`${result.exam.title} given`, {
      color: COLORS.success,
      description: `${mention(member.id)} can sit the exam on the portal until <t:${Math.floor(result.expiresAt / 1000)}:t> (<t:${Math.floor(result.expiresAt / 1000)}:R>). It must be submitted before then.`,
      rows: [["Portal", result.link, false], ["DM", result.dmSent ? "Sent with the link" : "Could not DM them - share the link yourself"]],
    });
  }
  if (sub === "revoke") {
    const member = i.options.getUser("member", true);
    const result = await staffExams.revoke(i.user.id, member.id, i.options.getString("exam", true));
    return card(`${result.exam.title} access revoked`, { color: COLORS.warning, rows: [["Member", who(member.id)]] });
  }
  const rows = await staffExams.activeGrants(i.user.id);
  return card("Open exam access", {
    color: COLORS.primary,
    description: rows.length
      ? rows.map((row) => `${mention(row.discord_id)} · **${clean(row.title, 60)}** · given by ${mention(row.granted_by)} · expires <t:${Math.floor(Number(row.expires_at) / 1000)}:R>`).join("\n")
      : "Nobody has open exam access right now.",
  });
}


async function rosterCommand(i, sub) {
  const permission = ["list", "profile"].includes(sub)
    ? "fbrp.roster.view"
    : ["discipline", "discipline-revoke"].includes(sub)
      ? "fbrp.roster.discipline"
      : ["category-upsert", "category-delete", "rank-upsert", "rank-delete", "job-upsert", "job-delete", "sync"].includes(sub)
        ? "fbrp.roster.config"
        : "fbrp.roster.manage";
  if (permission === "fbrp.roster.config")
    await requireCoOwnerControl(i, permission, "configure the staff roster");
  else await requirePermission(i, permission);
  const history = (discordId, action, details) =>
    db.query(
      "INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at) VALUES(?,?,?,?,?)",
      [discordId, action, i.user.id, JSON.stringify(details || {}), Date.now()],
    );
  const rankById = async (id) => {
    const row = await db.one(
      `SELECT r.*,c.name category_name,c.callsign_start,c.callsign_end
       FROM staff_roster_ranks r JOIN staff_roster_categories c ON c.id=r.category_id WHERE r.id=?`,
      [id],
    );
    if (!row) throw new Error("Roster rank not found.");
    return row;
  };
  if (sub === "list") {
    const [categories, ranks, members, jobs] = await Promise.all([
      db.query("SELECT * FROM staff_roster_categories ORDER BY sort_order,name"),
      db.query("SELECT * FROM staff_roster_ranks ORDER BY category_id,sort_order,name"),
      db.query(`SELECT m.*,r.name rank,c.name category,
        (SELECT COUNT(*) FROM staff_roster_discipline d WHERE d.discord_id=m.discord_id AND d.revoked_at IS NULL) discipline
        FROM staff_roster_members m LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id
        LEFT JOIN staff_roster_categories c ON c.id=r.category_id WHERE m.status<>'removed'
        ORDER BY c.sort_order,r.sort_order,m.callsign`),
      db.query("SELECT j.*,COUNT(m.discord_id) members FROM staff_roster_jobs j LEFT JOIN staff_roster_member_jobs m ON m.job_id=j.id GROUP BY j.id ORDER BY j.sort_order,j.name"),
    ]);
    const config = categories.map((c) => `\`C${c.id}\` · **${clean(c.name)}** · callsigns ${c.callsign_start} to ${c.callsign_end}`);
    const rankText = ranks.map((r) => `\`R${r.id}\` · **${clean(r.name)}**${r.discord_role_id ? ` · ${roleRef(r.discord_role_id)}` : ""} · ${(Number(r.weekly_seconds) / 3600).toFixed(0)}h per week`);
    const roster = members.map((row) => `${row.callsign ? `\`${row.callsign}\` · ` : ""}${mention(row.discord_id)} · **${clean(row.rank || row.rank_name)}** · ${row.status}${Number(row.discipline) ? ` · ${row.discipline} active warning${Number(row.discipline) === 1 ? "" : "s"}` : ""}`);
    const jobText = jobs.map((j) => `\`J${j.id}\` · **${clean(j.name)}**${j.discord_role_id ? ` · ${roleRef(j.discord_role_id)}` : ""} · ${j.members} member${Number(j.members) === 1 ? "" : "s"}`);
    const sections = [
      ["Categories", config],
      ["Ranks", rankText],
      ["Secondary jobs", jobText],
    ];
    const list = card("Staff roster", {
      description: `${members.length} active staff member${members.length === 1 ? "" : "s"} across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}.`,
      rows: sections.map(([name, items]) => [name, chunkLines(items)[0] || "None", false]),
    });
    const memberChunks = chunkLines(roster);
    memberChunks.slice(0, 2).forEach((chunk, index) => list.addFields({ name: index ? "Staff (continued)" : "Staff", value: chunk }));
    if (!memberChunks.length) list.addFields({ name: "Staff", value: "Empty" });
    return list;
  }
  if (sub === "category-upsert") {
    const id = i.options.getInteger("id"), name = clean(i.options.getString("name", true), 80);
    const start = i.options.getInteger("start", true), end = i.options.getInteger("end", true);
    if (end < start) throw new Error("Callsign end must be greater than or equal to start.");
    const order = i.options.getInteger("order") || 0;
    if (id) await db.query("UPDATE staff_roster_categories SET name=?,callsign_start=?,callsign_end=?,sort_order=? WHERE id=?", [name, start, end, order, id]);
    else await db.query("INSERT INTO staff_roster_categories(name,callsign_start,callsign_end,sort_order,created_at) VALUES(?,?,?,?,?)", [name, start, end, order, Date.now()]);
    const rebalance = await rebalanceStaffCallsigns(i.user.id);
    await log(i.guild, {
      title: id ? "Roster category updated" : "Roster category created",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Category", name], ["Callsigns", `${start} to ${end}`], ["Callsign changes", String(rebalance.changes.length)]],
    }, "roster");
    return card("Roster category saved", { color: COLORS.success, rows: [["Category", name], ["Callsigns", `${start} to ${end}`], ["Callsign changes", String(rebalance.changes.length)]] });
  }
  if (sub === "category-delete") {
    const id = i.options.getInteger("id", true);
    await db.query("DELETE FROM staff_roster_categories WHERE id=?", [id]);
    await log(i.guild, { title: "Roster category deleted", color: COLORS.warning, actor: i.user.id, fields: [["Category ID", `\`${id}\``]] }, "roster");
    return card("Roster category deleted", { color: COLORS.warning, rows: [["Category ID", `\`${id}\``]] });
  }
  if (sub === "rank-upsert") {
    const id = i.options.getInteger("id"), category = i.options.getInteger("category", true);
    const name = clean(i.options.getString("name", true), 80), role = i.options.getRole("role");
    const weekly = (i.options.getInteger("weekly_hours") || 0) * 3600;
    const days = i.options.getInteger("minimum_days") || 0, order = i.options.getInteger("order") || 0;
    const aceGroup = i.options.getString("ace_group") ? group(i.options.getString("ace_group")) : null;
    if (aceGroup && !(await db.one("SELECT name FROM ace_groups WHERE name=?", [aceGroup]))) throw new Error(`ACE group \`${aceGroup}\` does not exist.`);
    if (id) await db.query("UPDATE staff_roster_ranks SET category_id=?,name=?,discord_role_id=?,discord_guild_id=?,ace_group=?,sort_order=?,weekly_seconds=?,minimum_days=? WHERE id=?", [category, name, role?.id || null, role ? i.guildId : null, aceGroup, order, weekly, days, id]);
    else await db.query("INSERT INTO staff_roster_ranks(category_id,name,discord_role_id,discord_guild_id,ace_group,sort_order,weekly_seconds,minimum_days,created_at) VALUES(?,?,?,?,?,?,?,?,?)", [category, name, role?.id || null, role ? i.guildId : null, aceGroup, order, weekly, days, Date.now()]);
    const rebalance = await rebalanceStaffCallsigns(i.user.id);
    const rows = [["Rank", name], ["Role", role ? roleRef(role.id) : "Not mapped"], ["ACE group", aceGroup ? `\`${aceGroup}\`` : "Not mapped"], ["Weekly hours", `${weekly / 3600}h`], ["Callsign changes", String(rebalance.changes.length)]];
    await log(i.guild, {
      title: id ? "Roster rank updated" : "Roster rank created",
      color: COLORS.success,
      actor: i.user.id,
      fields: rows,
    }, "roster");
    return card("Roster rank saved", { color: COLORS.success, rows });
  }
  if (sub === "rank-delete") {
    const id = i.options.getInteger("id", true);
    await db.query("DELETE FROM staff_roster_ranks WHERE id=?", [id]);
    await log(i.guild, { title: "Roster rank deleted", color: COLORS.warning, actor: i.user.id, fields: [["Rank ID", `\`${id}\``]] }, "roster");
    return card("Roster rank deleted", { color: COLORS.warning, rows: [["Rank ID", `\`${id}\``]] });
  }
  if (sub === "job-upsert") {
    const id = i.options.getInteger("id"), name = clean(i.options.getString("name", true), 80);
    const description = clean(i.options.getString("description") || "", 300), role = i.options.getRole("role");
    const order = i.options.getInteger("order") || 0;
    if (id) await db.query("UPDATE staff_roster_jobs SET name=?,description=?,discord_role_id=?,discord_guild_id=?,sort_order=? WHERE id=?", [name, description, role?.id || null, role ? i.guildId : null, order, id]);
    else await db.query("INSERT INTO staff_roster_jobs(name,description,discord_role_id,discord_guild_id,sort_order,created_at) VALUES(?,?,?,?,?,?)", [name, description, role?.id || null, role ? i.guildId : null, order, Date.now()]);
    await log(i.guild, {
      title: id ? "Staff job updated" : "Staff job created",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Job", name], ["Role", role ? roleRef(role.id) : "Not mapped"]],
    }, "roster");
    return card("Staff job saved", {
      color: COLORS.success,
      description: description || undefined,
      rows: [["Job", name], ["Role", role ? roleRef(role.id) : "Not mapped"]],
    });
  }
  if (sub === "job-delete") {
    const id = i.options.getInteger("id", true);
    await db.query("DELETE FROM staff_roster_jobs WHERE id=?", [id]);
    await log(i.guild, { title: "Staff job deleted", color: COLORS.warning, actor: i.user.id, fields: [["Job ID", `\`${id}\``]] }, "roster");
    return card("Staff job deleted", { color: COLORS.warning, rows: [["Job ID", `\`${id}\``]] });
  }
  if (sub === "discipline-revoke") {
    const id = i.options.getInteger("id", true), reason = clean(i.options.getString("reason", true), 300);
    const row = await db.one("SELECT * FROM staff_roster_discipline WHERE id=? AND revoked_at IS NULL", [id]);
    if (!row) throw new Error("Active discipline record not found.");
    await db.query("UPDATE staff_roster_discipline SET revoked_at=?,revoked_by=?,revoke_reason=? WHERE id=?", [Date.now(), i.user.id, reason, id]);
    await history(row.discord_id, "discipline_revoke", { id, reason });
    await log(i.guild, {
      title: "Discipline revoked",
      color: COLORS.success,
      actor: i.user.id,
      target: row.discord_id,
      fields: [["Record", `${humanize(row.kind)} #${id}`], ["Reason", reason, false]],
    }, "roster");
    return card("Discipline revoked", {
      color: COLORS.success,
      rows: [["Member", who(row.discord_id)], ["Record", `${humanize(row.kind)} #${id}`], ["Reason", reason, false]],
    });
  }
  if (sub === "sync") {
    const ranks = await db.query("SELECT * FROM staff_roster_ranks WHERE discord_role_id IS NOT NULL AND discord_guild_id IS NOT NULL ORDER BY sort_order");
    let synced = 0;
    for (const rank of ranks) {
      for (const member of await roleHolders(rank.discord_guild_id, rank.discord_role_id)) {
        await db.query(`INSERT INTO staff_roster_members(discord_id,display_name,username,rank_name,rank_id,callsign,status,joined_at,rank_changed_at,updated_at,added_by)
          VALUES(?,?,?,?,?,?,'active',?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),username=VALUES(username),rank_name=VALUES(rank_name),rank_id=VALUES(rank_id),status='active',updated_at=VALUES(updated_at)`,
        [member.id, member.displayName, member.username, rank.name, rank.id, null, Date.now(), Date.now(), Date.now(), i.user.id]);
        synced++;
      }
    }
    await reconcileAllRosterJobs();
    const rebalance = await rebalanceStaffCallsigns(i.user.id);
    await syncStaffTeamRoles();
    await log(i.guild, {
      title: "Roster synchronized",
      color: COLORS.success,
      actor: i.user.id,
      fields: [["Assignments", String(synced)], ["Callsign changes", String(rebalance.changes.length)]],
    }, "role_sync");
    return card("Roster synchronized", {
      color: COLORS.success,
      description: "Staff assignments were reconciled from Discord roles.",
      rows: [["Assignments", String(synced)], ["Callsign changes", String(rebalance.changes.length)]],
    });
  }
  const user = await targetUser(i);
  if (sub === "job-assign" || sub === "job-remove") {
    const jobId = i.options.getInteger("job", true);
    const job = await db.one("SELECT * FROM staff_roster_jobs WHERE id=?", [jobId]);
    if (!job) throw new Error("Staff job not found.");
    const add = sub === "job-assign";
    if (add) await db.query("INSERT IGNORE INTO staff_roster_member_jobs(discord_id,job_id,assigned_by,assigned_at) VALUES(?,?,?,?)", [user.id, jobId, i.user.id, Date.now()]);
    else await db.query("DELETE FROM staff_roster_member_jobs WHERE discord_id=? AND job_id=?", [user.id, jobId]);
    if (job.discord_role_id && job.discord_guild_id)
      await applyRole({ guildId: job.discord_guild_id, discordId: user.id, roleId: job.discord_role_id, add, reason: "FBRP roster job" });
    await history(user.id, add ? "job_assign" : "job_remove", { job: jobId });
    await log(i.guild, { title: add ? "Staff job assigned" : "Staff job removed", color: add ? COLORS.success : COLORS.warning, actor: i.user.id, target: user.id, fields: [["Job", clean(job.name)]] }, "roster");
    return card("Staff job updated", {
      color: COLORS.success,
      rows: [["Member", who(user.id)], ["Job", clean(job.name)], ["Action", add ? "Assigned" : "Removed"]],
    });
  }
  if (sub === "profile") {
    const row = await db.one(`SELECT m.*,r.name rank,c.name category,r.weekly_seconds
      FROM staff_roster_members m LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id LEFT JOIN staff_roster_categories c ON c.id=r.category_id WHERE m.discord_id=?`, [user.id]);
    if (!row) throw new Error("That member has no roster record.");
    const [discipline, historyRows, hours, jobs] = await Promise.all([
      db.query("SELECT * FROM staff_roster_discipline WHERE discord_id=? ORDER BY created_at DESC LIMIT 10", [user.id]),
      db.query("SELECT * FROM staff_roster_history WHERE discord_id=? ORDER BY created_at DESC LIMIT 10", [user.id]),
      db.one("SELECT COALESCE(SUM(CASE WHEN ended_at IS NULL THEN FLOOR((?-started_at)/1000) ELSE seconds END),0) seconds FROM staff_shifts WHERE discord_id=? AND started_at>=?", [Date.now(), user.id, Date.now() - 7 * 86400000]),
      db.query("SELECT j.name FROM staff_roster_member_jobs m JOIN staff_roster_jobs j ON j.id=m.job_id WHERE m.discord_id=? ORDER BY j.sort_order,j.name", [user.id]),
    ]);
    return card(`Roster profile: ${clean(user.username)}`, {
      description: `${mention(user.id)}\n\`${user.id}\``,
      rows: [
        ["Rank", clean(row.rank || row.rank_name) || "None"],
        ["Category", clean(row.category) || "Uncategorized"],
        ["Callsign", row.callsign ? String(row.callsign) : "Unassigned"],
        ["Status", humanize(row.status)],
        ["Weekly hours", `${(Number(hours?.seconds || 0) / 3600).toFixed(1)} of ${(Number(row.weekly_seconds || 0) / 3600).toFixed(1)}`],
        ["Tickets handled", String(row.tickets_handled || 0)],
        ["Jobs", jobs.map((j) => clean(j.name)).join(", ") || "None", false],
        ["Note", clean(row.activity_note, 500) || "None", false],
        ["Discipline", chunkLines(discipline.map((d) => `\`#${d.id}\` · ${humanize(d.kind)} · ${d.revoked_at ? "revoked" : "active"} · ${clean(d.reason, 100)}`))[0] || "None", false],
        ["Recent history", chunkLines(historyRows.map((h) => `${humanize(h.action)} · ${when(h.created_at)}`))[0] || "None", false],
      ],
    });
  }
  if (sub === "add") {
    const rank = await rankById(i.options.getInteger("rank", true));
    const displayName = user.globalName || user.username;
    await db.query(`INSERT INTO staff_roster_members(discord_id,display_name,username,rank_name,rank_id,callsign,status,joined_at,rank_changed_at,updated_at,added_by)
      VALUES(?,?,?,?,?,?,'active',?,?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),username=VALUES(username),rank_name=VALUES(rank_name),rank_id=VALUES(rank_id),callsign=VALUES(callsign),status='active',rank_changed_at=VALUES(rank_changed_at),updated_at=VALUES(updated_at),removed_at=NULL,removed_by=NULL,removal_reason=NULL`,
    [user.id, displayName, user.username, rank.name, rank.id, null, Date.now(), Date.now(), Date.now(), i.user.id]);
    await history(user.id, "add_or_update", { rank: rank.id, callsign: "rank_ordered" });
    await setRankRole(rank, user.id, true);
    await setStaffTeamRole(user.id, true);
    const rebalance = await rebalanceStaffCallsigns(i.user.id);
    const callsign = rebalance.assignments.find((row) => row.discordId === user.id)?.callsign ?? null;
    await log(i.guild, {
      title: "Roster member saved",
      color: COLORS.success,
      actor: i.user.id,
      target: user.id,
      fields: [["Rank", rank.name], ["Callsign", callsign === null ? "Not assigned (Trial Head Administrator and above only)" : String(callsign)]],
    }, "roster");
    return card("Roster member saved", {
      color: COLORS.success,
      rows: [["Member", who(user.id)], ["Rank", rank.name], ["Callsign", callsign === null ? "Not assigned (Trial Head Administrator and above only)" : String(callsign)]],
    });
  }
  if (sub === "remove") {
    const reason = clean(i.options.getString("reason", true), 300);
    await db.query("UPDATE staff_roster_members SET status='removed',callsign=NULL,removed_at=?,removed_by=?,removal_reason=?,updated_at=? WHERE discord_id=?", [Date.now(), i.user.id, reason, Date.now(), user.id]);
    await history(user.id, "remove", { reason });
    await setStaffTeamRole(user.id, false);
    await rebalanceStaffCallsigns(i.user.id);
    await log(i.guild, {
      title: "Roster member removed",
      color: COLORS.warning,
      actor: i.user.id,
      target: user.id,
      fields: [["Reason", reason, false]],
    }, "roster");
    return card("Roster member removed", { color: COLORS.warning, rows: [["Member", who(user.id)], ["Reason", reason, false]] });
  }
  if (sub === "status") {
    const status = i.options.getString("status", true);
    await db.query("UPDATE staff_roster_members SET status=?,updated_at=? WHERE discord_id=?", [status, Date.now(), user.id]);
    await history(user.id, "status", { status });
    await log(i.guild, { title: "Roster status changed", color: COLORS.primary, actor: i.user.id, target: user.id, fields: [["Status", humanize(status)]] }, "roster");
    return card("Roster status updated", { color: COLORS.success, rows: [["Member", who(user.id)], ["Status", humanize(status)]] });
  }
  if (sub === "callsign") {
    const rebalance = await rebalanceStaffCallsigns(i.user.id);
    const assignment = rebalance.assignments.find((row) => row.discordId === user.id);
    if (!assignment) throw new Error("That member is not on the active roster.");
    const callsign = assignment.callsign;
    return card("Callsigns rank-ordered", {
      color: COLORS.success,
      rows: [["Member", who(user.id)], ["Callsign", callsign === null ? "Not eligible (Trial Head Administrator and above only)" : String(callsign)], ["Changed assignments", String(rebalance.changes.length)]],
    });
  }
  if (sub === "note") {
    const note = clean(i.options.getString("note", true), 500);
    await db.query("UPDATE staff_roster_members SET activity_note=?,updated_at=? WHERE discord_id=?", [note, Date.now(), user.id]);
    await history(user.id, "note", { note });
    await log(i.guild, { title: "Roster note updated", color: COLORS.primary, actor: i.user.id, target: user.id, fields: [["Note", note, false]] }, "roster");
    return card("Roster note updated", { color: COLORS.success, rows: [["Member", who(user.id)], ["Note", note, false]] });
  }
  const kind = i.options.getString("kind", true), reason = clean(i.options.getString("reason", true), 500);
  const result = await db.query("INSERT INTO staff_roster_discipline(discord_id,kind,reason,actor_id,created_at) VALUES(?,?,?,?,?)", [user.id, kind, reason, i.user.id, Date.now()]);
  await history(user.id, "discipline", { id: result.insertId, kind, reason });
  await dm(user, `Staff ${kind} in ${i.guild.name}`, [["Record", `${humanize(kind)} #${result.insertId}`], ["Reason", reason, false]]);
  await log(i.guild, {
    title: "Staff discipline issued",
    color: COLORS.warning,
    actor: i.user.id,
    target: user.id,
    fields: [["Record", `${humanize(kind)} #${result.insertId}`], ["Reason", reason, false]],
  }, "roster");
  return card("Staff discipline issued", {
    color: COLORS.warning,
    rows: [["Member", who(user.id)], ["Record", `${humanize(kind)} #${result.insertId}`], ["Reason", reason, false]],
  });
}


/**
 * The onboarding DM (rank, optional callsign and a one-use staff-server invite) is sent by the main bot: the
 * request goes into staff_welcome_queue and src/staff-queue.js sends it and posts the result.
 */
async function queueStaffWelcome(user, rank, callsign, requestedBy) {
  await db.query(
    `INSERT INTO staff_welcome_queue(discord_id,rank_name,callsign,staff_only,requested_by,requested_at,attempts)
     VALUES(?,?,?,?,?,?,0)
     ON DUPLICATE KEY UPDATE rank_name=VALUES(rank_name),callsign=VALUES(callsign),staff_only=VALUES(staff_only),requested_by=VALUES(requested_by),requested_at=VALUES(requested_at),attempts=0`,
    [user.id, String(rank.name).slice(0, 80), callsign === null ? "" : String(callsign), rank.group_staff_only ? 1 : 0, String(requestedBy), Date.now()],
  );
  return { queued: true };
}

const COORDINATION_JOBS = ["Staff Coordination Team", "Gang Coordination Team", "Department Coordinator", "Business Coordinator"];
const COORDINATION_GROUPS = [COORD_TEAM_GROUP, "gang_coordination_team", "department_coordinator", "business_coordinator"];

/** Owner only: every coordinator staff job (with its staff-server role) and every coordinator ACE group. */
async function coordAllCommand(i, sub) {
  if (sub === "remove") return coordAllRemove(i);
  requireOwner(i, "add someone to every coordinator job and ACE group");
  const user = i.options.getUser("member", true);
  if (user.bot) throw new Error("Bots cannot be coordinators.");
  const jobs = await db.query(
    `SELECT * FROM staff_roster_jobs WHERE name IN (${COORDINATION_JOBS.map(() => "?").join(",")}) ORDER BY sort_order`,
    COORDINATION_JOBS,
  );
  const onRoster = Boolean(await db.one("SELECT 1 ok FROM staff_roster_members WHERE discord_id=? AND status<>'removed'", [user.id]));
  const roles = [];
  const missing = [];
  for (const job of jobs) {
    await db.query("INSERT IGNORE INTO staff_roster_member_jobs(discord_id,job_id,assigned_by,assigned_at) VALUES(?,?,?,?)", [user.id, job.id, i.user.id, Date.now()]);
    const outcome = job.discord_role_id && job.discord_guild_id
      ? await applyRole({ guildId: job.discord_guild_id, discordId: user.id, roleId: job.discord_role_id, add: true, reason: `/coordall by ${i.user.tag}` })
      : "missing";
    (["done", "queued", "skipped"].includes(outcome) ? roles : missing).push(job.name);
  }
  for (const group of COORDINATION_GROUPS)
    await db.query("INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,'manual',?,?)", [user.id, group, i.user.id, Date.now()]);
  await audit(i.user.id, "coordall.add", user.id, { jobs: jobs.map((job) => job.name), groups: COORDINATION_GROUPS });
  await syncNetwork(user.id).catch(() => {});
  return card("Coordinator added everywhere", {
    color: COLORS.success,
    rows: [
      ["Member", who(user.id)],
      ["Jobs", jobs.map((job) => clean(job.name)).join("\n") || "None found"],
      ["ACE groups", COORDINATION_GROUPS.map((group) => `\`${group}\``).join("\n")],
      ["Roles given (other servers are queued for the main bot)", roles.join("\n") || "None"],
      ...(missing.length ? [["Role not given (no role bound to the job)", missing.join("\n")]] : []),
      ...(onRoster ? [] : [["Note", "Not on the staff roster, so the jobs only show once they are added to it."]]),
    ],
  });
}



/** Owner only: strips every coordination job, role and ACE group (the opposite of /coordall add). */
async function coordAllRemove(i) {
  requireOwner(i, "remove someone from every coordinator job and ACE group");
  const user = await targetUser(i);
  const jobs = await db.query(
    `SELECT * FROM staff_roster_jobs WHERE name IN (${COORDINATION_JOBS.map(() => "?").join(",")})`,
    COORDINATION_JOBS,
  );
  // Job roles, the coordination ranks and team role, and every staff-server role that sources a coordinator group.
  const sources = await db.query(
    `SELECT role_id FROM discord_role_sources WHERE guild_id=? AND group_name IN (${COORDINATION_GROUPS.map(() => "?").join(",")})`,
    [STAFF_GUILD_ID, ...COORDINATION_GROUPS],
  );
  const staffRoles = new Set([
    ...COORD_RANKS.map((rank) => rank.roleId), TEAM_ROLE_ID, LEADERSHIP_ROLE_ID,
    ...sources.map((row) => String(row.role_id)),
    ...jobs.filter((job) => String(job.discord_guild_id) === STAFF_GUILD_ID && job.discord_role_id).map((job) => String(job.discord_role_id)),
  ]);
  const removed = [];
  for (const roleId of staffRoles)
    if ((await applyRole({ guildId: STAFF_GUILD_ID, discordId: user.id, roleId, add: false, reason: `/coordall remove by ${i.user.tag}` })) === "done") removed.push(roleId);
  // Jobs bound to roles in other servers are removed through the main bot.
  for (const job of jobs)
    if (job.discord_role_id && job.discord_guild_id && String(job.discord_guild_id) !== STAFF_GUILD_ID)
      await applyRole({ guildId: job.discord_guild_id, discordId: user.id, roleId: job.discord_role_id, add: false, reason: `/coordall remove by ${i.user.tag}` });
  // Every sector's own coordination roles (gang, department, business), through the main bot, and its roster.
  const sectorReport = [];
  for (const sector of SECTORS) {
    const { guildId, roleIds } = sectorCoordRoles(sector);
    let queued = 0;
    if (guildId)
      for (const roleId of roleIds) {
        const outcome = await applyRole({ guildId, discordId: user.id, roleId, add: false, reason: `/coordall remove by ${i.user.tag}` });
        if (outcome === "queued" || outcome === "done") queued++;
      }
    let roster = { rows: 0 };
    try {
      roster = clearSectorRoster(sector, user.id);
    } catch (error) {
      roster = { rows: 0, skipped: error.message || String(error) };
    }
    sectorReport.push(`**${sector.label}:** ${queued} role${queued === 1 ? "" : "s"} · ${roster.rows} roster row${roster.rows === 1 ? "" : "s"}${roster.skipped ? ` (${roster.skipped})` : ""}`);
  }
  if (jobs.length)
    await db.query(`DELETE FROM staff_roster_member_jobs WHERE discord_id=? AND job_id IN (${jobs.map(() => "?").join(",")})`, [user.id, ...jobs.map((job) => job.id)]);
  await db.query(
    `DELETE FROM ace_memberships WHERE discord_id=? AND group_name IN (${COORDINATION_GROUPS.map(() => "?").join(",")}) AND origin IN ('manual',?)`,
    [user.id, ...COORDINATION_GROUPS, COORD_ACE_ORIGIN],
  );
  await audit(i.user.id, "coordall.remove", user.id, { jobs: jobs.map((job) => job.name), groups: COORDINATION_GROUPS, roles: removed, sectors: sectorReport });
  await syncNetwork(user.id);
  await log(i.guild, { title: "Coordinator removed everywhere", color: COLORS.warning, actor: i.user.id, target: user.id, fields: [["Jobs", jobs.map((job) => clean(job.name)).join("\n") || "None"], ["ACE groups", COORDINATION_GROUPS.map((g) => `\`${g}\``).join(" ")]] }, "staff_audit");
  return card("Coordinator removed everywhere", {
    color: COLORS.warning,
    rows: [
      ["Member", who(user.id)],
      ["Jobs cleared", jobs.map((job) => clean(job.name)).join("\n") || "None found"],
      ["ACE groups cleared", COORDINATION_GROUPS.map((group) => `\`${group}\``).join("\n")],
      ["Staff-server roles removed", String(removed.length)],
      ["Sector rosters", sectorReport.join("\n"), false],
      ["Note", "Sector roles are removed by the main bot within a few seconds. Each sector bot redraws its coordination board from its roles."],
    ],
  });
}

export const handlers = {
  staff: staffCommand,
  callsign: callsignCommand,
  roster: rosterCommand,
  exam: examCommand,
  coordall: coordAllCommand,
};

export { staffRankAutocomplete, staffRemovalAutocomplete, activeStaff, setStaffTeamRole, syncStaffTeamRoles, reconcileRosterJobs, reconcileAllRosterJobs, rebalanceStaffCallsigns };
