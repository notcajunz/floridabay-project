import assert from "node:assert/strict";
import test from "node:test";
import { definitions } from "../src/devops/commands.js";

process.env.MARIADB_HOST ||= "127.0.0.1";
const { eupLine, eupMatches, slotLines } = await import("../src/devops/lookups.js");
const { analyze, slotSummary } = await import("../src/eup-packaging.js");

const rows = [
  { id: 1, name: "sheriff_class_a", label: "Sheriff Class A", resource: "fbrp_eup_sheriff_class_a", installed: true, file_count: 42, size_bytes: 31457280, created_by: "111111111111111111", created_at: 1700000000000, groups: [{ ped: "mp_m_freemode_01", dlc: "sheriff", drawables: 10, textures: 12, props: 2, ymt: true, meta: "pack" }], addonPeds: ["deputy_m"] },
  { id: 2, name: "sheriff_k9", label: "K9 Unit", resource: "fbrp_eup_sheriff_k9", installed: false, file_count: 1, size_bytes: 1024, created_by: null, created_at: 1700000000000, groups: [], addonPeds: ["k9_shepherd"] },
  { id: 12, name: "swat", label: "SWAT", resource: "fbrp_eup_swat", installed: true, file_count: 3, size_bytes: 3000, created_by: "222222222222222222", created_at: 1700000000000, groups: [], addonPeds: [] },
];

test("the dev bot has /eup lookup, added and list like the personals lookups", () => {
  const eup = definitions.find((command) => command.name === "eup");
  assert.ok(eup);
  assert.deepEqual(eup.options.map((option) => option.name), ["lookup", "added", "list"]);
  const lookup = eup.options.find((option) => option.name === "lookup");
  assert.equal(lookup.options[0].autocomplete, true);
  assert.equal(lookup.options[0].required, true);
  assert.equal(eup.options.find((option) => option.name === "added").options[0].type, 6);
  assert.equal(definitions.find((command) => command.name === "personals").options[0].name, "owned");
});

test("lookup finds packs by id, exact name, partial text, clothing pack name or addon ped", () => {
  assert.deepEqual(eupMatches(rows, "#1").map((r) => r.id), [1]);
  assert.deepEqual(eupMatches(rows, "12").map((r) => r.id), [12]);
  assert.deepEqual(eupMatches(rows, "SWAT").map((r) => r.id), [12]);
  assert.deepEqual(eupMatches(rows, "sherif").map((r) => r.id), [1, 2], "partial matches list every pack");
  assert.deepEqual(eupMatches(rows, "k9_shepherd").map((r) => r.id), [2]);
  assert.deepEqual(eupMatches(rows, "deputy").map((r) => r.id), [1]);
  assert.deepEqual(eupMatches(rows, "sheriff_k9").map((r) => r.id), [2], "an exact name wins over partial matches");
  assert.deepEqual(eupMatches(rows, "nothing"), []);
  assert.deepEqual(eupMatches(rows, "  "), []);
});

test("list lines show status, size, clothing, addon peds and who added the pack", () => {
  const line = eupLine(rows[0]);
  assert.match(line, /#1 · Sheriff Class A\*\* 🟢/);
  assert.match(line, /`fbrp_eup_sheriff_class_a` · 42 files · 30 MB · 12 clothing items · 1 addon ped\n↳ added by <@111111111111111111>/);
  assert.match(eupLine(rows[1]), /🔴 files missing/);
  assert.match(eupLine(rows[1]), /1 file · 1\.0 MB|1 file · 0\.0 MB/);
  assert.match(eupLine(rows[1]), /added by unknown/);
  assert.match(eupLine({ ...rows[0], slots: [{ label: "Torsos" }, { label: "Shoes" }, { label: "Torsos" }] }), /\n↳ Torsos, Shoes\n/);
});

test("each part of a pack is shown with its slot and the vMenu category that lists it", () => {
  const names = [
    "mp_m_freemode_01_x^jbib_000_u.ydd", "mp_m_freemode_01_x^jbib_001_u.ydd", "mp_m_freemode_01_x^jbib_diff_000_a_uni.ytd", "mp_m_freemode_01_x^jbib_diff_001_a_uni.ytd", "mp_m_freemode_01_x^jbib_diff_001_b_uni.ytd",
    "mp_m_freemode_01_x^p_head_000.ydd", "mp_m_freemode_01_x^p_head_diff_000_a.ytd",
    "mp_f_freemode_01_x^feet_002_u.ydd", "mp_f_freemode_01_x^feet_diff_002_a_uni.ytd",
    "mp_m_freemode_01^lowr_007_u.ydd",
  ];
  const lines = slotLines(slotSummary(analyze(names.map((rel) => ({ rel }))).entries));
  assert.deepEqual(lines, [
    "Female · slot 6 `feet` · **Shoes** · item 002 · 1 texture",
    "Male · slot 4 `lowr` · **Legs** · item 007 · 0 textures · replaces base game",
    "Male · slot 11 `jbib` · **Shirt Overlay & Jackets** · items 000–001 (2) · 3 textures",
    "Male · prop slot 0 `p_head` · **Hats & Helmets** · item 000 · 1 texture",
  ]);
});
