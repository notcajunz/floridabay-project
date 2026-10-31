/**
 * Apply an organization blueprint to its Discord server and the orgs website roster.
 *
 *   node --env-file=.env src/org-discord-setup-run.js pbh <guildId> [--apply]
 *
 * Without --apply it only prints the plan (nothing is changed). Uses the main bot's REST token, so
 * it does not open a second gateway connection.
 */
import { REST } from "discord.js";
import mysql from "mysql2/promise";

import { PALM_BEACH_HOTRODS, applyGuild, applyRanks } from "./org-discord-setup.js";

const BLUEPRINTS = { pbh: PALM_BEACH_HOTRODS };
const [slug, guildId, ...flags] = process.argv.slice(2);
const dryRun = !flags.includes("--apply");
const blueprint = BLUEPRINTS[slug];
if (!blueprint || !/^\d{15,24}$/.test(guildId || "")) {
  console.error("usage: org-discord-setup-run.js <blueprint> <guildId> [--apply]");
  process.exit(2);
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);
const api = {
  get: (route) => rest.get(route),
  post: (route, body) => rest.post(route, { body }),
  patch: (route, body) => rest.patch(route, { body }),
};
const db = await mysql.createConnection({
  host: process.env.MARIADB_HOST, port: Number(process.env.MARIADB_PORT), user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD, database: process.env.MARIADB_DATABASE,
});
const query = async (sql, params = []) => (await db.query(sql, params))[0];

try {
  const [org] = await query("SELECT id,slug,name,guild_id FROM organizations WHERE slug=? AND active=TRUE", [blueprint.orgSlug]);
  if (!org) throw new Error(`Organization ${blueprint.orgSlug} not found.`);
  if (org.guild_id && String(org.guild_id) !== guildId) throw new Error(`${org.name} is linked to a different server.`);
  const me = await rest.get("/users/@me");
  console.log(dryRun ? "DRY RUN (add --apply to change anything)" : "APPLYING", `-> ${org.name} in guild ${guildId}`);
  const result = await applyGuild(api, guildId, blueprint, { dryRun, botId: me.id, log: (line) => console.log(" ", line) });
  const ranks = await applyRanks(query, org, guildId, result.roleIds, blueprint, { actorId: String(process.env.FBRP_OWNER_DISCORD_ID || "system"), dryRun });
  if (!dryRun) await query("INSERT INTO org_roster_log(org_id,actor_id,action,target_id,detail,created_at) VALUES(?,?,?,?,?,?)", [org.id, "system", "discord_setup", null, JSON.stringify({ ranks: ranks.map((r) => r.name), guildId }), Date.now()]).catch(() => {});
  console.log(JSON.stringify({ ...result, roleIds: undefined, ranks }, null, 2));
} finally {
  await db.end();
}
