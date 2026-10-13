import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { randomInt } from "node:crypto";
import { COLORS, card, embed } from "./ui.js";

/**
 * Discord giveaways. /giveaway posts an embed with an Enter button; clicking again leaves.
 * State lives in the database, so a restart only delays the draw until the next sweep.
 */

const MIN_MS = 60_000;
const MAX_MS = 30 * 86_400_000;
const UNITS = { w: 604_800_000, d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };

/** "90m", "1d12h", "2h 30m" -> milliseconds. */
export function parseDuration(value) {
  const text = String(value ?? "").toLowerCase().replace(/\s+/g, "");
  if (!/^(\d+[wdhms])+$/.test(text)) throw new Error("Duration looks like `30m`, `2h`, `1d` or `1d12h`.");
  let total = 0;
  for (const [, amount, unit] of text.matchAll(/(\d+)([wdhms])/g)) total += Number(amount) * UNITS[unit];
  if (total < MIN_MS) throw new Error("A giveaway must run for at least 1 minute.");
  if (total > MAX_MS) throw new Error("A giveaway can run for at most 30 days.");
  return total;
}

const unix = (ms) => Math.floor(Number(ms) / 1000);

export function createGiveaways({ client, db, audit, clean }) {
  const enterId = (id) => `giveaway:enter:${id}`;

  const button = (id, count, disabled = false) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(enterId(id))
        .setStyle(ButtonStyle.Success)
        .setLabel(`Enter giveaway (${count})`)
        .setEmoji("🎉")
        .setDisabled(disabled),
    );

  async function entryCount(id) {
    const row = await db.one("SELECT COUNT(*) n FROM giveaway_entries WHERE giveaway_id=?", [id]);
    return Number(row?.n || 0);
  }

  function body(row, count, winners = null) {
    const ended = Boolean(row.ended);
    const lines = [];
    if (row.description) lines.push(clean(row.description, 500), "");
    lines.push(
      ended ? `Ended <t:${unix(row.ends_at)}:R>` : `Ends <t:${unix(row.ends_at)}:R> (<t:${unix(row.ends_at)}:f>)`,
      `Hosted by <@${row.host_id}>`,
      `Winners: **${row.winner_count}**`,
    );
    if (ended) lines.push(winners?.length ? `\n🏆 ${winners.map((id) => `<@${id}>`).join(", ")}` : "\nNo valid entries, so there was no winner.");
    return card(`🎉 ${clean(row.prize, 200)}`, {
      description: lines.join("\n"),
      color: ended ? COLORS.muted : COLORS.success,
      footer: `Giveaway #${row.id} · ${count} entr${count === 1 ? "y" : "ies"}`,
    });
  }

  async function draw(id, count, exclude = []) {
    const rows = await db.query("SELECT discord_id FROM giveaway_entries WHERE giveaway_id=?", [id]);
    const pool = rows.map((row) => String(row.discord_id)).filter((discordId) => !exclude.includes(discordId));
    const picked = [];
    while (picked.length < count && pool.length) picked.push(pool.splice(randomInt(pool.length), 1)[0]);
    return picked;
  }

  async function fetchMessage(row) {
    const channel = await client.channels.fetch(row.channel_id).catch(() => null);
    if (!channel?.isTextBased()) return { channel: null, message: null };
    const message = row.message_id ? await channel.messages.fetch(row.message_id).catch(() => null) : null;
    return { channel, message };
  }

  const parseWinners = (row) => {
    try {
      const value = typeof row.winners === "string" ? JSON.parse(row.winners) : row.winners;
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  };

  async function getRow(id) {
    const row = await db.one("SELECT * FROM giveaways WHERE id=?", [id]);
    if (!row) throw new Error(`Giveaway #${id} does not exist.`);
    return row;
  }

  /** Closes a giveaway (idempotent), edits its message and announces the winners. */
  async function finish(id, actor = null) {
    const claimed = await db.query("UPDATE giveaways SET ended=TRUE WHERE id=? AND ended=FALSE", [id]);
    if (!claimed.affectedRows) return null;
    const row = await getRow(id);
    const count = await entryCount(id);
    const winners = await draw(id, Number(row.winner_count), []);
    await db.query("UPDATE giveaways SET winners=? WHERE id=?", [JSON.stringify(winners), id]);
    const { channel, message } = await fetchMessage(row);
    const ended = { ...row, ended: true };
    if (message) await message.edit({ embeds: [body(ended, count, winners)], components: [button(id, count, true)] }).catch(() => {});
    if (channel) {
      await channel
        .send({
          content: winners.length
            ? `🎉 Congratulations ${winners.map((w) => `<@${w}>`).join(", ")}! You won **${clean(row.prize, 200)}**.`
            : `Nobody entered the giveaway for **${clean(row.prize, 200)}**.`,
          reply: message ? { messageReference: message.id, failIfNotExists: false } : undefined,
          allowedMentions: { users: winners },
        })
        .catch((error) => console.error("[FBRP giveaway] announce:", error.message));
    }
    await audit(actor || "system", "giveaway.end", String(id), { prize: row.prize, winners }).catch(() => {});
    return { row, winners, count };
  }

  async function sweep() {
    const due = await db.query("SELECT id FROM giveaways WHERE ended=FALSE AND ends_at<=? LIMIT 20", [Date.now()]);
    for (const { id } of due) await finish(Number(id)).catch((error) => console.error(`[FBRP giveaway] #${id}:`, error.message));
  }

  function start() {
    setInterval(() => void sweep().catch((error) => console.error("[FBRP giveaway] sweep:", error.message)), 30_000).unref();
    void sweep().catch(() => {});
  }

  /** Enter / leave button. Returns true when the interaction was a giveaway button. */
  async function component(i) {
    if (!i.isButton() || !i.customId.startsWith("giveaway:enter:")) return false;
    const id = Number(i.customId.split(":")[2]);
    const row = await db.one("SELECT * FROM giveaways WHERE id=?", [id]);
    if (!row || row.ended || Number(row.ends_at) <= Date.now()) {
      await i.reply({ embeds: [embed("Giveaway closed", "This giveaway has already ended.", COLORS.warning)], ephemeral: true });
      return true;
    }
    const removed = await db.query("DELETE FROM giveaway_entries WHERE giveaway_id=? AND discord_id=?", [id, i.user.id]);
    let entered = false;
    if (!removed.affectedRows) {
      await db.query("INSERT IGNORE INTO giveaway_entries(giveaway_id,discord_id,entered_at) VALUES(?,?,?)", [id, i.user.id, Date.now()]);
      entered = true;
    }
    const count = await entryCount(id);
    await i.update({ embeds: [body(row, count)], components: [button(id, count)] });
    await i.followUp({
      embeds: [embed(entered ? "You're in!" : "Entry removed", entered ? `Good luck! Click the button again to leave giveaway #${id}.` : `You left giveaway #${id}.`, entered ? COLORS.success : COLORS.muted)],
      ephemeral: true,
    });
    return true;
  }

  /** /giveaway handler. The caller has already enforced Co-Owner or higher. */
  async function command(i, sub) {
    if (sub === "start") {
      const prize = clean(i.options.getString("prize", true), 200);
      if (!prize) throw new Error("The prize cannot be blank.");
      const ms = parseDuration(i.options.getString("duration", true));
      const winners = i.options.getInteger("winners") ?? 1;
      const description = clean(i.options.getString("description") || "", 500) || null;
      const channel = i.options.getChannel("channel") || i.channel;
      if (!channel?.isTextBased() || !channel.send) throw new Error("Pick a text channel to post the giveaway in.");
      const now = Date.now();
      const inserted = await db.query(
        "INSERT INTO giveaways(guild_id,channel_id,prize,description,winner_count,host_id,ends_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
        [i.guildId, channel.id, prize, description, winners, i.user.id, now + ms, now],
      );
      const id = Number(inserted.insertId);
      const row = { id, prize, description, winner_count: winners, host_id: i.user.id, ends_at: now + ms, ended: false };
      try {
        const message = await channel.send({ embeds: [body(row, 0)], components: [button(id, 0)] });
        await db.query("UPDATE giveaways SET message_id=? WHERE id=?", [message.id, id]);
      } catch (error) {
        await db.query("DELETE FROM giveaways WHERE id=?", [id]);
        throw new Error(`I could not post in <#${channel.id}>: ${clean(error.message, 200)}`);
      }
      await audit(i.user.id, "giveaway.start", String(id), { prize, winners, endsAt: now + ms, channel: channel.id });
      return embed("Giveaway started", `**${prize}** is live in <#${channel.id}> and ends <t:${unix(now + ms)}:R>. ID: \`${id}\`.`, COLORS.success);
    }

    if (sub === "end") {
      const id = i.options.getInteger("id", true);
      await getRow(id);
      const result = await finish(id, i.user.id);
      if (!result) throw new Error(`Giveaway #${id} has already ended. Use \`/giveaway reroll\` to draw again.`);
      return embed("Giveaway ended", result.winners.length ? `Winners: ${result.winners.map((w) => `<@${w}>`).join(", ")}` : "Nobody had entered.", COLORS.success);
    }

    if (sub === "reroll") {
      const id = i.options.getInteger("id", true);
      const row = await getRow(id);
      if (!row.ended) throw new Error(`Giveaway #${id} is still running. End it first.`);
      const previous = parseWinners(row);
      const count = i.options.getInteger("count") ?? Number(row.winner_count);
      const winners = await draw(id, count, previous);
      if (!winners.length) throw new Error("There are no other entrants left to draw from.");
      await db.query("UPDATE giveaways SET winners=? WHERE id=?", [JSON.stringify([...previous, ...winners]), id]);
      const { channel } = await fetchMessage(row);
      await channel
        ?.send({ content: `🎉 New winner${winners.length === 1 ? "" : "s"} for **${clean(row.prize, 200)}**: ${winners.map((w) => `<@${w}>`).join(", ")}`, allowedMentions: { users: winners } })
        .catch(() => {});
      await audit(i.user.id, "giveaway.reroll", String(id), { winners });
      return embed("Giveaway rerolled", `New winner${winners.length === 1 ? "" : "s"}: ${winners.map((w) => `<@${w}>`).join(", ")}`, COLORS.success);
    }

    if (sub === "cancel") {
      const id = i.options.getInteger("id", true);
      const row = await getRow(id);
      if (row.ended) throw new Error(`Giveaway #${id} has already ended.`);
      await db.query("UPDATE giveaways SET ended=TRUE,winners=? WHERE id=?", ["[]", id]);
      const { message } = await fetchMessage(row);
      const count = await entryCount(id);
      await message
        ?.edit({ embeds: [card(`🎉 ${clean(row.prize, 200)}`, { description: "This giveaway was cancelled.", color: COLORS.danger, footer: `Giveaway #${id}` })], components: [button(id, count, true)] })
        .catch(() => {});
      await audit(i.user.id, "giveaway.cancel", String(id), { prize: row.prize });
      return embed("Giveaway cancelled", `Giveaway #${id} (**${clean(row.prize, 200)}**) was cancelled with no draw.`, COLORS.warning);
    }

    if (sub === "list") {
      const rows = await db.query("SELECT * FROM giveaways WHERE guild_id=? AND ended=FALSE ORDER BY ends_at LIMIT 25", [i.guildId]);
      const counts = await Promise.all(rows.map((row) => entryCount(row.id)));
      return card("Active giveaways", {
        color: rows.length ? COLORS.success : COLORS.muted,
        description: rows.length
          ? rows.map((row, n) => `\`${row.id}\` · **${clean(row.prize, 80)}** · <#${row.channel_id}> · ends <t:${unix(row.ends_at)}:R> · ${counts[n]} entries`).join("\n")
          : "No giveaways are running.",
      });
    }

    throw new Error("Unknown giveaway action.");
  }

  return { command, component, start, sweep };
}
