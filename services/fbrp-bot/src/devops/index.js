import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags, Partials } from "discord.js";
import { pool } from "../database.js";
import { allMembers, authority, config, db, post } from "./store.js";
import { C, EPHEMERAL, UserError, card, fail, mention, respond, ts } from "./util.js";
import { definitions } from "./commands.js";
import * as roster from "./roster.js";
import * as discipline from "./discipline.js";
import * as leave from "./leave.js";
import * as awards from "./awards.js";
import * as tasks from "./tasks.js";
import * as incidents from "./incidents.js";
import * as comms from "./comms.js";
import * as tickets from "./tickets.js";
import * as admin from "./admin.js";
import * as ranksync from "./ranksync.js";
import * as status from "./status.js";
import * as lookups from "./lookups.js";
import { refreshPanels, renderPanel } from "./panels.js";

/**
 * FBRP | DevOps: a separate Discord application that runs the FBRP development team server.
 * It shares the FBRP database (and the .env of services/fbrp-bot) but has its own token.
 *
 *   DEVOPS_BOT_TOKEN   bot token for the DevOps application
 *   DEVOPS_GUILD_ID    the FBRP | DevOps server
 */

const TOKEN = process.env.DEVOPS_BOT_TOKEN;
const GUILD_ID = process.env.DEVOPS_GUILD_ID;
if (!TOKEN || !GUILD_ID) {
  console.error("[DevOps] DEVOPS_BOT_TOKEN and DEVOPS_GUILD_ID must be set.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.GuildMember],
});
tickets.init(client);
status.setClient(client);

const guild = () => client.guilds.cache.get(GUILD_ID);

/* ------------------------------------------------------------------ errors */

async function report(i, error) {
  const expected = error instanceof UserError;
  if (!expected) console.error(`[DevOps] ${i.commandName || i.customId}:`, error);
  const body = {
    embeds: [expected ? fail(error.message) : card("Something went wrong", { color: C.red, description: "The error was logged. Try again, or tell a developer if it keeps happening." })],
    components: [],
  };
  try {
    if (i.deferred || i.replied) await i.editReply(body);
    else await i.reply({ ...body, flags: MessageFlags.Ephemeral });
  } catch {
    await i.followUp?.({ ...body, flags: MessageFlags.Ephemeral }).catch(() => null);
  }
}

/* ------------------------------------------------------------------ slash commands */

const HELP = [
  ["👥 Roster · `/dev`", "`add` · `promote` · `demote` · `remove` · `team` · `profile` · `history` · `roster`\nHead Developer+ manages ranks below their own. Manager+ removes."],
  ["⚖️ Discipline · `/discipline`", "`warn` · `strike` · `suspend` · `revoke` · `record`\nHead Developer+ warns and strikes. Manager+ suspends."],
  ["🌴 Leave · `/loa`", "`request` · `end` · `list`\nLeadership approves with the buttons."],
  ["🏅 Awards · `/commend`", "`give` · `dotm` · `list`"],
  ["📋 Tasks · `/task`", "`add` · `list` · `view` · `claim` · `assign` · `status` · `done` · `delete`\nThe live board is in the task-board channel."],
  ["🚨 Incidents · `/incident`", "`open` · `update` · `resolve` · `commander` · `list` · `view`\nDevelopers and up. Posts to the public status page."],
  ["📣 Comms", "`/release post` · `/announce` · `/standup`"],
  ["🎫 Tickets · `/ticket` `/support`", "General Support and Purchase Support. Staff claim, prioritise, note and close from the buttons."],
  ["🟢 Status · `/devops status`", "Live game server, website, database and bot health."],
  ["🔎 Public lookups", "`/vehicle lookup` · `/personals owned` · `/headtag info` · `/headtag owned`\nAvailable to everyone in this server."],
];

async function slash(i, actor) {
  const sub = i.options.getSubcommand(false);
  switch (i.commandName) {
    case "dev":
      if (sub === "add") return roster.add(i, actor);
      if (sub === "promote") return roster.move(i, actor, "promotion");
      if (sub === "demote") return roster.move(i, actor, "demotion");
      if (sub === "remove") return roster.remove(i, actor);
      if (sub === "team") return roster.assign(i, actor);
      if (sub === "profile") return roster.profile(i);
      if (sub === "history") return roster.historyCommand(i, actor);
      if (sub === "roster") return roster.rosterCommand(i);
      break;
    case "discipline":
      return discipline.command(i, actor, sub);
    case "loa":
      return leave.command(i, actor, sub);
    case "commend":
      return awards.command(i, actor, sub);
    case "task":
      return tasks.command(i, actor, sub);
    case "incident":
      return incidents.command(i, actor, sub);
    case "release":
      return comms.releaseCommand(i, actor, sub);
    case "announce":
      return comms.announceCommand(i, actor);
    case "standup":
      return comms.standupCommand(i, actor);
    case "vehicle":
      if (sub === "lookup") return lookups.vehicle(i);
      break;
    case "personals":
      if (sub === "owned") return lookups.personals(i);
      break;
    case "headtag":
      if (sub === "info") return lookups.headtagInfo(i);
      if (sub === "owned") return lookups.headtagsOwned(i);
      break;
    case "ticket": {
      // The intake form must be shown within three seconds, so it cannot wait behind a deferred reply.
      if (sub === "open") return i.showModal(tickets.intakeModal(i.options.getString("type", true)));
      await i.deferReply(EPHEMERAL);
      const result = await tickets.command(i, sub);
      return i.editReply(result?.embeds || result?.files ? result : { embeds: [result] });
    }
    case "support": {
      await i.deferReply(EPHEMERAL);
      return i.editReply({ embeds: [await tickets.supportCommand(i, sub)] });
    }
    case "devops":
      if (sub === "status") {
        await i.deferReply(EPHEMERAL);
        return i.editReply({ embeds: await status.statusEmbeds() });
      }
      return respond(i, { embeds: [card("🛠️ FBRP DevOps bot", { color: C.teal, description: "Everything the development team runs on, from the roster to the ticket queue.", fields: HELP.map(([n, v]) => [n, v, false]) })] });
    case "devops-admin":
      return admin.command(i, actor, sub);
  }
  throw new UserError("Unknown command.");
}

async function autocomplete(i, actor) {
  const focused = i.options.getFocused(true).name;
  const name = i.commandName;
  if (name === "dev" && focused === "rank") return roster.rankAutocomplete(i, actor);
  if (name === "dev" && focused === "team") return roster.divisionAutocomplete(i);
  if (name === "task" && focused === "id") return tasks.autocomplete(i);
  if (name === "incident" && focused === "id") return incidents.autocomplete(i);
  if ((name === "ticket" || name === "support") && ["type", "level"].includes(focused)) return tickets.autocomplete(i);
  if (name === "devops-admin" && focused === "rank") return roster.allRankAutocomplete(i);
  if ((name === "vehicle" && focused === "query") || (name === "headtag" && focused === "tag")) return lookups.autocomplete(i);
  return i.respond([]);
}

/* ------------------------------------------------------------------ components */

async function toggleNotify(i, key) {
  const cfg = await config();
  const roleId = cfg.roles[`notify:${key}`];
  if (!roleId) throw new UserError("That notification role is not set up.");
  const member = await i.guild.members.fetch(i.user.id);
  const has = member.roles.cache.has(roleId);
  await (has ? member.roles.remove(roleId, "Notification toggle") : member.roles.add(roleId, "Notification toggle"));
  return i.reply({ ...EPHEMERAL, embeds: [card(has ? "🔕 Turned off" : "🔔 Turned on", { color: has ? C.grey : C.green, description: `You will ${has ? "no longer" : "now"} be pinged for **${key}**.` })] });
}

async function component(i, actor) {
  const [, area, action, ...args] = i.customId.split(":");
  if (i.isModalSubmit()) {
    if (area === "release") return comms.releaseModal(i, action === "1");
    if (area === "announce") return comms.announceModal(i, action, args[0] === "1");
    if (area === "standup") return comms.standupModal(i);
    if (area === "loa" && action === "denymodal") return leave.modal(i, args[0]);
  }
  if (area === "notify") return toggleNotify(i, action);
  if (area === "loa") return leave.button(i, action, args[0]);
  if (area === "trial") return roster.trialButton(i, action, args[0]);
  void actor;
  throw new UserError("This button has expired.");
}

client.on(Events.InteractionCreate, async (i) => {
  if (!i.inGuild() || i.guildId !== GUILD_ID) {
    if (i.isRepliable()) await i.reply({ content: "The DevOps bot only works inside the FBRP | DevOps server.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return;
  }
  try {
    const cfg = await config();
    // Ticket buttons, menus and modals have their own id scheme.
    const id = i.customId || "";
    if (!i.isChatInputCommand() && !i.isAutocomplete() && (id.startsWith("ticket:") || id.startsWith("tk:"))) {
      if (await tickets.component(i)) return;
    }
    const member = await i.guild.members.fetch(i.user.id);
    const actor = await authority(member);
    if (i.isAutocomplete()) return await autocomplete(i, actor);
    if (i.isChatInputCommand()) {
      const setupCommand = i.commandName === "devops-admin" && i.options.getSubcommand(false) === "setup";
      if (!cfg.ready && !setupCommand) throw new UserError("The DevOps server has not been set up yet. An administrator needs to run `/devops-admin setup`.");
      return await slash(i, actor);
    }
    if ((i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) && id.startsWith("dv:")) return await component(i, actor);
  } catch (error) {
    if (i.isAutocomplete()) return i.respond([]).catch(() => null);
    await report(i, error);
  }
});

/* ------------------------------------------------------------------ member events */

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== GUILD_ID) return;
  try {
    if (member.user.bot) {
      await post(member.guild, "security", {
        embeds: [card("🤖 Bot added", { color: C.amber, description: `${member} (\`${member.id}\`) was added to the server.`, fields: [["Account created", ts(member.user.createdTimestamp, "R")]] })],
      });
      return;
    }
    const prior = await db.one("SELECT status,removed_at FROM devops_members WHERE discord_id=?", [member.id]);
    await post(member.guild, "joinLeave", {
      embeds: [
        card("📥 Member joined", {
          color: C.green,
          thumbnail: member.displayAvatarURL(),
          fields: [["Member", `${member}\n\`${member.id}\``], ["Account created", ts(member.user.createdTimestamp, "R")], prior ? ["Roster history", `Previously **${prior.status}**${prior.removed_at ? ` ${ts(prior.removed_at, "R")}` : ""}`] : null],
        }),
      ],
    });
  } catch (error) {
    console.warn(`[DevOps] join log: ${error.message}`);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (member.guild.id !== GUILD_ID || member.user?.bot) return;
  await post(member.guild, "joinLeave", { embeds: [card("📤 Member left", { color: C.grey, description: `${member.user ? mention(member.id) : `\`${member.id}\``} left the server.` })] }).catch(() => null);
  refreshPanels(member.guild, "chain");
  ranksync.queue(member.guild, 15000);
});

// Manual role edits (by people, not the bot) still keep the roster honest.
client.on(Events.GuildMemberUpdate, (before, after) => {
  if (after.guild.id !== GUILD_ID || before.partial) return;
  if (before.roles.cache.size !== after.roles.cache.size || before.roles.cache.some((r) => !after.roles.cache.has(r.id))) {
    refreshPanels(after.guild, "chain");
    ranksync.queue(after.guild);
  }
});

client.on(Events.MessageCreate, (message) => {
  if (message.guildId !== GUILD_ID) return;
  tickets.onMessage(message).catch(() => null);
});

/* ------------------------------------------------------------------ scheduler */

const every = (ms, name, job, delay = ms) => {
  const run = async () => {
    const g = guild();
    if (!g || !(await config()).ready) return;
    await job(g).catch((e) => console.warn(`[DevOps] ${name}: ${e.message}`));
  };
  setTimeout(() => {
    run();
    setInterval(run, ms);
  }, delay);
};

client.once(Events.ClientReady, async () => {
  const g = guild();
  if (!g) {
    console.error(`[DevOps] Not in guild ${GUILD_ID}. Invite the bot first.`);
    return;
  }
  await g.commands.set(definitions);
  await allMembers(g);
  client.user.setPresence({ activities: [{ name: "the build pipeline 🛠️", type: ActivityType.Watching }], status: "online" });
  console.log(`[DevOps] ${client.user.tag} ready in ${g.name} · ${definitions.length} commands registered.`);

  every(60_000, "expiry", async (gg) => {
    await discipline.expireDue(gg);
    await leave.tick(gg);
    await tickets.slaTick(gg);
  }, 15_000);
  every(60_000, "status panel", (gg) => renderPanel(gg, "status"), 20_000);
  every(300_000, "rank sync", ranksync.sync, 25_000);
  every(600_000, "panels", async (gg) => {
    await roster.trialTick(gg);
    await renderPanel(gg, "tasks");
    await renderPanel(gg, "chain");
  }, 40_000);
  every(3_600_000, "task reminders", tasks.remind, 120_000);
});

client.on(Events.Error, (e) => console.error("[DevOps] client error:", e.message));
process.on("unhandledRejection", (e) => console.error("[DevOps] unhandled:", e));

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    console.log(`[DevOps] ${signal}, shutting down.`);
    await client.destroy();
    await pool.end().catch(() => null);
    process.exit(0);
  });

client.login(TOKEN);
