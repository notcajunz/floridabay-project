import assert from "node:assert/strict";
import test from "node:test";
import { addonPedNames, analyze, assetHeaderProblem, classify, closeGaps, eupPieces, genderHint, shopMetaTarget, shopPedMeta, validateRenames, isVanillaDlc, withPrefix } from "../src/eup-packaging.js";

test("clothing file names are classified by ped, pack, component and number", () => {
  assert.deepEqual(
    (({ kind, ped, dlc, style, comp, index }) => ({ kind, ped, dlc, style, comp, index }))(classify("mp_m_freemode_01_sheriff^jbib_012_u.ydd")),
    { kind: "drawable", ped: "mp_m_freemode_01", dlc: "sheriff", style: "dlc", comp: "jbib", index: 12 },
  );
  assert.equal(classify("mp_f_freemode_01_x^uppr_diff_003_b_whi.ytd").kind, "texture");
  assert.equal(classify("mp_m_freemode_01_x^p_head_001.ydd").kind, "prop");
  assert.equal(classify("mp_m_freemode_01_x^p_head_diff_001_a.ytd").kind, "proptexture");
  assert.equal(classify("mp_m_freemode_01^jbib_001_u.ydd").style, "replace");
  assert.equal(classify("jbib_001_u.ydd").style, "bare");
  assert.equal(classify("mp_m_freemode_01_sheriff.ymt").kind, "ymt");
  assert.equal(classify("Shirt_Blue.ydd").kind, "other");
  assert.equal(classify("stream/male/hair_000_r_hi.ydd").hi, true);
});

test("a gender is read from folder names but never from the file name alone", () => {
  assert.equal(genderHint("pack/Female/a.ydd"), "mp_f_freemode_01");
  assert.equal(genderHint("pack/[male]/a.ydd"), "mp_m_freemode_01");
  assert.equal(genderHint("pack/f/a.ydd"), "mp_f_freemode_01");
  assert.equal(genderHint("pack/women/a.ydd"), "mp_f_freemode_01");
  assert.equal(genderHint("mp_f_freemode_01_a.ydd"), null);
  assert.equal(genderHint("pack/uniforms/a.ydd"), null);
});

test("prefixes are added without disturbing the rest of the name", () => {
  assert.equal(withPrefix(classify("uppr_000_u.ydd"), "mp_m_freemode_01", "deputy"), "mp_m_freemode_01_deputy^uppr_000_u.ydd");
  assert.equal(withPrefix(classify("mp_m_freemode_01^uppr_000_u.ydd"), "mp_m_freemode_01", "deputy"), "mp_m_freemode_01_deputy^uppr_000_u.ydd");
});

test("analysis reports missing textures, orphans, gaps and a missing creature metadata file", () => {
  const files = [
    "mp_m_freemode_01_x^jbib_000_u.ydd", "mp_m_freemode_01_x^jbib_diff_000_a_uni.ytd",
    "mp_m_freemode_01_x^jbib_002_u.ydd",
    "mp_m_freemode_01_x^lowr_diff_005_a_uni.ytd",
    "loose_shirt.ydd",
  ].map((rel) => ({ rel, size: 10 }));
  const result = analyze(files);
  assert.equal(result.groups.length, 1);
  assert.deepEqual([result.groups[0].drawables, result.groups[0].textures], [2, 2]);
  const text = result.warnings.join(" | ");
  assert.match(text, /1 drawable has no texture \(for example mp_m_freemode_01_x\^jbib_002_u\.ydd\)/);
  assert.match(text, /1 texture has no drawable/);
  assert.match(text, /numbering skips jbib 001/);
  assert.match(text, /no mp_m_freemode_01_x\.ymt/);
  assert.match(result.problems.join(" "), /does not follow a clothing name \(for example loose_shirt\.ydd\)/);
});

test("closing gaps renumbers drawables and their textures together", () => {
  const group = analyze(["a/mp_m_freemode_01_x^jbib_000_u.ydd", "a/mp_m_freemode_01_x^jbib_diff_000_a_uni.ytd", "a/mp_m_freemode_01_x^jbib_004_u.ydd", "a/mp_m_freemode_01_x^jbib_diff_004_a_uni.ytd", "a/mp_m_freemode_01_x^jbib_diff_004_b_uni.ytd"].map((rel) => ({ rel }))).groups[0];
  assert.deepEqual(closeGaps(group.entries), [
    { from: "a/mp_m_freemode_01_x^jbib_004_u.ydd", to: "a/mp_m_freemode_01_x^jbib_001_u.ydd" },
    { from: "a/mp_m_freemode_01_x^jbib_diff_004_a_uni.ytd", to: "a/mp_m_freemode_01_x^jbib_diff_001_a_uni.ytd" },
    { from: "a/mp_m_freemode_01_x^jbib_diff_004_b_uni.ytd", to: "a/mp_m_freemode_01_x^jbib_diff_001_b_uni.ytd" },
  ]);
});

test("AI renames are kept only when they are well formed, unused and not base game replacements", () => {
  const entries = analyze(["Shirt.ydd", "Shirt_tex.ytd", "mp_m_freemode_01_x^jbib_000_u.ydd", "Other.ydd", "mp_m_freemode_01^jbib_005_u.ydd"].map((rel) => ({ rel }))).entries;
  const { accepted, rejected } = validateRenames([
    { from: "Shirt.ydd", to: "mp_m_freemode_01_x^jbib_001_u.ydd", reason: "shirt" },
    { from: "Shirt_tex.ytd", to: "mp_m_freemode_01_x^jbib_diff_001_a_uni.ytd", reason: "texture" },
    { from: "Other.ydd", to: "mp_m_freemode_01_x^jbib_000_u.ydd", reason: "name already used" },
    { from: "Other.ydd", to: "mp_m_freemode_01^jbib_009_u.ydd", reason: "replaces the base game" },
    { from: "Other.ydd", to: "mp_m_freemode_01_other^jbib_009_u.ydd", reason: "different pack" },
    { from: "Other.ydd", to: "whatever.ydd", reason: "not clothing" },
    { from: "Other.ydd", to: "mp_m_freemode_01_x^jbib_diff_009_a_uni.ytd", reason: "changes extension" },
    { from: "missing.ydd", to: "mp_m_freemode_01_x^jbib_007_u.ydd", reason: "unknown source" },
  ], entries, { dlc: "x" });
  assert.deepEqual(accepted.map((a) => a.to), ["mp_m_freemode_01_x^jbib_001_u.ydd", "mp_m_freemode_01_x^jbib_diff_001_a_uni.ytd"]);
  assert.deepEqual(rejected.map((r) => r.reason), [
    "name already used", "would replace base game clothing", "uses a different pack name", "not a valid clothing file name", "changes the extension", "not a file of this pack",
  ]);
});

test("meta helpers read targets, addon peds and write a basic shop meta", () => {
  const meta = shopPedMeta("mp_f_freemode_01", "deputy", { creature: true });
  assert.deepEqual(shopMetaTarget(meta), { ped: "mp_f_freemode_01", dlc: "deputy" });
  assert.match(meta, /<creatureMetaData>mp_creaturemetadata_deputy<\/creatureMetaData>/);
  assert.doesNotMatch(shopPedMeta("mp_m_freemode_01", "x"), /creatureMetaData/);
  assert.deepEqual(addonPedNames("<InitDatas><Item><Name>Deputy_M</Name></Item><Item><Name>deputy_f</Name></Item><Item><Name>Deputy_M</Name></Item></InitDatas>"), ["deputy_m", "deputy_f"]);
});

test("game asset files must carry a GTA resource header", () => {
  assert.equal(assetHeaderProblem("a.ydd", Buffer.from("RSC7....")), null);
  assert.equal(assetHeaderProblem("a.ytd", Buffer.from("RSC8....")), null);
  assert.match(assetHeaderProblem("a.ydd", Buffer.from("MZ......")), /not a real ydd game asset/);
  assert.match(assetHeaderProblem("a.ytd", Buffer.from("print(1)")), /not a real ytd/);
  assert.equal(assetHeaderProblem("a.ymt", Buffer.from("PSIN....")), null);
});

test("a first-person alternate is part of its drawable and a prop set keeps the pack name", () => {
  const alt = classify("mp_m_freemode_01_mp_m_bcso^jbib_006_u_1.ydd");
  assert.deepEqual([alt.kind, alt.dlc, alt.comp, alt.index, alt.alt], ["drawable", "mp_m_bcso", "jbib", 6, true]);
  assert.equal(classify("mp_m_freemode_01_mp_m_bcso^jbib_006_u.ydd").alt, false);
  // Props are named <ped>_p_<pack>^p_head_000.ydd; the pack is still <pack>.
  const prop = classify("mp_f_freemode_01_p_mp_f_bcso^p_head_003.ydd");
  assert.deepEqual([prop.kind, prop.ped, prop.dlc, prop.style, prop.index], ["prop", "mp_f_freemode_01", "mp_f_bcso", "dlc", 3]);
  assert.equal(classify("mp_f_freemode_01_p_mp_f_bcso^p_head_diff_003_b.ytd").dlc, "mp_f_bcso");
  assert.equal(classify("mp_f_freemode_01_sheriff^p_head_003.ydd").dlc, "sheriff");
  const result = analyze([
    { rel: "mp_m_freemode_01_x^jbib_000_u.ydd" }, { rel: "mp_m_freemode_01_x^jbib_000_u_1.ydd" }, { rel: "mp_m_freemode_01_x^jbib_diff_000_a_uni.ytd" },
    { rel: "mp_m_freemode_01_p_x^p_head_000.ydd" }, { rel: "mp_m_freemode_01_x.ymt" },
  ]);
  assert.equal(result.groups.length, 1);
  assert.deepEqual([result.groups[0].drawables, result.groups[0].props, result.groups[0].ymt], [1, 1, true]);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.warnings.filter((w) => /texture|creature/.test(w)), ["mp_m_freemode_01_x: 1 drawable has no texture (for example mp_m_freemode_01_p_x^p_head_000.ydd)."]);
});

test("every clothing piece is listed once with its textures, alternate and size", () => {
  const pieces = eupPieces(analyze([
    { rel: "mp_f_freemode_01_x^jbib_001_u.ydd", size: 100 }, { rel: "mp_f_freemode_01_x^jbib_001_u_1.ydd", size: 50 },
    { rel: "mp_f_freemode_01_x^jbib_diff_001_a_uni.ytd", size: 10 }, { rel: "mp_f_freemode_01_x^jbib_diff_001_b_uni.ytd", size: 10 },
    { rel: "mp_f_freemode_01_x^jbib_000_u.ydd", size: 7 },
    { rel: "mp_m_freemode_01_p_x^p_head_000.ydd", size: 5 }, { rel: "mp_m_freemode_01_p_x^p_head_diff_000_a.ytd", size: 5 },
    { rel: "mp_m_freemode_01_x.ymt", size: 1 }, { rel: "readme.ydd", size: 1 },
  ]).entries);
  assert.deepEqual(pieces.map((p) => [p.ped[3], p.comp, p.index, p.label, p.prop, p.textures, p.alternate, p.bytes]), [
    ["f", "jbib", 0, "Shirt Overlay & Jackets", false, 0, false, 7],
    ["f", "jbib", 1, "Shirt Overlay & Jackets", false, 2, true, 170],
    ["m", "p_head", 0, "Hats & Helmets", true, 1, false, 10],
  ]);
  assert.equal(pieces[0].dlc, "x");
});

test("base game dlc names are recognised", () => {
  assert.equal(isVanillaDlc("mp_m_bikerdlc_01"), true);
  assert.equal(isVanillaDlc("mp_f_heist"), true);
  assert.equal(isVanillaDlc("mp_m_lowrider_01"), true);
  assert.equal(isVanillaDlc("mp_m_sdmcfatality"), false);
  assert.equal(isVanillaDlc("mp_m_security_pack"), false);
  assert.equal(isVanillaDlc("sheriff"), false);
});
