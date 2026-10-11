import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.MARIADB_HOST || "127.0.0.1",
  port: Number(process.env.MARIADB_PORT || 3306),
  database: process.env.MARIADB_DATABASE || "fbrp",
  user: process.env.MARIADB_USER || "fbrp",
  password: String(process.env.MARIADB_PASSWORD || ""),
  connectionLimit: 8,
  charset: "utf8mb4",
  supportBigNumbers: true,
});

export const db = {
  async query(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows;
  },
  async one(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows[0] || null;
  },
  async transaction(work) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const query = async (sql, params = []) =>
        (await connection.query(sql, params))[0];
      const result = await work(query);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
};

export const audit = (actor, action, target, payload = {}) =>
  db.query(
    "INSERT INTO audit_log(actor_id,action,target_id,payload,created_at) VALUES(?,?,?,?,?)",
    [
      String(actor || "system"),
      action,
      target ? String(target) : null,
      JSON.stringify(payload),
      Date.now(),
    ],
  );

/** FiveM ACE semantics: `a.b` (or `a.b.*`) also covers every `a.b.<child>`. */
const matchObject = (pattern, object) => {
  const base = pattern.endsWith(".*") ? pattern.slice(0, -2) : pattern;
  return pattern === "*" || object === base || object.startsWith(`${base}.`);
};

export const superuserIds = () =>
  new Set(
    String(process.env.FBRP_SUPERUSER_IDS || process.env.FBRP_OWNER_DISCORD_ID || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

/**
 * A member's staff level: the highest rank_order of any ACE group they belong to directly.
 * Bot superusers outrank everyone; members of no group are -1.
 */
export async function staffLevel(discordId) {
  if (superuserIds().has(String(discordId))) return Number.POSITIVE_INFINITY;
  const row = await db.one(
    `SELECT MAX(g.rank_order) level
       FROM ace_memberships m JOIN ace_groups g ON g.name=m.group_name
      WHERE m.discord_id=?
        AND (m.origin NOT LIKE 'discord:%' OR m.group_name='ban_blacklist_moderator')`,
    [String(discordId)],
  );
  return row?.level === null || row?.level === undefined ? -1 : Number(row.level);
}

export async function hasPermission(discordId, object) {
  if (superuserIds().has(String(discordId))) return true;
  const rows = await db.query(
    `
    SELECT e.object,e.mode
    FROM ace_memberships m
    JOIN ace_entries e ON e.group_name=m.group_name
    WHERE m.discord_id=?
    ORDER BY e.mode='deny' DESC`,
    [discordId],
  );
  let allowed = false;
  for (const row of rows) {
    if (!matchObject(String(row.object), object)) continue;
    if (row.mode === "deny") return false;
    allowed = true;
  }
  return allowed;
}

export function safeName(value, label = "name") {
  const result = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!result || result.length > 40)
    throw new Error(
      `Invalid ${label}. Use 1–40 letters, numbers, underscores, or hyphens.`,
    );
  return result;
}

export function hexColor(value) {
  const text = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(text))
    throw new Error("Color must be a six-digit hex value such as #43E8D8.");
  return text;
}
