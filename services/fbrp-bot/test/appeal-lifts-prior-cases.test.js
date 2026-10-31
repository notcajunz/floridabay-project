import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("approved appeals lift every active moderation ban while excluding IAA cases", () => {
  const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const start = source.indexOf("async function liftAppealedCase");
  const end = source.indexOf("/** Lift one directly-issued EasyAdmin ban", start);
  const fn = source.slice(start, end);

  assert.match(fn, /FROM moderation_cases WHERE target_id=\? AND active=TRUE/);
  assert.match(fn, /action IN \('ban','blacklist'\)/);
  assert.match(fn, /guild_id<>\?/);
  assert.match(fn, /process\.env\.IAA_GUILD_ID/);
  assert.match(fn, /for \(const item of cases\)/);
  assert.match(fn, /guild_id === "game"/);
  assert.match(fn, /guild_id === "global"/);
  assert.doesNotMatch(fn, /FROM iaa_cases|UPDATE iaa_cases|DELETE FROM iaa_cases/);
  assert.match(fn, /iaaExcluded: true/);
});
