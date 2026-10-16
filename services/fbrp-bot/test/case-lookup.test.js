import test from "node:test";
import assert from "node:assert/strict";
import { lookupAnyCase, moderationCaseState } from "../src/case-lookup.js";

test("moderation lookup returns every linked case, appeal event, and audit payload", async () => {
  const root = { id: 42, ban_id: "FB-654321", action: "purge", target_id: "100", actor_id: "200", active: 1, source_case_id: 7 };
  const db = {
    async one(sql, params) {
      if (sql.includes("UPPER(ban_id)")) return params[0] === "FB-654321" ? root : null;
      if (sql.includes("moderation_cases WHERE id")) return { id: 7, ban_id: "FB-111111", action: "ban" };
      return null;
    },
    async query(sql) {
      if (sql.includes("source_case_id")) return [{ id: 43, ban_id: "FB-654322", action: "ban", target_id: "101" }];
      if (sql.includes("moderation_appeals WHERE")) return [{ id: 9, case_id: 42, answers: '{"why":"test"}', evidence: '["url"]' }];
      if (sql.includes("moderation_appeal_events")) return [{ id: 10, appeal_id: 9, data: '{"status":"open"}' }];
      if (sql.includes("audit_log")) return [{ id: 11, payload: '{"caseId":42}' }];
      return [];
    },
  };
  const result = await lookupAnyCase(db, "fb-654321");
  assert.equal(result.kind, "moderation");
  assert.equal(result.publicId, "FB-654321");
  assert.equal(result.sourceCase.publicId, "FB-111111");
  assert.equal(result.derivedCases[0].publicId, "FB-654322");
  assert.deepEqual(result.appeals[0].answers, { why: "test" });
  assert.deepEqual(result.appeals[0].events[0].data, { status: "open" });
  assert.deepEqual(result.audits[0].payload, { caseId: 42 });
  assert.equal(moderationCaseState(root), "recorded");
});

test("Internal Affairs references return the complete case log and discipline", async () => {
  const db = {
    async one(sql, params) {
      if (sql.includes("iaa_cases")) return params[0] === "IA-2026-0004"
        ? { id: 4, reference: "IA-2026-0004", intel: '{"score":72}' }
        : null;
      return null;
    },
    async query(sql) {
      if (sql.includes("iaa_case_entries")) return [{ id: 1, kind: "note", body: "Full note" }];
      if (sql.includes("iaa_discipline")) return [{ id: 2, saved_roles: '["123"]' }];
      if (sql.includes("audit_log")) return [];
      return [];
    },
  };
  const result = await lookupAnyCase(db, "ia-2026-0004");
  assert.equal(result.kind, "internal_affairs");
  assert.deepEqual(result.case.intel, { score: 72 });
  assert.equal(result.entries[0].body, "Full note");
  assert.deepEqual(result.discipline[0].saved_roles, ["123"]);
});

test("unknown references fail clearly", async () => {
  const db = { one: async () => null, query: async () => [] };
  await assert.rejects(() => lookupAnyCase(db, "FB-000000"), /No case was found/);
});
