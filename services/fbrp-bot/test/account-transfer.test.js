import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { commands } from "../src/commands.js";
import {
  ACCOUNT_MERGE_COLUMNS,
  ACCOUNT_MOVE_COLUMNS,
  destinationAccountConflicts,
  transferAccountData,
  transferCount,
} from "../src/account-transfer.js";

const indexSource = readFileSync(fileURLToPath(new URL("../src/index.js", import.meta.url)), "utf8");

test("global transfer is a confirmed Community Director account handoff", () => {
  const global = commands.find((command) => command.name === "global");
  const transfer = global.options.find((option) => option.name === "transfer");
  assert.match(transfer.description, /Community Director\+/);
  assert.deepEqual(
    transfer.options.map((option) => [option.name, option.required]),
    [
      ["from_account", true],
      ["to_account", true],
      ["reason", true],
      ["confirm", true],
    ],
  );
  assert.match(indexSource, /requireMinimumStaffRank\(i, "Community Director", "transfer an account"\)/);
  assert.match(indexSource, /isVerified\(db, destination\.id\)/);
  assert.match(indexSource, /oauthJoinToken\(db, destination\.id\)/);
  assert.match(indexSource, /await db\.transaction\(async \(query\) =>/);
  assert.match(indexSource, /plan\.sourceMember\.roles\.set\(managed,/);
  assert.match(indexSource, /plan\.sourceMember\.kick\(`\/global transfer to/);
  assert.match(indexSource, /Florida Bay account-transfer rollback/);
});

test("account transfer covers access, staff, organization, game, and owned assets", () => {
  const moved = new Set(ACCOUNT_MOVE_COLUMNS.map(([table, column]) => `${table}.${column}`));
  const merged = new Set(ACCOUNT_MERGE_COLUMNS.map(([table, column]) => `${table}.${column}`));
  for (const expected of [
    "characters.discord_id",
    "custom_eup.created_by",
    "devops_members.discord_id",
    "iaa_members.discord_id",
    "moderation_cases.target_id",
    "organization_members.discord_id",
    "personal_vehicles.owner_id",
    "players.discord_id",
    "role_manager_roles.owner_id",
    "staff_roster_members.discord_id",
    "support_tickets.author_id",
  ]) assert.ok(moved.has(expected), `${expected} should move`);
  for (const expected of [
    "ace_memberships.discord_id",
    "identity_links.discord_id",
    "discord_security_exemption_scopes.discord_id",
    "headtag_grants.discord_id",
    "personal_vehicle_trust.discord_id",
  ]) assert.ok(merged.has(expected), `${expected} should merge`);
  assert.equal(moved.size, ACCOUNT_MOVE_COLUMNS.length, "move definitions must not repeat");
  assert.equal(merged.size, ACCOUNT_MERGE_COLUMNS.length, "merge definitions must not repeat");
});

test("destination collision check names established account data", async () => {
  const conflicts = await destinationAccountConflicts(async (sql) =>
    sql.includes("`staff_roster_members`") || sql.includes("`organization_members`") ? [{ present: 1 }] : [], "200");
  assert.deepEqual(conflicts, ["organization roster", "staff roster"]);
});

test("durable transfer merges account grants, moves subjects, and revokes old sessions", async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith("SELECT COUNT(*)")) {
      if (sql.includes("`ace_memberships`")) return [{ count: 2 }];
      if (sql.includes("`identity_links`")) return [{ count: 1 }];
      if (sql.includes("`staff_roster_members`")) return [{ count: 1 }];
      return [{ count: 0 }];
    }
    if (sql.startsWith("UPDATE `characters`")) return { affectedRows: 3 };
    return { affectedRows: 0 };
  };

  const counts = await transferAccountData(query, "100", "200");
  assert.equal(transferCount(counts), 7);
  assert.equal(counts.ace_memberships, 2);
  assert.equal(counts.identity_links, 1);
  assert.equal(counts.characters, 3);
  assert.equal(counts.staff_roster_members, 1);
  assert.ok(calls.some(({ sql, params }) => sql.startsWith("UPDATE IGNORE `ace_memberships`") && params[0] === "200" && params[1] === "100"));
  assert.ok(calls.some(({ sql, params }) => sql === "DELETE FROM `discord_oauth_grants` WHERE `discord_id`=?" && params[0] === "100"));
  assert.ok(calls.some(({ sql, params }) => sql === "DELETE FROM portal_sessions WHERE discord_id IN (?,?)" && params[0] === "100" && params[1] === "200"));
});

