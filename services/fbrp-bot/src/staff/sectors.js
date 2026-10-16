import { readFileSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/**
 * Where the gang, department and business coordination teams live. Each sector bot keeps its
 * coordination roles in its config.toml and, for gangs and businesses, a `coordinators` table in its
 * own SQLite file. `/coordall remove` clears both so a person really leaves every coordination roster.
 */
const services = (name) => fileURLToPath(new URL(`../../../${name}/`, import.meta.url));

export const SECTORS = [
  { key: "gang", label: "Gangs", dir: services("gangsmanager"), db: "gang_manager.db" },
  { key: "department", label: "Departments", dir: services("deptmanager"), db: "department_manager.db" },
  { key: "business", label: "Businesses", dir: services("businessmanager"), db: "business_manager.db" },
];

/** A just-enough TOML reader: [section] headers, key = integer, key = [integers]. Everything else is ignored. */
export function parseToml(text) {
  const out = {};
  let section = "";
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      section = header[1];
      out[section] ??= {};
      continue;
    }
    const pair = line.match(/^("[^"]+"|[A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!pair) continue;
    const key = pair[1].replace(/^"|"$/g, "");
    const value = pair[2].trim();
    const target = (out[section] ??= {});
    if (/^\d+$/.test(value)) target[key] = value;
    else if (/^\[[\d\s,]*\]$/.test(value)) target[key] = value.slice(1, -1).split(",").map((v) => v.trim()).filter(Boolean);
  }
  return out;
}

const COORD_TABLES = /(^|\.)(coordinator_role_ids|category_coordinator_role_ids|coordinator_job_role_ids)$/;
const COORD_KEYS = /coord_team_role_id$|^coord_team_role_id$/;

/** { guildId, roleIds[] } for one sector, from its config.toml. Empty when the config is missing. */
export function sectorCoordRoles(sector) {
  const file = `${sector.dir}config.toml`;
  if (!existsSync(file)) return { guildId: null, roleIds: [] };
  const toml = parseToml(readFileSync(file, "utf8"));
  const bot = toml.bot || {};
  const roleIds = new Set();
  for (const [section, table] of Object.entries(toml))
    if (COORD_TABLES.test(section)) for (const value of Object.values(table)) roleIds.add(String(value));
  for (const [key, value] of Object.entries(bot))
    if (COORD_KEYS.test(key) && typeof value === "string") roleIds.add(value);
  return { guildId: bot.guild_id ? String(bot.guild_id) : null, roleIds: [...roleIds] };
}

/** Deletes the member from a sector bot's coordinator roster. Returns the rows removed. */
export function clearSectorRoster(sector, discordId) {
  const file = `${sector.dir}${sector.db}`;
  if (!existsSync(file)) return { rows: 0, skipped: "no database" };
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA busy_timeout=5000");
    let rows = 0;
    for (const [table, column] of [["coordinators", "member_id"], ["coordinator_liaisons", "member_id"]]) {
      const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!exists) continue;
      rows += Number(db.prepare(`DELETE FROM ${table} WHERE ${column}=?`).run(String(discordId)).changes || 0);
      rows += Number(db.prepare(`DELETE FROM ${table} WHERE ${column}=?`).run(Number(discordId)).changes || 0);
    }
    return { rows };
  } finally {
    db.close();
  }
}
