import { allMembers, config, db, demand, dm, history, post } from "./store.js";
import { C, UserError, card, mention, respond } from "./util.js";
import { fetchMember, setRoles } from "./roster.js";

export const AWARDS = {
  commendation: { label: "Letter of Commendation", icon: "📜", role: null, perm: "award.give", color: C.blue },
  bronze: { label: "Bronze Medal for Service Excellence", icon: "🥉", role: "bronze", perm: "award.medal", color: 0xc77f40 },
  silver: { label: "Silver Medal for Service Excellence", icon: "🥈", role: "silver", perm: "award.medal", color: 0xa7a7a7 },
  gold: { label: "Gold Medal for Service Excellence", icon: "🥇", role: "gold", perm: "award.medal", color: 0xe8c432 },
  aotm: { label: "Agent of the Month", icon: "🌟", role: "aotm", perm: "award.medal", color: 0xe91e63 },
};

export async function command(i, actor) {
  const kind = i.options.getString("award", true);
  const award = AWARDS[kind];
  if (!award) throw new UserError("Unknown award.");
  await demand(actor, award.perm);
  const member = await fetchMember(i.guild, i.options.getUser("user", true));
  if (member.id === i.user.id && !actor.admin) throw new UserError("You cannot decorate yourself.");
  const citation = i.options.getString("citation", true);
  const cfg = await config();
  const roleId = award.role ? cfg.roles[award.role] : null;

  // Agent of the Month passes from the previous holder to the new one.
  if (kind === "aotm" && roleId) {
    const holders = (await allMembers(i.guild)).filter((m) => m.roles.cache.has(roleId) && m.id !== member.id);
    for (const holder of holders.values()) await setRoles(holder, { remove: [roleId] }, "Agent of the Month passed on");
  }
  if (roleId) await setRoles(member, { add: [roleId] }, `${award.label} awarded by ${i.user.tag}`);
  await db.query("INSERT INTO iaa_awards(discord_id,award,citation,actor_id,created_at) VALUES(?,?,?,?,?)", [member.id, kind, citation, i.user.id, Date.now()]);
  await history(member.id, `award_${kind}`, i.user.id, { reason: citation });
  const total = await db.one("SELECT COUNT(*) n FROM iaa_awards WHERE discord_id=?", [member.id]);
  const embed = card(`${award.icon} ${award.label}`, {
    color: award.color,
    thumbnail: member.displayAvatarURL(),
    description: `Awarded to ${member}\n\n> ${citation.replace(/\n/g, "\n> ")}`,
    fields: [["Presented by", mention(i.user.id)], ["Decorations held", String(total.n)]],
  });
  await post(i.guild, "badges", { embeds: [embed] }, "botLogs");
  await dm(member.user, { embeds: [embed] });
  return respond(i, `${award.icon} ${member} received the **${award.label}**.`);
}
