import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PermissionFlagsBits as P } from "discord.js";
import { removeAccess } from "../src/sync.js";

const channelWith = (allow, deny) => {
  const calls = [];
  const set = (bitfield) => ({ bitfield });
  return {
    calls,
    current: { id: "role", allow: set(allow), deny: set(deny) },
    permissionOverwrites: {
      delete: async (...args) => calls.push(["delete", ...args]),
      edit: async (...args) => calls.push(["edit", ...args]),
    },
  };
};
const access = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true };

test("turning off all-channel access deletes an overwrite that only held that access", async () => {
  const channel = channelWith(P.ViewChannel | P.SendMessages, 0n);
  assert.equal(await removeAccess(channel, channel.current, access), true);
  assert.equal(channel.calls[0][0], "delete");
});

test("turning off all-channel access keeps unrelated overwrite flags", async () => {
  const channel = channelWith(P.ViewChannel | P.ManageMessages, P.SendMessages);
  await removeAccess(channel, channel.current, access);
  assert.equal(channel.calls[0][0], "edit");
  assert.deepEqual(channel.calls[0][2], { ViewChannel: null, SendMessages: null, ReadMessageHistory: null });
});

test("the shared-role form lets each server choose where the role sits", async () => {
  const app = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
  assert.match(app, /data-below-for/);
  assert.match(app, /below_role_id: row\.querySelector/);
  const sync = await readFile(new URL("../src/sync.js", import.meta.url), "utf8");
  assert.match(sync, /DELETE FROM network_sync_anchors WHERE sync_id=\? AND guild_id=\?/);
});
