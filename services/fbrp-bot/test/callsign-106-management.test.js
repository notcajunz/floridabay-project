import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = new URL(
  "../../../server-data/resources/[fbrp]/fbrp_core/migrations/108_callsign_106_management.sql",
  import.meta.url,
);

test("callsign 106 belongs to Management and existing assignments keep their order", async () => {
  const sql = await readFile(migration, "utf8");

  assert.match(sql, /SET callsign_end=105\s+WHERE name='Ownership'/);
  assert.match(sql, /SET callsign_start=106\s+WHERE name='Management'/);
  assert.match(sql, /category\.name='Ownership'[\s\S]*member\.callsign=106/);
  assert.match(sql, /category\.name='Management'[\s\S]*member\.callsign BETWEEN 107 AND 149/);
  assert.match(sql, /member\.callsign=member\.callsign-1000001/);
  assert.match(sql, /'callsign_rebalance'/);
});
