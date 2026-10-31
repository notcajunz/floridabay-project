import assert from "node:assert/strict";
import test from "node:test";

process.env.MARIADB_HOST ||= "127.0.0.1";
const { PANEL_RESOURCES } = await import("../src/web-panel.js");
const { commands } = await import("../src/commands.js");

test("the headtag create command requires an owner", () => {
  const command = commands.find((item) => item.name === "headtag");
  const create = command.options.find((item) => item.name === "create");
  const owner = create.options.find((item) => item.name === "owner");
  assert.equal(owner.required, true);
});

test("the panel requires an owner only when creating a headtag", () => {
  const owner = PANEL_RESOURCES.headtags.fields.find((item) => item.name === "owner_id");
  assert.deepEqual(
    { type: owner.type, inputOnly: owner.inputOnly, createOnly: owner.createOnly, createRequired: owner.createRequired },
    { type: "snowflake", inputOnly: true, createOnly: true, createRequired: true },
  );
});

test("creating a panel headtag grants it to its owner in the same transaction", async () => {
  const calls = [];
  await PANEL_RESOURCES.headtags.afterInsert(
    { query: async (sql, params) => calls.push({ sql, params }), actor: "111111111111111111" },
    { id: 42, owner_id: "222222222222222222" },
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO headtag_grants/);
  assert.deepEqual(calls[0].params.slice(0, 3), ["222222222222222222", 42, "111111111111111111"]);
  assert.equal(Number.isSafeInteger(calls[0].params[3]), true);
});

test("saving a panel headtag rebuilds Discord role grants", async () => {
  const client = { name: "client" };
  const calls = [];
  await PANEL_RESOURCES.headtags.afterSave({
    client,
    syncAll: async (selected) => calls.push(selected),
  });
  assert.deepEqual(calls, [client]);
});

test("deleting a panel headtag rebuilds Discord role grants", async () => {
  const client = { name: "client" };
  const calls = [];
  await PANEL_RESOURCES.headtags.afterDelete({
    client,
    syncAll: async (selected) => calls.push(selected),
  });
  assert.deepEqual(calls, [client]);
});
