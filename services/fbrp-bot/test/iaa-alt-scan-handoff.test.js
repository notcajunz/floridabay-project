import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { collectMembers } from "../src/altscan-members.js";
import { createAltScanQueue } from "../src/altscan-queue.js";

const member = (id, over = {}) => ({ id, nickname: null, user: { bot: false, username: `u${id}`, globalName: null, avatar: null, ...over.user }, ...over });
const guild = (name, list) => ({ name, members: { cache: new Map(), fetch: async () => new Map(list.map((m) => [m.id, m])) } });

test("collector reads everyone live, skips bots and merges members seen in several servers", async () => {
  const a = guild("A", [member("1"), member("2", { user: { bot: true } })]);
  const b = guild("B", [member("1", { nickname: "Sam" }), member("3", { user: { avatar: "hash" } })]);
  const { members, problems } = await collectMembers([a, b]);
  assert.deepEqual([...members.keys()], ["1", "3"]);
  assert.equal(members.get("1").servers, 2);
  assert.equal(members.get("1").display, "Sam");
  assert.equal(members.get("1").defaultAvatar, true);
  assert.equal(members.get("3").defaultAvatar, false);
  assert.deepEqual(problems, []);
});

test("collector falls back to the cache and reports a failed fetch", async () => {
  const broken = { name: "Big", members: { cache: new Map([["9", member("9")]]), fetch: async () => { throw new Error("timeout"); } } };
  const { members, problems } = await collectMembers([broken]);
  assert.equal(members.size, 1);
  assert.match(problems[0], /Big: full member fetch failed/);
});

test("main bot queue claims a job, stores the members and marks it done", async () => {
  const calls = [];
  const job = { id: 7, guild_ids: JSON.stringify(["10", "99"]) };
  let claimed = false;
  const db = {
    async query(sql, params) {
      calls.push([sql, params]);
      if (/SET status='running'/.test(sql)) return { affectedRows: 1 };
      return { affectedRows: 0 };
    },
    async one(sql) {
      if (/status='queued'/.test(sql) && !claimed) return (claimed = true), job;
      return null;
    },
  };
  const client = { guilds: { cache: new Map([["10", guild("Ten", [member("1"), member("2")])]]) } };
  await createAltScanQueue({ client, db }).tick();
  const insert = calls.find(([sql]) => /INSERT INTO iaa_altscan_members/.test(sql));
  assert.equal(insert[1][0].length, 2);
  assert.equal(insert[1][0][0][0], 7);
  const done = calls.find(([sql]) => /SET status='done'/.test(sql));
  assert.match(done[1][1], /99: the main bot is not in this server/);
});

test("IAA command hands off servers it is not in, and the schema and wiring exist", async () => {
  const iaa = await readFile(new URL("../src/iaa/altscan.js", import.meta.url), "utf8");
  assert.match(iaa, /INSERT INTO iaa_altscan_jobs/);
  assert.match(iaa, /client\.guilds\.cache\.has/);
  const main = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(main, /altScanQueue\.start\(\)/);
  const dir = new URL("../../../server-data/resources/[fbrp]/fbrp_core/migrations/", import.meta.url);
  const sql = await Promise.all((await readdir(dir)).filter((n) => n.includes("iaa_alt_scan")).map((n) => readFile(new URL(n, dir), "utf8")));
  assert.match(sql.join(""), /iaa_altscan_jobs[\s\S]*iaa_altscan_members/);
});
