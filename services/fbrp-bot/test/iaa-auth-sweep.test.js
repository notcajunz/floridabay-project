import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { definitions } from "../src/iaa/commands.js";

test("IAA exposes a historical authorization sweep command", () => {
  const intel = definitions.find((command) => command.name === "intel");
  assert.ok(intel);
  assert.ok(intel.options.find((option) => option.name === "auth-sweep"));
});

test("historical authorization sweep covers durable OAuth evidence and listed-server hits", async () => {
  const source = await readFile(new URL("../src/iaa/intel.js", import.meta.url), "utf8");
  for (const proof of [
    "member_verifications WHERE method='discord_oauth'",
    "audit_log WHERE action='portal.login'",
    "member_guilds",
    "identity_links",
    "discord_oauth_grants",
  ]) assert.match(source, new RegExp(proof.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /LEFT JOIN blacklisted_servers/);
  assert.match(source, /LEFT JOIN iaa_watch_servers/);
  assert.match(source, /await demand\(actor, "intel\.manage"\)/);
  assert.match(source, /iaa\.intel\.auth_sweep/);
});
