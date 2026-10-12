import { db, demand, dm, history, post, rankOf } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, mention, respond, ts } from "./util.js";
import { separate } from "./roster.js";

/** Removes the person from the agency, records the blacklist and bans them from the IAA server. */
export async function blacklistUser(guild, userId, { reason, actorId, caseId = null, ban = true }) {
  const user = await guild.client.users.fetch(userId).catch(() => null);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member && (await rankOf(member))) await separate(guild, member, { actorId, reason, kind: "blacklist" });
  await db.query(
    `INSERT INTO iaa_blacklist(discord_id,username,reason,actor_id,case_id,active,created_at) VALUES(?,?,?,?,?,1,?)
     ON DUPLICATE KEY UPDATE username=VALUES(username),reason=VALUES(reason),actor_id=VALUES(actor_id),case_id=VALUES(case_id),active=1,created_at=VALUES(created_at),lifted_by=NULL,lifted_at=NULL,lift_reason=NULL`,
    [String(userId), user?.username || String(userId), clip(reason, 1000), String(actorId), caseId, Date.now()],
  );
  await history(userId, "blacklist", actorId, { reason });
  if (user && member) await dm(user, { embeds: [card("🚫 IAA blacklist", { color: C.red, description: `You have been blacklisted from the FBRP Internal Affairs Agency.\n\n${reason}` })] });
  const banned = ban
    ? await guild.bans.create(String(userId), { reason: clip(`IAA blacklist: ${reason}`, 500) }).then(
        () => true,
        () => false,
      )
    : false;
  await post(
    guild,
    "blacklists",
    {
      embeds: [
        card(`🚫 Blacklisted · ${user?.username || userId}`, {
          color: C.red,
          thumbnail: user?.displayAvatarURL(),
          fields: [["User", `${mention(userId)}\n\`${userId}\``], ["By", mention(actorId)], ["Banned", banned ? "Yes" : "No"], ["Reason", reason, false]],
        }),
      ],
    },
    "botLogs",
  );
  return { banned };
}

export async function command(i, actor, sub) {
  if (sub === "list") {
    await demand(actor, "discipline.warn");
    const rows = await db.query("SELECT * FROM iaa_blacklist WHERE active=1 ORDER BY created_at DESC LIMIT 40");
    const lines = rows.map((r) => `🚫 **${clip(r.username, 40)}** \`${r.discord_id}\` · ${ts(r.created_at, "d")} · ${mention(r.actor_id)}\n  ↳ ${clip(r.reason, 120)}`);
    return respond(i, { embeds: [card(`🚫 IAA blacklist · ${rows.length}`, { color: C.red, description: lines.join("\n").slice(0, 4000) || "Nobody is blacklisted." })] });
  }
  await demand(actor, "discipline.blacklist");
  const user = i.options.getUser("user", true);
  const reason = i.options.getString("reason", true);
  if (sub === "add") {
    if (user.id === i.user.id) throw new UserError("You cannot blacklist yourself.");
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    const rank = member ? await rankOf(member) : null;
    if (rank && !actor.admin && rank.level >= actor.level) throw new UserError(`${user} holds **${rank.name}**, which is not below your rank.`);
    await i.deferReply(EPHEMERAL);
    const { banned } = await blacklistUser(i.guild, user.id, { reason, actorId: i.user.id, ban: i.options.getBoolean("ban") ?? true });
    return respond(i, `${user} is blacklisted${banned ? " and banned" : ""}.`);
  }
  if (sub === "remove") {
    const result = await db.query("UPDATE iaa_blacklist SET active=0,lifted_by=?,lifted_at=?,lift_reason=? WHERE discord_id=? AND active=1", [i.user.id, Date.now(), clip(reason, 500), user.id]);
    if (!result.affectedRows) throw new UserError(`${user} is not blacklisted.`);
    const unbanned = await i.guild.bans.remove(user.id, clip(`IAA blacklist lifted: ${reason}`, 500)).then(
      () => true,
      () => false,
    );
    await history(user.id, "unblacklist", i.user.id, { reason });
    await post(
      i.guild,
      "blacklists",
      { embeds: [card(`✅ Blacklist lifted · ${user.username}`, { color: C.green, fields: [["User", `${user}`], ["By", `${i.user}`], ["Unbanned", unbanned ? "Yes" : "No"], ["Reason", reason, false]] })] },
      "botLogs",
    );
    return respond(i, `${user} was removed from the blacklist${unbanned ? " and unbanned" : ""}.`);
  }
}
