import assert from "node:assert/strict";
import test from "node:test";

import { decodePng, downscale, encodePng, isPng } from "../src/png.js";
import {
  CALLSIGN_STYLES, callsignStyleFor, chooseFields, emWidth, eraseLine, findTextLines, layoutFromChoices, measureLine,
  withMarks, withRuler,
} from "../src/badge-vision.js";
import { cleanFields, createOrgBadges, defaultFields } from "../src/org-badges.js";

process.env.OPENAI_API_KEY = "test-key";

const GOLD = [200, 160, 40];
const INK = [30, 20, 10];

function blank(width, height, color = GOLD) {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([...color, 255], i * 4);
  return { width, height, data };
}

function rect(image, x0, y0, w, h, color = INK) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y += 1) for (let x = Math.round(x0); x < Math.round(x0 + w); x += 1)
    if (x >= 0 && y >= 0 && x < image.width && y < image.height) image.data.set([...color, 255], (y * image.width + x) * 4);
}

/** A row of letter-sized blocks along a baseline; `bend` lifts the ends (negative) or drops them. */
function wordOn(image, { x, y, letters, w = 14, h = 24, gap = 8, bend = 0 }) {
  const total = letters * w + (letters - 1) * gap;
  for (let i = 0; i < letters; i += 1) {
    const cx = x - total / 2 + i * (w + gap) + w / 2;
    const u = (cx - x) / image.width;
    rect(image, cx - w / 2, y + bend * u * u * image.height - h / 2, w, h);
  }
}

test("png pictures survive a round trip and shrink with a box filter", () => {
  const image = blank(64, 40);
  rect(image, 10, 10, 8, 8, [255, 0, 0]);
  const png = encodePng(image);
  assert.ok(isPng(png));
  const back = decodePng(png);
  assert.equal(back.width, 64);
  assert.deepEqual([...back.data.slice((12 * 64 + 12) * 4, (12 * 64 + 12) * 4 + 4)], [255, 0, 0, 255]);
  assert.equal(downscale(back, 32).width, 32);
  assert.equal(downscale(back, 500), back);
  assert.throws(() => decodePng(Buffer.from("nope")), /not a PNG/);
});

test("the ruler and the marks are drawn on copies, not on the template", () => {
  const image = blank(300, 200);
  const before = Uint8Array.from(image.data);
  const ruled = withRuler(image);
  const marked = withMarks(image, [{ id: 3, x0: 20, y0: 30, x1: 120, y1: 60 }]);
  assert.deepEqual(image.data, before);
  assert.notDeepEqual(ruled.data, before);
  assert.notDeepEqual(marked.data, before);
});

test("text lines and write-in rules are found, plain decoration is not", () => {
  const image = blank(600, 400);
  wordOn(image, { x: 300, y: 300, letters: 6 });
  wordOn(image, { x: 300, y: 120, letters: 3, w: 18, h: 30 });
  rect(image, 100, 220, 300, 2);
  rect(image, 520, 40, 20, 20); // a lone block is not a line of text
  const lines = findTextLines(image);
  const text = lines.filter((l) => l.kind === "text");
  assert.equal(text.length, 2);
  assert.deepEqual(text.map((l) => l.letters.length).sort(), [3, 6]);
  assert.equal(lines.filter((l) => l.kind === "rule").length, 1);
  assert.ok(lines.every((l, i) => l.id === i + 1));
});

test("a curved banner is measured as a curve and a straight line as flat", () => {
  const curved = blank(600, 400);
  wordOn(curved, { x: 300, y: 300, letters: 12, bend: -2.5 });
  const [line] = findTextLines(curved).filter((l) => l.kind === "text");
  const m = measureLine(curved, line);
  assert.ok(m.a < -1, `expected an upward bend, got ${m.a}`);
  const flat = blank(600, 400);
  wordOn(flat, { x: 300, y: 300, letters: 12 });
  const [flatLine] = findTextLines(flat).filter((l) => l.kind === "text");
  const f = measureLine(flat, flatLine);
  assert.equal(f.a, 0);
  assert.equal(f.b, 0);
  assert.ok(Math.abs(f.capHeight - 24) <= 2);
  assert.match(f.color, /^#[0-9a-f]{6}$/);
  assert.ok(f.inkFraction > 0.9);
});

test("erasing a sample text leaves the plate behind it", () => {
  const image = blank(600, 400);
  wordOn(image, { x: 300, y: 300, letters: 6 });
  const [line] = findTextLines(image);
  const cleaned = blank(600, 400);
  rect(cleaned, 0, 0, 0, 0);
  const copy = { width: image.width, height: image.height, data: Uint8Array.from(image.data) };
  eraseLine(copy, line, measureLine(image, line));
  let bad = 0;
  for (let i = 0; i < copy.data.length; i += 4) if (Math.abs(copy.data[i] - GOLD[0]) > 12 || Math.abs(copy.data[i + 1] - GOLD[1]) > 12) bad += 1;
  assert.ok(bad < 40, `${bad} pixels still differ from the plate`);
});

test("only the callsign is replaced: ranks and names stay as printed", () => {
  const image = blank(600, 400);
  wordOn(image, { x: 300, y: 250, letters: 8, w: 16, h: 28 }); // a rank printed on the badge
  wordOn(image, { x: 300, y: 330, letters: 3 }); // the sample callsign
  const lines = findTextLines(image).filter((l) => l.kind === "text");
  const rank = lines.find((l) => l.letters.length === 8);
  const callsign = lines.find((l) => l.letters.length === 3);
  const result = layoutFromChoices(image, lines, [
    { id: rank.id, role: "other", text: "SERGEANT", bold: true, serif: true, align: "center" },
    { id: callsign.id, role: "callsign_sample", text: "5XX", bold: false, serif: true, align: "center" },
  ]);
  assert.deepEqual(result.found, ["callsign"]);
  assert.deepEqual(Object.keys(result.fields), ["callsign"]);
  assert.equal(result.fields.callsign.font, "serif");
  assert.equal(result.fields.callsign.uppercase, true);
  assert.ok(Math.abs(result.fields.callsign.x - 0.5) < 0.01 && Math.abs(result.fields.callsign.y - 330 / 400) < 0.02);
  const at = (img, x, y) => img.data[(y * img.width + x) * 4];
  assert.equal(at(image, 300 - 7, 330), INK[0]); // the input is untouched
  assert.ok(at(result.cleaned, 300 - 7, 330) > 150); // the sample callsign is gone from the copy
  assert.equal(at(result.cleaned, 300 - 8, 250), INK[0]); // the rank is still printed
});

test("text is sized so the longest normal callsign fits the plate, three digits for Homefront Security", () => {
  const image = blank(600, 400, [30, 30, 60]);
  rect(image, 240, 280, 120, 60, GOLD); // the callsign plate
  wordOn(image, { x: 300, y: 310, letters: 3 });
  const lines = findTextLines(image).filter((l) => l.kind === "text");
  const choices = [{ id: lines[0].id, role: "callsign_sample", text: "5XX", bold: true, serif: false, align: "center" }];
  const standard = layoutFromChoices(image, lines, choices, { style: "standard" }).fields.callsign;
  const dhs = layoutFromChoices(image, lines, choices, { style: "dhs" }).fields.callsign;
  assert.ok(standard.size * 400 * 4.9 <= 125, `standard text ${standard.size * 400}px would overflow a 120px plate`);
  assert.ok(dhs.size > standard.size);
  assert.ok(dhs.size * 400 * emWidth("000") <= 125);
  assert.ok(standard.maxWidth <= 0.22 && standard.maxWidth >= 0.1);
});

test("a label gets its value slot above the write-in rule; a picture without a callsign keeps defaults", () => {
  const image = blank(600, 400);
  wordOn(image, { x: 140, y: 150, letters: 5, w: 10, h: 14, gap: 4 }); // "Badge:"
  rect(image, 220, 160, 300, 2);
  const lines = findTextLines(image);
  const label = lines.find((l) => l.kind === "text");
  const result = layoutFromChoices(image, lines, [{ id: label.id, role: "callsign_label", text: "Badge #", bold: false, serif: false, align: "left" }]);
  assert.equal(result.fields.callsign.align, "left");
  assert.ok(result.fields.callsign.x >= 0.35 && result.fields.callsign.x <= 0.4);
  assert.ok(result.fields.callsign.y < 160 / 400);
  assert.equal(result.cleaned, null);
  const none = layoutFromChoices(image, lines, [{ id: label.id, role: "other", text: "x", bold: false, serif: false, align: "left" }]);
  assert.deepEqual(none.found, []);
  assert.deepEqual(none.fields, {});
  assert.ok(none.notes.some((n) => /default position was kept/.test(n)));
});

test("the model is asked once, tells which callsign shape to expect, and uses the lightest model", async () => {
  const image = blank(600, 400);
  wordOn(image, { x: 300, y: 300, letters: 6 });
  const lines = findTextLines(image);
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    const candidates = lines.map((l) => ({ id: l.id, text: "5XX", role: "callsign_sample", bold: true, serif: false, align: "center" }));
    return { ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ candidates }) }] }] }) };
  };
  delete process.env.BADGE_AI_MODEL;
  const choices = await chooseFields(image, lines, { fetchImpl });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url === "https://api.openai.com/v1/responses" && calls[0].body.model === "gpt-5.4-nano");
  assert.match(calls[0].body.instructions, /two or three letters, dash, three digits/);
  assert.equal(calls[0].body.text.format.strict, true);
  assert.equal(choices[0].role, "callsign_sample");
  await chooseFields(image, lines, { fetchImpl, style: "dhs" });
  assert.match(calls.at(-1).body.instructions, /three digits \(like 201/);
  assert.doesNotMatch(calls.at(-1).body.instructions, /two or three letters/);
  process.env.BADGE_AI_MODEL = "gpt-5.4-nano-2026-03-17";
  await chooseFields(image, lines, { fetchImpl });
  assert.equal(calls.at(-1).body.model, "gpt-5.4-nano-2026-03-17");
  delete process.env.BADGE_AI_MODEL;
  await assert.rejects(chooseFields(image, lines, { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "slow down" } }) }) }), /slow down/);
});

test("Homefront Security callsigns are three digits, everyone else uses the standard shapes", () => {
  assert.equal(callsignStyleFor({ name: "Department of Homefront Security", slug: "dohs" }), "dhs");
  assert.equal(callsignStyleFor({ name: "DOHS", slug: "dohs" }), "dhs");
  assert.equal(callsignStyleFor({ name: "Los Santos Police Department", slug: "lspd" }), "standard");
  assert.equal(callsignStyleFor(null), "standard");
  assert.equal(CALLSIGN_STYLES.standard.sample, "2A-14");
  assert.equal(CALLSIGN_STYLES.dhs.sample, "201");
});

test("font and curve settings are clamped like every other badge field", () => {
  const fields = cleanFields({ rank: { font: "comic", bendA: 99, bendB: -9 }, callsign: { font: "serif", bendA: 0.5 } });
  assert.equal(fields.rank.font, "sans");
  assert.equal(fields.rank.bendA, 4);
  assert.equal(fields.rank.bendB, -1.5);
  assert.equal(fields.callsign.font, "serif");
  assert.equal(defaultFields().name.bendA, 0);
});

const upload = (png) => `data:image/png;base64,${png.toString("base64")}`;

function savingDb(org = { name: "Los Santos Police Department", slug: "lspd" }, existing = null) {
  const calls = [];
  return {
    calls,
    async one(sql) { calls.push(sql); return /FROM organizations/.test(sql) ? org : /SELECT fields FROM org_badge_templates/.test(sql) ? existing : null; },
    async query(sql, params) { calls.push([sql, params]); return []; },
  };
}

const insertOf = (db) => db.calls.find((c) => Array.isArray(c) && /INSERT INTO org_badge_templates/.test(c[0]));

test("uploading a picture uses the AI once, stores the cleaned picture and keeps the original", async () => {
  const original = encodePng(blank(60, 40));
  const cleaned = blank(60, 40, [10, 10, 10]);
  const db = savingDb();
  let runs = 0;
  let style = null;
  const analyze = async (buffer, options) => {
    runs += 1;
    style = options.style;
    return { fields: { callsign: { enabled: true, x: 0.4, y: 0.7, size: 0.06, align: "center", font: "serif", bendA: 1, bendB: 0 } }, cleaned, found: ["callsign"], notes: [] };
  };
  const badges = createOrgBadges({ db, economy: {}, analyze });
  const result = await badges.save(7, { tier: "supervisor", image: upload(original), fields: { callsign: { x: 0.9 } } }, "42");
  assert.equal(runs, 1);
  assert.equal(style, "standard");
  assert.deepEqual(result.found, ["callsign"]);
  assert.equal(result.erased, true);
  const [, p] = insertOf(db);
  assert.ok(isPng(p[3]) && !Buffer.from(p[3]).equals(original));
  assert.ok(Buffer.from(p[8]).equals(original));
  const fields = JSON.parse(p[5]);
  assert.equal(fields.callsign.x, 0.4); // the AI's space beats a position dragged before the upload
  assert.equal(fields.callsign.font, "serif");
  assert.equal(fields.rank.enabled, false);
  assert.equal(fields.name.enabled, false);
  assert.ok(p[9]);
});

test("Homefront Security badges are read with the three-digit callsign style", async () => {
  const db = savingDb({ name: "Department of Homefront Security", slug: "dohs" });
  let style = null;
  const badges = createOrgBadges({ db, economy: {}, analyze: async (_b, o) => { style = o.style; return { fields: {}, cleaned: null, found: [], notes: [] }; } });
  await badges.save(3, { tier: "member", image: upload(encodePng(blank(20, 20))) }, "42");
  assert.equal(style, "dhs");
});

test("an AI failure never loses the upload: the picture is stored with the default callsign spot", async () => {
  const png = encodePng(blank(30, 30));
  const db = savingDb();
  const badges = createOrgBadges({ db, economy: {}, analyze: async () => { throw new Error("quota exceeded"); } });
  const result = await badges.save(7, { tier: "member", image: upload(png), fields: { callsign: { y: 0.33 } } }, "42");
  assert.deepEqual(result.found, []);
  assert.ok(result.notes.some((n) => /quota exceeded/.test(n)));
  const [, p] = insertOf(db);
  assert.ok(Buffer.from(p[3]).equals(png));
  assert.equal(p[8], null);
  assert.equal(JSON.parse(p[5]).callsign.y, 0.33); // without an AI answer the sent position is used
});

test("a JPEG is stored without asking the AI, and a placement-only change never calls it", async () => {
  let runs = 0;
  const analyze = async () => { runs += 1; return { fields: {}, cleaned: null, found: [], notes: [] }; };
  const db = savingDb();
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24)]);
  const result = await createOrgBadges({ db, economy: {}, analyze }).save(7, { tier: "member", image: `data:image/jpeg;base64,${jpeg.toString("base64")}` }, "42");
  assert.equal(runs, 0);
  assert.ok(result.notes.some((n) => /only reads PNG/.test(n)));
  const existing = savingDb(undefined, { fields: "{}" });
  await createOrgBadges({ db: existing, economy: {}, analyze }).save(7, { tier: "member", fields: { callsign: { y: 0.5 } } }, "42");
  assert.equal(runs, 0);
});

test("there is no way to re-run the AI on a stored badge", () => {
  const badges = createOrgBadges({ db: {}, economy: {} });
  assert.equal(badges.detect, undefined);
  assert.equal(badges.detectBadge, undefined);
});
