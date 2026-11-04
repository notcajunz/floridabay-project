import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("redesigned HUD consumes Florida Bay state instead of installing a competing backend", () => {
  const lua = read("server-data/resources/[fbrp]/fbrp_core/client/hud.lua");
  const page = read("server-data/resources/[fbrp]/fbrp_core/web/hud/index.html");
  const manifest = read("server-data/resources/[fbrp]/fbrp_core/fxmanifest.lua");
  assert.match(lua, /GlobalState\['fbrp:aop'\]/);
  assert.match(lua, /GlobalState\['fbrp:peacetime'\]/);
  assert.match(lua, /GlobalState\['fbrp:priority'\]/);
  assert.match(lua, /local function priorityData\(\)/);
  assert.match(page, /id="prioList"/);
  assert.match(page, /id="prioAop"/);
  assert.match(page, />Job</);
  assert.match(manifest, /web\/fonts\/\*\.ttf/);
  assert.match(manifest, /web\/hud\/index\.html/);
});

test("status card stays within its bounds and vital icons remain upright", () => {
  const html = read("server-data/resources/[fbrp]/fbrp_core/web/index.html");
  const css = read("server-data/resources/[fbrp]/fbrp_core/web/styles.css");

  assert.match(html, /<strong>Florida Bay Roleplay \(Server 1\)<\/strong>/);
  assert.match(css, /\.vital > svg[^}]*transform:\s*rotate\(-90deg\)/s);
  assert.doesNotMatch(css, /\.status\s*\{[^}]*backdrop-filter/s);
  assert.match(css, /\.status\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  assert.match(css, /\.status\s*\{[^}]*border:\s*0;/s);
  assert.match(css, /\.status-heading\s*\{[^}]*border:\s*0;/s);
  assert.match(css, /\.status-self\s*\{[^}]*border:\s*0;[^}]*\}/s);
  assert.doesNotMatch(css, /\.status-self\s*\{[^}]*border-left/s);
});

test("new loading screen retains manual shutdown, local media, live state, and hardened YouTube relay", () => {
  const base = "server-data/resources/[fbrp]/fbrp_loading/";
  const manifest = read(base + "fxmanifest.lua");
  const client = read(base + "client.lua");
  const config = read(base + "web/assets/scripts/config.js");
  const script = read(base + "web/assets/scripts/main.js");
  const relay = read(base + "web/host-this-online/yt-relay.html");

  assert.match(manifest, /loadscreen_manual_shutdown 'yes'/);
  assert.match(client, /ShutdownLoadingScreenNui\(\)/);
  assert.match(manifest, /web\/host-this-online\/\*\.html/);
  assert.match(manifest, /web\/assets\/media\/music\/\*\.webm/);
  assert.match(config, /Config\.YouTubeRelay/);
  assert.match(config, /api\/public\/status/);
  assert.equal((config.match(/file: "assets\/media\/music\//g) || []).length, 4);
  assert.match(script, /e\.source !== f\.contentWindow \|\| e\.origin !== relayOrigin/);
  assert.match(script, /postMessage\(\{ fbrp: 1, cmd, args \}, relayOrigin\)/);
  assert.match(relay, /e\.source !== parent/);
  assert.match(relay, /parent\.postMessage\(o, parentOrigin\)/);
  assert.doesNotMatch(config, /gay Lover boy|EDIT THESE - placeholders/);
});

test("Claude Cowork handoff covers every generated Tebex package image", () => {
  const csv = read("docs/tebex/package-settings.csv").trim().split(/\r?\n/);
  const prompt = read("docs/tebex/CLAUDE-COWORK-PROMPT.md");
  assert.equal(csv.length - 1, 23);
  assert.match(prompt, /exactly 23 packages/);
  assert.match(prompt, /package-images/);

  for (const line of csv.slice(1)) {
    const columns = line.split(",");
    const image = columns[7];
    assert.ok(fs.existsSync(path.join(root, "docs/tebex/package-images", image)), `missing ${image}`);
  }
});
