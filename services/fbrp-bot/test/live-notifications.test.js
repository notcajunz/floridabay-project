import assert from "node:assert/strict";
import test from "node:test";
import {
  LIVE_CHANNEL_ID,
  createLiveNotifications,
  parseTwitchLogin,
  parseTwitchUser,
  parseYouTubeLive,
  parseYouTubeRef,
} from "../src/live-notifications.js";

test("parses Twitch and YouTube references", () => {
  assert.equal(parseTwitchLogin("https://www.twitch.tv/XQC/videos"), "xqc");
  assert.equal(parseTwitchLogin("@Some_Streamer"), "some_streamer");
  assert.throws(() => parseTwitchLogin("a b"));
  assert.equal(parseYouTubeRef("https://youtube.com/@LofiGirl/live"), "@LofiGirl");
  assert.equal(parseYouTubeRef("LofiGirl"), "@LofiGirl");
  assert.equal(parseYouTubeRef("https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow"), "UCSJ4gkVC6NrvII8umztf0Ow");
  assert.throws(() => parseYouTubeRef("!!"));
});

test("detects live YouTube pages and ignores offline ones", () => {
  const live = '<link rel="canonical" href="https://www.youtube.com/watch?v=1-LpQekNa9g"><meta property="og:title" content="beats &amp; chill">"ownerChannelName":"Lofi Girl","isLiveNow":true';
  const parsed = parseYouTubeLive(live);
  assert.equal(parsed.live, true);
  assert.equal(parsed.url, "https://www.youtube.com/watch?v=1-LpQekNa9g");
  assert.equal(parsed.title, "beats & chill");
  assert.equal(parseYouTubeLive('<link rel="canonical" href="https://www.youtube.com/@LofiGirl">').live, false);
  assert.equal(parseYouTubeLive('<link rel="canonical" href="https://www.youtube.com/watch?v=1-LpQekNa9g">"isLiveNow":false').live, false);
});

test("reads Twitch users", () => {
  assert.equal(parseTwitchUser({ login: "a", displayName: "A", stream: null }).live, false);
  const live = parseTwitchUser({ login: "a", displayName: "A", stream: { id: "9", type: "live", title: "t", viewersCount: 3, game: { name: "G" } } });
  assert.deepEqual([live.live, live.url, live.game], [true, "https://www.twitch.tv/a", "G"]);
});

function harness(initial) {
  const sent = [];
  const deleted = [];
  const store = { value: JSON.stringify(initial) };
  const messages = new Map();
  const channel = {
    isTextBased: () => true,
    send: async (payload) => {
      const id = String(1000 + sent.length);
      sent.push({ id, payload });
      messages.set(id, { delete: async () => deleted.push(id) });
      return { id };
    },
    messages: { fetch: async (id) => messages.get(id) || null },
  };
  const client = { user: { id: "bot" }, channels: { fetch: async (id) => (id === LIVE_CHANNEL_ID ? channel : null) } };
  const db = {
    one: async () => ({ value: store.value }),
    query: async (_sql, args) => {
      store.value = args[1];
    },
  };
  let twitchLive = true;
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [{ data: { users: [{ login: "xqc", displayName: "xQc", stream: twitchLive ? { id: "1", type: "live", title: "t", viewersCount: 1 } : null }] } }],
  });
  const live = createLiveNotifications({ client, db, audit: async () => {}, clean: (v) => String(v), fetchImpl });
  return { live, sent, deleted, store, setLive: (v) => (twitchLive = v) };
}

test("announces once, pings the role, and deletes the message after the stream ends", async () => {
  const h = harness({ role_id: "42", streamers: [{ platform: "twitch", id: "xqc", name: "xQc" }], active: {} });
  await h.live.poll();
  await h.live.poll();
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].payload.content, /<@&42>/);
  assert.match(h.sent[0].payload.content, /https:\/\/www\.twitch\.tv\/xqc/);
  h.setLive(false);
  await h.live.poll();
  assert.equal(h.deleted.length, 0, "one offline poll is not enough");
  await h.live.poll();
  assert.deepEqual(h.deleted, ["1000"]);
  assert.deepEqual(JSON.parse(h.store.value).active, {});
});
