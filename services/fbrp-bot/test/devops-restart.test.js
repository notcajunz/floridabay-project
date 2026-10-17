import test from "node:test";
import assert from "node:assert/strict";
import { definitions } from "../src/devops/commands.js";
import { RESTART_CHOICES, RESTART_OWNER_ID, RESTART_TARGETS, command, isRestartOwner } from "../src/devops/restart.js";

test("restart command is restricted to the designated Discord owner", async () => {
  assert.equal(RESTART_OWNER_ID, "1090083387638812755");
  assert.equal(isRestartOwner(RESTART_OWNER_ID), true);
  assert.equal(isRestartOwner("1099651002208104488"), false);

  let deferred = false;
  await assert.rejects(
    command({ user: { id: "1099651002208104488" }, options: { getString: () => "game" }, deferReply: async () => { deferred = true; } }),
    /Only the designated FBRP service owner/,
  );
  assert.equal(deferred, false, "authorization must happen before any restart work or acknowledgement");
});

test("restart command exposes only fixed FBRP service targets", () => {
  const commandDefinition = definitions.find((definition) => definition.name === "restart");
  assert.ok(commandDefinition);
  const choices = commandDefinition.options[0].choices;
  assert.deepEqual(choices.map(({ name, value }) => ({ name, value })), RESTART_CHOICES);
  assert.deepEqual(new Set(choices.map((choice) => choice.value)), new Set(["all", ...Object.keys(RESTART_TARGETS)]));

  for (const target of Object.values(RESTART_TARGETS)) {
    if (target.unit) assert.match(target.unit, /^(?:fbrp-(?:server|bot)|(?:businesses|departments|devops|dohs|gangs|iaa|personals|role-manager|staff)-bot)\.service$/);
    if (target.container) assert.equal(target.container, "fbrp-mariadb");
    if (target.manager) assert.match(target.manager, /^(?:game|system)$/);
  }
});
