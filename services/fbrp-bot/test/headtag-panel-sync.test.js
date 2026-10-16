import assert from "node:assert/strict";
import test from "node:test";

process.env.MARIADB_HOST ||= "127.0.0.1";
const { PANEL_RESOURCES } = await import("../src/web-panel.js");

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
