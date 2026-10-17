import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags, Partials } from "discord.js";
import { pool } from "../database.js";
import { recordInteraction } from "../audit-trail.js";
import { agencyRoleIds, allMembers, authority, config } from "./store.js";
import { UserError, fail, card, C } from "./util.js";
import { definitions } from "./commands.js";
import * as roster from "./roster.js";
import * as discipline from "./discipline.js";
import * as investigations from "./investigations.js";
import * as clocklog from "./clocklog.js";
import * as quota from "./quota.js";
import * as ranksync from "./ranksync.js";
import * as leave from "./leave.js";
import * as intel from "./intel.js";
import * as awards from "./awards.js";
import * as blacklist from "./blacklist.js";
import * as admin from "./admin.js";
import { refreshPanels } from "./panels.js";
import { resequence, scheduleResequence } from "./callsigns.js";

/**
 * FBRP | IAA Systems: a separate Discord application that runs the Internal Affairs Agency server.
 * It shares the FBRP database (and the .env of services/fbrp-bot) but has its own token.
 *
 *   IAA_BOT_TOKEN   bot token for the IAA application
 *   IAA_GUILD_ID    the Internal Affairs Agency server
 */

const TOKEN = process.env.IAA_BOT_TOKEN;
const GUILD_ID = process.env.IAA_GUILD_ID;
if (!TOKEN || !GUILD_ID) {
  console.error("[IAA] IAA_BOT_TOKEN and IAA_GUILD_ID must be set.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration],
  partials: [Partials.GuildMember],
});

const guild = () => client.guilds.cache.get(GUILD_ID);

/* ------------------------------------------------------------------ errors */

async function report(i, error) {
  const expected = error instanceof UserError;
  if (!expected) console.error(`[IAA] ${i.commandName || i.customId}:`, error);
  const body = { embeds: [expected ? fail(error.message) : card("Something went wrong", { color: C.red, description: "The error was logged. Try again, or tell a developer if it keeps happening." })], components: [] };
  try {
    if (i.deferred || i.replied) await i.editReply(body);
    else await i.reply({ ...body, flags: MessageFlags.Ephemeral });
  } catch {
    await i.followUp?.({ ...body, flags: MessageFlags.Ephemeral }).catch(() => null);
  }
}

/* ------------------------------------------------------------------ slash commands */

async function slash(i, actor) {
  const sub = i.options.getSubcommand(false);
  const group = i.options.getSubcommandGroup(false);
  switch (i.commandName) {
    case "iaa":
      if (group === "blacklist") return blacklist.command(i, actor, sub);
      if (sub === "add") return roster.add(i, actor);
      if (sub === "promote") return roster.move(i, actor, "promotion");
      if (sub === "demote") return roster.move(i, actor, "demotion");
      if (sub === "remove") return roster.remove(i, actor);
      if (sub === "callsigns") return roster.callsigns(i, actor);
      if (sub === "assign") return roster.assign(i, actor);
      if (sub === "orientation") return roster.orientation(i, actor);
      if (sub === "profile") return roster.profile(i, actor);
      if (sub === "history") return roster.historyCommand(i, actor);
      if (sub === "roster") return roster.rosterCommand(i, actor);
      break;
    case "investigation":
      return investigations.command(i, actor, sub);
    case "discipline":
      return discipline.command(i, actor, sub);
    case "activity":
      return quota.activityReport(i, actor);
    case "loa":
      return leave.command(i, actor, sub);
    case "commend":
      return awards.command(i, actor);
    case "intel":
      return intel.command(i, actor, group, sub);
    case "iaa-admin":
      return admin.command(i, actor, sub);
  }
  throw new UserError("Unknown command.");
}

async function autocomplete(i, actor) {
  const focused = i.options.getFocused(true).name;
  const sub = i.options.getSubcommand(false);
  if (i.commandName === "iaa" && focused === "rank") return roster.rankAutocomplete(i, actor);
  if (i.commandName === "iaa" && focused === "assignment") return roster.divisionAutocomplete(i);
  if (i.commandName === "investigation" && focused === "case") return investigations.caseAutocomplete(i, { openOnly: !["view", "reopen"].includes(sub) });
  if (i.commandName === "iaa-admin" && focused === "rank") return admin.rankAutocompleteAll(i);
  if (i.commandName === "iaa-admin" && focused === "key") return admin.channelKeyAutocomplete(i);
  return i.respond([]);
}

/* ------------------------------------------------------------------ components */

async function component(i, actor) {
  const [, area, action, ...args] = i.customId.split(":");
  if (i.isModalSubmit()) {
    if (area === "case") return investigations.modalSubmit(i, actor, action, args);
    if (area === "loa" && action === "denymodal") return leave.modal(i, args[0]);
  }
  if (area === "act" && action === "warn") return quota.applyInactivity(i, actor, args[0]);
  if (area === "loa") return leave.button(i, action, args[0]);
  if (area === "setup") return admin.button(i, actor, action);
  if (area === "case") return investigations.component(i, actor, action, args);
  if (area === "intel" && action === "view") return intel.viewButton(i, actor, args[0]);
  throw new UserError("This button has expired.");
}

client.on(Events.InteractionCreate, async (i) => {
  if (!i.isAutocomplete()) void recordInteraction((sql, args) => pool.query(sql, args), "iaa", i).catch(() => {});
  if (!i.inGuild() || i.guildId !== GUILD_ID) {
    if (i.isRepliable()) await i.reply({ content: "IAA Systems only works inside the Internal Affairs Agency server.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return;
  }
  try {
    const member = await i.guild.members.fetch(i.user.id);
    const actor = await authority(member);
    if (i.isAutocomplete()) return await autocomplete(i, actor);
    if (i.isChatInputCommand()) {
      const cfg = await config();
      if (!cfg.ready && i.commandName !== "iaa-admin") throw new UserError("IAA Systems has not been set up yet. High Command: run `/iaa-admin setup`.");
      return await slash(i, actor);
    }
    if ((i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) && i.customId.startsWith("iaa:")) return await component(i, actor);
  } catch (error) {
    if (i.isAutocomplete()) return i.respond([]).catch(() => null);
    await report(i, error);
  }
});

/* ------------------------------------------------------------------ member events */

client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild.id !== GUILD_ID || member.user.bot) return;
  intel.onJoin(member).catch((e) => console.warn(`[IAA] join screening: ${e.message}`));
});

client.on(Events.GuildMemberRemove, (member) => {
  if (member.guild.id !== GUILD_ID || member.user?.bot) return;
  intel.onLeave(member).catch(() => null);
  refreshPanels(member.guild, "chain", "directory");
  ranksync.queue(member.guild);
});

// Manual role edits (by people, not the bot) still keep the chain of command honest.
client.on(Events.GuildMemberUpdate, (before, after) => {
  if (after.guild.id !== GUILD_ID || before.partial) return;
  if (before.roles.cache.size !== after.roles.cache.size || before.roles.cache.some((r) => !after.roles.cache.has(r.id))) {
    void (async () => {
      const controlled = await agencyRoleIds();
      const added = [...after.roles.cache.keys()].filter((id) => controlled.has(id) && !before.roles.cache.has(id));
      await ranksync.enforceRosterRoles(after, { warnFor: added });
    })().catch((e) => console.warn(`[IAA] roster role enforcement: ${e.message}`));
    refreshPanels(after.guild, "chain", "directory");
    scheduleResequence(after.guild);
    ranksync.queue(after.guild);
  }
});

/* ------------------------------------------------------------------ scheduler */

const every = (ms, name, job, delay = ms) => {
  const run = async () => {
    const g = guild();
    if (!g || !(await config()).ready) return;
    await job(g).catch((e) => console.warn(`[IAA] ${name}: ${e.message}`));
  };
  setTimeout(() => {
    run();
    setInterval(run, ms);
  }, delay);
};

client.once(Events.ClientReady, async () => {
  const g = guild();
  if (!g) {
    console.error(`[IAA] Not in guild ${GUILD_ID}. Invite the bot first.`);
    return;
  }
  await g.commands.set(definitions);
  await allMembers(g);
  client.user.setPresence({ activities: [{ name: "the watchers 🦅", type: ActivityType.Watching }], status: "online" });
  if ((await config()).ready) {
    await resequence(g, { reason: "Startup sync" }).catch((e) => console.warn(`[IAA] startup resequence: ${e.message}`));
    await ranksync.reconcileRosterRoles(g).catch((e) => console.warn(`[IAA] startup roster role sync: ${e.message}`));
  }
  console.log(`[IAA] ${client.user.tag} ready in ${g.name} · ${definitions.length} commands registered.`);

  every(60_000, "expiry", async (gg) => {
    await discipline.expireDue(gg);
    await leave.tick(gg);
  }, 15_000);
  await clocklog.retireTerminal(g).catch((e) => console.warn(`[IAA] retire terminal: ${e.message}`));
  every(5_000, "clock log", clocklog.poll, 5_000);
  every(300_000, "rank sync", ranksync.sync, 20_000);
  every(3_600_000, "stale cases", investigations.remindStale, 120_000);
  every(600_000, "panels", async (gg) => refreshPanels(gg, "leaderboard", "board"), 30_000);
  every(6 * 3_600_000, "sweep", intel.sweep, 600_000);
});

client.on(Events.Error, (e) => console.error("[IAA] client error:", e.message));
process.on("unhandledRejection", (e) => console.error("[IAA] unhandled:", e));

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    console.log(`[IAA] ${signal}, shutting down.`);
    await client.destroy();
    await pool.end().catch(() => null);
    process.exit(0);
  });

client.login(TOKEN);
