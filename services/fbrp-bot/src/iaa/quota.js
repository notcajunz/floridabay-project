import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { allMembers, config, db, demand, ranks } from "./store.js";
import { C, EPHEMERAL, card, hours, meter, respond, ts, weekStart } from "./util.js";

/**
 * Weekly quotas, measured from in-game hours. The game writes `organization_shifts` when an agent
 * uses /duty; the IAA organization is the one tied to the IAA server or with slug `iaa`.
 */

/** SQL predicate selecting the IAA organization as alias `o`. Bind the guild id twice. */
export const ORG = `(o.guild_id=? OR o.slug='iaa' OR EXISTS(SELECT 1 FROM organization_role_requirements r WHERE r.org_id=o.id AND r.guild_id=?))`;

// An open shift counts up to its last heartbeat, so a crashed server cannot inflate it.
const SECONDS = "CASE WHEN s.ended_at IS NULL THEN GREATEST(0,FLOOR((s.heartbeat_at-s.started_at)/1000)) ELSE s.seconds END";
const FROM = `FROM organization_shifts s JOIN organizations o ON o.id=s.org_id WHERE ${ORG}`;

const bind = (guild, ...rest) => [guild.id, guild.id, ...rest];

export async function weekSeconds(guild, discordId, since = weekStart(), until = Date.now()) {
  const row = await db.one(`SELECT COALESCE(SUM(${SECONDS}),0) s ${FROM} AND s.discord_id=? AND s.started_at>=? AND s.started_at<?`, bind(guild, String(discordId), since, until));
  return Number(row.s);
}

export async function totals(guild, discordId) {
  const row = await db.one(`SELECT COALESCE(SUM(${SECONDS}),0) s,COUNT(*) n ${FROM} AND s.discord_id=?`, bind(guild, String(discordId)));
  return { seconds: Number(row.s), shifts: Number(row.n) };
}

export async function topThisWeek(guild, limit = 10) {
  return db.query(`SELECT s.discord_id,SUM(${SECONDS}) s ${FROM} AND s.started_at>=? GROUP BY s.discord_id ORDER BY s DESC LIMIT ${Number(limit)}`, bind(guild, weekStart()));
}

export const quotaSeconds = async (tier, member) => {
  const cfg = await config();
  const reduced = member && cfg.roles.reducedHours && member.roles.cache.has(cfg.roles.reducedHours);
  return Math.round((cfg.settings.quotas[tier] ?? 0) * 60 * (reduced ? 0.5 : 1));
};

/**
 * Every active agent below quota for the week starting `since`, skipping agents on approved leave
 * during that week and agents who joined after it began.
 */
export async function underQuota(guild, since) {
  const until = since + 604800000;
  const cfg = await config();
  const ladder = await ranks();
  const members = await allMembers(guild);
  const leaves = new Set(
    (await db.query("SELECT discord_id FROM iaa_leaves WHERE status IN ('approved','ended') AND starts_at<? AND ends_at>?", [until, since])).map((r) => r.discord_id),
  );
  const joined = Object.fromEntries((await db.query("SELECT discord_id,joined_at FROM iaa_members")).map((r) => [r.discord_id, Number(r.joined_at)]));
  const done = Object.fromEntries(
    (await db.query(`SELECT s.discord_id,SUM(${SECONDS}) s ${FROM} AND s.started_at>=? AND s.started_at<? GROUP BY s.discord_id`, bind(guild, since, until))).map((r) => [r.discord_id, Number(r.s)]),
  );
  const out = [];
  for (const member of members.values()) {
    if (member.user.bot) continue;
    const rank = ladder.find((r) => member.roles.cache.has(r.role_id));
    if (!rank) continue;
    if (cfg.roles.suspended && member.roles.cache.has(cfg.roles.suspended)) continue;
    if (leaves.has(member.id) || (joined[member.id] || member.joinedTimestamp) > since) continue;
    const quota = await quotaSeconds(rank.tier, member);
    const got = done[member.id] || 0;
    if (quota && got < quota) out.push({ member, rank, done: got, quota });
  }
  return out.sort((a, b) => a.done / a.quota - b.done / b.quota);
}

export async function activityReport(i, actor) {
  await demand(actor, "activity.manage");
  await i.deferReply(EPHEMERAL);
  const which = i.options.getString("week") || "last";
  const since = which === "current" ? weekStart() : weekStart() - 604800000;
  const list = await underQuota(i.guild, since);
  const lines = list.map((x) => `${meter(x.done, x.quota, 6)} ${x.member} · ${hours(x.done)} / ${hours(x.quota)} · *${x.rank.name}*`);
  const components =
    which === "last" && list.length
      ? [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`iaa:act:warn:${since}`)
              .setLabel(`Issue ${list.length} inactivity warning${list.length === 1 ? "" : "s"}`)
              .setEmoji("💤")
              .setStyle(ButtonStyle.Danger),
          ),
        ]
      : [];
  return respond(i, {
    embeds: [
      card(`📊 Activity report · week of ${ts(since, "D")}`, {
        color: list.length ? C.amber : C.green,
        description: `${list.length ? `**${list.length}** agent(s) under quota (in-game hours). Agents on leave, suspended, or who joined mid-week are excluded.\n\n` : "Everyone met quota. 🎉"}${lines.join("\n")}`.slice(0, 4000),
      }),
    ],
    components,
  });
}

export async function applyInactivity(i, actor, since) {
  await demand(actor, "activity.manage");
  await i.deferUpdate();
  const { issue } = await import("./discipline.js");
  const cfg = await config();
  const list = await underQuota(i.guild, Number(since));
  let issued = 0;
  for (const x of list) {
    if (cfg.roles.inactivity && x.member.roles.cache.has(cfg.roles.inactivity)) continue;
    if (!actor.admin && x.rank.level >= actor.level) continue;
    await issue(i.guild, x.member, {
      kind: "inactivity",
      reason: `Below weekly quota for the week of ${new Date(Number(since)).toISOString().slice(0, 10)}: ${hours(x.done)} of ${hours(x.quota)}.`,
      actorId: i.user.id,
    });
    issued++;
  }
  return i.editReply({ embeds: [card("💤 Inactivity warnings issued", { color: C.amber, description: `Issued **${issued}** warning(s). Agents already warned or not below your rank were skipped.` })], components: [] });
}
