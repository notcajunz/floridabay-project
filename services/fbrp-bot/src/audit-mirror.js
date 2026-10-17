import { ChannelType } from "discord.js";
import { logEmbed } from "./ui.js";

/**
 * Mirrors every log entry into one Discord category. Each kind of entry gets its own text channel,
 * created on first use, and everything is also copied into #all-activity so nothing depends on a
 * single channel existing. The category holds at most 50 channels, so past MAX_CHANNELS new kinds
 * only appear in #all-activity.
 */
export const ALL_KEY = "all-activity";
export const AUDIT_CATEGORY_ID = process.env.FBRP_AUDIT_CATEGORY_ID || "1559447048552587274";
const MAX_CHANNELS = 45;

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// The same look as the other log channels: an emoji, a box-drawing bar, then a hyphenated name ending in -logs.
const KIND_EMOJI = {
  network: "🌐", audit: "🧾", character: "🧑", portal: "🖥️", verify: "✅", verification: "✅", economy: "💰",
  staff: "🛡️", staff_duty: "⏱️", player: "👤", vehicle: "🚗", justice: "⚖️", medical: "🏥", dispatch: "📡",
  interaction: "🤝", organization: "🏢", organizations: "🏢", game: "🎮", security: "🔒", moderation: "🔨",
  tickets: "🎫", roster: "📋", role_sync: "🔄", property: "🏠", personal: "🚙", pastime: "🎯", cad: "💻",
  citizen: "🪪", economy_delivery: "📦", global: "🌍", ace: "🔑", easyadmin: "🛠️", bans: "🔨", unbans: "🔓",
};

export function channelName(key) {
  const text = String(key);
  let emoji = "📋";
  let base;
  if (text === ALL_KEY) return "📜│all-activity-logs";
  if (text === "global-commands") return "🌍│global-command-logs";
  if (text.startsWith("commands-")) {
    emoji = "⌨️";
    base = `${slug(text.slice(9))}-command-logs`;
  } else if (text.startsWith("audit-")) {
    const kind = text.slice(6);
    emoji = KIND_EMOJI[kind] || KIND_EMOJI[kind.replace(/-/g, "_")] || "📋";
    base = `${slug(kind)}-event-logs`;
  } else if (text.startsWith("log-")) {
    const kind = text.slice(4);
    emoji = KIND_EMOJI[kind] || KIND_EMOJI[kind.replace(/-/g, "_")] || "📋";
    base = `${slug(kind)}-audit-logs`;
  } else {
    base = `${slug(text)}-logs`;
  }
  return `${emoji}│${base}`.slice(0, 95);
}

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
  const renamed = new Set();

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
      if (existing?.isTextBased()) {
        const wanted = channelName(key);
        if (existing.name !== wanted && !renamed.has(key)) {
          renamed.add(key);
          await existing.setName(wanted, "FBRP audit mirror naming").catch(() => {});
        }
        return existing;
      }
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
