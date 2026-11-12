import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("storefront exposes a complete Tebex shopping flow", async () => {
  const [html, script, panel, caddy, deploy] = await Promise.all([
    readFile(new URL("../web/store/index.html", import.meta.url), "utf8"),
    readFile(new URL("../web/store/store.js", import.meta.url), "utf8"),
    readFile(new URL("../src/web-panel.js", import.meta.url), "utf8"),
    readFile(new URL("../../../deploy/caddy/store.floridabay.net.caddy", import.meta.url), "utf8"),
    readFile(new URL("../../../scripts/deploy.sh", import.meta.url), "utf8"),
  ]);
  assert.match(html, /Secure Tebex checkout/);
  assert.match(html, /Fuel the stories/);
  assert.match(html, /results-label/);
  assert.match(html, /Have a code or gift card/);
  assert.match(script, /basket\/auth/);
  assert.match(script, /needsAccountLink\(basket\)\) \{ await linkAccount/);
  assert.match(script, /fbrp_tebex_pending_package/);
  assert.match(script, /basket\/code/);
  assert.match(script, /links\?\.checkout/);
  assert.match(panel, /\/api\/store\/catalog/);
  assert.match(panel, /\/api\/store\/webhooks\/tebex/);
  assert.match(panel, /\/api\/store\/identity/);
  assert.match(panel, /discord_id: session\.id/);
  assert.match(panel, /\/store-login/);
  assert.match(html, /discord-account/);
  assert.match(html, /discord\.gg\/4gCvKJRGxk/);
  assert.match(script, /fbrp_tebex_basket_v2/);
  assert.match(script, /Sign in with Discord/);
  assert.match(script, /matching “/);
  assert.match(panel, /store\.floridabay\.net/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:8080/);
  assert.match(deploy, /install_caddy/);
  assert.match(deploy, /caddy reload/);
});
