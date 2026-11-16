import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { COLORS } from "./ui.js";
import { currentDiscordId } from "./discord-ids.js";

const CONFIG_KEY = "server_status_board";
const TITLE = "Florida Bay Roleplay · Live Status";
const DEFAULT_CHANNEL_ID = "1570228138347077795";
const DEFAULT_RESTART_TIMES = "06:00,18:00";
const DEFAULT_TIMEZONE = "America/New_York";
const DEFAULT_MAX_PLAYERS = 48;

const line = (value, max = 100) =>
  String(value ?? "")
    .replace(/[\r\n\u0000-\u001f]+/g, " ")
    .trim()
    .slice(0, max);

const restartTimes = () => {
  const parsed = String(process.env.FBRP_RESTART_TIMES || DEFAULT_RESTART_TIMES)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
  return [...new Set(parsed.length ? parsed : DEFAULT_RESTART_TIMES.split(","))].sort();
};

const formatterFor = (timeZone) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

const zonedParts = (epoch, formatter) =>
  Object.fromEntries(
    formatter
      .formatToParts(new Date(epoch))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

/** Converts a wall-clock time in an IANA timezone to its UTC epoch. */
function wallTimeToEpoch(parts, formatter) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  let candidate = desired;
  // A second pass handles a different UTC offset on the target side of a DST boundary.
  for (let pass = 0; pass < 2; pass += 1) {
    const actual = zonedParts(candidate, formatter);
    const rendered = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate += desired - rendered;
  }
  return candidate;
}

/** The next configured restart, respecting Florida daylight-saving time. */
export function nextRestart(now = Date.now()) {
  let timeZone = String(process.env.FBRP_RESTART_TIMEZONE || DEFAULT_TIMEZONE).trim();
  let formatter;
  try {
    formatter = formatterFor(timeZone);
    formatter.format(new Date(now));
  } catch {
    timeZone = "UTC";
    formatter = formatterFor(timeZone);
  }
  const current = zonedParts(now, formatter);
  const calendarDay = Date.UTC(current.year, current.month - 1, current.day);
  let epoch = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < 8; offset += 1) {
    const date = new Date(calendarDay + offset * 86400000);
    for (const time of restartTimes()) {
      const [hour, minute] = time.split(":").map(Number);
      const candidate = wallTimeToEpoch(
        {
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          day: date.getUTCDate(),
          hour,
          minute,
        },
        formatter,
      );
      if (candidate > now && candidate < epoch) epoch = candidate;
    }
  }
  return { epoch, timeZone };
}

const parseStored = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const playerBar = (players, maximum) => {
  const filled = Math.max(0, Math.min(10, Math.round((players / Math.max(1, maximum)) * 10)));
  return `${"▰".repeat(filled)}${"▱".repeat(10 - filled)}`;
};

const priorityLabel = (key) =>
  ({ ls: "Los Santos", blaine: "Blaine County", paleto: "Paleto Bay", zancudo: "Fort Zancudo", roxwood: "Roxwood" })[key] ||
  line(key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()), 40);

const priorityText = (priority) => {
  const entries = Object.entries(priority && typeof priority === "object" ? priority : {});
  if (!entries.length) return "⚪ No priority information";
  return entries
    .slice(0, 8)
    .map(([zone, item]) => {
      const status = String(item?.status || "available").toLowerCase();
      const labels = {
        available: ["🟢", "Available"],
        active: ["🔴", "In progress"],
        cooldown: ["🟠", `Cooldown${Number(item?.remaining) ? ` · ${Number(item.remaining)}m` : ""}`],
        hold: ["🟡", "On hold"],
      };
      const [icon, text] = labels[status] || ["⚪", line(status, 30) || "Unknown"];
      return `${icon} **${priorityLabel(zone)}** · ${text}`;
    })
    .join("\n");
};

const connectAddress = (connectUrl) =>
  line(connectUrl().replace(/^fivem:\/\/connect\//, "") || "join.floridabay.net", 180);

function statusPayload({ channel, health, latency, publicBase, connectUrl }) {
  const online = Boolean(health?.ok);
  const players = online ? Math.max(0, Number(health.players) || 0) : 0;
  const maximum = Math.max(1, Number(health?.maxPlayers) || Number(process.env.FBRP_MAX_PLAYERS) || DEFAULT_MAX_PLAYERS);
  const restart = nextRestart();
  const restartEpoch = Math.floor(restart.epoch / 1000);
  const address = connectAddress(connectUrl);
  const guildIcon = channel.guild?.iconURL({ size: 256 });

  const embed = new EmbedBuilder()
    .setColor(online ? COLORS.success : COLORS.danger)
    .setAuthor({
      name: online ? "LIVE SERVER STATUS · ONLINE" : "LIVE SERVER STATUS · OFFLINE",
      ...(guildIcon ? { iconURL: guildIcon } : {}),
    })
    .setTitle(TITLE)
    .setDescription(
      online
        ? "🌴 **The coast is open.** Live information from the Florida Bay game server."
        : "⚠️ **The city is currently unreachable.** Staff have been alerted; check back shortly.",
    )
    .addFields(
      {
        name: "👥 PLAYERS",
        value: online ? `**${players} / ${maximum}**\n${playerBar(players, maximum)}` : `**— / ${maximum}**\n${playerBar(0, maximum)}`,
        inline: true,
      },
      {
        name: "📍 CURRENT AOP",
        value: online ? `**${line(health.aop, 80) || "Statewide"}**` : "**Unavailable**",
        inline: true,
      },
      {
        name: "🔄 NEXT RESTART",
        value: `<t:${restartEpoch}:R>\n<t:${restartEpoch}:t> · ${line(restart.timeZone, 40)}`,
        inline: true,
      },
      {
        name: "📡 SERVER",
        value: online ? `🟢 **Online**\n${latency}ms response` : "🔴 **Offline**\nNo response",
        inline: true,
      },
      {
        name: "🕊️ PEACETIME",
        value: online ? (health.peacetime ? "🟢 **Enabled**" : "⚪ **Disabled**") : "⚪ **Unknown**",
        inline: true,
      },
      {
        name: "🎯 PRIORITY STATUS",
        value: online ? priorityText(health.priority) : "⚪ No priority information",
        inline: false,
      },
      {
        name: "🎮 HOW TO CONNECT",
        value: `Open FiveM, press **F8**, and enter:\n\`connect ${address}\``,
        inline: false,
      },
    )
    .setFooter({ text: "Florida Bay Roleplay · Automatically refreshes every minute" })
    .setTimestamp();
  if (guildIcon) embed.setThumbnail(guildIcon);

  const site = String(publicBase() || "").replace(/\/$/, "");
  const components = [];
  if (/^https:\/\//i.test(site)) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("Play Florida Bay").setEmoji("🌴").setStyle(ButtonStyle.Link).setURL(site),
        new ButtonBuilder().setLabel("Member Portal").setEmoji("🪪").setStyle(ButtonStyle.Link).setURL(`${site}/portal.html`),
      ),
    );
  }
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

/** Maintains one editable status message instead of posting a new message every minute. */
export function createStatusBoard({ client, db, callGame, publicBase, connectUrl }) {
  let updating = false;

  async function update() {
    if (updating) return;
    updating = true;
    try {
      const channelId = currentDiscordId(process.env.FBRP_STATUS_CHANNEL_ID || DEFAULT_CHANNEL_ID);
      if (!channelId) return;
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased() || !channel.guild)
        throw new Error(`Status channel ${channelId} is unavailable or is not a guild text channel.`);

      const started = Date.now();
      const health = await callGame("/health", null, "GET").catch(() => null);
      const latency = Date.now() - started;
      const payload = statusPayload({ channel, health, latency, publicBase, connectUrl });
      const row = await db.one("SELECT value FROM bot_config WHERE `key`=?", [CONFIG_KEY]);
      const stored = parseStored(row?.value);
      let message = stored.channel_id === channel.id && stored.message_id
        ? await channel.messages.fetch(String(stored.message_id)).catch(() => null)
        : null;

      if (!message) {
        const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
        message = recent?.find(
          (item) => item.author.id === client.user.id && item.embeds[0]?.title === TITLE,
        ) || null;
      }
      message = message ? await message.edit(payload) : await channel.send(payload);
      if (stored.channel_id !== channel.id || stored.message_id !== message.id)
        await db.query(
          "INSERT INTO bot_config(`key`,value,updated_by,updated_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
          [CONFIG_KEY, JSON.stringify({ channel_id: channel.id, message_id: message.id }), client.user.id, Date.now()],
        );
    } finally {
      updating = false;
    }
  }

  async function start() {
    await update();
    const interval = Math.max(30000, Number(process.env.FBRP_STATUS_REFRESH_MS) || 60000);
    setInterval(() => void update().catch((error) => console.error("[FBRP status board] refresh:", error.message || error)), interval).unref();
  }

  return { start, update };
}
