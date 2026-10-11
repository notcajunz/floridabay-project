import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./database.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const directory = path.join(
  root,
  "server-data/resources/[fbrp]/fbrp_core/migrations",
);

function statements(sql) {
  const output = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (const char of sql) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote && char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      if (current.trim()) output.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) output.push(current.trim());
  return output;
}

try {
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations(name VARCHAR(100) PRIMARY KEY,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
  for (const name of files) {
    const migrationName = `migrations/${name}`;
    const [installed] = await pool.query("SELECT 1 FROM schema_migrations WHERE name=? LIMIT 1", [migrationName]);
    if (installed.length) continue;
    const sql = await readFile(path.join(directory, name), "utf8");
    const queue = statements(sql);
    for (let index = 0; index < queue.length; index++) {
      try {
        await pool.query(queue[index]);
      } catch (error) {
        error.message = `${name} statement ${index + 1}/${queue.length} failed (${queue[index].slice(0, 160).replace(/\s+/g, " ")}): ${error.message}`;
        throw error;
      }
    }
    await pool.query("INSERT INTO schema_migrations(name) VALUES(?)", [migrationName]);
    console.log(`[FBRP bot] Applied ${name}.`);
  }
  console.log("[FBRP bot] MariaDB schema is ready.");
} finally {
  await pool.end();
}
