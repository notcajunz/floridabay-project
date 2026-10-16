import { EmbedBuilder } from "discord.js";

/**
 * The staff bot to main bot request queue is mirrored into one private staff-server channel (purpose
 * `role_queue` in discord_channel_bindings): the staff bot posts what it queued, the main bot posts
 * how each request finished. Both processes use this module.
 */
export const QUEUE_LOG_PURPOSE = "role_queue";

export function createQueueLog({ client, db }) {
  const names = new Map();

  async function channel() {
    const row = await db.one("SELECT channel_id FROM discord_channel_bindings WHERE purpose=?", [QUEUE_LOG_PURPOSE]).catch(() => null);
    if (!row) return null;
    const found = await client.channels.fetch(String(row.channel_id)).catch(() => null);
    return found?.isTextBased() ? found : null;
  }

  async function guildName(guildId) {
    const id = String(guildId);
    if (!names.has(id)) {
      const row = await db.one("SELECT name FROM network_guilds WHERE guild_id=?", [id]).catch(() => null);
      names.set(id, row?.name || client.guilds.cache.get(id)?.name || id);
    }
    return names.get(id);
  }

  async function roleName(guildId, roleId) {
    const live = client.guilds.cache.get(String(guildId))?.roles.cache.get(String(roleId))?.name;
    if (live) return live;
    const row = await db.one("SELECT name FROM discord_guild_roles WHERE guild_id=? AND role_id=?", [String(guildId), String(roleId)]).catch(() => null);
    return row?.name || `role ${roleId}`;
  }

  /** `➕ Staff Manager+ → <@user> in FBRP | Main` style line for one role request. */
  async function roleLine(row, prefix = "") {
    const verb = row.action === "add" ? "➕ add" : "➖ remove";
    return `${prefix}${verb} **${await roleName(row.guild_id, row.role_id)}** · <@${row.discord_id}> · ${await guildName(row.guild_id)}`;
  }

  async function post(title, lines, color = 0x5865f2) {
    if (!lines.length) return;
    const target = await channel();
    if (!target) return;
    const pages = [];
    let page = "";
    for (const line of lines) {
      if (page.length + line.length + 1 > 3800) {
        pages.push(page);
        page = "";
      }
      page += `${page ? "\n" : ""}${line}`;
    }
    if (page) pages.push(page);
    for (const [index, description] of pages.entries())
      await target
        .send({
          embeds: [new EmbedBuilder().setColor(color).setTitle(pages.length > 1 ? `${title} (${index + 1}/${pages.length})` : title).setDescription(description).setTimestamp()],
          allowedMentions: { parse: [] },
        })
        .catch((error) => console.error("[FBRP queue log]", error.message || error));
  }

  return { post, roleLine, channel };
}
