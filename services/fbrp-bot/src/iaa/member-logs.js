import { C, card, mention, ts } from "./util.js";

export const MAIN_GUILD_ID = String(process.env.IAA_MAIN_GUILD_ID || "1557594282976747550");
export const MAIN_LEAVE_LOG_CHANNEL_ID = String(process.env.IAA_MAIN_LEAVE_LOG_CHANNEL_ID || "1564407236862808154");

const duration = (ms) => {
  const days = Math.max(0, Math.floor(Number(ms) / 86_400_000));
  if (days >= 365) return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`;
  if (days >= 30) return `${Math.floor(days / 30)}mo ${days % 30}d`;
  return `${days}d`;
};

/** A main-server departure log with enough context to identify and review the member. */
export function mainLeaveEmbed(member, now = Date.now()) {
  const joinedAt = Number(member.joinedTimestamp) || null;
  const createdAt = Number(member.user?.createdTimestamp) || null;
  const roles = member.roles?.cache
    ? [...member.roles.cache.values()]
        .filter((role) => role.id !== member.guild.id && !role.managed)
        .sort((a, b) => b.position - a.position)
        .slice(0, 15)
        .map((role) => `<@&${role.id}>`)
    : [];
  const username = member.user?.username || member.displayName || member.id;

  return card(`📤 Main server departure · ${username}`, {
    color: C.grey,
    thumbnail: member.displayAvatarURL?.() || member.user?.displayAvatarURL?.(),
    description: `${mention(member.id)} \`${member.id}\` left **${member.guild.name}**.`,
    fields: [
      ["Joined", joinedAt ? `${ts(joinedAt)} · ${duration(now - joinedAt)} ago` : "Unknown", false],
      ["Account created", createdAt ? ts(createdAt) : "Unknown", true],
      ["Roles at departure", roles.join(" ") || "None", false],
    ],
    footer: "FBRP · IAA Main Discord Leave Log",
  });
}

export async function logMainGuildLeave(client, member) {
  if (member.guild.id !== MAIN_GUILD_ID || member.user?.bot) return false;
  const channel = client.channels.cache.get(MAIN_LEAVE_LOG_CHANNEL_ID)
    || (await client.channels.fetch(MAIN_LEAVE_LOG_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased()) {
    console.warn(`[IAA] main leave log channel ${MAIN_LEAVE_LOG_CHANNEL_ID} is unavailable.`);
    return false;
  }
  await channel.send({ embeds: [mainLeaveEmbed(member)] });
  return true;
}
