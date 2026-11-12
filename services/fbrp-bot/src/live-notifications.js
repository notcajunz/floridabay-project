import { COLORS, card, embed } from "./ui.js";

/**
 * Live Notifications: a reaction-role message plus a Twitch/YouTube go-live announcer.
 * All state lives in one bot_config row, so no schema change is needed. Detection needs no
 * credentials: Twitch is read through its public GraphQL endpoint and YouTube through the
 * channel's public /live page.
 */

export const LIVE_CHANNEL_ID = "1570228151429107783";
const CONFIG_KEY = "live_notifications";
const ROLE_NAME = "Live Notifications";
const REACTION = "🔴";
const POLL_MS = 60_000;
const OFFLINE_POLLS = 2; // consecutive "not live" polls before the notification is deleted
const MAX_STREAMERS = 100;
const TWITCH_GQL = "https://gql.twitch.tv/gql";
const TWITCH_CLIENT_ID = process.env.TWITCH_GQL_CLIENT_ID || "ue6666qo983tsx6so1t0vnawi233wa";
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Twitch login from a URL or bare name. */
export function parseTwitchLogin(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{3,25})(?:[/?#].*)?$/i);
  const login = (match ? match[1] : text.replace(/^@/, "")).toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(login)) throw new Error("Give a Twitch username or twitch.tv link.");
  return login;
}

/** YouTube channel reference ("@handle" or "UC…" id) from a URL, @handle or channel id. */
export function parseYouTubeRef(value) {
  const text = String(value ?? "").trim();
  const url = text.match(/^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/(@[A-Za-z0-9._-]{3,60}|channel\/UC[A-Za-z0-9_-]{22})(?:[/?#].*)?$/i);
  if (url) return url[1].toLowerCase().startsWith("channel/") ? url[1].slice(8) : url[1];
  if (/^UC[A-Za-z0-9_-]{22}$/.test(text)) return text;
  const handle = text.match(/^@?([A-Za-z0-9._-]{3,60})$/);
  if (handle) return `@${handle[1]}`;
  throw new Error("Give a YouTube @handle, channel ID, or a youtube.com/@handle or /channel/ link.");
}

const youtubeBase = (ref) => `https://www.youtube.com/${ref.startsWith("@") ? ref : `channel/${ref}`}`;
const decodeEntities = (text) =>
  String(text ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const meta = (html, property) => {
  const match = html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`));
  return match ? decodeEntities(match[1]) : null;
};

/** Reads a youtube.com/<channel>/live page. Live only when it resolves to a watch page flagged live. */
export function parseYouTubeLive(html) {
  const canonical = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/);
  if (!canonical || !/"isLiveNow":true/.test(html)) return { live: false };
  const owner = html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/);
  let name = null;
  try {
    name = owner ? JSON.parse(`"${owner[1]}"`) : null;
  } catch {
    name = owner ? owner[1] : null;
  }
  return {
    live: true,
    streamId: canonical[1],
    url: `https://www.youtube.com/watch?v=${canonical[1]}`,
    title: meta(html, "og:title") || "Live on YouTube",
    name,
    thumbnail: `https://i.ytimg.com/vi/${canonical[1]}/maxresdefault_live.jpg`,
  };
}

/** One entry of a Twitch GraphQL `users` result. */
export function parseTwitchUser(user) {
  if (!user) return null;
  const stream = user.stream;
  const base = { name: user.displayName || user.login };
  if (!stream || stream.type !== "live") return { ...base, live: false };
  return {
    ...base,
    live: true,
    streamId: String(stream.id),
    url: `https://www.twitch.tv/${user.login}`,
    title: stream.title || "Live on Twitch",
    game: stream.game?.name || null,
    viewers: Number(stream.viewersCount || 0),
    thumbnail: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${user.login}-1280x720.jpg`,
  };
}

const platformLabel = (platform) => (platform === "twitch" ? "Twitch" : "YouTube");
const keyOf = (streamer) => `${streamer.platform}:${streamer.id}`;

export function createLiveNotifications({ client, db, audit, clean, fetchImpl = globalThis.fetch }) {
  let config = null;
  let running = false;
  const misses = new Map();

  async function load() {
    if (config) return config;
    const row = await db.one("SELECT value FROM bot_config WHERE `key`=?", [CONFIG_KEY]);
    let parsed = {};
    try {
      parsed = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) || {} : {};
    } catch {
      parsed = {};
    }
    config = { role_id: null, message_id: null, streamers: [], active: {}, ...parsed };
    return config;
  }

  async function save(actor = null) {
    await db.query(
      "INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
      [CONFIG_KEY, JSON.stringify(config), actor || client.user?.id || "system", Date.now()],
    );
  }

  async function http(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(15_000) });
    return response;
  }

  async function twitchUsers(logins) {
    const list = logins.map((login) => JSON.stringify(login)).join(",");
    const response = await http(TWITCH_GQL, {
      method: "POST",
      headers: { "Client-ID": TWITCH_CLIENT_ID, "Content-Type": "text/plain" },
      body: JSON.stringify([{ query: `query{users(logins:[${list}]){login displayName stream{id title type viewersCount game{name}}}}` }]),
    });
    if (!response.ok) throw new Error(`Twitch returned HTTP ${response.status}.`);
    const data = await response.json();
    const users = data?.[0]?.data?.users;
    if (!Array.isArray(users)) throw new Error("Twitch returned an unexpected response.");
    return users;
  }

  async function youtubePage(path) {
    const response = await http(`${path}`, {
      headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "SOCS=CAI; CONSENT=YES+1" },
      redirect: "follow",
    });
    return response;
  }

  /** Verifies a streamer exists and returns { id, name } for storage. */
  async function resolve(platform, input) {
    if (platform === "twitch") {
      const login = parseTwitchLogin(input);
      const [user] = await twitchUsers([login]);
      if (!user) throw new Error(`There is no Twitch channel named \`${login}\`.`);
      return { id: login, name: clean(user.displayName || login, 60) };
    }
    const ref = parseYouTubeRef(input);
    const response = await youtubePage(youtubeBase(ref));
    if (response.status === 404) throw new Error(`I could not find a YouTube channel for \`${ref}\`.`);
    if (!response.ok) throw new Error(`YouTube returned HTTP ${response.status}.`);
    const html = await response.text();
    const name = meta(html, "og:title");
    if (!name) throw new Error(`I could not find a YouTube channel for \`${ref}\`.`);
    return { id: ref, name: clean(name, 60) };
  }

  /** Current state for every whitelisted streamer. Failed lookups are simply absent (state unknown). */
  async function probe(streamers) {
    const results = new Map();
    const twitch = streamers.filter((s) => s.platform === "twitch");
    if (twitch.length) {
      for (let at = 0; at < twitch.length; at += 30) {
        const chunk = twitch.slice(at, at + 30);
        try {
          const users = await twitchUsers(chunk.map((s) => s.id));
          for (const user of users.filter(Boolean)) results.set(`twitch:${user.login}`, parseTwitchUser(user));
        } catch (error) {
          console.error("[FBRP live] twitch:", error.message);
        }
      }
    }
    for (const streamer of streamers.filter((s) => s.platform === "youtube")) {
      try {
        const response = await youtubePage(`${youtubeBase(streamer.id)}/live`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        results.set(keyOf(streamer), parseYouTubeLive(await response.text()));
      } catch (error) {
        console.error(`[FBRP live] youtube ${streamer.id}:`, error.message);
      }
    }
    return results;
  }

  async function liveChannel() {
    const channel = await client.channels.fetch(LIVE_CHANNEL_ID).catch(() => null);
    return channel?.isTextBased() && channel.send ? channel : null;
  }

  function announcement(streamer, state) {
    const where = platformLabel(streamer.platform);
    const name = clean(state.name || streamer.name, 60);
    const rows = [];
    if (state.game) rows.push(["Playing", clean(state.game, 100)]);
    if (state.viewers) rows.push(["Viewers", String(state.viewers)]);
    const message = card(`${name} is live on ${where}`, {
      description: `**${clean(state.title, 250)}**\n\n[Watch the stream](${state.url})`,
      color: streamer.platform === "twitch" ? 0x9146ff : 0xff0000,
      rows,
      footer: where,
    }).setURL(state.url);
    if (state.thumbnail) message.setImage(`${state.thumbnail}?t=${Math.floor(Date.now() / 60_000)}`);
    return {
      content: `${config.role_id ? `<@&${config.role_id}> ` : ""}**${name}** is now live on ${where}!\n${state.url}`,
      embeds: [message],
      allowedMentions: { roles: config.role_id ? [config.role_id] : [] },
    };
  }

  async function announce(streamer, state, channel) {
    const message = await channel.send(announcement(streamer, state));
    config.active[keyOf(streamer)] = { message_id: message.id, stream_id: state.streamId, started_at: Date.now() };
    misses.delete(keyOf(streamer));
    await save();
  }

  async function retract(key, channel) {
    const entry = config.active[key];
    if (!entry) return;
    const message = channel ? await channel.messages.fetch(entry.message_id).catch(() => null) : null;
    if (message) await message.delete().catch((error) => console.error("[FBRP live] delete:", error.message));
    delete config.active[key];
    misses.delete(key);
    await save();
  }

  /** One pass: announce new streams, retract finished ones. */
  async function poll() {
    if (running) return;
    running = true;
    try {
      await load();
      const channel = await liveChannel();
      if (!channel) return;
      const results = await probe(config.streamers);
      for (const streamer of config.streamers) {
        const key = keyOf(streamer);
        const state = results.get(key);
        if (!state) continue;
        const active = config.active[key];
        if (state.live) {
          misses.delete(key);
          if (active && active.stream_id !== state.streamId) await retract(key, channel);
          if (!config.active[key]) await announce(streamer, state, channel);
        } else if (active) {
          const count = (misses.get(key) || 0) + 1;
          if (count >= OFFLINE_POLLS) await retract(key, channel);
          else misses.set(key, count);
        }
      }
      // Notifications for streamers that were removed from the whitelist.
      for (const key of Object.keys(config.active)) if (!config.streamers.some((s) => keyOf(s) === key)) await retract(key, channel);
    } finally {
      running = false;
    }
  }

  /** Creates the role and the reaction message when missing, and grants roles for reactions made while offline. */
  async function ensureRoleMessage() {
    await load();
    const channel = await liveChannel();
    if (!channel?.guild) return;
    const guild = channel.guild;
    let role = config.role_id ? guild.roles.cache.get(config.role_id) || (await guild.roles.fetch(config.role_id).catch(() => null)) : null;
    if (!role) {
      role = (await guild.roles.fetch()).find((r) => r.name === ROLE_NAME) || null;
      if (!role) role = await guild.roles.create({ name: ROLE_NAME, mentionable: true, reason: "Live Notifications reaction role" });
      config.role_id = role.id;
      await save();
    }
    let message = config.message_id ? await channel.messages.fetch(config.message_id).catch(() => null) : null;
    if (!message) {
      message = await channel.send({
        embeds: [
          card("🔴 Live Notifications", {
            description: `React with ${REACTION} below to get the <@&${role.id}> role and be pinged when a Florida Bay streamer goes live on Twitch or YouTube.\n\nRemove your reaction to drop the role.`,
            color: COLORS.primary,
          }),
        ],
        allowedMentions: { parse: [] },
      });
      config.message_id = message.id;
      await save();
    }
    if (!message.reactions.cache.has(REACTION)) await message.react(REACTION).catch(() => {});
    const reaction = message.reactions.cache.get(REACTION);
    if (reaction) {
      const users = await reaction.users.fetch().catch(() => null);
      for (const user of users?.values() || []) {
        if (user.bot) continue;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (member && !member.roles.cache.has(role.id)) await member.roles.add(role, "Reacted for Live Notifications").catch(() => {});
      }
    }
  }

  /** messageReactionAdd / messageReactionRemove handler. */
  async function reaction(r, user, added) {
    if (user.bot) return;
    if (r.partial) r = await r.fetch().catch(() => null);
    if (!r) return;
    await load();
    if (!config.message_id || r.message.id !== config.message_id || r.emoji.name !== REACTION || !config.role_id) return;
    const member = await r.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    if (added) await member.roles.add(config.role_id, "Reacted for Live Notifications");
    else await member.roles.remove(config.role_id, "Removed Live Notifications reaction");
  }

  async function start() {
    await ensureRoleMessage().catch((error) => console.error("[FBRP live] role message:", error.message));
    setInterval(() => void poll().catch((error) => console.error("[FBRP live] poll:", error.message)), POLL_MS).unref();
    setInterval(() => void ensureRoleMessage().catch((error) => console.error("[FBRP live] role message:", error.message)), 600_000).unref();
    void poll().catch((error) => console.error("[FBRP live] poll:", error.message));
  }

  /** /livenotify handler. The caller has already enforced Co-Owner or higher. */
  async function command(i, sub) {
    await load();
    if (sub === "add") {
      const platform = i.options.getString("platform", true);
      if (config.streamers.length >= MAX_STREAMERS) throw new Error(`The whitelist is full (${MAX_STREAMERS} streamers).`);
      const found = await resolve(platform, i.options.getString("streamer", true));
      const streamer = { platform, id: found.id, name: found.name, added_by: i.user.id, added_at: Date.now() };
      if (config.streamers.some((s) => keyOf(s) === keyOf(streamer))) throw new Error(`${found.name} is already whitelisted on ${platformLabel(platform)}.`);
      config.streamers.push(streamer);
      await save(i.user.id);
      await audit(i.user.id, "livenotify.add", keyOf(streamer), { name: found.name }).catch(() => {});
      void poll().catch(() => {});
      return embed("Streamer whitelisted", `**${found.name}** on ${platformLabel(platform)} will be announced in <#${LIVE_CHANNEL_ID}> when they go live.`, COLORS.success);
    }
    if (sub === "remove") {
      const platform = i.options.getString("platform", true);
      const id = platform === "twitch" ? parseTwitchLogin(i.options.getString("streamer", true)) : parseYouTubeRef(i.options.getString("streamer", true));
      const index = config.streamers.findIndex((s) => s.platform === platform && s.id.toLowerCase() === id.toLowerCase());
      if (index < 0) throw new Error(`\`${id}\` is not whitelisted on ${platformLabel(platform)}.`);
      const [removed] = config.streamers.splice(index, 1);
      await retract(keyOf(removed), await liveChannel()).catch(() => {});
      await save(i.user.id);
      await audit(i.user.id, "livenotify.remove", keyOf(removed), { name: removed.name }).catch(() => {});
      return embed("Streamer removed", `**${removed.name}** is no longer whitelisted on ${platformLabel(platform)}.`, COLORS.success);
    }
    if (sub === "list") {
      if (!config.streamers.length) return embed("Whitelisted streamers", "Nobody is whitelisted yet. Use `/livenotify add`.", COLORS.muted);
      const lines = config.streamers.map((s) => `${config.active[keyOf(s)] ? "🔴" : "⚫"} **${clean(s.name, 60)}** · ${platformLabel(s.platform)} · \`${s.id}\``);
      return embed(`Whitelisted streamers (${lines.length})`, lines.join("\n").slice(0, 4000), COLORS.primary);
    }
    throw new Error("Unknown subcommand.");
  }

  return { start, poll, command, reaction, ensureRoleMessage };
}
