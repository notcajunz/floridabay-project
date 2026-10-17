import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { deflateRawSync } from "node:zlib";

const run = promisify(execFile);
const dir = await mkdtemp(path.join(tmpdir(), "fbrp-replace-pack-"));
process.env.FBRP_VEHICLES_DIR = dir;
process.env.OPENAI_API_KEY = "test-key";
process.env.FBRP_FIVEM_ORIGIN = "http://127.0.0.1:9/fbrp_core"; // never reach the live game server from a test
const { createPersonalImporter } = await import("../src/personal-import.js");

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith("https://api.openai.com")) return realFetch(url, options);
  const name = JSON.parse(options.body).text.format.name;
  const answer = name === "vehicle_security_review"
    ? { verdict: "safe", summary: "Only game assets.", findings: [], repairs: [] }
    : { label: "New Car", summary: "Installed.", notes: [], edits: [] };
  return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(answer) }] }] }), { status: 200 });
};

const vehiclesMeta = (model) => `<CVehicleModelInfo__InitDataList><Item><modelName>${model}</modelName><txdName>${model}</txdName><handlingId>${model}</handlingId><gameName>${model}</gameName></Item></CVehicleModelInfo__InitDataList>`;
const handlingMeta = (model) => `<CHandlingDataMgr><HandlingData><Item type="CHandlingData"><handlingName>${model}</handlingName><fMass value="1500.0"/></Item></HandlingData></CHandlingDataMgr>`;
const yft = (fill) => {
  const header = Buffer.alloc(16);
  header.write("RSC7");
  header.writeUInt32LE(162, 4);
  header.writeUInt32LE(0xa8000000, 8); // one 512-byte system page, resource version 0xA2
  header.writeUInt32LE(0x20000000, 12);
  return Buffer.concat([header, deflateRawSync(Buffer.alloc(512, fill))]);
};

/** Builds a pack zip for `model` and stages it as an upload through the importer's chunk endpoint. */
async function stagePack(importer, model) {
  const src = await mkdtemp(path.join(tmpdir(), "fbrp-pack-src-"));
  await mkdir(path.join(src, "data"));
  await mkdir(path.join(src, "stream"));
  await writeFile(path.join(src, "data", "vehicles.meta"), vehiclesMeta(model));
  await writeFile(path.join(src, "data", "handling.meta"), handlingMeta(model));
  await writeFile(path.join(src, "stream", `${model}.yft`), yft(2));
  await writeFile(path.join(src, "stream", `${model}.ytd`), yft(3));
  const zip = path.join(src, "pack.zip");
  await run("python3", ["-c", "import sys,zipfile,pathlib\nroot=pathlib.Path(sys.argv[1])\nz=zipfile.ZipFile(sys.argv[2],'w')\n[z.write(p,p.relative_to(root)) for p in root.rglob('*') if p.is_file() and p.name!='pack.zip']\nz.close()", src, zip]);
  const body = await readFile(zip);
  const params = new URLSearchParams({ offset: "0", total: String(body.length), name: "pack.zip" });
  return importer.uploadChunk("manager", params, (async function* () { yield body; })());
}

const resource = path.join(dir, "fbrp_pv_oldcar");
await mkdir(path.join(resource, "stream"), { recursive: true });
await mkdir(path.join(resource, "data"));
await writeFile(path.join(resource, "stream", "oldcar.yft"), yft(1));
await writeFile(path.join(resource, "stream", "leftover.ydr"), yft(1));
await writeFile(path.join(resource, "data", "vehicles.meta"), vehiclesMeta("oldcar"));
await writeFile(path.join(resource, ".fbrp-import.json"), JSON.stringify({ model: "oldcar" }));

const audits = [];
const queries = [];
const importer = createPersonalImporter({
  personals: {
    assertManager: async (id) => { if (id !== "manager") throw new Error("Only the designated personal-vehicle manager can do that."); },
    find: async () => ({ id: 7, model: "oldcar" }),
    modelOf: (value) => String(value).toLowerCase(),
  },
  audit: async (...args) => { audits.push(args); },
  db: { query: async (sql, params) => { queries.push([sql, params]); return { affectedRows: 2 }; } },
});

test("only the manager can replace a personal's vehicle", async () => {
  await assert.rejects(importer.replacePack("someone", { id: 7, uploadId: "a".repeat(24), uploadName: "pack.zip" }), /designated personal-vehicle manager/);
});

test("replacing installs the new pack under the personal's own model and keeps a backup", async () => {
  const staged = await stagePack(importer, "newcar");
  const result = await importer.replacePack("manager", { id: 7, uploadId: staged.id, uploadName: "pack.zip" });
  assert.equal(result.model, "oldcar");
  assert.equal(result.packModel, "newcar");
  assert.equal(result.resource, "fbrp_pv_oldcar");
  // Old files are gone, new ones carry the personal's model name.
  assert.deepEqual((await readdir(path.join(resource, "stream"))).sort(), ["oldcar.ytd", "oldcar.yft"].sort());
  assert.match(await readFile(path.join(resource, "data", "vehicles.meta"), "utf8"), /<modelName>oldcar<\/modelName><txdName>oldcar<\/txdName><handlingId>oldcar<\/handlingId>/);
  assert.match(await readFile(path.join(resource, "data", "handling.meta"), "utf8"), /<handlingName>oldcar<\/handlingName>/);
  assert.match(await readFile(path.join(resource, "fxmanifest.lua"), "utf8"), /vehicle: oldcar /);
  const marker = JSON.parse(await readFile(path.join(resource, ".fbrp-import.json"), "utf8"));
  assert.equal(marker.model, "oldcar");
  assert.equal(marker.packModel, "newcar");
  // No resource was created for the pack's own name.
  assert.equal((await readdir(dir)).includes("fbrp_pv_newcar"), false);
  // The previous vehicle is kept in a hidden folder.
  const backups = (await readdir(dir)).filter((name) => name.startsWith(".replaced-fbrp_pv_oldcar-"));
  assert.equal(backups.length, 1);
  assert.deepEqual((await readdir(path.join(dir, backups[0], "stream"))).sort(), ["leftover.ydr", "oldcar.yft"]);
  assert.ok(audits.some(([, action]) => action === "personal.replace_pack"));
  // Liveries added to the old files are gone with them, and the result says so.
  assert.deepEqual(queries.at(-1), ["DELETE FROM personal_liveries WHERE personal_id=?", [7]]);
  assert.ok(result.notes.some((note) => /2 livery bundles on the old files were removed/.test(note)));
});

test("replacing again keeps only the last two backups", async () => {
  for (let index = 0; index < 3; index++) {
    const staged = await stagePack(importer, "newcar");
    await importer.replacePack("manager", { id: 7, uploadId: staged.id, uploadName: "pack.zip" });
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal((await readdir(dir)).filter((name) => name.startsWith(".replaced-fbrp_pv_oldcar-")).length, 2);
});

test("a resource that was not made by the importer is never overwritten", async () => {
  const other = path.join(dir, "fbrp_pv_handmade");
  await mkdir(other);
  await writeFile(path.join(other, "fxmanifest.lua"), "fx_version 'cerulean'\n");
  const handmade = createPersonalImporter({
    personals: { assertManager: async () => {}, find: async () => ({ id: 8, model: "handmade" }), modelOf: (value) => String(value).toLowerCase() },
    audit: async () => {},
    db: {},
  });
  const staged = await stagePack(handmade, "newcar");
  await assert.rejects(handmade.replacePack("manager", { id: 8, uploadId: staged.id, uploadName: "pack.zip" }), /was not made by this importer/);
  assert.deepEqual(await readdir(other), ["fxmanifest.lua"]);
});
