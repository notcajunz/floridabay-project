import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.resolve(here, '../../../server-data/resources/[fbrp]/fbrp_core');
const read = (file) => fs.readFileSync(path.join(core, file), 'utf8');

test('/announcement is limited to the management team and shown to every player', () => {
  const server = read('server/main.lua');
  assert.match(server, /RegisterCommand\('announcement'/);
  assert.match(server, /hasPermission\(source, FBRP\.Ace\.announceCenter\)/);
  assert.match(server, /TriggerClientEvent\('fbrp:announcement:show', -1,/);
  assert.match(server, /FBRP\.DB\.audit\(actorOf\(source\), 'staff\.center_announcement'/);
  assert.match(read('config.lua'), /announceCenter = 'fbrp\.announce\.center'/);
  const migration = read('migrations/096_center_announcements.sql');
  assert.match(migration, /'fbrp\.announce\.center','allow'/);
  assert.match(migration, /g\.name='mgmt_team'/);
  assert.match(read('config_staffperms.lua'), /'fbrp\.announce\.center'/);
});

test('client relays announcements to the NUI and the manifest loads it', () => {
  assert.match(read('fxmanifest.lua'), /'client\/announcements\.lua'/);
  const client = read('client/announcements.lua');
  assert.match(client, /RegisterNetEvent\('fbrp:announcement:show'/);
  assert.match(client, /SendNUIMessage\(\{ type = 'announcement'/);
});

test('NUI queues announcements, escapes text and centres them above the middle', () => {
  const css = read('web/styles.css');
  assert.match(css, /\.announcement \{[^}]*left: 50%; top: 30%/);
  assert.match(read('web/index.html'), /id="announcement"/);

  const els = {};
  const element = (id) => els[id] ||= { id, className: '', innerHTML: '', classList: { add(c) { els[id].className += ` ${c}`; }, remove() {} } };
  const timers = [];
  const dom = new Proxy(function () {}, { get: () => dom, set: () => true, apply: () => dom });
  const context = {
    console,
    document: { querySelector: (sel) => (sel === '#announcement' ? element('announcement') : dom), querySelectorAll: () => [], addEventListener() {}, createElement: () => dom, body: dom, documentElement: dom, activeElement: null },
    window: { addEventListener() {}, innerWidth: 1920, innerHeight: 1080 }, innerWidth: 1920, innerHeight: 1080,
    fetch: async () => ({ json: async () => ({ ok: true }) }),
    setInterval: () => 0, clearInterval() {}, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, performance: { now: () => 0 },
    URLSearchParams, Date, Math, JSON, Number, String, Object, Array, Set, Map, Promise, Intl,
  };
  vm.createContext(context);
  vm.runInContext(read('web/app.js'), context, { filename: 'app.js' });

  vm.runInContext('announce("<b>Server restart</b> in 5 minutes", "urgent"); announce("Second one", "info")', context);
  const root = els.announcement;
  assert.match(root.className, /announcement urgent/);
  assert.match(root.innerHTML, /&lt;b&gt;Server restart/);
  assert.doesNotMatch(root.innerHTML, /<b>Server restart/);
  assert.doesNotMatch(root.innerHTML, /Second one/, 'the second announcement waits for the first');

  timers.shift().fn(); // first announcement starts leaving
  assert.match(root.className, /leaving/);
  timers.shift().fn(); // leave finished, next one shows
  assert.match(root.innerHTML, /Second one/);
  assert.match(root.className, /announcement info/);
});
