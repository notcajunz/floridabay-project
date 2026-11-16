#!/usr/bin/env node
import mysql from "../services/fbrp-bot/node_modules/mysql2/promise.js";

const OWNER_ID = "1090083387638812755";

// Definitions and reusable server configuration survive a season reset. Every
// other table is player-, member-, organization-, history-, cache-, or queue data.
const preserved = new Set([
  "ace_entries",
  "ace_groups",
  "audit_mirror_channels",
  "bot_config",
  "chain_of_command_config",
  "devops_config",
  "devops_ranks",
  "discord_channel_bindings",
  "discord_guild_roles",
  "discord_role_bindings",
  "discord_role_sources",
  "discord_server_backup_guilds",
  "discord_server_backups",
  "door_settings",
  "gg_studio_migrations",
  "gg_studio_settings",
  "gg_studio_settings_meta",
  "iaa_config",
  "iaa_ranks",
  "iaa_watch_servers",
  "jax_water_zones",
  "network_allowed_bots",
  "network_guilds",
  "network_sync_anchors",
  "network_sync_guild_settings",
  "network_sync_guilds",
  "network_sync_roles",
  "network_syncs",
  "offices",
  "ox_doorlock",
  "property_doors",
  "property_points",
  "protected_roles",
  "radio_channels",
  "role_manager_roles",
  "schema_migrations",
  "sky_phone_company_services",
  "sky_phone_configurator",
  "sky_phone_crypto_markets",
  "sky_phone_migrations",
  "sky_phone_webhooks",
  "staff_exams",
  "staff_roster_categories",
  "staff_roster_jobs",
  "staff_roster_ranks",
  "station_doors",
  "ticket_priorities",
  "ticket_settings",
  "ticket_support_roles",
  "ticket_types",
]);

const required = ["ace_entries", "ace_groups", "ace_memberships", "schema_migrations"];
const execute = process.argv.includes("--execute");
const connection = await mysql.createConnection({
  host: process.env.MARIADB_HOST || "127.0.0.1",
  port: Number(process.env.MARIADB_PORT || 3306),
  database: process.env.MARIADB_DATABASE || "fbrp",
  user: process.env.MARIADB_USER || "fbrp",
  password: String(process.env.MARIADB_PASSWORD || ""),
  charset: "utf8mb4",
  supportBigNumbers: true,
});

try {
  const [rows] = await connection.query(
    "SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",
  );
  const tables = rows.map((row) => String(row.name));
  for (const name of required) {
    if (!tables.includes(name)) throw new Error(`Required table is missing: ${name}`);
  }
  const wipe = tables.filter((name) => !preserved.has(name));
  console.log(`Preserving ${tables.length - wipe.length} configuration tables; wiping ${wipe.length} data tables.`);
  if (!execute) {
    console.log("Dry run only. Re-run with --execute after taking backups.");
    process.exitCode = 2;
  } else {
    await connection.query("SET FOREIGN_KEY_CHECKS=0");
    await connection.beginTransaction();
    try {
      for (const name of wipe) await connection.query(`DELETE FROM \`${name}\``);
      await connection.query(
        "INSERT INTO ace_memberships(discord_id,group_name,origin,added_by,added_at) VALUES(?,?,?,?,?)",
        [OWNER_ID, "owner", "season-reset", "system", Date.now()],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.query("SET FOREIGN_KEY_CHECKS=1");
    }

    for (const name of wipe) {
      const [columns] = await connection.query(
        "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND EXTRA LIKE '%auto_increment%' LIMIT 1",
        [name],
      );
      if (columns.length) await connection.query(`ALTER TABLE \`${name}\` AUTO_INCREMENT=1`);
    }

    for (const name of wipe) {
      const [count] = await connection.query(`SELECT COUNT(*) count FROM \`${name}\``);
      if (Number(count[0].count) !== (name === "ace_memberships" ? 1 : 0))
        throw new Error(`Post-reset row count is wrong for ${name}: ${count[0].count}`);
    }
    const [owners] = await connection.query(
      "SELECT discord_id,group_name FROM ace_memberships ORDER BY discord_id,group_name",
    );
    if (owners.length !== 1 || String(owners[0].discord_id) !== OWNER_ID || owners[0].group_name !== "owner")
      throw new Error("ACE memberships were not reduced to the designated owner.");
    console.log("MariaDB season data reset and verified.");
  }
} finally {
  await connection.end();
}
