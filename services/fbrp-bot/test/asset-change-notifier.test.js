import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSET_CHANGE_RECIPIENT_ID,
  assetChangeMessage,
  assetChangeType,
  createAssetChangeNotifier,
} from "../src/asset-change-notifier.js";

test("headtag and personal mutations are selected from every management interface", () => {
  for (const action of [
    "headtag.create",
    "headtag.grant",
    "personal.update",
    "personal.owner",
    "personal.retune",
    "panel.headtags.edit",
    "panel.headtag-grants.delete",
    "panel.personals.create",
    "panel.personal-trust.edit",
    "panel.personal-tags.delete",
  ]) assert.ok(assetChangeType(action), action);

  for (const action of ["personal.import.blocked", "panel.organizations.edit", "cmd.main.headtag.create"])
    assert.equal(assetChangeType(action), null, action);
});

test("change messages contain the actor, target, action and before/after details", () => {
  const message = assetChangeMessage({
    id: 42,
    actor_id: "1090083387638812754",
    action: "personal.update",
    target_id: "17",
    payload: JSON.stringify({ before: { label: "Old" }, after: { label: "New" } }),
    created_at: 1_700_000_000_000,
  });
  const embed = message.embeds[0];
  assert.equal(embed.title, "Personal edited");
  assert.match(embed.fields[0].value, /1090083387638812754/);
  assert.match(embed.fields[1].value, /17/);
  assert.match(embed.description, /before/);
  assert.match(embed.description, /Old/);
  assert.match(embed.description, /New/);
  assert.match(embed.footer.text, /personal\.update/);
});

test("notifier DMs the configured recipient once and ignores unrelated audits", async () => {
  const sent = [];
  const fetched = [];
  const notifier = createAssetChangeNotifier({
    client: { users: { fetch: async (id) => {
      fetched.push(id);
      return { send: async (message) => sent.push(message) };
    } } },
  });
  assert.equal(await notifier.notify({ action: "organization.edit" }), false);
  assert.equal(await notifier.notify({ action: "headtag.delete", target_id: 9, payload: { label: "VIP" } }), true);
  assert.deepEqual(fetched, [ASSET_CHANGE_RECIPIENT_ID]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].embeds[0].title, "Headtag deleted");
});
