import { ChannelType } from "discord.js";
import { logEmbed } from "./ui.js";

/**
 * Mirrors every log entry into one Discord category. Each kind of entry gets its own text channel,
 * created on first use, and everything is also copied into #all-activity so nothing depends on a
 * single channel existing. The category holds at most 50 channels, so past MAX_CHANNELS new kinds
 * only appear in #all-activity.
 */
export const AUDIT_CATEGORY_ID = process.env.FBRP_AUDIT_CATEGORY_ID || "1559447048552587274";
export const ALL_KEY = "all-activity";
const MAX_CHANNELS = 45;

const channelName = (key) => String(key).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "audit";

/** Which mirror channel an audit_log action belongs to. */
export function keyForAction(action) {
  const parts = String(action || "").split(".");
  if (parts[0] === "cmd") return parts[1] === "main" && parts[2] === "global" ? "global-commands" : `commands-${parts[1] || "other"}`;
  return `audit-${parts[0] || "other"}`;
}

export function createAuditMirror({ client, db }) {
  const ids = new Map();       // key -> channel id
  const creating = new Map();  // key -> promise
  let category = null;
  let loaded = false;
  let warned = false;
  let chain = Promise.resolve();

  const warn = (message) => {
    if (warned) return;
    warned = true;
    console.error(`[FBRP audit mirror] ${message}`);
  };

  async function load() {
    if (loaded) return;
    for (const row of await db.query("SELECT channel_key,channel_id FROM audit_mirror_channels").catch(() => [])) {
      ids.set(row.channel_key, String(row.channel_id));
    }
    loaded = true;
  }

  async function categoryChannel() {
    if (category) return category;
    const found = await client.channels.fetch(AUDIT_CATEGORY_ID).catch(() => null);
    if (found?.type === ChannelType.GuildCategory) category = found;
    else warn(`category ${AUDIT_CATEGORY_ID} is not reachable, so audit entries are not mirrored.`);
    return category;
  }

  async function resolve(key) {
    await load();
    const known = ids.get(key);
    if (known) {
      const existing = await client.channels.fetch(known).catch(() => null);
      if (existing?.isTextBased()) return existing;
      ids.delete(key);
    }
    if (creating.has(key)) return creating.get(key);
    const made = (async () => {
      const parent = await categoryChannel();
      if (!parent) return null;
      if (key !== ALL_KEY && ids.size >= MAX_CHANNELS) return null;
      const created = await parent.guild.channels.create({
        name: channelName(key),
        type: ChannelType.GuildText,
        parent: parent.id,
        topic: `Automatic audit mirror: ${key}`,
        reason: "FBRP audit mirror",
      }).catch((error) => {
        warn(`could not create #${channelName(key)}: ${error.message || error}`);
        return null;
      });
      if (!created) return null;
      ids.set(key, created.id);
      await db.query(
        "INSERT INTO audit_mirror_channels(channel_key,guild_id,channel_id,created_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE guild_id=VALUES(guild_id),channel_id=VALUES(channel_id)",
        [key, created.guildId, created.id, Date.now()],
      ).catch(() => {});
      return created;
    })().finally(() => creating.delete(key));
    creating.set(key, made);
    return made;
  }

  async function send(key, embed, skipIds) {
    const channel = await resolve(key);
    if (!channel || skipIds?.has(channel.id)) return;
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch((error) => {
      console.error(`[FBRP audit mirror] #${channel.name}:`, error.message || error);
    });
  }

  /**
   * Copies one entry into its channel and into #all-activity. Posts are chained so a burst keeps
   * its order and Discord's rate limits are never raced. `skipIds` are channels that already got
   * the entry (the original log destination).
   */
  function post(key, embed, skipIds = null) {
    chain = chain.then(async () => {
      await send(key, embed, skipIds);
      if (key !== ALL_KEY) await send(ALL_KEY, embed, skipIds);
    }).catch(() => {});
    return chain;
  }

  /** Builds the embed from a log spec the same way the main log does, then mirrors it. */
  function mirrorSpec(key, spec, guild, skipIds) {
    const embed = typeof spec === "string" || !spec ? logEmbed(key, { description: spec || "" }, guild) : logEmbed(key, spec, guild);
    return post(key, embed, skipIds);
  }

  return { post, mirrorSpec, resolve, keyForAction };
}
