import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { commands } from "../src/commands.js";

test("reverify command requires a target and an investigation reason", () => {
  const command = commands.find((entry) => entry.name === "reverify");
  assert.ok(command);
  assert.equal(command.dm_permission, false);
  assert.match(command.description, /ACM\+/);
  assert.deepEqual(command.options.map(({ name, required }) => [name, required]), [
    ["user", true],
    ["reason", true],
  ]);
});

test("reverify handler enforces ACM+, preserves access, audits, and detects closed DMs", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const start = source.indexOf("async function reverifyCommand");
  const end = source.indexOf("\n}\n", start) + 2;
  const handler = source.slice(start, end);
  assert.match(handler, /requireMinimumStaffRank\(i, "Assistant Community Manager"/);
  assert.match(handler, /Internal Affairs re-verification required/);
  assert.match(handler, /iaa\.reverify\.request/);
  assert.match(handler, /DMs are closed/);
  assert.doesNotMatch(handler, /DELETE FROM member_verifications/);
  assert.doesNotMatch(handler, /quarantineUnverifiedMember/);
});
