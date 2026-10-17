import test from "node:test";
import assert from "node:assert/strict";
import { punishmentHistory } from "../src/investigation.js";

test("merges every punishment source newest first and survives a missing table", async () => {
  const rows = {
    "FROM moderation_cases": [
      { id: 1, ban_id: "FB-1", guild_id: "global", actor_id: "9", action: "timeout", reason: "spam", active: 1, expires_at: Date.now() + 1e6, created_at: 100 },
      { id: 2, ban_id: null, guild_id: "g", actor_id: "9", action: "unban", reason: "appeal", active: 0, expires_at: null, created_at: 300 },
    ],
    "FROM iaa_cases": [{ id: 4, reference: "IA-4", type: "conduct", status: "closed", summary: "probe", opened_by: "8", opened_at: 200, closed_at: 250, verdict: "founded", outcome: "strike" }],
    "FROM audit_log": [{ id: 7, actor_id: "9", action: "global.rolestrip", payload: '{"reason":"compromised"}', created_at: 400 }],
    "FROM global_role_strips": [{ reason: "compromised", stripped_by: "9", stripped_at: 400 }],
  };
  const db = {
    async query(sql) {
      if (sql.includes("FROM devops_discipline")) throw new Error("missing table");
      const key = Object.keys(rows).find((k) => sql.includes(k));
      return key ? rows[key] : [];
    },
  };
  const out = await punishmentHistory(db, "5");
  assert.deepEqual(out.entries.map((e) => e.kind), ["role strip", "unban", "IAA investigation (conduct)", "timeout"]);
  assert.equal(out.entries[0].status, "active");
  assert.equal(out.entries[1].status, "lifted");
  assert.deepEqual(out.failed, ["DevOps discipline"]);
});
