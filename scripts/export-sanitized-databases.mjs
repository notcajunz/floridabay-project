#!/usr/bin/env node
// Produce deterministic, reviewable SQL exports without credentials or personal identifiers.
// Run from the control host while the private MariaDB tunnel is available.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(process.env.FBRP_DATABASE_SOURCE_ROOT || repoRoot);
const outputRoot = path.resolve(process.argv[2] || path.join(repoRoot, "database-exports"));

const parseEnv = async (filename) => {
  const result = {};
  for (const line of (await readFile(filename, "utf8")).split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return result;
};

const envPath = path.join(sourceRoot, "services/fbrp-bot/.env");
const fileEnv = await parseEnv(envPath);
const secretEnvs = { ...fileEnv };
for (const relative of [
  "services/businessmanager/.env",
  "services/deptmanager/.env",
  "services/gangsmanager/.env",
  "services/dohsbot/.env",
]) {
  try { Object.assign(secretEnvs, await parseEnv(path.join(sourceRoot, relative))); } catch {}
}
const env = { ...fileEnv, ...process.env };
const mysqlModule = path.join(sourceRoot, "services/fbrp-bot/node_modules/mysql2/promise.js");
const mysql = (await import(pathToFileURL(mysqlModule))).default;
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
});

const SECRET_COLUMN = /(^|_)(access_?token|refresh_?token|token|secret|password|passcode|salt|ciphertext|session_?hash|api_?key|auth|credential|webhook|mutation_?token|invite_?code)($|_)/i;
const PRIVATE_TEXT = /(^|_)(backstory|reason|notes?|body|answers?|narrative|transcript|statement|evidence|response|findings|form_?data|content|intel|payload|data|roles|members|servers|winners|saved_?roles|details?|decision_?note|review_?note|activity_?note|status_?note|revoke_?reason|close_?reason|removal_?reason)($|_)/i;
const PRIVATE_CONTACT = /(^|_)(email|phone|address|birth(date)?|date_of_birth|emergency_contact|ip|imei)($|_)/i;
const EXTERNAL_ID = /(discord|license|identifier|player_key)|(^|_)(guild|channel|role|message|member|actor|author|owner|user|officer|reviewer|inviter|head)_id$|^(requested|added|updated|created|resolved|closed|claimed|decided|granted|removed|revoked|set)_by$|^(subject|target)_id$/i;
const PERSON_TABLE = /(^|_)(player|players|character|characters|member|members|staff|ticket|tickets|moderation|appeal|discipline|intake|application|applications|roster|phone|sms|contact|mail|case|cases|jail|warrant|criminal|dispatch|identity|session|audit|history|security_event|transcript)(_|$)/i;
const PERSON_COLUMN = /^(name|username|nickname|display_name|first_name|last_name|callsign|plate|owner_name|officer_name|author_name|subject_name|caller_name|character_name|player_name|actor_name|staff_name)$/i;
const SECRET_KEY = /(token|secret|password|passcode|salt|api.?key|auth|credential|webhook)/i;
const BINARY_TYPE = /(blob|binary)/i;
const NUMERIC_TYPE = /(int|decimal|float|double|bit|year)/i;
const JSON_TYPE = /json/i;
const IDENTIFIER_VALUE = /^(?:\d{16,20}|(?:license|discord|steam|fivem|xbl|live):[A-Za-z0-9]+|[a-f0-9]{32,})$/i;
const secretValues = Object.entries(secretEnvs)
  .filter(([key, value]) => SECRET_KEY.test(key) && value.length >= 8)
  .map(([, value]) => value)
  .sort((a, b) => b.length - a.length);
const rawIdentifiers = new Set();
const rawIdentifierLocations = new Map();
const rememberIdentifier = (identifier, location) => {
  rawIdentifiers.add(identifier);
  if (!rawIdentifierLocations.has(identifier)) rawIdentifierLocations.set(identifier, new Set());
  rawIdentifierLocations.get(identifier).add(location);
};

const hash = (kind, value) => createHash("sha256").update(`fbrp-public-sanitized-v1:${kind}:${value}`).digest("hex");
const pseudonym = (kind, value, column) => {
  const domain = /license|identifier|player_key/i.test(kind) ? "game_identifier" : "external_identifier";
  const digest = hash(domain, String(value));
  if (NUMERIC_TYPE.test(column.data_type)) {
    const maxima = { tinyint: 127n, smallint: 32767n, mediumint: 8388607n, int: 2147483647n, bigint: 8000000000000000000n };
    let maximum = maxima[column.data_type] || 2147483647n;
    if (column.data_type === "decimal" && column.numeric_precision) {
      maximum = (10n ** BigInt(Math.max(1, Number(column.numeric_precision) - Number(column.numeric_scale || 0)))) - 1n;
    }
    return String(1n + (BigInt(`0x${digest.slice(0, 16)}`) % maximum));
  }
  const output = `anon_${digest.slice(0, 24)}`;
  return column.max_length ? output.slice(0, Math.max(1, Number(column.max_length))) : output;
};
const neutral = (column) => {
  if (column.is_nullable === "YES") return null;
  if (NUMERIC_TYPE.test(column.data_type)) return "0";
  if (BINARY_TYPE.test(column.data_type)) return Buffer.alloc(0);
  if (column.is_json || JSON_TYPE.test(column.data_type)) return JSON.stringify("[redacted]");
  return "[redacted]";
};
const scrub = (input) => {
  let value = String(input);
  for (const secret of secretValues) value = value.split(secret).join("[redacted-secret]");
  value = value
    .replace(/https?:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/[^\s"']+/gi, "[redacted-webhook]")
    .replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}\b/g, "[redacted-token]")
    .replace(/\bcfxk_[A-Za-z0-9_]{12,}\b/g, "[redacted-token]")
    .replace(/\b[MN][A-Za-z0-9]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{20,}\b/g, "[redacted-token]")
    .replace(/([?&](?:token|key|secret|signature|auth)=)[^&#\s"']+/gi, "$1[redacted]")
    .replace(/\b(license|discord|steam|fivem|xbl|live):([A-Za-z0-9]+)\b/gi, (_all, kind, id) => `${kind}:anon_${hash("external_identifier", id).slice(0, 20)}`)
    .replace(/\b[a-f0-9]{32,}\b/gi, (id) => `anon_${hash("external_identifier", id).slice(0, 20)}`)
    .replace(/\b\d{16,20}\b/g, (id) => `anon_${hash("external_identifier", id).slice(0, 20)}`)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]");
  return value;
};
const sanitize = (table, column, value, row) => {
  if (value === null || value === undefined) return null;
  const raw = String(value);
  if (EXTERNAL_ID.test(column.column_name) && IDENTIFIER_VALUE.test(raw)) rememberIdentifier(raw, `${table}.${column.column_name}`);
  if (typeof value === "string") {
    for (const match of value.matchAll(/\b(?:license|discord|steam|fivem|xbl|live):[A-Za-z0-9]+\b|\b\d{16,20}\b/gi)) rememberIdentifier(match[0], `${table}.${column.column_name}`);
  }
  if (column.is_json) return neutral(column);
  const name = column.column_name;
  const keyText = Object.entries(row).filter(([key]) => /(^|_)(key|name)$/i.test(key)).map(([, cell]) => String(cell)).join(" ");
  const sensitive = SECRET_COLUMN.test(name) || ((name === "value" || name.endsWith("_value")) && SECRET_KEY.test(keyText)) || PRIVATE_TEXT.test(name) || PRIVATE_CONTACT.test(name) || (PERSON_TABLE.test(table) && PERSON_COLUMN.test(name));
  if (sensitive) return column.column_key ? pseudonym(name, value, column) : neutral(column);
  if (EXTERNAL_ID.test(name)) return pseudonym(name, value, column);
  if (BINARY_TYPE.test(column.data_type) || Buffer.isBuffer(value)) return neutral(column);
  return typeof value === "string" ? scrub(value) : value;
};

const q = (name) => `\`${String(name).replace(/`/g, "``")}\``;
const sqlValue = (value) => {
  if (value === null || value === undefined) return "NULL";
  if (Buffer.isBuffer(value)) return value.length ? `X'${value.toString("hex")}'` : "X''";
  if (typeof value === "object" && !(value instanceof Date)) return connection.escape(JSON.stringify(value));
  return connection.escape(value);
};

const out = [
  "-- Florida Bay MariaDB sanitized logical export",
  "-- Current rows are preserved with credentials removed and personal identifiers pseudonymized.",
  "SET NAMES utf8mb4;", "SET FOREIGN_KEY_CHECKS=0;", "SET UNIQUE_CHECKS=0;", "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';", "",
];
const [tables] = await connection.query("SELECT TABLE_NAME name, TABLE_TYPE type FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_TYPE, TABLE_NAME");
for (const { name, type } of tables) {
  if (type === "VIEW") {
    const [[view]] = await connection.query(`SHOW CREATE VIEW ${q(name)}`);
    out.push(`DROP VIEW IF EXISTS ${q(name)};`, `${view["Create View"].replace(/DEFINER=`[^`]+`@`[^`]+`\s*/i, "")};`, "");
    continue;
  }
  const [[create]] = await connection.query(`SHOW CREATE TABLE ${q(name)}`);
  out.push(`DROP TABLE IF EXISTS ${q(name)};`, `${create["Create Table"]};`);
  const [columns] = await connection.query(
    "SELECT COLUMN_NAME column_name,DATA_TYPE data_type,IS_NULLABLE is_nullable,COLUMN_KEY column_key,CHARACTER_MAXIMUM_LENGTH max_length,NUMERIC_PRECISION numeric_precision,NUMERIC_SCALE numeric_scale FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION",
    [name],
  );
  for (const column of columns) {
    const needle = "json_valid(`" + column.column_name.toLowerCase() + "`)";
    column.is_json = create["Create Table"].toLowerCase().includes(needle);
  }
  const [keys] = await connection.query(
    "SELECT COLUMN_NAME c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME='PRIMARY' ORDER BY ORDINAL_POSITION",
    [name],
  );
  const order = keys.length ? ` ORDER BY ${keys.map((key) => q(key.c)).join(",")}` : "";
  const [rows] = await connection.query(`SELECT * FROM ${q(name)}${order}`);
  const names = columns.map((column) => q(column.column_name)).join(",");
  for (let index = 0; index < rows.length; index += 200) {
    const batch = rows.slice(index, index + 200).map((row) => `(${columns.map((column) => sqlValue(sanitize(name, column, row[column.column_name], row))).join(",")})`);
    out.push(`INSERT INTO ${q(name)} (${names}) VALUES\n${batch.join(",\n")};`);
  }
  out.push("");
}
out.push("SET FOREIGN_KEY_CHECKS=1;", "SET UNIQUE_CHECKS=1;", "");
await connection.end();

await mkdir(outputRoot, { recursive: true });
const mariaPath = path.join(outputRoot, "mariadb-sanitized.sql");
await writeFile(mariaPath, out.join("\n"), { mode: 0o644 });

const sqliteScript = path.join(repoRoot, "scripts/export-sanitized-sqlite.py");
const sqliteSources = [
  "services/businessmanager/business_manager.db",
  "services/deptmanager/department_manager.db",
  "services/deptmanager/department_manager_armedforces.db",
  "services/gangsmanager/gang_manager.db",
];
for (const relative of sqliteSources) {
  const source = path.join(sourceRoot, relative);
  const destination = path.join(outputRoot, `${path.basename(relative, ".db")}-sanitized.sql`);
  const result = spawnSync("python3", [sqliteScript, source, destination], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`SQLite export failed for ${relative}: ${result.stderr || result.stdout}`);
}

const files = [mariaPath, ...sqliteSources.map((relative) => path.join(outputRoot, `${path.basename(relative, ".db")}-sanitized.sql`))];
const forbidden = [...secretValues, /discord(?:app)?\.com\/api\/webhooks\//i, /github_pat_|gh[pousr]_/i, /cfxk_[A-Za-z0-9_]{12,}/i, /\b[MN][A-Za-z0-9]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{20,}\b/];
for (const filename of files) {
  const text = await readFile(filename, "utf8");
  for (const pattern of forbidden) {
    const found = typeof pattern === "string" ? pattern.length >= 8 && text.includes(pattern) : pattern.test(text);
    if (found) throw new Error(`Secret scan failed for ${path.basename(filename)}`);
  }
  for (const identifier of rawIdentifiers) {
    const offset = text.indexOf(identifier);
    if (offset !== -1) {
      const locations = [...(rawIdentifierLocations.get(identifier) || [])].sort().slice(0, 10).join(", ");
      const statements = [...text.slice(0, offset).matchAll(/(?:INSERT INTO|CREATE TABLE) `([^`]+)`/g)];
      const outputTable = statements.at(-1)?.[1] || "unknown";
      throw new Error(`Identifier scan failed for ${path.basename(filename)} from ${locations}; survived in ${outputTable}`);
    }
  }
}
console.log(`Wrote and secret-scanned ${files.length} sanitized database exports in ${outputRoot}`);
