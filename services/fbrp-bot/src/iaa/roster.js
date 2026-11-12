import { agencyRoleIds, config, db, demand, demandOutranks, dm, history, post, rankById, rankOf, ranks, tierLabel, tierRoleIdsUpTo } from "./store.js";
import { quotaSeconds, totals, weekSeconds } from "./quota.js";
import { C, EPHEMERAL, UserError, card, clip, hours, mention, meter, rel, respond, roleMention, shortRole, ts, pages } from "./util.js";
import { refreshPanels } from "./panels.js";
import { demandSlot, describe, resequence, syncNickname } from "./callsigns.js";
import { offboardDocuments, scheduleRosterSheet } from "./documents-runtime.js";

export { syncNickname };

/* ------------------------------------------------------------------ helpers */

export const memberRecord = (id) => db.one("SELECT * FROM iaa_members WHERE discord_id=?", [String(id)]);

export async function fetchMember(guild, user) {
  const member = await guild.members.fetch(user.id ?? user).catch(() => null);
  if (!member) throw new UserError(`${mention(user.id ?? user)} is not in this server.`);
  if (member.user.bot) throw new UserError("Bots cannot be agents.");
  return member;
}

/**
 * One API call per change: computes the member's full role list so rank, tier and base roles swap
 * atomically (and only one audit-log entry is written).
 */
export async function setRoles(member, { rank = undefined, add = [], remove = [] }, reason) {
  const cfg = await config();
  const ladder = await ranks();
  const next = new Set(member.roles.cache.keys());
  next.delete(member.guild.id);
  if (rank !== undefined) {
    for (const r of ladder) next.delete(r.role_id);
    for (const t of cfg.tiers) if (t.roleId) next.delete(t.roleId);
    if (rank) {
      next.add(rank.role_id);
      // Command tiers stack: High Command also holds Trial High Command, Low Command and Supervisor.
      for (const id of tierRoleIdsUpTo(cfg, rank)) next.add(id);
      if (cfg.roles.base) next.add(cfg.roles.base);
    }
  }
  for (const id of remove) next.delete(id);
  for (const id of add) if (id) next.add(id);
  const before = [...member.roles.cache.keys()].filter((id) => id !== member.guild.id).sort().join();
  if ([...next].sort().join() === before) return member;
  return member.roles.set([...next], clip(reason || "IAA roster", 400));
}

/** Same line as the main bot's staff roster: `@member --> Rank | @actor | date`, no pings. */
export const movementLine = (memberId, label, actorId) => `${mention(memberId)} --> ${label} | ${mention(actorId)} | ${ts(Date.now(), "D")}`;

async function movement(guild, kind, { member, from, to, actorId }) {
  const label = to ? to.name : kind === "retirement" ? "Retired" : "Removed";
  const payload = { content: movementLine(member.id, label, actorId), allowedMentions: { parse: [] } };
  await post(guild, "movements", payload, "botLogs");
  // Anything involving supervisors or command is mirrored to the supervisor section.
  if ([from, to].some((r) => r && r.tier !== "agent")) await post(guild, "supMovements", payload);
  if ([from, to].some((r) => r && /high_command/.test(r.tier))) await post(guild, "cmdMovements", payload);
}

/* ------------------------------------------------------------------ rank picking */

export async function rankAutocomplete(i, actor) {
  const query = String(i.options.getFocused() || "").toLowerCase();
  const list = (await ranks())
    .filter((r) => actor.admin || r.level < actor.level)
    .filter((r) => !query || r.name.toLowerCase().includes(query))
    .slice(0, 25);
  return i.respond(list.map((r) => ({ name: `${String(r.level).padStart(2, "0")} · ${r.name}`, value: r.role_id })));
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

export async function add(i, actor) {
  await demand(actor, "roster.manage");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  const rank = await pickRank(i, actor);
  const current = await rankOf(member);
  if (current) throw new UserError(`${member} is already **${current.name}**. Use \`/iaa promote\` or \`/iaa demote\`.`);
  const banned = await db.one("SELECT reason FROM iaa_blacklist WHERE discord_id=? AND active=1", [member.id]);
  if (banned) throw new UserError(`${member} is on the IAA blacklist: ${banned.reason}`);
  const cfg = await config();
  const reason = i.options.getString("reason") || null;
  const orientation = i.options.getBoolean("orientation") ?? true;
  await demandSlot(rank, member.id);

  await i.deferReply(EPHEMERAL);
  await setRoles(member, { rank, add: [...(cfg.settings.addRoles || []), ...(orientation ? [cfg.roles.orientation] : [])] }, `Appointed ${rank.name} by ${i.user.tag}`);
  const now = Date.now();
  await db.query(
    `INSERT INTO iaa_members(discord_id,username,callsign,rank_role_id,status,joined_at,rank_changed_at,updated_at) VALUES(?,?,NULL,?,'active',?,?,?)
     ON DUPLICATE KEY UPDATE username=VALUES(username),rank_role_id=VALUES(rank_role_id),status='active',joined_at=VALUES(joined_at),rank_changed_at=VALUES(rank_changed_at),removed_at=NULL,updated_at=VALUES(updated_at)`,
    [member.id, member.user.username, rank.role_id, now, now, now],
  );
  const { callsign, others } = describe(await resequence(i.guild, { actorId: i.user.id, reason: `${member.user.username} appointed ${rank.name}` }), member.id);
  await history(member.id, "add", i.user.id, { to: rank.role_id, reason });
  await movement(i.guild, "appointment", { member, to: rank, actorId: i.user.id, reason, callsign });
  await dm(member.user, {
    embeds: [
      card("🦅 Welcome to the Internal Affairs Agency", {
        color: C.gold,
        description: [
          `You have been appointed **${rank.name}** in the FBRP Internal Affairs Agency.`,
          callsign ? `Your callsign is **\`${callsign}\`**.` : null,
          orientation ? "\nYou still need to complete **orientation** before working cases. A supervisor will reach out." : null,
          "\nClock in with /duty in game when you are active, and keep everything you see here confidential.",
        ]
          .filter(Boolean)
          .join("\n"),
      }),
    ],
  });
  refreshPanels(i.guild, "chain", "directory");
  scheduleRosterSheet();
  return respond(i, `${member} is now **${rank.name}**${callsign ? ` (\`${callsign}\`)` : ""}.${others ? ` ${others} other callsign(s) shifted.` : ""}`);
}

export async function move(i, actor, direction) {
  await demand(actor, "roster.manage");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  const from = await demandOutranks(actor, member);
  if (!from) throw new UserError(`${member} has no IAA rank. Use \`/iaa add\` first.`);
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
  await demandSlot(to, member.id);

  await i.deferReply(EPHEMERAL);
  const record = await memberRecord(member.id);
  await setRoles(member, { rank: to }, `${direction === "promotion" ? "Promoted" : "Demoted"} to ${to.name} by ${i.user.tag}`);
  const now = Date.now();
  await db.query(
    `INSERT INTO iaa_members(discord_id,username,rank_role_id,status,joined_at,rank_changed_at,updated_at) VALUES(?,?,?,'active',?,?,?)
     ON DUPLICATE KEY UPDATE username=VALUES(username),rank_role_id=VALUES(rank_role_id),rank_changed_at=VALUES(rank_changed_at),updated_at=VALUES(updated_at)`,
    [member.id, member.user.username, to.role_id, member.joinedTimestamp || now, now, now],
  );
  const changes = await resequence(i.guild, { actorId: i.user.id, reason: `${member.user.username} ${direction === "promotion" ? "promoted" : "demoted"} to ${to.name}` });
  const { others } = describe(changes, member.id);
  const callsign = changes.find((c) => c.id === member.id)?.to ?? record?.callsign ?? null;
  await history(member.id, direction === "promotion" ? "promote" : "demote", i.user.id, { from: from.role_id, to: to.role_id, reason });
  await movement(i.guild, direction, { member, from, to, actorId: i.user.id, reason, callsign });
  await dm(member.user, {
    embeds: [
      card(direction === "promotion" ? "▲ You have been promoted" : "▼ You have been demoted", {
        color: direction === "promotion" ? C.green : C.red,
        description: `**${from.name}** ➜ **${to.name}**\n\n${reason}`,
      }),
    ],
  });
  refreshPanels(i.guild, "chain", "directory");
  scheduleRosterSheet();
  return respond(i, `${member}: **${from.name}** ➜ **${to.name}**${callsign ? ` · \`${callsign}\`` : ""}${record?.rank_changed_at ? ` (previous rank held since ${ts(record.rank_changed_at, "D")})` : ""}.${others ? ` ${others} other callsign(s) shifted.` : ""}`);
}

/** Strips every agency role. Shared by /iaa remove, case outcomes and the blacklist. */
export async function separate(guild, member, { actorId, reason, retire = false, kind = "separation" }) {
  const cfg = await config();
  const from = await rankOf(member);
  const strip = await agencyRoleIds();
  const add = [];
  if (retire && from) {
    const retired = cfg.roles.retired || {};
    const tier = await tierLabel(from.tier);
    const role = retired[from.name.toLowerCase()] || retired[tier.toLowerCase()] || retired[tier.toLowerCase().replace(/s$/, "")];
    if (role) add.push(role);
  }
  if (cfg.roles.suspended) strip.add(cfg.roles.suspended);
  await setRoles(member, { rank: null, remove: [...strip], add }, clip(`IAA ${kind}: ${reason}`, 400));
  const record = await memberRecord(member.id);
  await db.query("UPDATE iaa_members SET status='removed',callsign=NULL,rank_role_id=NULL,removed_at=?,updated_at=? WHERE discord_id=?", [Date.now(), Date.now(), member.id]);
  await db.query("UPDATE iaa_discipline SET active=0 WHERE discord_id=? AND kind IN ('suspension','strike','inactivity') AND active=1", [member.id]);
  await syncNickname(member, null);
  await history(member.id, retire ? "retire" : "remove", actorId, { from: from?.role_id || null, reason });
  await movement(guild, retire ? "retirement" : "separation", { member, from, to: null, actorId, reason, callsign: record?.callsign });
  await resequence(guild, { actorId, reason: `${member.user.username} left the roster` });
  refreshPanels(guild, "chain", "directory");
  await offboardDocuments(member.id, { by: actorId, reason: `${retire ? "retired" : "removed"}: ${reason}` });
  return { from, retiredRole: add[0] || null };
}

/**
 * Automatic offboarding for someone who leaves the IAA server while still on the roster. Their roles
 * are already gone with them, so only the record, callsign, discipline flags and document access need closing.
 */
export async function autoSeparate(guild, user) {
  const record = await memberRecord(user.id);
  if (!record || record.status === "removed") return null;
  const from = record.rank_role_id ? await rankById(record.rank_role_id) : null;
  const now = Date.now();
  await db.query("UPDATE iaa_members SET status='removed',callsign=NULL,rank_role_id=NULL,removed_at=?,updated_at=? WHERE discord_id=?", [now, now, user.id]);
  await db.query("UPDATE iaa_discipline SET active=0 WHERE discord_id=? AND kind IN ('suspension','strike','inactivity') AND active=1", [user.id]);
  const actorId = guild.client.user.id;
  const reason = "Left the IAA server";
  await history(user.id, "remove", actorId, { from: from?.role_id || null, reason });
  await movement(guild, "separation", { member: { id: user.id }, from, to: null, actorId, reason, callsign: record.callsign });
  await resequence(guild, { actorId, reason: `${user.username} left the server` });
  refreshPanels(guild, "chain", "directory");
  await offboardDocuments(user.id, { by: actorId, reason });
  return { from };
}

export async function remove(i, actor) {
  await demand(actor, "roster.remove");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  await demandOutranks(actor, member);
  const reason = i.options.getString("reason", true);
  const retire = i.options.getBoolean("retire") ?? false;
  await i.deferReply(EPHEMERAL);
  const { from, retiredRole } = await separate(i.guild, member, { actorId: i.user.id, reason, retire });
  await dm(member.user, {
    embeds: [card(retire ? "🎖️ Retired from the IAA" : "You have been removed from the IAA", { color: retire ? C.gold : C.grey, description: reason })],
  });
  return respond(i, `${member} was ${retire ? "retired" : "removed"}${from ? ` from **${from.name}**` : ""}.${retiredRole ? ` Granted ${roleMention(retiredRole)}.` : ""}`);
}

/** Recomputes every callsign from the roster (also picks up rank roles changed by hand). */
export async function callsigns(i, actor) {
  await demand(actor, "roster.manage");
  await i.deferReply(EPHEMERAL);
  const changes = await resequence(i.guild, { actorId: i.user.id, reason: "Manual re-sync" });
  refreshPanels(i.guild, "chain", "directory");
  return respond(i, changes.length ? `Re-synced: **${changes.length}** callsign(s) changed. See the callsign log.` : "Every callsign is already correct.");
}

export async function orientation(i, actor) {
  await demand(actor, "roster.manage");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  const passed = i.options.getString("result", true) === "pass";
  const notes = i.options.getString("notes") || null;
  const cfg = await config();
  if (passed && cfg.roles.orientation) await setRoles(member, { remove: [cfg.roles.orientation] }, `Orientation passed (${i.user.tag})`);
  await history(member.id, passed ? "orientation_pass" : "orientation_fail", i.user.id, { reason: notes });
  await post(
    i.guild,
    "orientation",
    {
      embeds: [
        card(passed ? "🎓 Orientation passed" : "📕 Orientation not passed", {
          color: passed ? C.green : C.amber,
          thumbnail: member.displayAvatarURL(),
          fields: [["Agent", `${member}`], ["Instructor", `${i.user}`], notes ? ["Notes", notes, false] : null],
        }),
      ],
    },
    "botLogs",
  );
  if (passed) await dm(member.user, { embeds: [card("🎓 Orientation complete", { color: C.green, description: "You are cleared for duty. Welcome aboard, agent." })] });
  return respond(i, `Orientation for ${member} recorded as **${passed ? "passed" : "not passed"}**.`);
}

export async function divisionAutocomplete(i) {
  const cfg = await config();
  const query = String(i.options.getFocused() || "").toLowerCase();
  const ids = [...(cfg.roles.divisions || []), ...(cfg.roles.positions || [])];
  const list = ids
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
  const roleId = i.options.getString("assignment", true);
  if (![...(cfg.roles.divisions || []), ...(cfg.roles.positions || [])].includes(roleId)) throw new UserError("Pick a division or position from the list.");
  const role = i.guild.roles.cache.get(roleId);
  const adding = !member.roles.cache.has(roleId);
  await setRoles(member, adding ? { add: [roleId] } : { remove: [roleId] }, `${adding ? "Assigned to" : "Removed from"} ${role?.name} by ${i.user.tag}`);
  await history(member.id, adding ? "assign" : "unassign", i.user.id, { to: roleId, reason: i.options.getString("reason") });
  await post(
    i.guild,
    "movements",
    { content: movementLine(member.id, `${adding ? "" : "Left "}${shortRole(role?.name || "division")}`, i.user.id), allowedMentions: { parse: [] } },
    "botLogs",
  );
  refreshPanels(i.guild, "chain");
  return respond(i, `${member} ${adding ? "joined" : "left"} ${roleMention(roleId)}.`);
}

/* ------------------------------------------------------------------ profile */

export async function profileEmbed(guild, user) {
  const member = await guild.members.fetch(user.id).catch(() => null);
  const record = await memberRecord(user.id);
  const rank = member ? await rankOf(member) : null;
  const cfg = await config();
  const [discipline, subjectCases, ledCases, awards, leave, recent, week, total, blacklisted] = await Promise.all([
    db.query("SELECT kind,COUNT(*) n,SUM(active) live FROM iaa_discipline WHERE discord_id=? GROUP BY kind", [user.id]),
    db.query("SELECT status,verdict FROM iaa_cases WHERE subject_id=?", [user.id]),
    db.one("SELECT COUNT(*) n,SUM(status='closed') closed FROM iaa_cases WHERE lead_id=?", [user.id]),
    db.query("SELECT award,COUNT(*) n FROM iaa_awards WHERE discord_id=? GROUP BY award", [user.id]),
    db.one("SELECT * FROM iaa_leaves WHERE discord_id=? AND status='approved' AND ends_at>? ORDER BY starts_at LIMIT 1", [user.id, Date.now()]),
    db.query("SELECT * FROM iaa_history WHERE discord_id=? ORDER BY id DESC LIMIT 5", [user.id]),
    weekSeconds(guild, user.id),
    totals(guild, user.id),
    db.one("SELECT reason FROM iaa_blacklist WHERE discord_id=? AND active=1", [user.id]),
  ]);
  const quota = rank ? await quotaSeconds(rank.tier, member) : 0;
  const d = Object.fromEntries(discipline.map((r) => [r.kind, r]));
  const disc = ["warning", "strike", "suspension", "inactivity"]
    .filter((k) => d[k])
    .map((k) => `${k[0].toUpperCase()}${k.slice(1)}s: **${d[k].n}**${Number(d[k].live) ? ` (${d[k].live} active)` : ""}`);
  const badges = { gold: "🥇", silver: "🥈", bronze: "🥉", aotm: "🌟", commendation: "📜" };
  const flags = [];
  if (member && cfg.roles.underInvestigation && member.roles.cache.has(cfg.roles.underInvestigation)) flags.push("🔎 Under investigation");
  if (member && cfg.roles.suspended && member.roles.cache.has(cfg.roles.suspended)) flags.push("⛔ Suspended");
  if (member && cfg.roles.orientation && member.roles.cache.has(cfg.roles.orientation)) flags.push("🎓 Needs orientation");
  if (leave) flags.push(`🌴 On leave until ${ts(leave.ends_at, "D")}`);
  if (blacklisted) flags.push(`🚫 IAA blacklisted: ${blacklisted.reason}`);

  const verdicts = subjectCases.filter((c) => c.status === "closed");
  return card(`🗂️ Personnel file · ${member?.displayName || user.username}`, {
    color: rank ? C.navy : C.grey,
    thumbnail: (member || user).displayAvatarURL(),
    description: flags.join("\n") || null,
    fields: [
      ["Rank", rank ? `${roleMention(rank.role_id)}\n${await tierLabel(rank.tier)}` : "None"],
      ["Callsign", record?.callsign ? `\`${record.callsign}\`` : "—"],
      ["Status", record?.status || "not on roster"],
      ["Joined agency", record ? ts(record.joined_at, "D") : "—"],
      ["Rank held since", record?.rank_changed_at ? `${ts(record.rank_changed_at, "D")} (${rel(record.rank_changed_at)})` : "—"],
      ["Divisions", member ? [...(cfg.roles.divisions || []), ...(cfg.roles.positions || [])].filter((id) => member.roles.cache.has(id)).map(roleMention).join("\n") || "—" : "—"],
      ["This week (in-game)", quota ? `${hours(week)} / ${hours(quota)}\n${meter(week, quota)}` : hours(week)],
      ["All time (in-game)", `${hours(total.seconds)} over ${total.shifts} shift${total.shifts === 1 ? "" : "s"}`],
      ["Cases led", `${ledCases?.n || 0} (${ledCases?.closed || 0} closed)`],
      ["Discipline", disc.join("\n") || "Clean record"],
      ["As case subject", subjectCases.length ? `${subjectCases.length} case(s), ${verdicts.filter((c) => c.verdict === "substantiated").length} substantiated` : "Never"],
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
  const rows = await db.query("SELECT * FROM iaa_history WHERE discord_id=? ORDER BY id DESC LIMIT 40", [user.id]);
  const lines = rows.map(
    (h) =>
      `${ts(h.created_at, "d")} **${h.action.replace(/_/g, " ")}**${h.from_role ? ` ${roleMention(h.from_role)} ➜` : ""}${h.to_role ? ` ${roleMention(h.to_role)}` : ""} · by ${mention(h.actor_id)}${h.reason ? `\n  ↳ ${clip(h.reason, 120)}` : ""}`,
  );
  return respond(i, { embeds: [card(`📜 Service history · ${user.username}`, { description: pages(lines)[0] || "No history yet." })] });
}

export async function rosterCommand(i) {
  const { directoryEmbeds } = await import("./panels.js");
  const embeds = await directoryEmbeds(i.guild);
  return respond(i, { embeds: embeds.slice(0, 10) });
}

