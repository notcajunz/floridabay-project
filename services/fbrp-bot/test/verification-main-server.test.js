import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, verification, ids] = await Promise.all(
  ["index.js", "verification.js", "discord-ids.js"].map((name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8")),
);

test("the main server enforces verification on join even when the network list is empty", () => {
  const fn = index.match(/async function verificationApplies\(guildId, rows = networkRows\) \{[\s\S]*?\n\}/)[0];
  assert.match(fn, /String\(guildId\) === MAIN_GUILD_ID\) return true/);
  assert.match(fn, /\(await rows\(\)\)\.some/);
  assert.match(index, /import \{ currentDiscordId, MAIN_GUILD_ID \} from "\.\/discord-ids\.js"/);
  assert.match(ids, /export const MAIN_GUILD_ID = "1557594282976747550"/);
  const join = index.match(/async function enforceVerificationOnJoin\(member\) \{[\s\S]*?\n\}/)[0];
  assert.match(join, /await verificationApplies\(member\.guild\.id\)/);
  assert.doesNotMatch(join, /networkRows\(\)\)\.some/);
});

test("joiners are quarantined into Unverified and website verification swaps it for the verified role", () => {
  const join = index.match(/async function enforceVerificationOnJoin\(member\) \{[\s\S]*?\n\}/)[0];
  assert.match(join, /quarantineUnverifiedMember\(member\)/);
  assert.match(join, /staffLevel\(id\)\) >= 0\) return false/, "staff are exempt from quarantine");
  const quarantine = index.match(/async function quarantineUnverifiedMember[\s\S]*?\n\}/)[0];
  assert.match(quarantine, /member\.roles\.set\(\[role\.id, \.\.\.keptManagedRoles\]/);
  const grant = verification.match(/export async function grantVerifiedRole[\s\S]*?\n\}/)[0];
  assert.match(grant, /member\.roles\.set\(\[\s*role\.id,/, "the Unverified role is replaced, not kept");
  assert.match(grant, /\.\.\.member\.roles\.cache\.filter\(\(item\) => item\.managed\)/);
  assert.match(index, /grantVerifiedRole\(client, discordId\)/);
});
