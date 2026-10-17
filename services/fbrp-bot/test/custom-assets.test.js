import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = await mkdtemp(path.join(tmpdir(), "fbrp-assets-"));
process.env.FBRP_VEHICLES_DIR = path.join(root, "vehicles");
process.env.FBRP_EUP_DIR = path.join(root, "eup");
process.env.OPENAI_API_KEY = "test-key";
process.env.FBRP_FIVEM_ORIGIN = "http://127.0.0.1:9/fbrp_core"; // never reach the live game server from a test
const { createCustomAssets, eupSlug, streamPath } = await import("../src/custom-assets.js");
const { createPersonalImporter } = await import("../src/personal-import.js");

const realFetch = globalThis.fetch;
let verdict = "safe";
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com")) return realFetch(url, options);
  const answer = verdict === "safe"
    ? { verdict: "safe", summary: "Only game assets.", findings: [], repairs: [] }
    : { verdict: "unsafe", summary: "Hidden payload.", findings: [{ severity: "critical", file: "x.ydd", reason: "Embedded script." }], repairs: [] };
  return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }] }), { status: 200 });
};

/** A tiny in-memory stand-in for the two tables the module writes. */
function fakeDb() {
  const eup = [];
  const liveries = [];
  let next = 1;
  return {
    eup, liveries,
    async one(sql, params) {
      if (/FROM custom_eup WHERE name=/.test(sql)) return eup.find((r) => r.name === params[0]) || null;
      if (/FROM custom_eup WHERE id=/.test(sql)) return eup.find((r) => r.id === params[0]) || null;
      if (/FROM personal_liveries WHERE personal_id=\? AND label=\?/.test(sql)) return liveries.find((r) => r.personal_id === params[0] && r.label === params[1]) || null;
      if (/FROM personal_liveries WHERE id=/.test(sql)) return liveries.find((r) => r.id === params[0]) || null;
      throw new Error(`unexpected one: ${sql}`);
    },
    async query(sql, params) {
      if (/INSERT INTO custom_eup/.test(sql)) {
        const [name, label, notes, file_count, size_bytes, created_by, created_at, updated_at] = params;
        const row = eup.find((r) => r.name === name);
        if (row) Object.assign(row, { label, notes, file_count, size_bytes, updated_at });
        else eup.push({ id: next++, name, label, notes, file_count, size_bytes, created_by, created_at, updated_at });
        return { affectedRows: 1 };
      }
      if (/^SELECT \* FROM custom_eup/.test(sql)) return [...eup];
      if (/^SELECT id,personal_id,label,files FROM personal_liveries|^SELECT id,personal_id,label,files,added_by/.test(sql)) return [...liveries];
      if (/^UPDATE custom_eup SET label/.test(sql)) { Object.assign(eup.find((r) => r.id === params[3]), { label: params[0], notes: params[1], updated_at: params[2] }); return { affectedRows: 1 }; }
      if (/DELETE FROM custom_eup/.test(sql)) { eup.splice(eup.findIndex((r) => r.id === params[0]), 1); return { affectedRows: 1 }; }
      if (/INSERT INTO personal_liveries/.test(sql)) {
        const [personal_id, label, token, files, added_by, added_at] = params;
        liveries.push({ id: next++, personal_id, label, token, files, added_by, added_at });
        return { affectedRows: 1 };
      }
      if (/SELECT label,files FROM personal_liveries/.test(sql)) return liveries.filter((r) => r.personal_id === params[0]);
      if (/DELETE FROM personal_liveries WHERE id/.test(sql)) { liveries.splice(liveries.findIndex((r) => r.id === params[0]), 1); return { affectedRows: 1 }; }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

const db = fakeDb();
const audits = [];
const personals = {
  assertManager: async (id) => { if (id !== "manager") throw new Error("Only the designated personal-vehicle manager can do that."); },
  canManage: async (id) => id === "manager",
  find: async () => ({ id: 5, model: "livcar", label: "Liv Car" }),
  modelOf: (value) => String(value).toLowerCase(),
};
const audit = async (...args) => { audits.push(args); };
const assets = createCustomAssets({ personals, audit, db });
const importer = createPersonalImporter({ personals, audit, db });

const asset = (fill) => Buffer.concat([Buffer.from("RSC7"), Buffer.alloc(48, fill)]);

/** Zips `files` ({ "path/in/zip": Buffer|string }) and stages it through the importer's upload endpoint. */
async function stageZip(files) {
  const src = await mkdtemp(path.join(tmpdir(), "fbrp-zip-src-"));
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(src, rel)), { recursive: true });
    await writeFile(path.join(src, rel), body);
  }
  const zip = path.join(await mkdtemp(path.join(tmpdir(), "fbrp-zip-out-")), "pack.zip");
  await run("python3", ["-c", "import sys,zipfile,pathlib\nroot=pathlib.Path(sys.argv[1])\nz=zipfile.ZipFile(sys.argv[2],'w')\n[z.write(p,p.relative_to(root)) for p in root.rglob('*') if p.is_file()]\nz.close()", src, zip]);
  const body = await readFile(zip);
  const params = new URLSearchParams({ offset: "0", total: String(body.length), name: "pack.zip" });
  return importer.uploadChunk("manager", params, (async function* () { yield body; })());
}

const SHOP_META = "<ShopPedApparel><pedName>mp_m_freemode_01</pedName></ShopPedApparel>";

test("pack names and stream paths are normalised and checked", () => {
  assert.equal(eupSlug("Sheriff Class-A"), "sheriff_class_a");
  assert.throws(() => eupSlug("x"), /2 to 40/);
  assert.equal(streamPath("pack/stream/male/jbib_000_u.ydd"), "male/jbib_000_u.ydd");
  assert.equal(streamPath("mp_m_freemode_01^jbib_000_u.ydd"), "mp_m_freemode_01^jbib_000_u.ydd");
  assert.throws(() => streamPath("stream/../evil.ydd"), /not allowed/);
  assert.throws(() => streamPath("stream/we ird;name.ydd"), /not allowed/);
});

test("only the manager sees or changes custom assets", async () => {
  assert.equal(await assets.portalData("someone"), null);
  await assert.rejects(assets.installEup("someone", { name: "abc", uploadId: "a".repeat(24) }), /designated personal-vehicle manager/);
  await assert.rejects(assets.addLivery("someone", { personalId: 5 }), /designated personal-vehicle manager/);
});

test("an EUP pack is scanned, rebuilt as its own resource, and can be replaced and deleted", async () => {
  const staged = await stageZip({
    "pack/stream/mp_m_freemode_01_mp_m_sheriff.ymt": asset(1),
    "pack/stream/male/mp_m_freemode_01_mp_m_sheriff^jbib_000_u.ydd": asset(2),
    "pack/stream/male/mp_m_freemode_01_mp_m_sheriff^jbib_diff_000_a_uni.ytd": asset(3),
    "pack/mp_m_freemode_01_mp_m_sheriff.meta": SHOP_META,
    "pack/readme.txt": "hello",
  });
  const result = await assets.installEup("manager", { uploadId: staged.id, name: "Sheriff Class A", label: "Sheriff", notes: "For SO" });
  assert.equal(result.eup.resource, "fbrp_eup_sheriff_class_a");
  assert.equal(result.eup.files, 3);
  const dir = path.join(process.env.FBRP_EUP_DIR, "fbrp_eup_sheriff_class_a");
  assert.deepEqual((await readdir(path.join(dir, "stream", "male"))).sort(), ["mp_m_freemode_01_mp_m_sheriff^jbib_000_u.ydd", "mp_m_freemode_01_mp_m_sheriff^jbib_diff_000_a_uni.ytd"]);
  const manifest = await readFile(path.join(dir, "fxmanifest.lua"), "utf8");
  assert.match(manifest, /data_file 'SHOP_PED_APPAREL_META_FILE'\s+'data\/shoppedapparel_1\.meta'/);
  assert.doesNotMatch(manifest, /client_script|server_script/);
  assert.equal(JSON.parse(await readFile(path.join(dir, ".fbrp-eup.json"), "utf8")).label, "Sheriff");
  assert.equal(db.eup.length, 1);
  assert.equal((await assets.portalData("manager")).eup[0].label, "Sheriff");

  // The same name again needs the replace flag, and replacing keeps a backup.
  const again = await stageZip({ "stream/a.ydd": asset(9) });
  await assert.rejects(assets.installEup("manager", { uploadId: again.id, name: "sheriff_class_a" }), /already exists/);
  const replaced = await assets.installEup("manager", { uploadId: again.id, name: "sheriff_class_a", replace: true, label: "Sheriff v2" });
  assert.equal(replaced.eup.files, 1);
  assert.equal(db.eup[0].label, "Sheriff v2");
  assert.equal((await readdir(process.env.FBRP_EUP_DIR)).filter((n) => n.startsWith(".replaced-fbrp_eup_sheriff_class_a-")).length, 1);

  await assets.updateEup("manager", { id: db.eup[0].id, label: "Renamed", notes: "" });
  assert.equal(db.eup[0].label, "Renamed");
  await assets.deleteEup("manager", { id: db.eup[0].id });
  assert.equal(await stat(dir).catch(() => null), null);
  assert.equal(db.eup.length, 0);
});

test("a pack with no clothing files or an unsafe verdict is refused", async () => {
  const empty = await stageZip({ "readme.txt": "nothing here" });
  await assert.rejects(assets.installEup("manager", { uploadId: empty.id, name: "empty_pack" }), /No clothing files/);
  const bad = await stageZip({ "stream/a.ydd": asset(4) });
  verdict = "unsafe";
  await assert.rejects(assets.installEup("manager", { uploadId: bad.id, name: "bad_pack" }), /Security check blocked/);
  verdict = "safe";
  assert.equal(await stat(path.join(process.env.FBRP_EUP_DIR, "fbrp_eup_bad_pack")).catch(() => null), null);
});

// A personal vehicle whose resource the importer made.
const vehicle = path.join(process.env.FBRP_VEHICLES_DIR, "fbrp_pv_livcar");
await mkdir(path.join(vehicle, "stream"), { recursive: true });
await writeFile(path.join(vehicle, "stream", "livcar.yft"), asset(1));
await writeFile(path.join(vehicle, "stream", "livcar.ytd"), asset(1));
await writeFile(path.join(vehicle, ".fbrp-import.json"), JSON.stringify({ model: "livcar" }));

test("a livery adds files, refuses silent overwrites, and removing it restores the vehicle", async () => {
  const added = await stageZip({ "livery/livcar_stripe.ytd": asset(5), "livery/notes.txt": "x" });
  const result = await assets.addLivery("manager", { personalId: 5, uploadId: added.id, label: "Stripe" });
  assert.equal(result.livery.files.length, 1);
  assert.deepEqual((await readdir(path.join(vehicle, "stream"))).sort(), ["livcar.ytd", "livcar.yft", "livcar_stripe.ytd"].sort());

  // Same label, or a file that belongs to another livery.
  const dupe = await stageZip({ "a/livcar_stripe.ytd": asset(6) });
  await assert.rejects(assets.addLivery("manager", { personalId: 5, uploadId: dupe.id, label: "Stripe" }), /already has a livery/);
  await assert.rejects(assets.addLivery("manager", { personalId: 5, uploadId: dupe.id, label: "Other", replaceExisting: true }), /belong to another livery/);

  // Overwriting the vehicle's own texture needs the flag, and the original comes back on removal.
  const swap = await stageZip({ "livcar.ytd": asset(7) });
  await assert.rejects(assets.addLivery("manager", { personalId: 5, uploadId: swap.id, label: "Retexture" }), /Replace files with the same name/);
  const swapped = await assets.addLivery("manager", { personalId: 5, uploadId: swap.id, label: "Retexture", replaceExisting: true });
  assert.deepEqual(await readFile(path.join(vehicle, "stream", "livcar.ytd")), asset(7));
  assert.equal(swapped.livery.files[0].replaced, true);

  await assets.removeLivery("manager", { id: swapped.livery.id });
  assert.deepEqual(await readFile(path.join(vehicle, "stream", "livcar.ytd")), asset(1));
  await assets.removeLivery("manager", { id: result.livery.id });
  assert.deepEqual((await readdir(path.join(vehicle, "stream"))).sort(), ["livcar.ytd", "livcar.yft"].sort());
  assert.equal(db.liveries.length, 0);
  assert.deepEqual(await readdir(path.join(vehicle, ".liveries")), []);
});

test("an unsafe livery is blocked and leaves the vehicle alone", async () => {
  const bad = await stageZip({ "evil.ydd": asset(8) });
  verdict = "unsafe";
  await assert.rejects(assets.addLivery("manager", { personalId: 5, uploadId: bad.id, label: "Evil" }), /Security check blocked/);
  verdict = "safe";
  assert.deepEqual((await readdir(path.join(vehicle, "stream"))).sort(), ["livcar.ytd", "livcar.yft"].sort());
  assert.ok(audits.some(([, action]) => action === "livery.import.blocked"));
});

test("liveries need an importer-made vehicle", async () => {
  const handmade = createCustomAssets({
    personals: { ...personals, find: async () => ({ id: 6, model: "handmade", label: "Hand" }) },
    audit, db,
  });
  await mkdir(path.join(process.env.FBRP_VEHICLES_DIR, "fbrp_pv_handmade"));
  const staged = await stageZip({ "a.ytd": asset(2) });
  await assert.rejects(handmade.addLivery("manager", { personalId: 6, uploadId: staged.id, label: "X" }), /not made by the importer/);
});
