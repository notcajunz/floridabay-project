import { Client, EmbedBuilder, GatewayIntentBits, Partials } from "discord.js";
import { pool } from "./database.js";
import { roleManagerCommand } from "./role-manager.js";
import { roleManagerCommandNames, roleManagerCommands } from "./role-manager-commands.js";
import { COLORS, embed } from "./ui.js";

const token = String(process.env.ROLE_MANAGER_BOT_TOKEN || "");
if (!token) throw new Error("ROLE_MANAGER_BOT_TOKEN is required.");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

async function registerCommands(guild) {
  try {
    await guild.commands.set(roleManagerCommands);
    console.log(`[FBRP role manager] Registered ${roleManagerCommands.length} commands in ${guild.name}.`);
  } catch (error) {
    console.error(`[FBRP role manager] Could not register commands in ${guild.name} (${guild.id}):`, error.message || error);
  }
}

client.on("guildCreate", (guild) => void registerCommands(guild));

client.once("clientReady", async () => {
  console.log(`[FBRP role manager] Logged in as ${client.user.tag}.`);
  await Promise.all([...client.guilds.cache.values()].map(registerCommands));
  client.user.setActivity("managed roles");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || !roleManagerCommandNames.has(interaction.commandName)) return;
  await interaction.deferReply({ ephemeral: true });
  try {
    const result = await roleManagerCommand(interaction);
    const payload = result instanceof EmbedBuilder ? { embeds: [result] } : result;
    await interaction.editReply(payload);
  } catch (error) {
    console.error(`[FBRP role manager] /${interaction.commandName}:`, error);
    await interaction.editReply({
      embeds: [embed("Command failed", String(error?.message || error).slice(0, 1000), COLORS.danger)],
    }).catch(() => {});
  }
});

client.on("roleDelete", (role) => {
  void pool
    .query("DELETE FROM role_manager_roles WHERE guild_id=? AND role_id=?", [role.guild.id, role.id])
    .catch((error) => console.error("[FBRP role manager] role cleanup:", error.message || error));
});

async function shutdown(signal) {
  console.log(`[FBRP role manager] ${signal}, shutting down.`);
  client.destroy();
  await pool.end();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (error) => console.error("[FBRP role manager] unhandled rejection:", error));

await client.login(token);
