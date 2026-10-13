import { config, db, demand, dm, history, post } from "./store.js";
import { C, EPHEMERAL, UserError, card, clip, mention, respond, ts } from "./util.js";
import { fetchMember, setRoles } from "./roster.js";
import { allMembers } from "./store.js";

/** /commend give | dotm | list */
export async function command(i, actor, sub) {
  if (sub === "list") {
    const user = i.options.getUser("user") || i.user;
    const rows = await db.query("SELECT * FROM devops_awards WHERE discord_id=? ORDER BY id DESC LIMIT 15", [user.id]);
    const lines = rows.map((r) => `${r.award === "dotm" ? "🌟" : "📜"} ${ts(r.created_at, "d")} · ${clip(r.reason, 120)} — ${mention(r.actor_id)}`);
    return respond(i, { embeds: [card(`🏅 Awards · ${user.username}`, { color: C.gold, description: lines.join("\n") || "No awards yet." })] });
  }
  const isDotm = sub === "dotm";
  await demand(actor, isDotm ? "award.dotm" : "award.give");
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  if (member.id === i.user.id && !actor.admin) throw new UserError("You cannot award yourself.");
  const reason = i.options.getString("reason", true);
  await i.deferReply(EPHEMERAL);
  const cfg = await config();
  const award = isDotm ? "dotm" : "commendation";
  await db.query("INSERT INTO devops_awards(discord_id,award,reason,actor_id,created_at) VALUES(?,?,?,?,?)", [member.id, award, clip(reason, 500), i.user.id, Date.now()]);
  await history(member.id, award, i.user.id, { reason });
  if (isDotm && cfg.roles.dotm) {
    // One holder at a time.
    for (const holder of (await allMembers(i.guild)).values())
      if (holder.id !== member.id && holder.roles.cache.has(cfg.roles.dotm)) await setRoles(holder, { remove: [cfg.roles.dotm] }, "New Developer of the Month").catch(() => null);
    await setRoles(member, { add: [cfg.roles.dotm] }, `Developer of the Month by ${i.user.tag}`);
  }
  await post(i.guild, "commendations", {
    embeds: [
      card(isDotm ? "🌟 Developer of the Month" : "📜 Commendation", {
        color: C.gold,
        thumbnail: member.displayAvatarURL(),
        description: `${member} — ${reason}`,
        fields: [["Awarded by", `${i.user}`]],
      }),
    ],
  });
  await dm(member.user, {
    embeds: [card(isDotm ? "🌟 You are Developer of the Month" : "📜 You received a commendation", { color: C.gold, description: reason })],
  });
  return respond(i, `${isDotm ? "Developer of the Month" : "Commendation"} recorded for ${member}.`);
}
