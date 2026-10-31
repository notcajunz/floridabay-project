import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requestUrl } from "../src/site-url.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => fs.readFileSync(path.resolve(here, "..", relative), "utf8");
const ea = "../../server-data/resources/[admin]/EasyAdmin/server";

test("portal request parsing never throws on malformed targets", () => {
  for (const target of ["//a b", "//[", "//x:99999/", "//%", "//@", "//:", "//a%00b/"]) {
    const url = requestUrl(target);
    assert.ok(url, target);
    assert.equal(url.host, "localhost");
  }
  assert.equal(requestUrl("//api/portal?x=1").pathname, "/api/portal");
  assert.equal(requestUrl("/api/portal?x=1").searchParams.get("x"), "1");
  assert.equal(requestUrl(undefined).pathname, "/");
  assert.equal(requestUrl("http://["), null);
});

test("the portal answers an unparseable target with 400 and ignores the Host header", () => {
  const panel = read("src/web-panel.js");
  assert.doesNotMatch(panel, /new URL\(request\.url/);
  assert.match(panel, /const url = requestUrl\(request\.url\);\n\s+if \(!url\) return sendJson\(response, 400/);
});

// updateBlacklist awaits fbrp_core's case insert, so the global `source` is nil afterwards.
// Reading it there made getName(nil) -> GetPlayerName(nil) throw before the webhook and kick.
test("EasyAdmin ban handlers keep the acting admin across the banlist write", () => {
  const banlist = read(`${ea}/banlist.lua`);
  const admin = read(`${ea}/admin_server.lua`);
  const handlers = [
    banlist.match(/RegisterServerEvent\("EasyAdmin:banPlayer"[\s\S]*?\nend\)/)[0],
    banlist.match(/RegisterServerEvent\("EasyAdmin:offlinebanPlayer"[\s\S]*?\nend\)/)[0],
    admin.match(/ea_warnAction", "kick"\) == "ban" then[\s\S]*?WarnedPlayers\[id\] = nil/)[0],
  ];
  for (const handler of handlers) {
    const after = handler.slice(handler.indexOf("updateBlacklist( ban )"));
    assert.ok(after.length > 30);
    assert.doesNotMatch(after, /\bsource\b/);
  }
  assert.match(handlers[0], /local src = source/);
  assert.match(handlers[0].slice(handlers[0].indexOf("updateBlacklist( ban )")), /DropPlayer\(playerId/);
});
