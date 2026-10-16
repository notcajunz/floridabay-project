import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { oauthJoinToken, saveOAuthAuthorization } from "../src/verification.js";

process.env.FBRP_IDENTITY_SALT = "test-only-oauth-encryption-secret-32-bytes";

function memoryDb() {
  let row = null;
  return {
    get row() { return row; },
    async one() { return row; },
    async query(sql, params = []) {
      if (sql.startsWith("DELETE FROM discord_oauth_grants")) row = null;
      if (sql.includes("INSERT INTO discord_oauth_grants"))
        row = { token_ciphertext: params[1], scopes: params[2], expires_at: params[3] };
      return { affectedRows: 1 };
    },
  };
}

test("guilds.join grants are encrypted at rest and decrypt while valid", async () => {
  const db = memoryDb();
  const accessToken = "oauth-token-that-must-not-be-stored-in-plaintext";
  const saved = await saveOAuthAuthorization(db, {
    discordId: "123456789012345678",
    accessToken,
    scopes: ["identify", "guilds.join"],
    expiresAt: Date.now() + 3600000,
  });
  assert.equal(saved, true);
  assert.notEqual(db.row.token_ciphertext, accessToken);
  assert.equal(db.row.token_ciphertext.includes(accessToken), false);
  assert.equal(await oauthJoinToken(db, "123456789012345678"), accessToken);
});

test("missing or expired guilds.join grants are rejected", async () => {
  const db = memoryDb();
  assert.equal(await saveOAuthAuthorization(db, {
    discordId: "123456789012345678",
    accessToken: "token",
    scopes: ["identify"],
    expiresAt: Date.now() + 3600000,
  }), false);
  assert.equal(await oauthJoinToken(db, "123456789012345678"), null);
});

test("regular joins use OAuth while global invite keeps invite links", async () => {
  const [index, panel, migration] = await Promise.all([
    readFile(new URL("../src/index.js", import.meta.url), "utf8"),
    readFile(new URL("../src/web-panel.js", import.meta.url), "utf8"),
    readFile(new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/065_discord_oauth_grants.sql", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /identify connections guilds guilds\.join/);
  assert.match(index, /async function addAuthorizedGuildMember/);
  assert.match(index, /if \(sub === "invite"\)[\s\S]+createMemberInvite\(guild, user/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS discord_oauth_grants/);
});
