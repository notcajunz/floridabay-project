import assert from "node:assert/strict";
import test from "node:test";
import { attributeJoin, createInviteTracker } from "../src/invite-tracker.js";

const GUILD = "1557594282976747550";
const INVITER = "100000000000000001";
const JOINER = "100000000000000002";

const entry = (uses, inviterId = INVITER, maxUses = 0) => ({ uses, maxUses, inviterId });

test("attributes a join to the single invite whose use count rose", () => {
  const before = new Map([["abc", entry(2)], ["def", entry(5)]]);
  const after = new Map([["abc", entry(3)], ["def", entry(5)]]);
  assert.deepEqual(attributeJoin(before, after), { method: "invite", code: "abc", inviterId: INVITER });
});

test("attributes a join to a capped invite that disappeared after its last use", () => {
  const before = new Map([["once", entry(0, INVITER, 1)]]);
  assert.equal(attributeJoin(before, new Map()).code, "once");
});

test("does not guess when several invites moved or nothing did", () => {
  const before = new Map([["a", entry(0)], ["b", entry(0)]]);
  const both = new Map([["a", entry(1)], ["b", entry(1)]]);
  assert.equal(attributeJoin(before, both).method, "unknown");
  assert.equal(attributeJoin(before, before).method, "unknown");
});

test("falls back to the vanity URL when only its counter rose", () => {
  const same = new Map([["a", entry(1)]]);
  assert.deepEqual(attributeJoin(same, same, { code: "fbrp", rose: true }), { method: "vanity", code: "fbrp", inviterId: null });
});

function fixture() {
  const rows = [];
  const logs = [];
  let live = new Map();
  const queued = [];
  const guild = {
    id: GUILD,
    name: "Florida Bay",
    vanityURLCode: null,
    invites: {
      fetch: async () => {
        const current = queued.length ? queued.shift() : live;
        return new Map([...current].map(([code, v]) => [code, { code, uses: v.uses, maxUses: v.maxUses, inviter: { id: v.inviterId } }]));
      },
    },
  };
  const db = {
    async query(sql, params = []) {
      if (sql.startsWith("CREATE TABLE")) return [];
      if (sql.startsWith("UPDATE invite_tracker_joins")) {
        for (const row of rows) if (row.member_id === params[2] && row.left_at == null) row.left_at = params[0];
        return [];
      }
      if (sql.startsWith("INSERT INTO invite_tracker_joins")) {
        rows.push({ guild_id: params[0], member_id: params[1], inviter_id: params[2], invite_code: params[3], method: params[4], joined_at: params[5], left_at: null });
        return [];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async one(sql, params) {
      if (!sql.includes("COUNT(*)")) throw new Error(`Unexpected one: ${sql}`);
      const mine = rows.filter((row) => row.inviter_id === params[1]);
      return { total: mine.length, active: mine.filter((row) => row.left_at == null).length };
    },
  };
  const client = { guilds: { cache: new Map([[GUILD, guild]]) } };
  const tracker = createInviteTracker({ client, db, log: async (_g, spec) => logs.push(spec), now: () => 1_800_000_000_000 });
  const member = (id) => ({ id, guild, user: { id, bot: false } });
  return { rows, logs, tracker, member, setInvites: (next) => (live = next), queueInvites: (...next) => queued.push(...next) };
}

test("records, logs and counts a tracked join, then marks the leave", async () => {
  const f = fixture();
  f.setInvites(new Map([["abc", entry(0)]]));
  await f.tracker.start();
  f.setInvites(new Map([["abc", entry(1)]]));
  const result = await f.tracker.memberAdded(f.member(JOINER));
  assert.equal(result.inviterId, INVITER);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].invite_code, "abc");
  assert.equal(f.logs.length, 1);
  assert.deepEqual(await f.tracker.inviterStats(GUILD, INVITER), { total: 1, active: 1, left: 0 });

  await f.tracker.memberRemoved(f.member(JOINER));
  assert.deepEqual(await f.tracker.inviterStats(GUILD, INVITER), { total: 1, active: 0, left: 1 });
});

test("concurrent joins are attributed to their own invites", async () => {
  const f = fixture();
  f.setInvites(new Map([["a", entry(0, "1")], ["b", entry(0, "2")]]));
  await f.tracker.start();
  f.queueInvites(
    new Map([["a", entry(1, "1")], ["b", entry(0, "2")]]),
    new Map([["a", entry(1, "1")], ["b", entry(1, "2")]]),
  );
  const first = f.tracker.memberAdded(f.member("10"));
  const second = f.tracker.memberAdded(f.member("11"));
  const [r1, r2] = await Promise.all([first, second]);
  assert.equal(r1.code, "a");
  assert.equal(r2.code, "b");
});

test("bots are ignored", async () => {
  const f = fixture();
  await f.tracker.start();
  const bot = f.member("99");
  bot.user.bot = true;
  assert.equal(await f.tracker.memberAdded(bot), null);
  assert.equal(f.rows.length, 0);
});

import { inviteHistory } from "../src/investigation.js";

test("invite history reports who invited a member and who they invited", async () => {
  const db = {
    async query(sql, params) {
      if (sql.includes("WHERE member_id=?")) return [
        { guild_id: GUILD, inviter_id: INVITER, invite_code: "abc", method: "invite", joined_at: 2000, left_at: null },
        { guild_id: GUILD, inviter_id: null, invite_code: null, method: "unknown", joined_at: 1000, left_at: 1500 },
      ];
      if (sql.includes("WHERE inviter_id=?")) return [{ guild_id: GUILD, member_id: JOINER, joined_at: 3000, left_at: 4000 }];
      throw new Error(sql);
    },
    async one() { return { total: 3, active: 2 }; },
  };
  const info = await inviteHistory(db, JOINER);
  assert.equal(info.invitedBy.length, 1);
  assert.equal(info.invitedBy[0].inviterId, INVITER);
  assert.equal(info.invited[0].leftAt, 4000);
  assert.deepEqual(info.totals, { total: 3, active: 2, left: 1 });
  assert.deepEqual(info.failed, []);
});

test("invite history survives a failed read", async () => {
  const db = { async query() { throw new Error("down"); }, async one() { throw new Error("down"); } };
  const info = await inviteHistory(db, JOINER);
  assert.equal(info.failed.length, 3);
  assert.deepEqual(info.totals, { total: 0, active: 0, left: 0 });
});
