import test from "node:test";
import assert from "node:assert/strict";
import { INTAKE_LOG_CHANNEL_ID, KINDS, isSkip, readAnswer } from "../src/devops/intake.js";
import { TICKET_TYPES } from "../src/ticket-system.js";

test("intake logs to the development channel", () => {
  assert.equal(INTAKE_LOG_CHANNEL_ID, "1561220286555099236");
});

test("bug reports are no longer a main-server ticket type", () => {
  assert.equal(TICKET_TYPES.bug, undefined);
});

test("every intake kind starts with a choice, has a title and unique keys", () => {
  for (const kind of Object.values(KINDS)) {
    const keys = kind.steps.map((step) => step.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(kind.steps[0].choice?.length >= 2);
    assert.ok(keys.includes("title"));
    for (const step of kind.steps) assert.ok(step.choice || step.max > 0);
  }
  assert.ok(KINDS.bug.steps.some((step) => step.key === "steps"));
});

test("optional steps accept skip, required steps do not", () => {
  const optional = KINDS.bug.steps.find((step) => step.key === "evidence");
  const required = KINDS.bug.steps.find((step) => step.key === "what");
  assert.equal(readAnswer(optional, "skip"), "");
  assert.equal(isSkip("  None "), true);
  assert.equal(readAnswer(required, "   "), null);
  assert.equal(readAnswer(required, "skip"), "skip");
});

test("answers are clamped, titles are one line, attachments are appended", () => {
  const title = KINDS.bug.steps.find((step) => step.key === "title");
  assert.equal(readAnswer(title, "radio\nbroken"), "radio broken");
  assert.ok(readAnswer(title, "x".repeat(500)).length <= title.max);
  const evidence = KINDS.bug.steps.find((step) => step.key === "evidence");
  assert.equal(readAnswer(evidence, "skip", ["https://cdn.example/a.png"]), "https://cdn.example/a.png");
  assert.match(readAnswer(evidence, "see clip", ["https://cdn.example/a.png"]), /see clip\nhttps:\/\/cdn\.example\/a\.png/);
});
