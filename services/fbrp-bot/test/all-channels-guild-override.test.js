import assert from "node:assert/strict";
import test from "node:test";
import { db } from "../src/database.js";
import { enforceAllChannelAccess } from "../src/sync.js";

test("the all-channel sweep honours a server's own setting over the shared role default", async () => {
  const queries = [];
  const original = db.query;
  db.query = async (sql) => {
    queries.push(sql);
    return [];
  };
  try {
    await enforceAllChannelAccess({ guilds: { cache: new Map() } });
  } finally {
    db.query = original;
  }
  assert.equal(queries.length, 1);
  assert.match(queries[0], /LEFT JOIN network_sync_guild_settings g ON g\.sync_id=r\.sync_id AND g\.guild_id=r\.guild_id/);
  assert.match(queries[0], /COALESCE\(g\.all_channels,s\.all_channels\)=TRUE/);
  assert.doesNotMatch(queries[0], /WHERE s\.all_channels=TRUE/);
});
