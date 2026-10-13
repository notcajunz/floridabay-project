import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { COLORS, card, clip, humanize } from "./ui.js";

const DEFAULT_CHANNEL_ID = "1558946985988595762";
const DEFAULT_GUILD_ID = "1557594282976747550";
const DEFAULT_TITLE = "Florida Bay Roleplay | Chain of Command";
const MINIMUM_RANK = "Assistant Community Manager";
const ITEMS_PER_MESSAGE = 8;

const text = (value, max = 1000) =>
  String(value ?? "")
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, " ")
    .trim()
    .slice(0, max);

const jsonArray = (value) => {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const parseAssistants = (value) => {
  if (value === null || value === undefined) return null;
  if (["-", "none", "clear"].includes(String(value).trim().toLowerCase())) return [];
  return [...new Set(String(value).match(/\d{15,24}/g) || [])].slice(0, 15);
};

const parsePositions = (value) => {
  if (value === null || value === undefined) return null;
  if (["-", "none", "clear"].includes(String(value).trim().toLowerCase())) return "";
  return text(value, 900)
    .split(/\s*(?:\||\n)\s*/)
    .map((line) => line.replace(/^[•*\-]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .join("\n");
};

const parseColor = (value) => {
  if (value === null || value === undefined) return null;
  if (["-", "none", "clear"].includes(String(value).trim().toLowerCase())) return "";
  const color = String(value).trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) throw new Error("Color must be a six-digit hex value, such as #43E8D8. Use `-` to reset it.");
  return color;
};

const colorNumber = (value, fallback = COLORS.primary) => {
  if (/^#[0-9A-F]{6}$/i.test(String(value || ""))) return Number.parseInt(String(value).slice(1), 16);
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

export function createChainOfCommand({ client, db, audit, hasPermission }) {
  const refreshTimers = new Map();

  async function requireManager(i) {
    if (i.guild?.ownerId === i.user.id || i.memberPermissions?.has(PermissionFlagsBits.Administrator)) return;
    if (await hasPermission(i.user.id, "fbrp.coc.manage")) return;
    throw new Error("You need the `fbrp.coc.manage` permission to manage the chain of command.");
  }

  async function config(guildId) {
    return db.one("SELECT * FROM chain_of_command_config WHERE guild_id=?", [String(guildId)]);
  }

  async function importRoster(guildId, actorId, { replace = false } = {}) {
    const roster = await db.query(
      `SELECT m.discord_id,m.callsign,m.rank_name,r.name rank,c.name category,r.sort_order rank_order
         FROM staff_roster_members m
         LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id
         LEFT JOIN staff_roster_categories c ON c.id=r.category_id
        WHERE m.status<>'removed'
          AND r.sort_order<=(SELECT cutoff.sort_order FROM staff_roster_ranks cutoff WHERE cutoff.name=? ORDER BY cutoff.id LIMIT 1)
        ORDER BY c.sort_order,r.sort_order,m.callsign,m.discord_id`,
      [MINIMUM_RANK],
    );
    if (replace) await db.query("UPDATE chain_of_command_entries SET active=FALSE,updated_at=? WHERE guild_id=?", [Date.now(), String(guildId)]);
    let next = Number((await db.one("SELECT COALESCE(MAX(display_order),0) n FROM chain_of_command_entries WHERE guild_id=?", [String(guildId)]))?.n || 0) + 10;
    for (const row of roster) {
      const existing = await db.one("SELECT display_order FROM chain_of_command_entries WHERE guild_id=? AND discord_id=?", [String(guildId), String(row.discord_id)]);
      const order = existing ? Number(existing.display_order) : next;
      if (!existing) next += 10;
      await db.query(
        `INSERT INTO chain_of_command_entries(guild_id,discord_id,display_order,title,positions,assistant_ids,color,active,added_by,created_at,updated_at)
         VALUES(?,?,?,?,?,'[]',NULL,TRUE,?,?,?)
         ON DUPLICATE KEY UPDATE active=TRUE,updated_at=VALUES(updated_at)`,
        [String(guildId), String(row.discord_id), order, null, null, actorId, Date.now(), Date.now()],
      );
    }
    return roster.length;
  }

  async function rows(guildId) {
    return db.query(
      `SELECT e.*,m.callsign,m.display_name,m.username,m.status,r.name roster_rank,r.discord_role_id,c.name category
         FROM chain_of_command_entries e
         LEFT JOIN staff_roster_members m ON m.discord_id=e.discord_id AND m.status<>'removed'
         LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id
         LEFT JOIN staff_roster_categories c ON c.id=r.category_id
        WHERE e.guild_id=? AND e.active=TRUE
          AND m.status<>'removed'
          AND r.sort_order<=(SELECT cutoff.sort_order FROM staff_roster_ranks cutoff WHERE cutoff.name=? ORDER BY cutoff.id LIMIT 1)
        ORDER BY e.display_order,e.created_at,e.discord_id`,
      [String(guildId), MINIMUM_RANK],
    );
  }

  async function entryEmbed(guild, row, index, total) {
    const member = await guild.members.fetch(String(row.discord_id)).catch(() => null);
    const role = row.discord_role_id ? await guild.roles.fetch(String(row.discord_role_id)).catch(() => null) : null;
    let displayName = member?.displayName || row.display_name || row.username || `User ${row.discord_id}`;
    displayName = String(displayName).replace(/^!\s*/, "");
    if (row.callsign) displayName = displayName.replace(new RegExp(`^${row.callsign}\\s*[|｜•·-]\\s*`, "i"), "");
    const title = text(row.title || row.roster_rank || "Leadership", 100);
    const call = row.callsign ? `${row.callsign} | ` : "";
    const positions = String(row.positions || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `•  ***${line}***`)
      .join("\n");
    const assistants = jsonArray(row.assistant_ids);
    const description = [
      `<@${row.discord_id}>`,
      "",
      role ? `<@&${role.id}>` : `***${title}***`,
      positions,
      assistants.length ? `\n**Assistants:**\n${assistants.map((id) => `<@${id}>`).join("\n")}` : "",
    ].filter((part) => part !== "").join("\n");
    return new EmbedBuilder()
      .setColor(colorNumber(row.color, role?.color || COLORS.primary))
      .setTitle(`${call}${text(displayName, 80) || row.discord_id}`)
      .setDescription(clip(description, 4000))
      .setFooter({ text: `Florida Bay Roleplay · ${title} · ${index + 1} of ${total}` });
  }

  async function payloads(guild, title) {
    const entries = await rows(guild.id);
    const embeds = await Promise.all(entries.map((row, index) => entryEmbed(guild, row, index, entries.length)));
    const header = card(text(title || DEFAULT_TITLE, 100), {
      color: COLORS.primary,
      description: "Follow the chain from top to bottom. Contact the first appropriate staff member for your issue before escalating it.",
      rows: [["Leadership", `${entries.length} member${entries.length === 1 ? "" : "s"}`], ["Last updated", `<t:${Math.floor(Date.now() / 1000)}:R>`]],
      footer: "Florida Bay Roleplay · Live chain of command",
    });
    if (!embeds.length) {
      header.setDescription("The chain of command is ready, but no members have been added yet. Use `/coc adduser` or `/coc newchain` to import the staff roster.");
      return [{ embeds: [header] }];
    }
    const output = [];
    for (let index = 0; index < embeds.length; index += ITEMS_PER_MESSAGE) {
      const page = embeds.slice(index, index + ITEMS_PER_MESSAGE);
      output.push({ embeds: index === 0 ? [header, ...page] : page });
    }
    return output;
  }

  async function render(guildId, actorId = client.user?.id) {
    const cfg = await config(guildId);
    if (!cfg) return null;
    const guild = client.guilds.cache.get(String(guildId)) || await client.guilds.fetch(String(guildId)).catch(() => null);
    if (!guild) throw new Error("The bot is not in the configured chain-of-command server.");
    const channel = await guild.channels.fetch(String(cfg.channel_id)).catch(() => null);
    if (!channel?.isTextBased() || channel.isThread?.()) throw new Error("The configured chain-of-command channel is unavailable.");
    const previousIds = jsonArray(cfg.message_ids);
    const previous = [];
    for (const id of previousIds) previous.push(await channel.messages.fetch(id).catch(() => null));
    const pages = await payloads(guild, cfg.title);
    const messageIds = [];
    for (let index = 0; index < pages.length; index++) {
      const payload = { ...pages[index], content: "", components: [], allowedMentions: { parse: [] } };
      const message = previous[index]
        ? await previous[index].edit(payload)
        : await channel.send(payload);
      messageIds.push(message.id);
    }
    for (const stale of previous.slice(pages.length)) if (stale?.deletable) await stale.delete().catch(() => null);
    await db.query("UPDATE chain_of_command_config SET message_ids=?,updated_by=?,updated_at=? WHERE guild_id=?", [JSON.stringify(messageIds), actorId, Date.now(), String(guildId)]);
    return { channel, messageIds, entries: (await rows(guildId)).length };
  }

  function scheduleRefresh(guildId, delay = 1200) {
    if (!guildId) return;
    clearTimeout(refreshTimers.get(String(guildId)));
    const timer = setTimeout(() => {
      refreshTimers.delete(String(guildId));
      void render(guildId).catch((error) => console.error("[FBRP CoC] refresh:", error.message || error));
    }, delay);
    timer.unref?.();
    refreshTimers.set(String(guildId), timer);
  }

  async function saveConfig(guildId, channelId, title, actorId) {
    const old = await config(guildId);
    const messageIds = old && String(old.channel_id) === String(channelId) ? jsonArray(old.message_ids) : [];
    await db.query(
      `INSERT INTO chain_of_command_config(guild_id,channel_id,title,message_ids,updated_by,updated_at)
       VALUES(?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE channel_id=VALUES(channel_id),title=VALUES(title),message_ids=VALUES(message_ids),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)`,
      [String(guildId), String(channelId), text(title || old?.title || DEFAULT_TITLE, 100), JSON.stringify(messageIds), actorId, Date.now()],
    );
    return old;
  }

  async function addOrUpdate(i, self = false) {
    if (!self) await requireManager(i);
    const user = self ? i.user : i.options.getUser("member", true);
    const existing = await db.one("SELECT * FROM chain_of_command_entries WHERE guild_id=? AND discord_id=?", [i.guildId, user.id]);
    const roster = await db.one(
      `SELECT m.rank_name,m.callsign,r.sort_order,
              (SELECT cutoff.sort_order FROM staff_roster_ranks cutoff WHERE cutoff.name=? ORDER BY cutoff.id LIMIT 1) cutoff
         FROM staff_roster_members m LEFT JOIN staff_roster_ranks r ON r.id=m.rank_id
        WHERE m.discord_id=? AND m.status<>'removed'`,
      [MINIMUM_RANK, user.id],
    );
    if (!roster || roster.cutoff === null || Number(roster.sort_order) > Number(roster.cutoff))
      throw new Error(`Only ${MINIMUM_RANK} and above can be included in the chain of command.`);
    if (self && !existing) throw new Error("Management must add you to the chain before you can update your own card.");
    const titleValue = self ? null : i.options.getString("title");
    const positions = parsePositions(i.options.getString("positions"));
    const assistants = parseAssistants(i.options.getString("assistants"));
    const color = self ? null : parseColor(i.options.getString("color"));
    const next = existing ? Number(existing.display_order) : Number((await db.one("SELECT COALESCE(MAX(display_order),0) n FROM chain_of_command_entries WHERE guild_id=?", [i.guildId]))?.n || 0) + 10;
    await db.query(
      `INSERT INTO chain_of_command_entries(guild_id,discord_id,display_order,title,positions,assistant_ids,color,active,added_by,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,TRUE,?,?,?)
       ON DUPLICATE KEY UPDATE title=VALUES(title),positions=VALUES(positions),assistant_ids=VALUES(assistant_ids),color=VALUES(color),active=TRUE,updated_at=VALUES(updated_at)`,
      [i.guildId, user.id, next,
        titleValue === null ? (existing?.title ?? null) : (["-", "clear"].includes(titleValue.trim().toLowerCase()) ? null : text(titleValue, 100)),
        positions === null ? (existing?.positions ?? null) : positions,
        JSON.stringify(assistants === null ? jsonArray(existing?.assistant_ids) : assistants),
        color === null ? (existing?.color ?? null) : (color || null),
        i.user.id, existing?.created_at || Date.now(), Date.now()],
    );
    await audit(i.user.id, self ? "coc.update_self" : existing ? "coc.update" : "coc.add", user.id, { guild: i.guildId });
    const result = await render(i.guildId, i.user.id);
    return card(self ? "Chain profile updated" : existing ? "Chain member updated" : "Chain member added", {
      color: COLORS.success,
      description: `<@${user.id}> is now live in <#${result.channel.id}>.`,
      rows: [["Position", String((await rows(i.guildId)).findIndex((row) => row.discord_id === user.id) + 1)], ["Messages", String(result.messageIds.length)]],
    });
  }

  async function command(i, sub) {
    if (sub === "updateself") return addOrUpdate(i, true);
    if (sub === "getorder") {
      const list = await rows(i.guildId);
      return card("Chain of command order", {
        description: list.length ? list.map((row, index) => `\`${String(index + 1).padStart(2, "0")}\` <@${row.discord_id}> · **${text(row.title || row.roster_rank || "Leadership", 80)}**`).join("\n") : "No chain members have been added.",
        footer: "Use /coc reorder to move a member",
      });
    }
    await requireManager(i);
    if (sub === "newchain") {
      const channel = i.options.getChannel("channel") || (i.guildId === DEFAULT_GUILD_ID ? await i.guild.channels.fetch(DEFAULT_CHANNEL_ID).catch(() => null) : i.channel);
      if (!channel?.isTextBased() || channel.isThread?.()) throw new Error("Choose a server text channel.");
      const old = await saveConfig(i.guildId, channel.id, i.options.getString("title"), i.user.id);
      if (!old || !(await db.one("SELECT 1 ok FROM chain_of_command_entries WHERE guild_id=? AND active=TRUE", [i.guildId]))) await importRoster(i.guildId, i.user.id);
      const result = await render(i.guildId, i.user.id);
      await audit(i.user.id, "coc.new", channel.id, { guild: i.guildId, entries: result.entries });
      return card("Chain of command is live", { color: COLORS.success, description: `Published **${result.entries}** leadership profiles in <#${channel.id}>.`, rows: [["Messages", String(result.messageIds.length)]] });
    }
    if (sub === "relocatecoc") {
      const channel = i.options.getChannel("channel", true);
      if (!channel?.isTextBased() || channel.isThread?.()) throw new Error("Choose a server text channel.");
      const old = await config(i.guildId);
      if (!old) throw new Error("Create the chain first with `/coc newchain`.");
      const oldChannel = await i.guild.channels.fetch(String(old.channel_id)).catch(() => null);
      const oldMessages = jsonArray(old.message_ids);
      await saveConfig(i.guildId, channel.id, old.title, i.user.id);
      const result = await render(i.guildId, i.user.id);
      if (oldChannel?.isTextBased() && oldChannel.id !== channel.id) for (const id of oldMessages) {
        const message = await oldChannel.messages.fetch(id).catch(() => null);
        if (message?.deletable) await message.delete().catch(() => null);
      }
      await audit(i.user.id, "coc.relocate", channel.id, { guild: i.guildId, from: old.channel_id });
      return card("Chain of command moved", { color: COLORS.success, description: `The live chain is now in <#${channel.id}>.` });
    }
    if (sub === "adduser" || sub === "updateuser") return addOrUpdate(i);
    if (sub === "removeuser") {
      const user = i.options.getUser("member", true);
      const result = await db.query("UPDATE chain_of_command_entries SET active=FALSE,updated_at=? WHERE guild_id=? AND discord_id=? AND active=TRUE", [Date.now(), i.guildId, user.id]);
      if (!result.affectedRows) throw new Error("That member is not on the chain of command.");
      await audit(i.user.id, "coc.remove", user.id, { guild: i.guildId });
      await render(i.guildId, i.user.id);
      return card("Chain member removed", { color: COLORS.warning, description: `<@${user.id}> was removed from the live chain.` });
    }
    if (sub === "reorder") {
      const user = i.options.getUser("member", true);
      const position = i.options.getInteger("position", true);
      const list = await rows(i.guildId);
      const current = list.findIndex((row) => row.discord_id === user.id);
      if (current < 0) throw new Error("That member is not on the chain of command.");
      const [moving] = list.splice(current, 1);
      const target = Math.max(0, Math.min(position - 1, list.length));
      list.splice(target, 0, moving);
      await db.transaction(async (query) => {
        for (let index = 0; index < list.length; index++) await query("UPDATE chain_of_command_entries SET display_order=?,updated_at=? WHERE guild_id=? AND discord_id=?", [(index + 1) * 10, Date.now(), i.guildId, list[index].discord_id]);
      });
      await audit(i.user.id, "coc.reorder", user.id, { guild: i.guildId, from: current + 1, to: target + 1 });
      await render(i.guildId, i.user.id);
      return card("Chain order updated", { color: COLORS.success, description: `<@${user.id}> is now **#${target + 1}**.` });
    }
    if (sub === "updatecoc") {
      const cfg = await config(i.guildId);
      if (!cfg) throw new Error("Create the chain first with `/coc newchain`.");
      const imported = await importRoster(i.guildId, i.user.id);
      const result = await render(i.guildId, i.user.id);
      await audit(i.user.id, "coc.refresh", cfg.channel_id, { guild: i.guildId, roster: imported });
      return card("Chain of command refreshed", { color: COLORS.success, description: `The board in <#${result.channel.id}> is live with **${result.entries}** members.`, rows: [["Roster records checked", String(imported)]] });
    }
    throw new Error(`Unknown chain-of-command action: ${humanize(sub)}.`);
  }

  async function start() {
    // The requested main-server board is self-installing. Existing installations keep their saved channel.
    const guild = client.guilds.cache.get(DEFAULT_GUILD_ID);
    if (guild) {
      const channel = await guild.channels.fetch(DEFAULT_CHANNEL_ID).catch(() => null);
      if (channel?.isTextBased()) {
        const cfg = await config(guild.id);
        if (!cfg) await saveConfig(guild.id, channel.id, DEFAULT_TITLE, client.user.id);
        if (!(await db.one("SELECT 1 ok FROM chain_of_command_entries WHERE guild_id=? AND active=TRUE", [guild.id]))) await importRoster(guild.id, client.user.id);
        await render(guild.id, client.user.id);
      }
    }
  }

  async function scheduleRosterRefresh(delay = 1200) {
    for (const row of await db.query("SELECT guild_id FROM chain_of_command_config")) scheduleRefresh(row.guild_id, delay);
  }

  return { command, render, scheduleRefresh, scheduleRosterRefresh, start };
}
