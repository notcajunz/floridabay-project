/**
 * Reads every human member of the given guilds straight from Discord (not from the member cache,
 * which would miss people who joined but never verified). Shared by the IAA bot, for the servers it
 * is in, and by the main bot's alt-scan queue, for every other network server.
 *
 * @returns {{ members: Map<string, { id, username, display, defaultAvatar, servers }>, problems: string[] }}
 */
export async function collectMembers(guilds, { onGuild = async () => {} } = {}) {
  const members = new Map();
  const problems = [];
  for (const guild of guilds) {
    let list = null;
    try {
      list = await guild.members.fetch();
    } catch (error) {
      list = guild.members.cache;
      problems.push(`${guild.name}: full member fetch failed (${error.message}); used ${list.size} cached member(s)`);
    }
    for (const member of list.values()) {
      if (member.user.bot) continue;
      const seen = members.get(member.id);
      if (seen) {
        seen.servers++;
        seen.display ||= member.nickname || member.user.globalName || null;
        continue;
      }
      members.set(member.id, {
        id: member.id,
        username: member.user.username,
        display: member.nickname || member.user.globalName || null,
        defaultAvatar: !member.user.avatar,
        servers: 1,
      });
    }
    await onGuild(guild, list.size);
  }
  return { members, problems };
}
