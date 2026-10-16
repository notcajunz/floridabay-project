import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.MARIADB_HOST ||= "127.0.0.1";
const config = await import("../src/staff/config.js");
const { definitions } = await import("../src/staff/commands.js");

test("coordination ranks and manager rules use distinct snowflakes", () => {
  const ids = [config.TEAM_ROLE_ID, config.LEADERSHIP_ROLE_ID, ...config.COORD_RANKS.map((rank) => rank.roleId)];
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [...ids, ...config.MANAGER_ROLE_RULES.flatMap((rule) => [rule.targetRole, ...rule.sourceRoles])])
    assert.match(id, /^\d{17,20}$/);
  assert.ok(config.COORD_RANKS.some((rank) => rank.name === config.MANAGER_RANK));
  assert.deepEqual(config.MANAGER_ROLE_RULES.map((rule) => rule.targetRole).sort(), [
    "1558270212267184178", "1558270290822299778", "1558270406484557944", "1560450541509677186",
  ]);
});

test("the staff bot owns the staff commands and /coord has only team subcommands", () => {
  assert.deepEqual(definitions.map((command) => command.name).sort(), ["callsign", "coord", "coordall", "exam", "roster", "staff"]);
  const coord = definitions.find((command) => command.name === "coord");
  assert.deepEqual(coord.options.map((option) => option.name).sort(), ["add", "hours", "leaderboard", "list", "remove", "sync"]);
});

test("the main bot no longer registers the moved commands", async () => {
  const { commands } = await import("../src/commands.js");
  const names = new Set(commands.map((command) => command.name));
  for (const name of ["staff", "roster", "callsign", "exam", "coordall"]) assert.equal(names.has(name), false, name);
});

test("adding and removing accept a Discord ID, with required options first", () => {
  const find = (command, sub) => definitions.find((c) => c.name === command).options.find((o) => o.name === sub).options;
  for (const [command, sub] of [["staff", "add"], ["staff", "move"], ["staff", "remove"], ["roster", "add"], ["roster", "remove"], ["coord", "add"], ["coord", "remove"]]) {
    const options = find(command, sub);
    const names = options.map((o) => o.name);
    assert.ok(names.includes("member") && names.includes("discord_id"), `${command} ${sub}`);
    assert.equal(options.find((o) => o.name === "member").required, false);
    let seenOptional = false;
    for (const option of options) {
      if (!option.required) seenOptional = true;
      else assert.equal(seenOptional, false, `${command} ${sub}: required ${option.name} after an optional option`);
    }
  }
});

test("migration 061 creates the team ACE group and both queues", async () => {
  const sql = await readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/061_staff_bot.sql", import.meta.url), "utf8");
  for (const needle of ["staff_coordination_team", "network_sync_queue", "network_role_queue"]) assert.ok(sql.includes(needle), needle);
});

test("migration 063 creates the welcome queue the main bot reads", async () => {
  const sql = await readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/063_staff_welcome_queue.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("staff_welcome_queue"));
});
