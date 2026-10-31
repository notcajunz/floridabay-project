import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { panelLookupsForScope, panelResourceAllowed } from "../src/web-panel.js";

test("the headtag ACE scope exposes only headtags and its read-only organization lookup", () => {
  assert.equal(panelResourceAllowed("headtags", "headtags"), true);
  for (const id of ["organizations", "organization-requirements", "org-shop", "org-wallets", "personals", "ace-groups"])
    assert.equal(panelResourceAllowed("headtags", id, true), false, id);
  assert.deepEqual(panelLookupsForScope("headtags"), { organizations: ["id", "name"] });
});

test("existing full, Co-Owner, and personals restrictions remain intact", () => {
  assert.equal(panelResourceAllowed("full", "ace-groups"), true);
  assert.equal(panelResourceAllowed("organizations", "organizations"), true);
  assert.equal(panelResourceAllowed("organizations", "headtags"), true);
  assert.equal(panelResourceAllowed("organizations", "personals", false), false);
  assert.equal(panelResourceAllowed("organizations", "personals", true), true);
});

test("scoped control-panel UI opens the first resource actually returned by the server", async () => {
  const source = await readFile(new URL("../web/app.js", import.meta.url), "utf8");
  assert.match(source, /firstScopedView = state\.data\.capabilities\?\.organizationSetup \? "orgsetup"/);
  assert.doesNotMatch(source, /state\.view = "resource:organizations"/);
});

test("the member portal links headtag managers into their scoped control panel", async () => {
  const server = await readFile(new URL("../src/web-panel.js", import.meta.url), "utf8");
  const portal = await readFile(new URL("../web/portal.js", import.meta.url), "utf8");
  assert.match(server, /headtagAdmin: managementScope === "headtags"/);
  assert.match(portal, /access\.headtagAdmin \? \[\["Management", \[\["settings", "Headtag configuration"/);
  assert.match(portal, /View and edit headtags only/);
  assert.match(portal, /access\.owner \|\| state\.data\.access\.orgAdmin \|\| state\.data\.access\.headtagAdmin/);
});
