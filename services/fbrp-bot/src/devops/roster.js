import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { authority, config, db, demand, demandOutranks, dm, history, post, rankById, rankOf, ranks, teamRoleIds } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, humanDuration, mention, pages, rel, respond, roleMention, shortRole, ts } from "./util.js";
import { refreshPanels, rosterData } from "./panels.js";

/* ------------------------------------------------------------------ helpers */

export const memberRecord = (id) => db.one("SELECT * FROM devops_members WHERE discord_id=?", [String(id)]);

export async function fetchMember(guild, user) {
  const member = await guild.members.fetch(user.id ?? user).catch(() => null);
  if (!member) throw new UserError(`${mention(user.id ?? user)} is not in this server.`);
  if (member.user.bot) throw new UserError("Bots cannot be on the roster.");
  return member;
}

/**
 * One API call per change: computes the member's full role list so rank, group and base roles swap
 * atomically (and only one audit-log entry is written).
 */
export async function setRoles(member, { rank = undefined, add = [], remove = [] }, reason) {
  const cfg = await config();
  const ladder = await ranks();
  const next = new Set(member.roles.cache.keys());
  next.delete(member.guild.id);
  if (rank !== undefined) {
    for (const r of ladder) next.delete(r.role_id);
    if (rank) {
      next.add(rank.role_id);
      if (cfg.roles.base) next.add(cfg.roles.base);
      if (cfg.roles.leadership) {
        if (rank.tier === "leadership") next.add(cfg.roles.leadership);
        else next.delete(cfg.roles.leadership);
      }
    } else {
      if (cfg.roles.base) next.delete(cfg.roles.base);
      if (cfg.roles.leadership) next.delete(cfg.roles.leadership);
    }
  }
  for (const id of remove) next.delete(id);
  for (const id of add) if (id) next.add(id);
  const before = [...member.roles.cache.keys()].filter((id) => id !== member.guild.id).sort().join();
  if ([...next].sort().join() === before) return member;
  return member.roles.set([...next], clip(reason || "DevOps roster", 400));
}

/** Same line as the other FBRP rosters: `@member --> Rank | @actor | date`. */
export const movementLine = (memberId, label, actorId) => `${mention(memberId)} --> ${label} | ${mention(actorId)} | ${ts(Date.now(), "D")}`;

const MOVES = {
  hire: { icon: "🎉", title: "New developer", color: C.green },
  promotion: { icon: "▲", title: "Promotion", color: C.green },
  demotion: { icon: "▼", title: "Demotion", color: C.red },
  removal: { icon: "🚪", title: "Removed from the team", color: C.grey },
  assignment: { icon: "🧩", title: "Team assignment", color: C.purple },
  sync: { icon: "🔄", title: "Rank change (manual)", color: C.amber },
};

export async function movement(guild, kind, { member, from, to, actorId, reason, label }) {
  const meta = MOVES[kind] || MOVES.sync;
  const text = label || (to ? to.name : "Removed");
  await post(
    guild,
    "movements",
    {
      content: movementLine(member.id, text, actorId),
      embeds: [
        card(`${meta.icon} ${meta.title}`, {
          color: meta.color,
          thumbnail: member.displayAvatarURL?.() || member.user?.displayAvatarURL?.(),
          fields: [
            ["Developer", `${member}`],
            from || to ? ["Rank", `${from ? from.name : "—"} ➜ **${to ? to.name : "—"}**`] : null,
            ["By", actorId ? mention(actorId) : "System"],
            reason ? ["Reason", reason, false] : null,
          ],
        }),
      ],
    },
    "audit",
    "botLogs",
  );
}

/* ------------------------------------------------------------------ rank picking */

export async function rankAutocomplete(i, actor) {
  const query = String(i.options.getFocused() || "").toLowerCase();
  const list = (await ranks())
    .filter((r) => actor.admin || r.level < actor.level)
    .filter((r) => !query || r.name.toLowerCase().includes(query))
    .sort((a, b) => a.level - b.level)
    .slice(0, 25);
  return i.respond(list.map((r) => ({ name: `${r.level} · ${r.name}`, value: r.role_id })));
}

export async function allRankAutocomplete(i) {
  const query = String(i.options.getFocused() || "").toLowerCase();
  const list = (await ranks()).filter((r) => !query || r.name.toLowerCase().includes(query)).sort((a, b) => a.level - b.level);
  return i.respond(list.slice(0, 25).map((r) => ({ name: `${r.level} · ${r.name}`, value: r.role_id })));
}

async function pickRank(i, actor, name = "rank", required = true) {
  const id = i.options.getString(name, required);
  if (!id) return null;
  const rank = (await rankById(id)) || (await ranks()).find((r) => r.name.toLowerCase() === id.toLowerCase());
  if (!rank) throw new UserError("Pick a rank from the list.");
  if (!actor.admin && rank.level >= actor.level) throw new UserError(`You can only hand out ranks below your own (**${actor.rank?.name || "none"}**).`);
  return rank;
}

/* ------------------------------------------------------------------ commands */

async function trialEnd(rank) {
  if (rank.level !== 1) return null;
  return Date.now() + (await config()).settings.trialDays * 86400000;
}

export async function add(i, actor) {
  await demand(actor, "roster.manage");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  const rank = (await pickRank(i, actor, "rank", false)) || (await ranks()).find((r) => r.level === 1);
  if (!actor.admin && rank.level >= actor.level) throw new UserError(`You can only hand out ranks below your own (**${actor.rank?.name || "none"}**).`);
  const current = await rankOf(member);
  if (current) throw new UserError(`${member} is already **${current.name}**. Use \`/dev promote\` or \`/dev demote\`.`);
  const reason = i.options.getString("reason") || null;
  await i.deferReply(EPHEMERAL);
  await setRoles(member, { rank }, `Appointed ${rank.name} by ${i.user.tag}`);
  const now = Date.now();
  const trial = await trialEnd(rank);
  await db.query(
    `INSERT INTO devops_members(discord_id,username,rank_role_id,status,joined_at,rank_changed_at,trial_ends_at,trial_notified,updated_at) VALUES(?,?,?,'active',?,?,?,0,?)
     ON DUPLICATE KEY UPDATE username=VALUES(username),rank_role_id=VALUES(rank_role_id),status='active',joined_at=VALUES(joined_at),rank_changed_at=VALUES(rank_changed_at),trial_ends_at=VALUES(trial_ends_at),trial_notified=0,removed_at=NULL,updated_at=VALUES(updated_at)`,
    [member.id, member.user.username, rank.role_id, now, now, trial, now],
  );
  await history(member.id, "add", i.user.id, { to: rank.role_id, reason });
  await movement(i.guild, "hire", { member, to: rank, actorId: i.user.id, reason });
  const cfg = await config();
  await dm(member.user, {
    embeds: [
      card("🎉 Welcome to the FBRP development team", {
        color: C.teal,
        description: [
          `You have been appointed **${rank.name}** in the Florida Bay development team.`,
          trial ? `\nYour trial period runs until ${ts(trial, "D")}. Leadership will review your work then.` : null,
          `\nPost your daily update with \`/standup\`, pick up work with \`/task list\`, and find everything in **${i.guild.name}**.`,
          cfg.channels.rules ? `Read the rules in <#${cfg.channels.rules}> first.` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    ],
  });
  refreshPanels(i.guild, "chain");
  return respond(i, `${member} is now **${rank.name}**.${trial ? ` Trial review ${ts(trial, "R")}.` : ""}`);
}

export async function move(i, actor, direction) {
  await demand(actor, "roster.manage");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  const from = await demandOutranks(actor, member);
  if (!from) throw new UserError(`${member} has no development rank. Use \`/dev add\` first.`);
  const ladder = await ranks();
  let to = await pickRank(i, actor, "rank", false);
  if (!to) {
    const step = ladder.filter((r) => (direction === "promotion" ? r.level > from.level : r.level < from.level));
    to = direction === "promotion" ? step[step.length - 1] : step[0];
    if (!to) throw new UserError(`${member} is already at the ${direction === "promotion" ? "top" : "bottom"} of the ladder.`);
    if (!actor.admin && to.level >= actor.level) throw new UserError(`The next rank (**${to.name}**) is not below your own.`);
  }
  if (direction === "promotion" && to.level <= from.level) throw new UserError(`**${to.name}** is not above **${from.name}**.`);
  if (direction === "demotion" && to.level >= from.level) throw new UserError(`**${to.name}** is not below **${from.name}**.`);
  const reason = i.options.getString("reason", true);

  await i.deferReply(EPHEMERAL);
  const record = await memberRecord(member.id);
  await setRoles(member, { rank: to }, `${direction === "promotion" ? "Promoted" : "Demoted"} to ${to.name} by ${i.user.tag}`);
  const now = Date.now();
  const trial = await trialEnd(to);
  await db.query(
    `INSERT INTO devops_members(discord_id,username,rank_role_id,status,joined_at,rank_changed_at,trial_ends_at,trial_notified,updated_at) VALUES(?,?,?,'active',?,?,?,0,?)
     ON DUPLICATE KEY UPDATE username=VALUES(username),rank_role_id=VALUES(rank_role_id),rank_changed_at=VALUES(rank_changed_at),trial_ends_at=VALUES(trial_ends_at),trial_notified=0,updated_at=VALUES(updated_at)`,
    [member.id, member.user.username, to.role_id, member.joinedTimestamp || now, now, trial, now],
  );
  await history(member.id, direction === "promotion" ? "promote" : "demote", i.user.id, { from: from.role_id, to: to.role_id, reason });
  await movement(i.guild, direction, { member, from, to, actorId: i.user.id, reason });
  await dm(member.user, {
    embeds: [
      card(direction === "promotion" ? "▲ You have been promoted" : "▼ You have been demoted", {
        color: direction === "promotion" ? C.green : C.red,
        description: `**${from.name}** ➜ **${to.name}**\n\n${reason}`,
      }),
    ],
  });
  refreshPanels(i.guild, "chain");
  return respond(i, `${member}: **${from.name}** ➜ **${to.name}**${record?.rank_changed_at ? ` (previous rank held since ${ts(record.rank_changed_at, "D")})` : ""}.`);
}

/** Strips every team role. Shared by /dev remove and discipline. */
export async function separate(guild, member, { actorId, reason, kind = "removal" }) {
  const cfg = await config();
  const from = await rankOf(member);
  const strip = await teamRoleIds();
  if (cfg.roles.suspended) strip.add(cfg.roles.suspended);
  await setRoles(member, { rank: null, remove: [...strip] }, clip(`DevOps ${kind}: ${reason}`, 400));
  await db.query("UPDATE devops_members SET status='removed',rank_role_id=NULL,trial_ends_at=NULL,removed_at=?,updated_at=? WHERE discord_id=?", [Date.now(), Date.now(), member.id]);
  await db.query("UPDATE devops_discipline SET active=0 WHERE discord_id=? AND kind IN ('suspension','strike') AND active=1", [member.id]);
  await db.query("UPDATE devops_leaves SET status='cancelled' WHERE discord_id=? AND status IN ('pending','approved')", [member.id]);
  await history(member.id, "remove", actorId, { from: from?.role_id || null, reason });
  await movement(guild, "removal", { member, from, to: null, actorId, reason });
  refreshPanels(guild, "chain");
  return { from };
}

export async function remove(i, actor) {
  await demand(actor, "roster.remove");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  await demandOutranks(actor, member);
  const reason = i.options.getString("reason", true);
  await i.deferReply(EPHEMERAL);
  const { from } = await separate(i.guild, member, { actorId: i.user.id, reason });
  await dm(member.user, { embeds: [card("You have been removed from the FBRP development team", { color: C.grey, description: reason })] });
  return respond(i, `${member} was removed${from ? ` from **${from.name}**` : ""}.`);
}

/* ------------------------------------------------------------------ teams (divisions) */

export async function divisionAutocomplete(i) {
  const cfg = await config();
  const query = String(i.options.getFocused() || "").toLowerCase();
  const list = (cfg.roles.divisions || [])
    .map((id) => i.guild.roles.cache.get(id))
    .filter(Boolean)
    .filter((r) => !query || r.name.toLowerCase().includes(query))
    .slice(0, 25);
  return i.respond(list.map((r) => ({ name: shortRole(r.name), value: r.id })));
}

export async function assign(i, actor) {
  await demand(actor, "roster.manage");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  if (member.id !== actor.id) await demandOutranks(actor, member);
  const cfg = await config();
  const roleId = i.options.getString("team", true);
  if (!(cfg.roles.divisions || []).includes(roleId)) throw new UserError("Pick a team from the list.");
  const role = i.guild.roles.cache.get(roleId);
  const adding = !member.roles.cache.has(roleId);
  await setRoles(member, adding ? { add: [roleId] } : { remove: [roleId] }, `${adding ? "Assigned to" : "Removed from"} ${role?.name} by ${i.user.tag}`);
  await history(member.id, adding ? "assign" : "unassign", i.user.id, { to: roleId, reason: i.options.getString("reason") });
  await movement(i.guild, "assignment", { member, actorId: i.user.id, label: `${adding ? "" : "Left "}${shortRole(role?.name || "team")}` });
  refreshPanels(i.guild, "chain");
  return respond(i, `${member} ${adding ? "joined" : "left"} ${roleMention(roleId)}.`);
}

/* ------------------------------------------------------------------ trial reviews */

const trialButtons = (id) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dv:trial:promote:${id}`).setLabel("Promote to Developer").setEmoji("▲").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`dv:trial:extend:${id}`).setLabel("Extend 7 days").setEmoji("⏳").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`dv:trial:remove:${id}`).setLabel("Remove").setEmoji("🚪").setStyle(ButtonStyle.Danger),
  );

/** Posts a review card for every trial that has ended. */
export async function trialTick(guild) {
  const rows = await db.query("SELECT * FROM devops_members WHERE status='active' AND trial_ends_at IS NOT NULL AND trial_ends_at<=? AND trial_notified=0", [Date.now()]);
  for (const row of rows) {
    const member = await guild.members.fetch(row.discord_id).catch(() => null);
    if (!member) continue;
    const [strikes, tasks, standups] = await Promise.all([
      db.one("SELECT COUNT(*) n FROM devops_discipline WHERE discord_id=? AND kind IN ('warning','strike')", [row.discord_id]),
      db.one("SELECT COUNT(*) n FROM devops_tasks WHERE completed_by=? AND completed_at>=?", [row.discord_id, Number(row.rank_changed_at)]),
      db.one("SELECT COUNT(*) n FROM devops_standups WHERE discord_id=? AND created_at>=?", [row.discord_id, Number(row.rank_changed_at)]),
    ]);
    const message = await post(
      guild,
      "trialReviews",
      {
        embeds: [
          card(`🎓 Trial review due · ${member.displayName}`, {
            color: C.amber,
            thumbnail: member.displayAvatarURL(),
            description: `${member}'s trial period has ended. Decide what happens next.`,
            fields: [
              ["Started", ts(row.rank_changed_at, "D")],
              ["Trial length", humanDuration(Number(row.trial_ends_at) - Number(row.rank_changed_at))],
              ["Tasks completed", String(tasks?.n || 0)],
              ["Standups posted", String(standups?.n || 0)],
              ["Warnings / strikes", String(strikes?.n || 0)],
            ],
            footer: `Trial review · ${member.id}`,
          }),
        ],
        components: [trialButtons(member.id)],
      },
      "leadChat",
      "botLogs",
    );
    if (message) await db.query("UPDATE devops_members SET trial_notified=1 WHERE discord_id=?", [row.discord_id]);
  }
}

export async function trialButton(i, action, id) {
  const actor = await authority(await i.guild.members.fetch(i.user.id));
  await demand(actor, "trial.review");
  const member = await i.guild.members.fetch(id).catch(() => null);
  if (!member) throw new UserError("That developer is no longer in the server.");
  if (member.id === actor.id && !actor.admin) throw new UserError("You cannot decide your own trial.");
  const rank = await rankOf(member);
  if (!rank) throw new UserError("They no longer hold a development rank.");
  await i.deferUpdate();
  const finish = (text, color) =>
    i.message.edit({ embeds: [card(`🎓 Trial review · ${member.displayName}`, { color, description: text, thumbnail: member.displayAvatarURL() })], components: [] }).catch(() => null);
  if (action === "promote") {
    const next = (await ranks()).filter((r) => r.level > rank.level).pop();
    if (!next) throw new UserError("They are already at the top of the ladder.");
    if (!actor.admin && next.level >= actor.level) throw new UserError(`**${next.name}** is not below your rank.`);
    await setRoles(member, { rank: next }, `Trial passed, promoted by ${i.user.tag}`);
    await db.query("UPDATE devops_members SET rank_role_id=?,rank_changed_at=?,trial_ends_at=NULL,trial_notified=0,updated_at=? WHERE discord_id=?", [next.role_id, Date.now(), Date.now(), member.id]);
    await history(member.id, "promote", i.user.id, { from: rank.role_id, to: next.role_id, reason: "Trial passed" });
    await movement(i.guild, "promotion", { member, from: rank, to: next, actorId: i.user.id, reason: "Trial passed" });
    await dm(member.user, { embeds: [card("🎓 Trial passed", { color: C.green, description: `Congratulations! You are now a **${next.name}**.` })] });
    refreshPanels(i.guild, "chain");
    return finish(`✅ Passed. Promoted to **${next.name}** by ${i.user}.`, C.green);
  }
  if (action === "extend") {
    const until = Date.now() + 7 * 86400000;
    await db.query("UPDATE devops_members SET trial_ends_at=?,trial_notified=0,updated_at=? WHERE discord_id=?", [until, Date.now(), member.id]);
    await history(member.id, "trial_extend", i.user.id, { reason: "Trial extended 7 days" });
    await dm(member.user, { embeds: [card("⏳ Trial extended", { color: C.amber, description: `Your trial was extended until ${ts(until, "D")}.` })] });
    return finish(`⏳ Extended to ${ts(until, "D")} by ${i.user}.`, C.amber);
  }
  if (action === "remove") {
    await demand(actor, "roster.remove");
    await demandOutranks(actor, member);
    await separate(i.guild, member, { actorId: i.user.id, reason: "Did not pass trial" });
    await dm(member.user, { embeds: [card("Trial result", { color: C.grey, description: "Thank you for your time. You did not pass your trial period." })] });
    return finish(`🚪 Removed by ${i.user}.`, C.grey);
  }
  throw new UserError("Unknown action.");
}

/* ------------------------------------------------------------------ profile */

export async function profileEmbed(guild, user) {
  const member = await guild.members.fetch(user.id).catch(() => null);
  const record = await memberRecord(user.id);
  const rank = member ? await rankOf(member) : null;
  const cfg = await config();
  const [discipline, awards, leave, recent, tasks, standups] = await Promise.all([
    db.query("SELECT kind,COUNT(*) n,SUM(active) live FROM devops_discipline WHERE discord_id=? GROUP BY kind", [user.id]),
    db.query("SELECT award,COUNT(*) n FROM devops_awards WHERE discord_id=? GROUP BY award", [user.id]),
    db.one("SELECT * FROM devops_leaves WHERE discord_id=? AND status='approved' AND ends_at>? ORDER BY starts_at LIMIT 1", [user.id, Date.now()]),
    db.query("SELECT * FROM devops_history WHERE discord_id=? ORDER BY id DESC LIMIT 5", [user.id]),
    db.one("SELECT SUM(status='done') done, SUM(status<>'done') open FROM devops_tasks WHERE assignee_id=?", [user.id]),
    db.one("SELECT COUNT(*) n, MAX(created_at) last FROM devops_standups WHERE discord_id=?", [user.id]),
  ]);
  const d = Object.fromEntries(discipline.map((r) => [r.kind, r]));
  const disc = ["warning", "strike", "suspension"]
    .filter((k) => d[k])
    .map((k) => `${k[0].toUpperCase()}${k.slice(1)}s: **${d[k].n}**${Number(d[k].live) ? ` (${d[k].live} active)` : ""}`);
  const badges = { commendation: "📜", dotm: "🌟" };
  const flags = [];
  if (member && cfg.roles.suspended && member.roles.cache.has(cfg.roles.suspended)) flags.push("⛔ Suspended");
  if (record?.trial_ends_at && Number(record.trial_ends_at) > Date.now()) flags.push(`🎓 On trial until ${ts(record.trial_ends_at, "D")}`);
  if (leave) flags.push(`🌴 On leave until ${ts(leave.ends_at, "D")}`);
  return card(`🗂️ Developer file · ${member?.displayName || user.username}`, {
    color: rank ? C.blue : C.grey,
    thumbnail: (member || user).displayAvatarURL(),
    description: flags.join("\n") || null,
    fields: [
      ["Rank", rank ? `${roleMention(rank.role_id)}\n${rank.tier === "leadership" ? "Leadership" : "Developer"}` : "None"],
      ["Status", record?.status || "not on roster"],
      ["Joined the team", record ? ts(record.joined_at, "D") : "—"],
      ["Rank held since", record?.rank_changed_at ? `${ts(record.rank_changed_at, "D")} (${rel(record.rank_changed_at)})` : "—"],
      ["Teams", member ? (cfg.roles.divisions || []).filter((id) => member.roles.cache.has(id)).map(roleMention).join("\n") || "—" : "—"],
      ["Tasks", `${Number(tasks?.done || 0)} done · ${Number(tasks?.open || 0)} open`],
      ["Standups", `${standups?.n || 0}${standups?.last ? ` · last ${rel(standups.last)}` : ""}`],
      ["Discipline", disc.join("\n") || "Clean record"],
      ["Awards", awards.map((a) => `${badges[a.award] || "🏅"}×${a.n}`).join("  ") || "—"],
      ["Recent history", recent.map((h) => `${ts(h.created_at, "d")} · ${h.action.replace(/_/g, " ")}${h.to_role ? ` ${roleMention(h.to_role)}` : ""}`).join("\n") || "—", false],
    ],
  });
}

export async function profile(i) {
  const user = i.options.getUser("user") || i.user;
  return respond(i, { embeds: [await profileEmbed(i.guild, user)] });
}

export async function historyCommand(i, actor) {
  const user = i.options.getUser("user", true);
  if (user.id !== i.user.id) await demand(actor, "roster.manage");
  const rows = await db.query("SELECT * FROM devops_history WHERE discord_id=? ORDER BY id DESC LIMIT 40", [user.id]);
  const lines = rows.map(
    (h) =>
      `${ts(h.created_at, "d")} **${h.action.replace(/_/g, " ")}**${h.from_role ? ` ${roleMention(h.from_role)} ➜` : ""}${h.to_role ? ` ${roleMention(h.to_role)}` : ""} · by ${mention(h.actor_id)}${h.reason ? `\n  ↳ ${clip(h.reason, 120)}` : ""}`,
  );
  return respond(i, { embeds: [card(`📜 Service history · ${user.username}`, { description: pages(lines)[0] || "No history yet." })] });
}

export async function rosterCommand(i) {
  const { ladder, byRank } = await rosterData(i.guild);
  const lines = [];
  for (const rank of ladder) {
    const people = byRank.get(rank.role_id);
    if (!people.length) continue;
    lines.push(`\n**${rank.name}** · ${people.length}`);
    for (const p of people) lines.push(`${p.member}${p.flags ? ` ${p.flags}` : ""}`);
  }
  const embeds = pages(lines, 3900).map((text, n) => card(n ? "📱 Team directory (cont.)" : "📱 Development team directory", { color: C.blue, description: text.trim() || "*Nobody on the roster yet.*" }));
  return respond(i, { embeds: embeds.slice(0, 10) });
}

