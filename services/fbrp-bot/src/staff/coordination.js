import { EmbedBuilder } from "discord.js";
import { audit, db, staffLevel, superuserIds } from "../database.js";
import { COLORS, card, chunkLines, who } from "../ui.js";
import {
  CHAIN_CHANNEL_ID,
  COORD_ACE_ORIGIN,
  COORD_LOG_CHANNEL_ID,
  COORD_RANKS,
  COORD_TEAM_GROUP,
  LEADERSHIP_ROLE_ID,
  MANAGER_RANK,
  STAFF_GUILD_ID,
  TEAM_ROLE_ID,
} from "./config.js";
import { log, syncNetwork, targetUser } from "./legacy.js";

/**
 * The staff coordination team: ranks and jobs are staff-server roles, the ACE group
 * `staff_coordination_team` is kept in line with them, and the chain-of-command board in the staff
 * server's #chain-of-command is rebuilt from whoever holds the roles.
 */

const MANAGER_INDEX = COORD_RANKS.findIndex((rank) => rank.name === MANAGER_RANK);
const RANK_ROLE_IDS = COORD_RANKS.map((rank) => rank.roleId);
const TEAM_JOB_NAME = "Staff Coordination Team";
const DAY = 86400000;

export function createCoordination({ client }) {
  let acmOrder = { at: 0, value: 825 };
  const timers = { chain: null };

  const rankIndex = (roleIds) => {
    const index = COORD_RANKS.findIndex((rank) => roleIds.has(rank.roleId));
    return index < 0 ? null : index;
  };
  const onTeam = (roleIds) => roleIds.has(TEAM_ROLE_ID) || rankIndex(roleIds) !== null;

  /** The ACE groups a member with these staff-server roles should hold because of the team. */
  async function wantedGroups(roleIds) {
    return new Set(onTeam(roleIds) ? [COORD_TEAM_GROUP] : []);
  }

  /** Brings one member's derived ACE rows in line with their roles. Returns what changed. */
  async function ensureAce(discordId, roleIds, actorId = "staff-bot", { notify = true } = {}) {
    const id = String(discordId);
    const wanted = await wantedGroups(roleIds);
    const existing = new Set(
      (await db.query(
        "SELECT group_name FROM ace_memberships WHERE discord_id=? AND origin=? AND group_name=?",
        [id, COORD_ACE_ORIGIN, COORD_TEAM_GROUP],
      )).map((row) => String(row.group_name)),
    );
    const added = [...wanted].filter((name) => !existing.has(name));
    const removed = [...existing].filter((name) => !wanted.has(name));
    for (const name of added)
      await db.query(
        "INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,?,?,?)",
        [id, name, COORD_ACE_ORIGIN, String(actorId), Date.now()],
      );
    for (const name of removed)
      await db.query("DELETE FROM ace_memberships WHERE discord_id=? AND group_name=? AND origin=?", [id, name, COORD_ACE_ORIGIN]);
    if ((added.length || removed.length) && notify) {
      await audit(String(actorId), "coord.ace", id, { added, removed });
      await syncNetwork(id, "staff-coord");
    }
    return { added, removed, wanted };
  }

  /** Mirrors the "Staff Coordination Team" roster job from the member's roles. */
  async function syncJobs(discordId, roleIds, actorId = "role-sync") {
    const job = await db.one("SELECT id FROM staff_roster_jobs WHERE name=?", [TEAM_JOB_NAME]);
    if (!job) return;
    if (onTeam(roleIds))
      await db.query("INSERT IGNORE INTO staff_roster_member_jobs(discord_id,job_id,assigned_by,assigned_at) VALUES(?,?,?,?)", [String(discordId), job.id, String(actorId), Date.now()]);
    else await db.query("DELETE FROM staff_roster_member_jobs WHERE discord_id=? AND job_id=?", [String(discordId), job.id]);
  }

  /* -------------------------------------------------------------- authority */

  async function actorInfo(i) {
    const member = await i.guild.members.fetch(i.user.id).catch(() => null);
    const roleIds = new Set(member?.roles.cache.keys() || []);
    const index = rankIndex(roleIds);
    const [level, floor] = await Promise.all([staffLevel(i.user.id), acmFloor()]);
    const bypass = superuserIds().has(i.user.id) || level >= floor;
    return { index, bypass, isManager: bypass || (index !== null && index <= MANAGER_INDEX) };
  }

  async function acmFloor() {
    if (Date.now() - acmOrder.at > 60000) {
      const row = await db.one("SELECT rank_order FROM ace_groups WHERE name='assistant_community_manager'").catch(() => null);
      acmOrder = { at: Date.now(), value: Number(row?.rank_order ?? 825) };
    }
    return acmOrder.value;
  }

  function requireManager(actor) {
    if (!actor.isManager) throw new Error(`Only ${MANAGER_RANK} and above (or Assistant Community Manager and above) can manage the coordination team.`);
  }

  /** Coordination staff may only act on ranks strictly below their own. */
  function requireOutranks(actor, index, action) {
    if (actor.bypass || index === null || index === undefined) return;
    if (actor.index !== null && index <= actor.index) throw new Error(`You can only ${action} below your own rank.`);
  }

  /* -------------------------------------------------------------- chain of command board */

  async function snapshot(guild) {
    const byRank = COORD_RANKS.map(() => []);
    const team = new Set();
    for (const member of guild.members.cache.values()) {
      if (member.user.bot) continue;
      const roleIds = new Set(member.roles.cache.keys());
      if (!onTeam(roleIds)) continue;
      team.add(member.id);
      const index = rankIndex(roleIds);
      if (index !== null) byRank[index].push(member);
    }
    const order = (a, b) => a.displayName.localeCompare(b.displayName);
    byRank.forEach((list) => list.sort(order));
    return { byRank, team };
  }

  async function renderChain(guild) {
    const data = await snapshot(guild);
    const embeds = [
      new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle("Florida Bay Roleplay | Staff Coordination Team")
        .setDescription("The staff coordination team, from the top down. Contact the first appropriate coordinator for your issue before escalating it.")
        .addFields(
          { name: "Members", value: String(data.team.size), inline: true },
          { name: "Last updated", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        )
        .setFooter({ text: "Florida Bay Roleplay · Live chain of command" }),
    ];
    COORD_RANKS.forEach((rank, index) => {
      const members = data.byRank[index];
      const role = guild.roles.cache.get(rank.roleId);
      embeds.push(
        new EmbedBuilder()
          .setColor(role?.color || COLORS.primary)
          .setTitle(rank.name)
          .setDescription(members.length ? members.map((member) => `<@${member.id}>`).join("\n").slice(0, 4000) : "*Vacant*"),
      );
    });
    return embeds;
  }

  async function chainState() {
    const row = await db.one("SELECT value FROM bot_config WHERE `key`='staff_coord_chain'").catch(() => null);
    if (!row) return null;
    try {
      return typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    } catch {
      return null;
    }
  }

  async function refreshChain() {
    const guild = client.guilds.cache.get(STAFF_GUILD_ID);
    if (!guild) return null;
    const channel = await guild.channels.fetch(CHAIN_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased()) throw new Error("The chain-of-command channel is unavailable.");
    const payload = { content: "", embeds: await renderChain(guild), allowedMentions: { parse: [] } };
    const state = await chainState();
    const previousId = state && String(state.channel_id) === channel.id ? state.message_ids?.[0] : null;
    let message = previousId ? await channel.messages.fetch(previousId).catch(() => null) : null;
    if (message && message.author.id !== client.user.id) message = null;
    message = message ? await message.edit(payload) : await channel.send(payload);
    await db.query(
      "INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES('staff_coord_chain',?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
      [JSON.stringify({ channel_id: channel.id, message_ids: [message.id] }), client.user.id, Date.now()],
    );
    return message;
  }

  function scheduleChain(delay = 4000) {
    clearTimeout(timers.chain);
    timers.chain = setTimeout(() => void refreshChain().catch((error) => console.error("[FBRP staff] chain board:", error.message || error)), delay);
    timers.chain.unref?.();
  }

  /** `@member --> Hired as ... | date | @actor` in #sct-audits (the staff audit channel if that is unreachable). */
  async function movement(guild, memberId, text, actorId) {
    const content = `<@${memberId}> --> ${text} | <t:${Math.floor(Date.now() / 1000)}:D> | <@${actorId}>`;
    const channel = await client.channels.fetch(COORD_LOG_CHANNEL_ID).catch(() => null);
    if (channel?.isTextBased()) return channel.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
    await log(guild, { content }, "staff_audit");
  }

  /* -------------------------------------------------------------- reconcile */

  /** One member changed: keep ACE rows, jobs and the board right. */
  async function onMemberChange(member) {
    if (member.guild.id !== STAFF_GUILD_ID || member.user.bot) return;
    const roleIds = new Set(member.roles.cache.keys());
    await ensureAce(member.id, roleIds, "role-sync");
    await syncJobs(member.id, roleIds);
    scheduleChain();
  }

  async function reconcileAll(guild, actorId = "role-sync") {
    const members = [...guild.members.cache.values()].filter((member) => !member.user.bot);
    const wantedBy = new Map();
    for (const member of members) wantedBy.set(member.id, await wantedGroups(new Set(member.roles.cache.keys())));
    const rows = await db.query(
      "SELECT discord_id,group_name FROM ace_memberships WHERE origin=? AND group_name=?",
      [COORD_ACE_ORIGIN, COORD_TEAM_GROUP],
    );
    const changed = new Set();
    // Only members still in the server are authoritative. Someone who left keeps nothing derived.
    for (const row of rows) {
      const wanted = wantedBy.get(String(row.discord_id));
      if (!wanted || !wanted.has(String(row.group_name))) {
        await db.query("DELETE FROM ace_memberships WHERE discord_id=? AND group_name=? AND origin=?", [row.discord_id, row.group_name, COORD_ACE_ORIGIN]);
        changed.add(String(row.discord_id));
      }
    }
    const have = new Set(rows.map((row) => `${row.discord_id}:${row.group_name}`));
    for (const [id, wanted] of wantedBy)
      for (const name of wanted)
        if (!have.has(`${id}:${name}`)) {
          await db.query("INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,?,?,?)", [id, name, COORD_ACE_ORIGIN, String(actorId), Date.now()]);
          changed.add(id);
        }
    for (const member of members) await syncJobs(member.id, new Set(member.roles.cache.keys()), actorId);
    for (const id of changed) await syncNetwork(id, "staff-coord");
    if (changed.size) await audit(String(actorId), "coord.reconcile", null, { changed: [...changed] });
    return { checked: members.length, changed: [...changed] };
  }

  /* -------------------------------------------------------------- hours */

  async function hoursFor(ids, days) {
    if (!ids.length) return new Map();
    const since = Date.now() - days * DAY;
    const now = Date.now();
    const rows = await db.query(
      `SELECT discord_id,COUNT(*) shifts,COALESCE(SUM(CASE WHEN ended_at IS NULL THEN FLOOR((?-started_at)/1000) ELSE seconds END),0) seconds
         FROM staff_shifts WHERE started_at>=? AND discord_id IN (${ids.map(() => "?").join(",")}) GROUP BY discord_id`,
      [now, since, ...ids],
    );
    return new Map(rows.map((row) => [String(row.discord_id), { seconds: Number(row.seconds), shifts: Number(row.shifts) }]));
  }

  async function weeklyTargets(ids) {
    if (!ids.length) return new Map();
    const rows = await db.query(
      `SELECT m.discord_id,r.weekly_seconds FROM staff_roster_members m JOIN staff_roster_ranks r ON r.id=m.rank_id
        WHERE m.status<>'removed' AND m.discord_id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    return new Map(rows.map((row) => [String(row.discord_id), Number(row.weekly_seconds || 0)]));
  }

  const hoursText = (seconds) => `${(Number(seconds) / 3600).toFixed(1)}h`;

  /* -------------------------------------------------------------- commands */

  async function command(i, sub) {
    if (i.guildId !== STAFF_GUILD_ID) throw new Error("The coordination team is managed from the staff server.");
    const guild = i.guild;
    const actor = await actorInfo(i);

    if (sub === "list") {
      const data = await snapshot(guild);
      const rows = COORD_RANKS.map((rank, index) => [rank.name, data.byRank[index].map((m) => `<@${m.id}>`).join(" ") || "Vacant", false]);
      return card("Staff coordination team", { description: `${data.team.size} member${data.team.size === 1 ? "" : "s"} · ACE group \`${COORD_TEAM_GROUP}\``, rows });
    }

    if (sub === "hours" || sub === "leaderboard") {
      const days = i.options.getInteger("days") || 7;
      const data = await snapshot(guild);
      if (sub === "hours") {
        const target = i.options.getUser("member");
        if (target && target.id !== i.user.id) requireManager(actor);
        const user = target || i.user;
        if (!data.team.has(user.id)) throw new Error(`${user.id === i.user.id ? "You are" : "That member is"} not on the staff coordination team.`);
        const [hours, weekly] = await Promise.all([hoursFor([user.id], days), weeklyTargets([user.id])]);
        const row = hours.get(user.id) || { seconds: 0, shifts: 0 };
        const need = weekly.get(user.id) || 0;
        const rows = [
          ["Member", who(user.id)],
          [`Time on duty (${days}d)`, hoursText(row.seconds)],
          ["Shifts", String(row.shifts)],
        ];
        if (need && days === 7) rows.push(["Weekly requirement", `${hoursText(row.seconds)} of ${hoursText(need)} · ${row.seconds >= need ? "met" : "not met"}`, false]);
        return card("Coordination hours", { rows, footer: `Florida Bay Roleplay · Last ${days} days` });
      }
      requireManager(actor);
      const ids = [...data.team];
      const [hours, weekly] = await Promise.all([hoursFor(ids, days), weeklyTargets(ids)]);
      const lines = ids
        .map((id) => ({ id, ...(hours.get(id) || { seconds: 0, shifts: 0 }), need: weekly.get(id) || 0 }))
        .sort((a, b) => b.seconds - a.seconds)
        .map((row, index) => `\`${String(index + 1).padStart(2, "0")}\` <@${row.id}> · **${hoursText(row.seconds)}** over ${row.shifts} shift${row.shifts === 1 ? "" : "s"}${days === 7 && row.need ? ` · ${row.seconds >= row.need ? "✅" : "⚠️"} ${hoursText(row.need)} needed` : ""}`);
      return card("Coordination leaderboard", {
        description: chunkLines(lines, 3900)[0] || "Nobody is on the coordination team yet.",
        footer: `Florida Bay Roleplay · Last ${days} days`,
      });
    }

    requireManager(actor);

    if (sub === "sync") {
      const result = await reconcileAll(guild, i.user.id);
      await refreshChain().catch(() => null);
      return card("Coordination team synced", {
        color: COLORS.success,
        rows: [["Members checked", String(result.checked)], ["ACE changes", String(result.changed.length)]],
      });
    }

    const user = await targetUser(i);
    if (user.bot) throw new Error("Bots cannot be coordinators.");
    const member = await guild.members.fetch(user.id).catch(() => null);

    if (sub === "add") {
      if (!member) throw new Error(`${user.username} is not in the staff server.`);
      const rank = COORD_RANKS.find((item) => item.name === i.options.getString("rank", true));
      if (!rank) throw new Error("Unknown coordination rank.");
      const newIndex = COORD_RANKS.indexOf(rank);
      const held = new Set(member.roles.cache.keys());
      const previous = rankIndex(held);
      requireOutranks(actor, newIndex, "assign ranks");
      requireOutranks(actor, previous, "change coordinators");
      if (user.id === i.user.id && !actor.bypass) throw new Error("You cannot change your own coordination rank.");
      const add = [rank.roleId, TEAM_ROLE_ID, ...(rank.leadership ? [LEADERSHIP_ROLE_ID] : [])].filter(Boolean);
      const drop = [...RANK_ROLE_IDS.filter((id) => id !== rank.roleId), ...(rank.leadership ? [] : [LEADERSHIP_ROLE_ID])].filter((id) => held.has(id));
      if (drop.length) await member.roles.remove(drop, `Coordinator rank set by ${i.user.tag}`);
      await member.roles.add(add.filter((id) => !held.has(id)), `Coordinator rank set by ${i.user.tag}`);
      for (const id of drop) held.delete(id);
      for (const id of add) held.add(id);
      const ace = await ensureAce(user.id, held, i.user.id);
      await syncJobs(user.id, held, i.user.id);
      const action = previous === null ? `Hired as ${rank.name}` : newIndex < previous ? `Promoted to ${rank.name}` : newIndex > previous ? `Demoted to ${rank.name}` : `Confirmed as ${rank.name}`;
      await audit(i.user.id, "coord.rank", user.id, { rank: rank.name, previous: previous === null ? null : COORD_RANKS[previous].name, ace });
      await movement(guild, user.id, action, i.user.id);
      scheduleChain(1500);
      return card("Coordination rank set", {
        color: COLORS.success,
        description: `<@${user.id}>: ${action}.`,
        rows: [
          ["Member", who(user.id)],
          ["ACE groups", [...ace.wanted].map((name) => `\`${name}\``).join(" ") || "None"],
          ...(ace.added.length ? [["Newly added", ace.added.map((name) => `\`${name}\``).join(" ")]] : []),
        ],
      });
    }

    if (sub === "remove") {
      if (!member && !(await db.one("SELECT 1 ok FROM ace_memberships WHERE discord_id=? AND group_name=? LIMIT 1", [user.id, COORD_TEAM_GROUP])))
        throw new Error(`${user.username} is not on the coordination team.`);
      const held = new Set(member?.roles.cache.keys() || []);
      const previous = rankIndex(held);
      requireOutranks(actor, previous, "remove coordinators");
      if (user.id === i.user.id && !actor.bypass) throw new Error("You cannot remove yourself from the team.");
      const reason = i.options.getString("reason", true);
      const drop = [...RANK_ROLE_IDS, TEAM_ROLE_ID, LEADERSHIP_ROLE_ID].filter((id) => held.has(id));
      if (member && drop.length) await member.roles.remove(drop, `Coordinator ${reason.toLowerCase()} by ${i.user.tag}`);
      for (const id of drop) held.delete(id);
      // /coordall and the ACE tools write manual rows, so a removal clears those too.
      await db.query(
        "DELETE FROM ace_memberships WHERE discord_id=? AND group_name=? AND origin IN (?,'manual')",
        [user.id, COORD_TEAM_GROUP, COORD_ACE_ORIGIN],
      );
      await syncJobs(user.id, held, i.user.id);
      await syncNetwork(user.id, "staff-coord");
      await audit(i.user.id, "coord.remove", user.id, { reason, roles: drop });
      await movement(guild, user.id, `${reason} from the Staff Coordination Team`, i.user.id);
      scheduleChain(1500);
      return card("Coordinator removed", {
        color: COLORS.warning,
        rows: [["Member", who(user.id)], ["Reason", reason], ["Roles removed", String(drop.length)], ["ACE group cleared", `\`${COORD_TEAM_GROUP}\``, false]],
      });
    }

    throw new Error("Unknown coordination action.");
  }

  return { command, onMemberChange, reconcileAll, refreshChain, scheduleChain, ensureAce, snapshot };
}
