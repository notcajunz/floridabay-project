import { ChannelType } from "discord.js";
import { logEmbed } from "./ui.js";

/**
 * Mirrors every log entry into one Discord category. Entries are grouped into a handful of text
 * channels (commands, staff, game, organizations, system and in-game kills), created on first use,
 * and everything is also copied into #all-activity so nothing depends on a single channel existing.
 * The footer of each embed keeps the exact action name, so grouping loses no detail.
 */
export const ALL_KEY = "all-activity";
export const AUDIT_CATEGORY_ID = process.env.FBRP_AUDIT_CATEGORY_ID || "1559447048552587274";

// The same look as the other log channels: an emoji, a box-drawing bar, then a hyphenated name ending in -logs.
export const KILL_KEY = "kill-logs";
export const LOG_GROUPS = {
  [ALL_KEY]: { emoji: "📜", name: "all-activity-logs" },
  [KILL_KEY]: { emoji: "💀", name: "kill-logs" },
  "command-logs": { emoji: "⌨️", name: "command-logs" },
  "staff-logs": { emoji: "🛡️", name: "staff-logs" },
  "game-logs": { emoji: "🎮", name: "game-logs" },
  "organization-logs": { emoji: "🏢", name: "organization-logs" },
  "system-logs": { emoji: "🖥️", name: "system-logs" },
};

// Which grouped channel a kind of entry lands in. Anything unlisted goes to system-logs.
const KIND_GROUP = {
  staff: "staff-logs", staff_duty: "staff-logs", staff_audit: "staff-logs", moderation: "staff-logs", mod: "staff-logs",
  bans: "staff-logs", unbans: "staff-logs", security: "staff-logs", easyadmin: "staff-logs", ace: "staff-logs",
  game: "game-logs", player: "game-logs", vehicle: "game-logs", justice: "game-logs", medical: "game-logs",
  dispatch: "game-logs", interaction: "game-logs", cad: "game-logs", citizen: "game-logs", character: "game-logs",
  pastime: "game-logs", property: "game-logs", personal: "game-logs", connections: "game-logs",
  economy: "organization-logs", economy_delivery: "organization-logs", organization: "organization-logs",
  organizations: "organization-logs", org: "organization-logs", roster: "organization-logs", role_sync: "organization-logs",
};

/** The grouped channel key for any mirror key (old per-kind keys included). */
export function groupOf(key) {
  const text = String(key);
  if (LOG_GROUPS[text]) return text;
  if (text === "global-commands" || text.startsWith("commands-")) return "command-logs";
  const kind = text.startsWith("audit-") ? text.slice(6) : text.startsWith("log-") ? text.slice(4) : text;
  return KIND_GROUP[kind.toLowerCase().replace(/[^a-z0-9]+/g, "_")] || "system-logs";
}

export function channelName(key) {
  const group = LOG_GROUPS[groupOf(key)];
  return `${group.emoji}│${group.name}`.slice(0, 95);
}

// Mirror keys that mean the same thing as a purpose that already has its own log channel.
const PURPOSE_ALIAS = {
  "audit-verify": "verification", "audit-verification": "verification",
  "audit-organization": "organizations", "audit-organizations": "organizations", "audit-org": "organizations",
  "audit-staff": "staff_duty",
};
export const purposeOf = (key) => PURPOSE_ALIAS[key] || (String(key).startsWith("log-") ? String(key).slice(4) : null);

/** Which mirror channel an audit_log action belongs to. */
export function keyForAction(action) {
  const parts = String(action || "").split(".");
  if (parts[0] === "cmd") return parts[1] === "main" && parts[2] === "global" ? "global-commands" : `commands-${parts[1] || "other"}`;
  if (action === "player.kill" || action === "player.death") return KILL_KEY;
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
  let tidied = null;

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

  // A kind that already has a log channel inside the category uses it instead of making a twin.
  async function existingFor(key) {
    const purpose = purposeOf(key);
    if (!purpose) return null;
    const parent = await categoryChannel();
    if (!parent) return null;
    const row = await db.one("SELECT channel_id FROM discord_channel_bindings WHERE purpose=?", [purpose]).catch(() => null);
    const found = row ? await client.channels.fetch(String(row.channel_id)).catch(() => null) : null;
    return found?.isTextBased() && found.parentId === parent.id ? found : null;
  }

  async function resolve(rawKey) {
    await load();
    const twin = await existingFor(rawKey);
    if (twin) return twin;
    const key = groupOf(rawKey);
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
      const created = await parent.guild.channels.create({
        name: channelName(key),
        type: ChannelType.GuildText,
        parent: parent.id,
        topic: `Automatic audit mirror: ${key}`,
        reason: "FBRP audit mirror",
      }).catch((error) => {
        warn(`could not create #${channelName(key)}: ${error.message || error}${error.rawError?.errors ? ` ${JSON.stringify(error.rawError.errors).slice(0, 300)}` : ""}`);
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
    // Wait for the startup cleanup so a full category never blocks the grouped channels.
    chain = chain.then(() => tidied).then(async () => {
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

  // Gives every channel the bot made the shared naming, without waiting for traffic. Channels the
  // mirror made for a single kind of entry (from before entries were grouped) are deleted; their
  // entries now live in a grouped channel and in #all-activity. Only channels listed in
  // audit_mirror_channels, inside the audit category and marked as automatic mirrors are touched.
  function tidy() {
    tidied ??= runTidy().catch((error) => console.error("[FBRP audit mirror] tidy:", error.message || error));
    return tidied;
  }

  async function runTidy() {
    await load();
    for (const [key, id] of [...ids]) {
      const channel = await client.channels.fetch(id).catch(() => null);
      if (groupOf(key) !== key) {
        const automatic = channel && channel.parentId === AUDIT_CATEGORY_ID && String(channel.topic || "").startsWith("Automatic audit mirror");
        if (automatic) {
          const removed = await channel.delete("FBRP audit mirror: entries are grouped into fewer channels").then(() => true, (error) => {
            console.error(`[FBRP audit mirror] delete ${key}:`, error.message || error);
            return false;
          });
          if (!removed) continue;
        }
        ids.delete(key);
        await db.query("DELETE FROM audit_mirror_channels WHERE channel_key=?", [key]).catch(() => {});
        continue;
      }
      const wanted = channelName(key);
      if (channel && channel.name !== wanted) {
        renamed.add(key);
        await channel.setName(wanted, "FBRP audit mirror naming").catch((error) => console.error(`[FBRP audit mirror] rename ${key}:`, error.message || error));
      }
    }
    // Create every grouped channel now (kill-logs included) instead of waiting for its first entry.
    for (const key of Object.keys(LOG_GROUPS)) await resolve(key);
  }

  return { post, mirrorSpec, resolve, tidy, keyForAction };
}
