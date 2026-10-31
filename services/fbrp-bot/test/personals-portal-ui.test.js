import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the personals page uses one clickable row per vehicle and a full management view", async () => {
  const portal = await readFile(new URL("../web/portal.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../web/site.css", import.meta.url), "utf8");
  assert.match(portal, /class="card personal-row"[^>]+data-personal-open/);
  assert.match(portal, /data-personal-back/);
  assert.match(portal, /personalDetailHtml\(selected, d\)/);
  assert.match(css, /\.personal-list \{ display: grid;/);
  assert.match(css, /\.personal-detail-card \{ display: grid;/);
});
