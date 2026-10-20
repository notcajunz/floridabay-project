import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createOrgLogos, decodeDataUrl, logoPath, MAX_LOGO_BYTES, sniffImage } from "../src/org-logos.js";
import { ROSTER_ACTIONS } from "../src/orgs-site.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24)]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(24)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]);

test("images are identified by their bytes, never their declared type", () => {
  assert.equal(sniffImage(PNG), "image/png");
  assert.equal(sniffImage(JPEG), "image/jpeg");
  assert.equal(sniffImage(GIF), "image/gif");
  assert.equal(sniffImage(WEBP), "image/webp");
  assert.equal(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'></svg>")), null);
  assert.equal(sniffImage(Buffer.from("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffImage(Buffer.alloc(4)), null);
});

test("website uploads must be a valid image data URL under the size limit", () => {
  const ok = decodeDataUrl(`data:image/png;base64,${PNG.toString("base64")}`);
  assert.equal(ok.mime, "image/png");
  assert.throws(() => decodeDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), /PNG, JPEG, WebP or GIF/);
  assert.throws(() => decodeDataUrl("https://evil.example/logo.png"), /PNG, JPEG, WebP or GIF/);
  // A script renamed to .png: right data URL type, wrong bytes.
  assert.throws(() => decodeDataUrl(`data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`), /not a PNG/);
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES)]);
  assert.throws(() => decodeDataUrl(`data:image/png;base64,${big.toString("base64")}`), /at most 512 KB/);
});

test("only Discord's CDN is fetched for attachments", async () => {
  const logos = createOrgLogos({ db: {}, audit: async () => {} });
  await assert.rejects(logos.fromAttachment({ url: "http://169.254.169.254/latest", size: 10 }), /Attach the logo/);
  await assert.rejects(logos.fromAttachment({ url: "https://evil.example/a.png", size: 10 }), /Attach the logo/);
  await assert.rejects(logos.fromAttachment({ url: "https://cdn.discordapp.com/attachments/1/2/a.png", size: MAX_LOGO_BYTES + 1 }), /at most 512 KB/);
});

test("logos are versioned so a new upload is never served from cache", () => {
  assert.equal(logoPath(7, 123, "https://floridabay.net"), "https://floridabay.net/api/orgs/logo/7?v=123");
  assert.equal(logoPath(7, null), null);
});

test("saving and removing a logo is audited and stores the sniffed type", async () => {
  const calls = [];
  const audits = [];
  const logos = createOrgLogos({ db: { query: async (sql, params) => { calls.push([sql, params]); return []; } }, audit: async (...args) => { audits.push(args); } });
  await logos.save(4, { buffer: PNG, mime: "image/png" }, "999");
  assert.match(calls[0][0], /INSERT INTO org_logos/);
  assert.equal(calls[0][1][1], "image/png");
  await logos.remove(4, "999");
  assert.match(calls[1][0], /DELETE FROM org_logos/);
  assert.deepEqual(audits.map((a) => a[1]), ["organization.logo", "organization.logo_remove"]);
});

test("logo actions exist on the site and the Discord commands accept an image", () => {
  assert.equal(ROSTER_ACTIONS.logo, "setLogo");
  assert.equal(ROSTER_ACTIONS["logo/remove"], "removeLogo");
  const commands = fs.readFileSync(path.join(here, "../src/commands.js"), "utf8");
  assert.match(commands, /addAttachmentOption\(\(o\) =>\s*o\s*\.setName\("logo"\)/);
  assert.match(commands, /\.setName\("logo"\)\s*\.setDescription\("Set or remove an organization's logo"\)/);
  const migration = fs.readFileSync(path.resolve(here, "../../../server-data/resources/[fbrp]/fbrp_core/migrations/080_org_logos.sql"), "utf8");
  assert.match(migration, /MEDIUMBLOB/);
  assert.match(fs.readFileSync(path.resolve(here, "../../../server-data/resources/[fbrp]/fbrp_core/server/database.lua"), "utf8"), /080_org_logos\.sql/);
});

test("the control panel organization editor has a logo field that is not a table column", () => {
  const panel = fs.readFileSync(path.join(here, "../src/web-panel.js"), "utf8");
  assert.match(panel, /field\("logo", "Logo", "logo", \{ virtual: true/);
  assert.match(panel, /if \(meta\.virtual\) continue;/);
  assert.match(panel, /decodeDataUrl\(logoInput\)/);
  const app = fs.readFileSync(path.join(here, "../web/app.js"), "utf8");
  assert.match(app, /meta\.type === "logo"/);
  assert.match(app, /data-logo-value/);
});
