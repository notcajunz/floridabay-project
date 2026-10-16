import { ActivityType, ChannelType, Client, EmbedBuilder, Events, GatewayIntentBits, Partials, PermissionFlagsBits } from "discord.js";
import { db, pool } from "../database.js";
import { refreshSiteUrls } from "../site-url.js";
import { COLORS, embed, humanize, roleRef } from "../ui.js";
import { commandNames, definitions } from "./commands.js";
import { COMMAND_GUILD_IDS, QUEUE_LOG_CATEGORY_ID, QUEUE_LOG_ROLE_IDS, STAFF_GUILD_ID } from "./config.js";
import { QUEUE_LOG_PURPOSE } from "../queue-log.js";
import { createCoordination } from "./coordination.js";
import {
  activeStaff,
  bindClient,
  handlers,
  log,
  reconcileAllRosterJobs,
  reconcileRosterJobs,
  setStaffTeamRole,
  staffRankAutocomplete,
  syncStaffTeamRoles,
} from "./legacy.js";
import { reconcileManagerRoles } from "./roles.js";

/**
 * FBRP | Staff Assistant: a separate Discord application that lives in the staff server and runs
 * everything staff related (/staff, /roster, /callsign, /exam, /coordall and the /coord staff
 * coordination team commands). It shares the FBRP database and the .env of services/fbrp-bot.
 *
 * It is only in the staff server. Anything that has to happen in another server (rank roles, the
 * "manager+" roles in the main server, a network-wide ACE re-sync) is written to a queue table and
 * carried out by the main bot, which is in every server (src/staff-queue.js).
 *
 *   STAFF_BOT_TOKEN   bot token for the Staff Assistant application
 */

const token = String(process.env.STAFF_BOT_TOKEN || "");
if (!token) {
  console.error("[FBRP staff] STAFF_BOT_TOKEN is required.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});
bindClient(client);
const coordination = createCoordination({ client });

const clean = (value, max = 300) => String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

/* ------------------------------------------------------------------ autocomplete */

async function aceGroupAutocomplete(i) {
  const focused = i.options.getFocused(true);
  if (focused.name !== "ace_group") return i.respond([]);
  const needle = String(focused.value || "").toLowerCase();
  const rows = await db.query("SELECT name,label,rank_order FROM ace_groups ORDER BY rank_order DESC,name");
  return i.respond(
    rows
      .filter((row) => `${row.name} ${row.label}`.toLowerCase().includes(needle))
      .slice(0, 25)
      .map((row) => ({ name: `${row.label} · ${row.name} · rank ${row.rank_order}`.slice(0, 100), value: row.name })),
  );
}

async function autocomplete(i) {
  const focused = i.options.getFocused(true);
  if (i.commandName === "staff" && focused.name === "rank") return staffRankAutocomplete(i);
  if (i.commandName === "roster") return aceGroupAutocomplete(i);
  return i.respond([]);
}

/* ------------------------------------------------------------------ commands */

/** Subcommands that only read data; everything else is written to the staff audit channel. */
const READ_ONLY = new Set(["list", "profile", "hours", "leaderboard", "active"]);
const optionText = (option) => {
  if (option.user) return `<@${option.user.id}> \`${option.user.id}\``;
  if (option.role) return `${roleRef(option.role.id)} \`${option.role.id}\``;
  if (option.channel) return `<#${option.channel.id}>`;
  return clean(String(option.value), 300);
};

async function logCommandUse(i, error) {
  const sub = i.options.getSubcommand(false);
  if (!error && sub && READ_ONLY.has(sub)) return;
  const data = i.options.data[0]?.type === 1 ? i.options.data[0].options || [] : i.options.data;
  await log(i.guild, {
    title: `/${i.commandName}${sub ? ` ${sub}` : ""}${error ? " failed" : ""}`,
    color: error ? COLORS.danger : COLORS.primary,
    actor: i.user.id,
    fields: [
      ["Server", `${clean(i.guild?.name || "DM", 80)}\n<#${i.channelId}>`],
      ...data.slice(0, 18).map((option) => [humanize(option.name), optionText(option)]),
      ...(error ? [["Error", clean(error.message || error, 500), false]] : []),
    ],
  }, "staff_audit");
}

const staffHandlers = {
  ...handlers,
  coord: (i, sub) => coordination.command(i, sub),
};

client.on(Events.InteractionCreate, async (i) => {
  if (i.isAutocomplete()) {
    if (!commandNames.has(i.commandName)) return;
    await autocomplete(i).catch((error) => {
      console.error(`[FBRP staff] /${i.commandName} autocomplete:`, error);
      return i.respond([]).catch(() => {});
    });
    return;
  }
  if (!i.isChatInputCommand() || !staffHandlers[i.commandName]) return;
  await i.deferReply({ ephemeral: true });
  try {
    if (!i.guildId || !COMMAND_GUILD_IDS.includes(i.guildId)) throw new Error("Staff commands only work inside the staff server.");
    const result = await staffHandlers[i.commandName](i, i.options.getSubcommand(false));
    // The main /coc board lives in the main server, so ask the main bot to redraw it.
    if (["staff", "roster"].includes(i.commandName))
      void db.query(
        "INSERT INTO network_sync_queue(discord_id,requested_by,requested_at) VALUES('coc-refresh','staff-bot',?) ON DUPLICATE KEY UPDATE requested_at=VALUES(requested_at)",
        [Date.now()],
      ).catch(() => {});
    if (["staff", "roster", "coordall"].includes(i.commandName)) coordination.scheduleChain(2500);
    const payload = result instanceof EmbedBuilder ? { embeds: [result] } : result;
    const followUps = Array.isArray(payload?.followUps) ? payload.followUps : [];
    await i.editReply(followUps.length ? { ...payload, followUps: undefined } : payload);
    for (const extra of followUps) await i.followUp({ ...extra, ephemeral: true }).catch(() => {});
    void logCommandUse(i, null).catch(() => {});
  } catch (error) {
    void logCommandUse(i, error).catch(() => {});
    console.error(`[FBRP staff] /${i.commandName}:`, error);
    await i.editReply({ embeds: [embed("Command failed", clean(error.message || error, 1000), COLORS.danger)] }).catch(() => {});
  }
});

/* ------------------------------------------------------------------ member events */

client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild.id !== STAFF_GUILD_ID || member.user.bot) return;
  void (async () => {
    if (await activeStaff(member.id)) await setStaffTeamRole(member.id, true);
    await coordination.onMemberChange(member);
  })().catch((error) => console.error("[FBRP staff] member add:", error));
});

client.on(Events.GuildMemberRemove, (member) => {
  if (member.guild.id !== STAFF_GUILD_ID) return;
  coordination.scheduleChain();
});

client.on(Events.GuildMemberUpdate, (before, after) => {
  if (after.guild.id !== STAFF_GUILD_ID || after.user.bot) return;
  const changed = before.partial || before.roles.cache.size !== after.roles.cache.size || before.roles.cache.some((role) => !after.roles.cache.has(role.id));
  if (!changed) return;
  void (async () => {
    await reconcileRosterJobs(after);
    await coordination.onMemberChange(after);
  })().catch((error) => console.error("[FBRP staff] member update:", error));
});

/* ------------------------------------------------------------------ scheduled work */

async function sweep() {
  const guild = client.guilds.cache.get(STAFF_GUILD_ID);
  await syncStaffTeamRoles().catch((error) => console.error("[FBRP staff] Staff Team roles:", error));
  await reconcileAllRosterJobs().catch((error) => console.error("[FBRP staff] roster jobs:", error));
  if (guild) {
    await coordination.reconcileAll(guild).catch((error) => console.error("[FBRP staff] coordination team:", error));
    await coordination.refreshChain().catch((error) => console.error("[FBRP staff] chain board:", error.message || error));
  }
}

let lastManagerReport = "";
async function managerRoles() {
  const report = await reconcileManagerRoles();
  const changes = report.filter((row) => row.added?.length || row.removed?.length || row.skipped);
  const text = JSON.stringify(changes.map((row) => [row.key, row.added, row.removed, row.skipped]));
  if (!changes.length || text === lastManagerReport) return;
  lastManagerReport = text;
  await log(client.guilds.cache.get(STAFF_GUILD_ID), {
    title: "Manager+ roles queued for the main bot",
    color: COLORS.primary,
    fields: changes.map((row) => [
      row.label,
      `Add: ${row.added.length ? row.added.map((id) => `<@${id}>`).join(" ") : "none"}\nRemove: ${row.removed.length ? row.removed.map((id) => `<@${id}>`).join(" ") : "none"}${row.skipped ? `\nHeld back: ${row.skipped}` : ""}`.slice(0, 1000),
      false,
    ]),
  }, "staff_audit");
}

/** Creates (once) the Community Director+ channel that mirrors the request queue to the main bot. */
async function ensureQueueLogChannel(guild) {
  const binding = await db.one("SELECT channel_id FROM discord_channel_bindings WHERE purpose=?", [QUEUE_LOG_PURPOSE]).catch(() => null);
  if (binding && (await guild.channels.fetch(String(binding.channel_id)).catch(() => null))) return;
  const view = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
  const bots = [client.user.id, process.env.DISCORD_APPLICATION_ID].filter(Boolean);
  const channel = await guild.channels.create({
    name: "role-queue-log",
    type: ChannelType.GuildText,
    parent: QUEUE_LOG_CATEGORY_ID,
    topic: "Role and sync requests the staff bot sends to the main bot: queued and completed. Community Director and above.",
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ...QUEUE_LOG_ROLE_IDS.map((id) => ({ id, allow: view })),
      ...bots.map((id) => ({ id, allow: [...view, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] })),
    ],
    reason: "Staff bot request queue log",
  });
  await db.query(
    "INSERT INTO discord_channel_bindings(purpose,guild_id,channel_id,updated_by,updated_at) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE guild_id=VALUES(guild_id),channel_id=VALUES(channel_id),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)",
    [QUEUE_LOG_PURPOSE, guild.id, channel.id, client.user.id, Date.now()],
  );
  console.log(`[FBRP staff] Created #${channel.name} (${channel.id}) for the request queue log.`);
}

client.once(Events.ClientReady, async () => {
  console.log(`[FBRP staff] Logged in as ${client.user.tag}`);
  await refreshSiteUrls().catch(() => {});
  for (const guildId of COMMAND_GUILD_IDS) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.error(`[FBRP staff] Not in command server ${guildId}.`);
      continue;
    }
    await guild.commands
      .set(definitions)
      .then(() => console.log(`[FBRP staff] Registered ${definitions.length} commands in ${guild.name}.`))
      .catch((error) => console.error(`[FBRP staff] Could not register commands in ${guild.name}:`, error.message || error));
  }
  const staffGuild = client.guilds.cache.get(STAFF_GUILD_ID);
  if (staffGuild) await staffGuild.members.fetch().catch((error) => console.error("[FBRP staff] member fetch:", error.message || error));
  if (staffGuild) await ensureQueueLogChannel(staffGuild).catch((error) => console.error("[FBRP staff] queue log channel:", error.message || error));
  await sweep();
  await managerRoles().catch((error) => console.error("[FBRP staff] manager+ roles:", error));
  setInterval(() => void sweep(), 600000).unref();
  setInterval(() => void managerRoles().catch((error) => console.error("[FBRP staff] manager+ roles:", error)), 300000).unref();
  client.user.setPresence({ activities: [{ name: "the staff team", type: ActivityType.Watching }], status: "online" });
});

const shutdown = async (signal) => {
  console.log(`[FBRP staff] ${signal}, shutting down.`);
  client.destroy();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (error) => console.error("[FBRP staff] unhandled rejection:", error));
await client.login(token);
