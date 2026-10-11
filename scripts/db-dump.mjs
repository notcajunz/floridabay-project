// Deterministic logical dump of the Florida Bay MariaDB database to stdout (no timestamps, so an
// unchanged database produces an identical file). Used by scripts/github-sync.sh.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "../services/fbrp-bot/node_modules/mysql2/promise.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
try {
  for (const line of readFileSync(path.join(root, "services/fbrp-bot/.env"), "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const connection = await mysql.createConnection({
  host: env.MARIADB_HOST || "127.0.0.1",
  port: Number(env.MARIADB_PORT || 3306),
  user: env.MARIADB_USER || "fbrp",
  password: env.MARIADB_PASSWORD || "",
  database: env.MARIADB_DATABASE || "fbrp",
  charset: "utf8mb4",
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  multipleStatements: false,
});

const q = (name) => `\`${String(name).replace(/`/g, "``")}\``;
const value = (cell) => {
  if (cell === null || cell === undefined) return "NULL";
  if (Buffer.isBuffer(cell)) return cell.length ? `X'${cell.toString("hex")}'` : "''";
  if (typeof cell === "object" && !(cell instanceof Date)) return connection.escape(JSON.stringify(cell));
  return connection.escape(cell);
};

const out = [];
out.push("-- Florida Bay MariaDB logical dump", "SET NAMES utf8mb4;", "SET FOREIGN_KEY_CHECKS=0;", "SET UNIQUE_CHECKS=0;", "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';", "");
const [tables] = await connection.query("SELECT TABLE_NAME name, TABLE_TYPE type FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_TYPE, TABLE_NAME");
for (const { name, type } of tables) {
  if (type === "VIEW") {
    const [[view]] = await connection.query(`SHOW CREATE VIEW ${q(name)}`);
    out.push(`DROP VIEW IF EXISTS ${q(name)};`, `${view["Create View"]};`, "");
    continue;
  }
  const [[create]] = await connection.query(`SHOW CREATE TABLE ${q(name)}`);
  out.push(`DROP TABLE IF EXISTS ${q(name)};`, `${create["Create Table"]};`);
  const [keys] = await connection.query(
    "SELECT COLUMN_NAME c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME='PRIMARY' ORDER BY ORDINAL_POSITION",
    [name],
  );
  const order = keys.length ? ` ORDER BY ${keys.map((key) => q(key.c)).join(",")}` : "";
  const [rows, fields] = await connection.query(`SELECT * FROM ${q(name)}${order}`);
  const columns = fields.map((field) => q(field.name)).join(",");
  for (let index = 0; index < rows.length; index += 200) {
    const batch = rows.slice(index, index + 200).map((row) => `(${fields.map((field) => value(row[field.name])).join(",")})`);
    out.push(`INSERT INTO ${q(name)} (${columns}) VALUES\n${batch.join(",\n")};`);
  }
  out.push("");
}
out.push("SET FOREIGN_KEY_CHECKS=1;", "SET UNIQUE_CHECKS=1;", "");
process.stdout.write(out.join("\n"));
await connection.end();
