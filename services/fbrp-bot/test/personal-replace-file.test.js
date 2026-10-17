import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dir = await mkdtemp(path.join(tmpdir(), "fbrp-replace-"));
process.env.FBRP_VEHICLES_DIR = dir;
process.env.OPENAI_API_KEY = "test-key";
process.env.FBRP_FIVEM_ORIGIN = "http://127.0.0.1:9/fbrp_core"; // never reach the live game server from a test
const { createPersonalImporter } = await import("../src/personal-import.js");

const resource = path.join(dir, "fbrp_pv_testcar");
await mkdir(path.join(resource, "stream"), { recursive: true });
await mkdir(path.join(resource, "data"));
await writeFile(path.join(resource, "stream", "testcar.yft"), Buffer.concat([Buffer.from("RSC7"), Buffer.alloc(60, 1)]));
await writeFile(path.join(resource, "stream", ".hidden.yft"), "x");
await writeFile(path.join(resource, "data", "vehicles.meta"), "<CVehicleModelInfo__InitDataList><modelName>testcar</modelName></CVehicleModelInfo__InitDataList>");
await writeFile(path.join(resource, "fxmanifest.lua"), "fx_version 'cerulean'\n");
await writeFile(path.join(resource, ".fbrp-import.json"), JSON.stringify({ model: "testcar" }));

const audits = [];
const importer = createPersonalImporter({
  personals: {
    assertManager: async (id) => { if (id !== "manager") throw new Error("Only the designated personal-vehicle manager can do that."); },
    find: async () => ({ id: 1, model: "testcar" }),
    modelOf: (value) => String(value).toLowerCase(),
  },
  audit: async (...args) => { audits.push(args); },
  db: {},
});

const realFetch = globalThis.fetch;
const safe = { verdict: "safe", summary: "Only game assets.", findings: [], repairs: [] };
globalThis.fetch = async (url) => {
  if (String(url).startsWith("https://api.openai.com")) {
    return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(safe) }] }] }), { status: 200 });
  }
  return realFetch(url);
};

async function stage(name, body, { chunkParams = {} } = {}) {
  const params = new URLSearchParams({ offset: "0", total: String(body.length), name, kind: "file", ...chunkParams });
  const request = (async function* () { yield body; })();
  return importer.uploadChunk("manager", params, request);
}

test("only the manager can list or replace files", async () => {
  await assert.rejects(importer.listFiles("someone", { id: 1 }), /designated personal-vehicle manager/);
  await assert.rejects(importer.replaceFile("someone", { id: 1, target: "stream/testcar.yft", uploadId: "a".repeat(24), uploadName: "testcar.yft" }), /designated personal-vehicle manager/);
});

test("listFiles shows stream and data files but not the manifest or hidden files", async () => {
  const { files } = await importer.listFiles("manager", { id: 1 });
  assert.deepEqual(files.map((file) => file.path), ["data/vehicles.meta", "stream/testcar.yft"]);
});

test("single-file uploads accept game assets only", async () => {
  await assert.rejects(stage("evil.lua", Buffer.from("print(1)")), /Upload one of/);
  await assert.rejects(stage("pack.zip", Buffer.from("PK\u0003\u0004zip")), /Upload one of/);
  const staged = await stage("testcar.yft", Buffer.concat([Buffer.from("RSC7"), Buffer.alloc(40, 2)]));
  assert.equal(staged.done, true);
});

test("a replacement must match the chosen file's type and be a real asset", async () => {
  const wrongType = await stage("testcar.ytd", Buffer.concat([Buffer.from("RSC7"), Buffer.alloc(40, 3)]));
  await assert.rejects(importer.replaceFile("manager", { id: 1, target: "stream/testcar.yft", uploadId: wrongType.id, uploadName: "testcar.ytd" }), /must be a \.yft file/);
  const fake = await stage("testcar.yft", Buffer.alloc(64, 7));
  await assert.rejects(importer.replaceFile("manager", { id: 1, target: "stream/testcar.yft", uploadId: fake.id, uploadName: "testcar.yft" }), /not a valid \.yft/);
  const staged = await stage("x.yft", Buffer.concat([Buffer.from("RSC7"), Buffer.alloc(40, 4)]));
  for (const target of ["../fxmanifest.lua", "stream/../fxmanifest.lua", "fxmanifest.lua", "stream/.hidden.yft", "stream/missing.yft"])
    await assert.rejects(importer.replaceFile("manager", { id: 1, target, uploadId: staged.id, uploadName: "x.yft" }), /Pick a file|is not in/);
});

test("meta replacements must keep the meta type", async () => {
  const wrong = await stage("vehicles.meta", Buffer.from("<CHandlingDataMgr></CHandlingDataMgr>   "));
  await assert.rejects(importer.replaceFile("manager", { id: 1, target: "data/vehicles.meta", uploadId: wrong.id, uploadName: "vehicles.meta" }), /must be a VEHICLE_METADATA_FILE/);
  const entity = await stage("vehicles.meta", Buffer.from("<!DOCTYPE x [<!ENTITY a 'b'>]><CVehicleModelInfo__InitDataList/>"));
  await assert.rejects(importer.replaceFile("manager", { id: 1, target: "data/vehicles.meta", uploadId: entity.id, uploadName: "vehicles.meta" }), /entities/);
});

test("a valid replacement swaps the file, keeps a backup and records it", async () => {
  const body = Buffer.concat([Buffer.from("RSC7"), Buffer.alloc(100, 9)]);
  const staged = await stage("newname.yft", body);
  const result = await importer.replaceFile("manager", { id: 1, target: "stream/testcar.yft", uploadId: staged.id, uploadName: "newname.yft" });
  assert.equal(result.file, "stream/testcar.yft");
  assert.deepEqual(await readFile(path.join(resource, "stream", "testcar.yft")), body);
  const backups = await readdir(path.join(resource, ".backup"));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /__stream__testcar\.yft$/);
  assert.deepEqual(await readFile(path.join(resource, ".backup", backups[0])), Buffer.concat([Buffer.from("RSC7"), Buffer.alloc(60, 1)]));
  const marker = JSON.parse(await readFile(path.join(resource, ".fbrp-import.json"), "utf8"));
  assert.equal(marker.replacements.at(-1).file, "stream/testcar.yft");
  assert.ok(audits.some(([, action]) => action === "personal.replace"));
  assert.deepEqual((await readdir(resource)).filter((name) => name.startsWith(".replace-")), []);
  // The upload is consumed, so it cannot be replayed.
  await assert.rejects(importer.replaceFile("manager", { id: 1, target: "stream/testcar.yft", uploadId: staged.id, uploadName: "newname.yft" }), /expired/);
});

test("a failed security review blocks the file and leaves the old one", async () => {
  globalThis.fetch = async (url) => String(url).startsWith("https://api.openai.com")
    ? new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ verdict: "unsafe", summary: "Hidden payload.", findings: [{ severity: "critical", file: "testcar.yft", reason: "Embedded script." }], repairs: [] }) }] }] }), { status: 200 })
    : realFetch(url);
  const before = await readFile(path.join(resource, "stream", "testcar.yft"));
  const staged = await stage("testcar.yft", Buffer.concat([Buffer.from("RSC7"), Buffer.alloc(50, 5)]));
  await assert.rejects(importer.replaceFile("manager", { id: 1, target: "stream/testcar.yft", uploadId: staged.id, uploadName: "testcar.yft" }), /Security check blocked this file/);
  assert.deepEqual(await readFile(path.join(resource, "stream", "testcar.yft")), before);
  globalThis.fetch = realFetch;
});
