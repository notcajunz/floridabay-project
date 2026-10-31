import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../web/", import.meta.url);
const redesignedPages = [
  "portal.html",
  "control.html",
  "orgs/index.html",
  "store/index.html",
  "verify.html",
  "transcript.html",
  "staff-permissions.html",
  "dev-review.html",
  "callback.html",
];

test("every non-landing page loads the Saltline system in cascade order", async () => {
  for (const page of redesignedPages) {
    const html = await readFile(new URL(page, webRoot), "utf8");
    const system = html.indexOf('/v2/design-system.css?v=20261028b');
    const responsive = html.indexOf('/v2/responsive.css?v=20261028a');
    const shell = html.indexOf('/v2/app-shell.js?v=20261028a');
    assert.ok(system > -1, `${page} loads the shared design system`);
    assert.ok(responsive > system, `${page} loads responsive overrides after the design system`);
    assert.ok(shell > responsive, `${page} loads the interaction shell after its styles`);
    assert.doesNotMatch(html, /florida\.(?:css|js)/, `${page} does not load the landing-only presentation`);
  }
});

test("the landing page remains isolated from the redesign", async () => {
  const html = await readFile(new URL("index.html", webRoot), "utf8");
  assert.match(html, /\/florida\.css\?v=2/);
  assert.match(html, /\/florida\.js\?v=3/);
  assert.doesNotMatch(html, /\/v2\//);
});

test("the design layer enforces solid surfaces and accessible motion", async () => {
  const system = await readFile(new URL("v2/design-system.css", webRoot), "utf8");
  const responsive = await readFile(new URL("v2/responsive.css", webRoot), "utf8");
  const shell = await readFile(new URL("v2/app-shell.js", webRoot), "utf8");
  assert.match(system, /body \* \{[\s\S]*background-image: none !important/);
  assert.match(system, /:focus-visible/);
  assert.match(responsive, /prefers-reduced-motion: reduce/);
  assert.match(responsive, /\.product-grid, \.loading-grid \{ grid-template-columns: 1fr !important/);
  assert.match(shell, /dataset\.interface = "saltline"/);
});

test("the redesign audit documents every shipped website surface", async () => {
  const audit = await readFile(new URL("../../../docs/website-design-system.md", import.meta.url), "utf8");
  for (const page of ["Landing", "Portal", "Control", "Organizations", "Store", "Verify", "Transcript", "Staff permissions", "Dev review", "Callback"]) {
    assert.match(audit, new RegExp(page, "i"), `${page} is covered by the audit`);
  }
});
