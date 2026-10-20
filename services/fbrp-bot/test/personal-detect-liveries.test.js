import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { deflateRawSync } from "node:zlib";

const run = promisify(execFile);
const dir = await mkdtemp(path.join(tmpdir(), "fbrp-liveries-"));
process.env.FBRP_VEHICLES_DIR = dir;
process.env.OPENAI_API_KEY = "test-key";
process.env.FBRP_FIVEM_ORIGIN = "http://127.0.0.1:9/fbrp_core"; // never reach the live game server from a test
const { createPersonalImporter } = await import("../src/personal-import.js");
const { createPersonals } = await import("../src/personals.js");
const detect = await import("../src/livery-detect.js");

const CARCOLS = `<CVehicleModelInfoVarGlobal><Kits>
  <Item><kitName>0001_other_modkit</kitName><liveryNames><Item>OTHER_LIVERY_0</Item></liveryNames></Item>
  <Item><kitName>1234_wagon_modkit</kitName><visibleMods/><liveryNames><Item>WAGON_LIVERY_BLUE</Item><Item>WAGON_LIVERY_2</Item></liveryNames></Item>
</Kits></CVehicleModelInfoVarGlobal>`;
const VEHICLE_ITEM = "<Item><modelName>wagon</modelName><handlingId>wagon</handlingId><modKits><Item>1234_wagon_modkit</Item></modKits></Item>";
const VARIATIONS = `<CVehicleModelInfoVariation><variationData><Item><modelName>wagon</modelName><liveries><Item value="true"/><Item value="true"/><Item value="false"/></liveries></Item></variationData></CVehicleModelInfoVariation>`;

test("livery names come from the vehicle's own mod kit", () => {
  assert.deepEqual(detect.metaLiveryNames([CARCOLS], VEHICLE_ITEM), ["WAGON_LIVERY_BLUE", "WAGON_LIVERY_2"]);
  // Without a matching kit every livery name is offered.
  assert.deepEqual(detect.metaLiveryNames([CARCOLS], "<Item/>"), ["OTHER_LIVERY_0", "WAGON_LIVERY_BLUE", "WAGON_LIVERY_2"]);
  assert.equal(detect.enabledLiverySlots([VARIATIONS]), 2);
  const evidence = detect.liveryEvidence({ carcols: [CARCOLS], carvariations: [VARIATIONS], vehicleItemText: VEHICLE_ITEM, streamNames: ["wagon.yft", "wagon.ytd", "wagon_hi.yft", "wagon_livery_red.ytd", "wheel.ydr"], model: "wagon" });
  assert.deepEqual(evidence, { names: ["WAGON_LIVERY_BLUE", "WAGON_LIVERY_2"], files: ["wagon_livery_red.ytd"], enabledSlots: 2 });
});

test("only liveries that match the evidence are kept, and mod kit slots are never lost", () => {
  const evidence = { names: ["WAGON_LIVERY_BLUE", "WAGON_LIVERY_2"], files: ["wagon_livery_red.ytd", "wagon_wheel_skin.ytd"], enabledSlots: 2 };
  const kept = detect.validateLiveries([
    { label: "Blue Stripe", source: "wagon_livery_blue" },
    { label: "Red", source: "wagon_livery_red.ytd" },
    { label: "Invented", source: "NOT_IN_THE_PACK" },
    { label: "Blue again", source: "WAGON_LIVERY_BLUE" },
  ], evidence, "wagon");
  assert.deepEqual(kept, [
    { label: "Blue Stripe", source: "WAGON_LIVERY_BLUE", kind: "meta" },
    { label: "Red", source: "wagon_livery_red.ytd", kind: "file" },
    { label: "Livery 2", source: "WAGON_LIVERY_2", kind: "meta" },
  ]);
  // A file the AI did not vouch for is not a livery, but the mod kit slots still are.
  assert.deepEqual(detect.validateLiveries([], evidence, "wagon").map((l) => l.label), ["Livery Blue", "Livery 2"]);
});

test("detected liveries are registered for a new personal and refreshed on replace", async () => {
  const vehicle = path.join(dir, "fbrp_pv_wagon");
  await mkdir(vehicle, { recursive: true });
  await writeFile(path.join(vehicle, ".fbrp-import.json"), JSON.stringify({ model: "wagon", liveries: [
    { label: "Blue Stripe", source: "WAGON_LIVERY_BLUE", kind: "meta" },
    { label: "Red", source: "wagon_livery_red.ytd", kind: "file" },
  ] }));
  const rows = [];
  const queries = [];
  const db = {
    query: async (sql, params) => {
      queries.push(sql);
      if (/^DELETE FROM personal_liveries WHERE personal_id=\? AND builtin/.test(sql)) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].personal_id === params[0]) rows.splice(i, 1); return { affectedRows: 0 }; }
      if (/^INSERT IGNORE INTO personal_liveries/.test(sql)) {
        const [personal_id, label, token, files, detail, added_by] = params;
        if (rows.some((r) => r.personal_id === personal_id && r.label === label)) return { affectedRows: 0 };
        rows.push({ personal_id, label, token, files, builtin: true, detail, added_by });
        return { affectedRows: 1 };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  assert.equal(await detect.registerDetectedLiveries(db, 11, "wagon"), 2);
  assert.deepEqual(rows.map((r) => [r.label, r.detail]), [
    ["Blue Stripe", "Livery slot WAGON_LIVERY_BLUE in the vehicle's carcols.meta"],
    ["Red", "Texture file wagon_livery_red.ytd"],
  ]);
  // Running it again replaces the detected rows instead of duplicating them.
  assert.equal(await detect.registerDetectedLiveries(db, 11, "wagon"), 2);
  assert.equal(rows.length, 2);
  // A vehicle with no marker lists nothing and does not throw.
  assert.equal(await detect.registerDetectedLiveries(db, 12, "nothere"), 0);
});

test("converting a pack finds its liveries with the AI and adding the personal lists them", async () => {
  const src = await mkdtemp(path.join(tmpdir(), "fbrp-pack-src-"));
  await mkdir(path.join(src, "data"));
  await mkdir(path.join(src, "stream"));
  await writeFile(path.join(src, "data", "vehicles.meta"), `<CVehicleModelInfo__InitDataList><Item><modelName>wagon</modelName><txdName>wagon</txdName><handlingId>wagon</handlingId><gameName>wagon</gameName><modKits><Item>1234_wagon_modkit</Item></modKits></Item></CVehicleModelInfo__InitDataList>`);
  await writeFile(path.join(src, "data", "handling.meta"), `<CHandlingDataMgr><HandlingData><Item type="CHandlingData"><handlingName>wagon</handlingName><fMass value="1500.0"/></Item></HandlingData></CHandlingDataMgr>`);
  await writeFile(path.join(src, "data", "carcols.meta"), CARCOLS);
  await writeFile(path.join(src, "data", "carvariations.meta"), VARIATIONS);
  const rsc = (fill) => {
    const header = Buffer.alloc(16);
    header.write("RSC7");
    header.writeUInt32LE(162, 4);
    header.writeUInt32LE(0xa8000000, 8);
    header.writeUInt32LE(0x20000000, 12);
    return Buffer.concat([header, deflateRawSync(Buffer.alloc(512, fill))]);
  };
  await writeFile(path.join(src, "stream", "wagon.yft"), rsc(1));
  await writeFile(path.join(src, "stream", "wagon.ytd"), rsc(2));
  await writeFile(path.join(src, "stream", "wagon_livery_red.ytd"), rsc(3));
  await writeFile(path.join(src, "stream", "wagon_wheel.ydr"), rsc(4));
  const zip = path.join(await mkdtemp(path.join(tmpdir(), "fbrp-zip-out-")), "pack.zip");
  await run("python3", ["-c", "import sys,zipfile,pathlib\nroot=pathlib.Path(sys.argv[1])\nz=zipfile.ZipFile(sys.argv[2],'w')\n[z.write(p,p.relative_to(root)) for p in root.rglob('*') if p.is_file()]\nz.close()", src, zip]);

  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://api.openai.com")) return realFetch(url, options);
    const body = JSON.parse(options.body);
    const answer = body.text.format.name === "vehicle_security_review"
      ? { verdict: "safe", summary: "Only game assets.", findings: [], repairs: [] }
      : (seen.push(JSON.parse(body.input)), { label: "Wagon", summary: "Installed.", notes: [], edits: [], vehicleType: "leo", vehicleTypeReason: "The pack declares police emergency lighting.", liveries: [
        { label: "Blue Stripe", source: "WAGON_LIVERY_BLUE" },
        { label: "Red Wrap", source: "wagon_livery_red.ytd" },
        { label: "Made up", source: "nothing.ytd" },
      ] });
    return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }] }), { status: 200 });
  };
  try {
    const queries = [];
    const db = {
      one: async () => null,
      query: async (sql, params) => { queries.push([sql, params]); return { affectedRows: 1, insertId: 21 }; },
    };
    const personalsLike = { assertManager: async () => {}, modelOf: (v) => String(v).toLowerCase() };
    const importer = createPersonalImporter({ personals: personalsLike, audit: async () => {}, db });
    const body = await readFile(zip);
    const staged = await importer.uploadChunk("1", new URLSearchParams({ offset: "0", total: String(body.length), name: "pack.zip" }), (async function* () { yield body; })());
    const result = await importer.convert("1", { uploadId: staged.id, uploadName: "pack.zip", model: "wagon" });

    // The AI was shown the evidence, and only evidence-backed liveries came back.
    assert.deepEqual(seen[0].liveryEvidence, { names: ["WAGON_LIVERY_BLUE", "WAGON_LIVERY_2"], files: ["wagon_livery_red.ytd"], enabledSlots: 2 });
    assert.ok(seen[0].emergencyMetadata.some((entry) => /carvariations\.meta/.test(entry)));
    assert.equal(result.vehicleType, "leo");
    assert.match(result.vehicleTypeReason, /police emergency lighting/);
    assert.deepEqual(result.liveries, [
      { label: "Blue Stripe", source: "WAGON_LIVERY_BLUE", kind: "meta" },
      { label: "Red Wrap", source: "wagon_livery_red.ytd", kind: "file" },
      { label: "Livery 2", source: "WAGON_LIVERY_2", kind: "meta" },
    ]);
    assert.ok(result.notes.some((n) => /Found 3 liveries already in the vehicle files/.test(n)));
    const marker = JSON.parse(await readFile(path.join(dir, "fbrp_pv_wagon", ".fbrp-import.json"), "utf8"));
    assert.equal(marker.liveries.length, 3);

    // Adding the personal registers them.
    const inserted = [];
    const personalsDb = {
      one: async () => null,
      query: async (sql, params) => {
        if (/^INSERT INTO personal_vehicles/.test(sql)) return { insertId: 21 };
        if (/DELETE FROM personal_liveries/.test(sql)) return { affectedRows: 0 };
        if (/^INSERT IGNORE INTO personal_liveries/.test(sql)) { inserted.push(params[1]); return { affectedRows: 1 }; }
        if (/FROM personal_vehicles WHERE id/.test(sql) || /personal_vehicle_trust|personal_vehicle_tags/.test(sql)) return [];
        return { affectedRows: 0 };
      },
    };
    personalsDb.one = async (sql) => (/FROM personal_vehicles WHERE id=/.test(sql) ? { id: 21, model: "wagon", label: "Wagon", plate: null, owner_id: "123456789012345678", enabled: 1, bulletproof: 0, emergency_class: "leo", locked: 0, created_at: 1 } : null);
    const personals = createPersonals({ db: personalsDb, audit: async () => {} });
    const created = await personals.create((await import("../src/access-control.js")).OWNER_DISCORD_ID, { model: "wagon", label: "Wagon", ownerId: "123456789012345678", emergencyClass: result.vehicleType });
    assert.equal(created.model, "wagon");
    assert.equal(created.emergencyClass, "leo");
    assert.deepEqual(inserted, ["Blue Stripe", "Red Wrap", "Livery 2"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});
