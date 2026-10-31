import { Client, EmbedBuilder, GatewayIntentBits } from "discord.js";
import { audit, db, hasPermission, pool } from "./database.js";
import { recordInteraction } from "./audit-trail.js";
import { createPersonalImporter } from "./personal-import.js";
import { createPersonals } from "./personals.js";
import { personalsCommandNames, personalsCommands } from "./personals-commands.js";
import { card, chunkLines, COLORS, embed, who } from "./ui.js";

/**
 * FBRP Personals: the Discord side of personal vehicles (/personal), on its own bot application.
 * The website (portal and AI importer) stays on the main bot's web panel; both share personals.js
 * and the database, and every change tells the game server to reload.
 */

const token = String(process.env.PERSONALS_BOT_TOKEN || "");
if (!token) throw new Error("PERSONALS_BOT_TOKEN is required.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const personals = createPersonals({ db, audit, hasPermission });
const importer = createPersonalImporter({ personals, audit, db });
const clean = (value, max = 1000) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);

/** One personal vehicle as an embed. */
function personalCard(title, row, { color = COLORS.success, description } = {}) {
  const trustLimit = row.tags.length ? personals.MAX_TRUSTED_WITH_TAG : personals.MAX_TRUSTED;
  return card(title, {
    color,
    description,
    rows: [
      ["Vehicle", `${clean(row.label)}\n\`${row.model}\``],
      ["ID · plate", `#${row.id} · \`${row.plate}\``],
      ["Owner", who(row.owner_id)],
      ["Status", `${row.enabled ? "Enabled" : "Disabled"}${row.bulletproof ? " · Bulletproof" : ""}${row.locked ? " · Locked by the DevOps team" : ""}`],
      [`Trusted (${row.trusted.length}/${trustLimit})`, row.trusted.length ? row.trusted.map((item) => `<@${item.discord_id}>`).join("\n") : "Nobody", false],
      ["Tag locks", row.tags.length ? row.tags.map((tag) => clean(tag.label)).join(", ") : "None", false],
    ],
  });
}

/** /personal: owners manage their own trust list; the designated manager runs the whole fleet. */
async function personalCommand(i, sub) {
  const actor = i.user.id;
  const vehicleId = () => {
    const id = Number(i.options.getString("vehicle", true));
    if (!Number.isInteger(id) || id < 1) throw new Error("Pick a vehicle from the list.");
    return id;
  };
  if (sub === "add") {
    const owner = i.options.getUser("owner", true);
    const row = await personals.create(actor, {
      model: i.options.getString("model", true),
      label: i.options.getString("label") || "",
      plate: i.options.getString("plate") || "",
      ownerId: owner.id,
      bulletproof: i.options.getBoolean("bulletproof") === true,
    });
    return personalCard("Personal vehicle added", row, { description: `${who(owner.id).split("\n")[0]} can spawn it from the **F7** garage under **Personal**.` });
  }
  if (sub === "edit") {
    const input = { id: vehicleId() };
    const label = i.options.getString("label");
    const model = i.options.getString("model");
    const plate = i.options.getString("plate");
    const enabled = i.options.getBoolean("enabled");
    const bulletproof = i.options.getBoolean("bulletproof");
    if (bulletproof !== null) input.bulletproof = bulletproof;
    if (label !== null) input.label = label;
    if (model !== null) input.model = model;
    if (plate !== null) input.plate = plate.trim() === "-" ? "" : plate;
    if (enabled !== null) input.enabled = enabled;
    if (Object.keys(input).length === 1) throw new Error("Choose at least one thing to change.");
    // A new model name also renames an imported vehicle's files, or the garage would say "not installed".
    const renamed = model !== null ? await importer.followModelChange(actor, input) : null;
    return personalCard("Personal vehicle updated", await personals.update(actor, input), {
      description: renamed ? `Vehicle files renamed from \`${renamed.previous}\` to \`${renamed.model}\`${renamed.started ? " and reloaded live" : ""}.` : undefined,
    });
  }
  if (sub === "owner")
    return personalCard("Personal vehicle transferred", await personals.setOwner(actor, { id: vehicleId(), ownerId: i.options.getUser("member", true).id }));
  if (sub === "remove") {
    const row = await personals.remove(actor, { id: vehicleId() });
    return personalCard("Personal vehicle removed", row, { color: COLORS.warning });
  }
  if (sub === "lock" || sub === "unlock") {
    const row = await personals.setLocked(actor, { id: vehicleId(), locked: sub === "lock" });
    return personalCard(sub === "lock" ? "Personal vehicle locked" : "Personal vehicle unlocked", row, {
      color: sub === "lock" ? COLORS.warning : COLORS.success,
      description: sub === "lock" ? "It cannot be spawned, and it despawns when anyone tries to use it. They are told the DevOps team locked it." : undefined,
    });
  }
  if (sub === "trust")
    return personalCard("Trust updated", await personals.trust(actor, { id: vehicleId(), discordId: i.options.getUser("member", true).id }));
  if (sub === "untrust")
    return personalCard("Trust updated", await personals.untrust(actor, { id: vehicleId(), discordId: i.options.getUser("member", true).id }));
  if (sub === "locktag" || sub === "unlocktag") {
    const tagId = Number(i.options.getString("tag", true));
    if (!Number.isInteger(tagId)) throw new Error("Pick a tag from the list.");
    const row = await (sub === "locktag" ? personals.lockTag : personals.unlockTag)(actor, { id: vehicleId(), tagId });
    return personalCard("Tag lock updated", row);
  }
  if (sub === "info") {
    const row = await personals.find(vehicleId());
    const relation = await personals.relation(actor, row);
    if (!relation && !(await personals.canManage(actor))) throw new Error("That vehicle is not yours.");
    return personalCard(`Personal #${row.id}`, row, { color: COLORS.primary });
  }
  const member = i.options.getUser("member");
  const all = Boolean(i.options.getBoolean("all"));
  const { manage, rows } = await personals.listFor(actor, { memberId: member?.id || null, all });
  const lines = rows.map(
    (row) => `\`${row.id}\` · **${clean(row.label)}** (\`${row.model}\` · \`${row.plate}\`)${row.enabled ? "" : " · disabled"} · <@${row.owner_id}> · ${row.trusted.length}/${row.tags.length ? personals.MAX_TRUSTED_WITH_TAG : personals.MAX_TRUSTED} trusted${row.tags.length ? ` · tag: ${clean(row.tags[0].label)}` : ""}`,
  );
  return card(all ? "All personal vehicles" : member ? `Personal vehicles · ${clean(member.globalName || member.username)}` : "Your personal vehicles", {
    description: chunkLines(lines, 3900)[0] || "No personal vehicles.",
    footer: manage ? "Management view" : undefined,
  });
}

async function personalAutocomplete(i) {
  const focused = i.options.getFocused(true);
  if (focused.name === "vehicle") return i.respond(await personals.choices(i.user.id, focused.value));
  if (focused.name !== "tag") return i.respond([]);
  const needle = String(focused.value || "").toLowerCase();
  const sub = i.options.getSubcommand(false);
  let rows;
  if (sub === "unlocktag") {
    const id = Number(i.options.getString("vehicle"));
    rows = id ? (await personals.find(id).catch(() => null))?.tags || [] : [];
  } else {
    rows = await personals.lockableTags(i.user.id, await personals.canManage(i.user.id));
  }
  return i.respond(
    rows
      .filter((row) => String(row.label).toLowerCase().includes(needle))
      .slice(0, 25)
      .map((row) => ({ name: `${row.label} · #${row.id}`.slice(0, 100), value: String(row.id) })),
  );
}

async function registerCommands(guild) {
  try {
    await guild.commands.set(personalsCommands);
    console.log(`[FBRP personals] Registered ${personalsCommands.length} commands in ${guild.name}.`);
  } catch (error) {
    console.error(`[FBRP personals] Could not register commands in ${guild.name} (${guild.id}):`, error.message || error);
  }
}

client.on("guildCreate", (guild) => void registerCommands(guild));

client.once("clientReady", async () => {
  console.log(`[FBRP personals] Logged in as ${client.user.tag} in ${client.guilds.cache.size} servers.`);
  await Promise.all([...client.guilds.cache.values()].map(registerCommands));
  client.user.setActivity("personal vehicles");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isAutocomplete()) void recordInteraction((sql, args) => pool.query(sql, args), "personals", interaction).catch(() => {});
  if (!personalsCommandNames.has(interaction.commandName)) return;
  if (interaction.isAutocomplete()) {
    await personalAutocomplete(interaction).catch((error) => {
      console.error("[FBRP personals] autocomplete:", error.message || error);
      return interaction.respond([]).catch(() => {});
    });
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply({ ephemeral: true });
  try {
    const result = await personalCommand(interaction, interaction.options.getSubcommand());
    const payload = result instanceof EmbedBuilder ? { embeds: [result] } : result;
    await interaction.editReply(payload);
  } catch (error) {
    console.error(`[FBRP personals] /${interaction.commandName}:`, error);
    await interaction.editReply({
      embeds: [embed("Command failed", String(error?.message || error).slice(0, 1000), COLORS.danger)],
    }).catch(() => {});
  }
});

async function shutdown(signal) {
  console.log(`[FBRP personals] ${signal}, shutting down.`);
  client.destroy();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (error) => console.error("[FBRP personals] unhandled rejection:", error));

await client.login(token);
