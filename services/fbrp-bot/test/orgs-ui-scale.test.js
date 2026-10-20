import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/orgs");
const css = fs.readFileSync(path.join(web, "orgs.css"), "utf8");
const js = fs.readFileSync(path.join(web, "orgs.js"), "utf8");
const html = fs.readFileSync(path.join(web, "index.html"), "utf8");

/** The last declaration block for a selector, so later overrides win like they do in the browser. */
const lastRule = (selector) => {
  const found = [...css.matchAll(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g"))];
  return found.length ? found.at(-1)[1] : "";
};

test("the section tabs wrap instead of scrolling, so no tab label is ever cut off", () => {
  const tabs = lastRule(".tabs");
  assert.match(tabs, /flex-wrap:\s*wrap/);
  assert.match(tabs, /overflow:\s*visible/);
  assert.match(tabs, /position:\s*static/);
});

test("large screens scale the site up a little, with no size buttons and no organization bar in the header", () => {
  assert.match(css, /html\s*\{\s*zoom:\s*var\(--zoom\)/);
  assert.match(css, /@media \(min-width: 1600px\)\s*\{\s*:root\s*\{\s*--zoom:\s*1\.12/);
  assert.doesNotMatch(js, /data-zoom|orgs-zoom-step|sizeControl/);
  assert.doesNotMatch(css, /size-ctl|user-zoom/);
  assert.doesNotMatch(html, /top-nav/);
  assert.doesNotMatch(js, /#top-nav/);
});

test("controls are comfortable to hit and text is not tiny", () => {
  assert.match(lastRule(".btn"), /--h:\s*44px/);
  assert.match(lastRule(".btn-sm"), /--h:\s*38px/);
  assert.match(lastRule(".field input, .field select, .field textarea"), /height:\s*46px/);
  assert.match(lastRule(".tabs a"), /font-size:\s*15px/);
});

test("changed assets are cache-busted", () => {
  assert.match(html, /orgs\.css\?v=8/);
  assert.match(html, /orgs\.js\?v=8/);
});
