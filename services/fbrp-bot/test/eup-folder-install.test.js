import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

process.env.OPENAI_API_KEY = "test-key";
const { installEupFolder } = await import("../src/eup-folder-install.js");

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com")) return realFetch(url, options);
  const name = JSON.parse(options.body).text.format.name;
  const answer = name === "eup_packaging_review"
    ? { summary: "Looks fine.", dlcName: "", renames: [], notes: [] }
    : { verdict: "safe", summary: "Only game assets.", findings: [], repairs: [] };
  return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }] }), { status: 200 });
};

const asset = (fill) => Buffer.concat([Buffer.from("RSC7"), Buffer.alloc(48, fill)]);
const OWNER = "1090083387638812755";

async function packFolder() {
  const dir = await mkdtemp(path.join(tmpdir(), "fbrp-eup-folder-"));
  await mkdir(path.join(dir, "stream", "mp_m_freemode_01_mp_m_gold"), { recursive: true });
  const stream = (name, body) => writeFile(path.join(dir, "stream", "mp_m_freemode_01_mp_m_gold", name), body);
  await stream("mp_m_freemode_01_mp_m_gold^jbib_000_u.ydd", asset(1));
  await stream("mp_m_freemode_01_mp_m_gold^jbib_000_u_1.ydd", asset(1));
  await stream("mp_m_freemode_01_mp_m_gold^jbib_diff_000_a_uni.ytd", asset(2));
  await writeFile(path.join(dir, "stream", "mp_m_freemode_01_mp_m_gold.ymt"), asset(3));
  await writeFile(path.join(dir, "shop.meta"), "<ShopPedApparel><pedName>mp_m_freemode_01</pedName><dlcName>mp_m_gold</dlcName></ShopPedApparel>");
  await writeFile(path.join(dir, "fxmanifest.lua"), "fx_version 'cerulean'\ngame 'gta5'\nfiles { 'shop.meta' }\n");
  return dir;
}

test("a staged install builds the resource and portal row for the owner without touching production", async () => {
  const dir = await packFolder();
  const stage = await mkdtemp(path.join(tmpdir(), "fbrp-eup-stage-"));
  const { result, row, eupDir } = await installEupFolder(["--dir", dir, "--name", "gold_deputies", "--label", "Gold Deputies", "--owner", OWNER, "--stage", stage]);

  assert.equal(eupDir, path.join(stage, "eup"));
  assert.equal(result.eup.resource, "fbrp_eup_gold_deputies");
  assert.equal(result.eup.created_by, OWNER);
  assert.equal(row.created_by, OWNER);
  assert.deepEqual(JSON.parse(await readFile(path.join(stage, "custom_eup-row.json"), "utf8")), row);
  const pack = path.join(stage, "eup", "fbrp_eup_gold_deputies");
  const marker = JSON.parse(await readFile(path.join(pack, ".fbrp-eup.json"), "utf8"));
  assert.equal(marker.by, OWNER);
  assert.deepEqual(marker.pieces.map((p) => [p.comp, p.index, p.textures, p.alternate]), [["jbib", 0, 1, true]]);
  assert.deepEqual((await readdir(path.join(pack, "stream", "mp_m_freemode_01_mp_m_gold"))).sort(), [
    "mp_m_freemode_01_mp_m_gold^jbib_000_u.ydd", "mp_m_freemode_01_mp_m_gold^jbib_000_u_1.ydd", "mp_m_freemode_01_mp_m_gold^jbib_diff_000_a_uni.ytd",
  ]);
  assert.match(result.notes.join(" "), /Could not start it live/, "the staged build never reaches the game server");
});

test("the install needs an explicit mode, a real folder, a pack name and an owner id", async () => {
  const dir = await packFolder();
  const stage = await mkdtemp(path.join(tmpdir(), "fbrp-eup-stage-"));
  const base = ["--dir", dir, "--name", "gold_deputies", "--owner", OWNER];
  await assert.rejects(installEupFolder(base), /exactly one of --stage/);
  await assert.rejects(installEupFolder([...base, "--stage", stage, "--live"]), /exactly one of --stage/);
  await assert.rejects(installEupFolder(["--dir", path.join(dir, "missing"), "--name", "gold_deputies", "--owner", OWNER, "--stage", stage]), /extracted pack folder/);
  await assert.rejects(installEupFolder(["--dir", dir, "--name", "Bad Name", "--owner", OWNER, "--stage", stage]), /--name/);
  await assert.rejects(installEupFolder(["--dir", dir, "--name", "gold_deputies", "--owner", "someone", "--stage", stage]), /--owner/);
});

test("a public pack is recorded as owned by nobody in particular", async () => {
  const dir = await packFolder();
  const stage = await mkdtemp(path.join(tmpdir(), "fbrp-eup-stage-"));
  const { result, row } = await installEupFolder(["--dir", dir, "--name", "open_pack", "--public", "--stage", stage]);
  assert.equal(result.eup.created_by, "public");
  assert.equal(row.created_by, "public");
  await assert.rejects(installEupFolder(["--dir", dir, "--name", "open_pack", "--public", "--owner", OWNER, "--stage", stage]), /not both/);
});

test("--max-gb raises the size cap only within a sane range", async () => {
  const dir = await packFolder();
  const stage = await mkdtemp(path.join(tmpdir(), "fbrp-eup-stage-"));
  const base = ["--dir", dir, "--name", "big_pack", "--public", "--stage", stage];
  await assert.rejects(installEupFolder([...base, "--max-gb", "9"]), /--max-gb/);
  await assert.rejects(installEupFolder([...base, "--max-gb", "abc"]), /--max-gb/);
  const { result } = await installEupFolder([...base, "--max-gb", "3"]);
  assert.equal(result.eup.name, "big_pack");
});

test("a pack replacing a base game dlc keeps its numbers and names and gets no shop meta", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "fbrp-eup-vanilla-"));
  await mkdir(path.join(dir, "stream"), { recursive: true });
  await writeFile(path.join(dir, "stream", "mp_m_freemode_01_mp_m_bikerdlc_01^hand_002_u.ydd"), asset(1));
  await writeFile(path.join(dir, "stream", "mp_m_freemode_01_mp_m_bikerdlc_01^hand_diff_002_a_uni.ytd"), asset(2));
  const stage = await mkdtemp(path.join(tmpdir(), "fbrp-eup-stage-"));
  const { result, eupDir } = await installEupFolder(["--dir", dir, "--name", "kutte_pack", "--public", "--stage", stage]);
  const pack = path.join(eupDir, "fbrp_eup_kutte_pack");
  assert.deepEqual((await readdir(path.join(pack, "stream"))).sort(), ["mp_m_freemode_01_mp_m_bikerdlc_01^hand_002_u.ydd", "mp_m_freemode_01_mp_m_bikerdlc_01^hand_diff_002_a_uni.ytd"]);
  assert.deepEqual(await readdir(path.join(pack, "data")), []);
  const marker = JSON.parse(await readFile(path.join(pack, ".fbrp-eup.json"), "utf8"));
  assert.equal(marker.pieces[0].index, 2);
  assert.equal(marker.groups[0].meta, "none");
  assert.ok(result.eup);
});
