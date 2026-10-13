import { Client, Events, GatewayIntentBits } from "discord.js";
import { pool } from "../database.js";
import { ensureServer } from "./setup.js";
import { renderAll } from "./panels.js";
import { ensurePanel, init } from "./tickets.js";

/** One-shot server build/repair: `node --env-file=.env src/devops/setup-cli.js`. Same code as /devops-admin setup. */
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
init(client);
client.once(Events.ClientReady, async () => {
  try {
    const guild = await client.guilds.fetch(process.env.DEVOPS_GUILD_ID);
    await guild.members.fetch().catch(() => null);
    const summary = await ensureServer(guild, { actorId: client.user.id, log: (m) => console.log(`[setup] ${m}`) });
    console.log("[setup] summary", JSON.stringify(summary));
    console.log("[setup] panels", (await renderAll(guild)).join(", "));
    await ensurePanel(guild).then(() => console.log("[setup] ticket panel posted"), (e) => console.warn(`[setup] ticket panel: ${e.message}`));
  } catch (error) {
    console.error("[setup] failed:", error);
    process.exitCode = 1;
  } finally {
    await client.destroy();
    await pool.end().catch(() => null);
    process.exit(process.exitCode || 0);
  }
});
client.login(process.env.DEVOPS_BOT_TOKEN);
