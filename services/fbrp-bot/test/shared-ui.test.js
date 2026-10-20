import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { orgsStaticPath } from "../src/orgs-site.js";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
const read = (file) => fs.readFileSync(path.join(web, file), "utf8");
const pages = ["index.html", "portal.html", "control.html", "verify.html", "transcript.html", "orgs/index.html", "store/index.html"];

test("every page loads the shared dropdowns and dialogs", () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /href="\/ui\.css\?v=\d+"/, page);
    assert.match(html, /<script src="\/ui\.js\?v=\d+" defer><\/script>/, page);
    // The classic script must come before the module scripts so dropdowns exist before the page renders.
    assert.ok(html.indexOf("/ui.js") < html.indexOf('type="module"'), page);
  }
});

test("the orgs and store hosts may serve the shared files", () => {
  assert.equal(orgsStaticPath("/ui.js"), "ui.js");
  assert.equal(orgsStaticPath("/ui.css"), "ui.css");
  assert.match(fs.readFileSync(path.join(web, "../src/web-panel.js"), "utf8"), /pathname === "\/ui\.js" \|\| pathname === "\/ui\.css"/);
});

test("no site uses the browser's own confirm, prompt or alert any more", () => {
  const files = ["app.js", "portal.js", "orgs/orgs.js", "orgs/badges.js", "store/store.js", "landing.js", "verify.js", "transcript.js", "callback.js"];
  for (const file of files) {
    const code = read(file).split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    assert.doesNotMatch(code, /(?<![\w.])confirm\(/, `${file} still calls confirm()`);
    assert.doesNotMatch(code, /(?<![\w.])prompt\(/, `${file} still calls prompt()`);
  }
  assert.match(read("ui.js"), /window\.alert = /);
  for (const file of ["portal.js", "orgs/orgs.js"]) assert.match(read(file), /await window\.fbrpConfirm\(/);
});

test("dropdowns keep the real select, work from the keyboard and never touch data-native ones", () => {
  const ui = read("ui.js");
  assert.match(ui, /data-native/);
  assert.match(ui, /aria-haspopup/);
  assert.match(ui, /ArrowDown/);
  assert.match(ui, /dispatchEvent\(new Event\("change"/);
  assert.match(read("ui.css"), /\.ui-select > select \{[^}]*opacity: 0/);
});
