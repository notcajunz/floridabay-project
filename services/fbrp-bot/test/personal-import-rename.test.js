import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const dir = await mkdtemp(path.join(tmpdir(), "fbrp-rename-"));
process.env.FBRP_VEHICLES_DIR = dir;
const { createPersonalImporter, renameMetaText, renamedStreamName } = await import("../src/personal-import.js");

test("meta names that equal the old model are renamed, others are kept", () => {
  const xml = "<modelName>404330i</modelName><txdName>404330I</txdName><handlingId>404330i</handlingId><gameName>404330i</gameName><vehicleMakeName>404330i</vehicleMakeName><handlingName> 404330i </handlingName><modelName>other</modelName>";
  const out = renameMetaText(xml, "404330i", "caj_330i");
  assert.equal(out, "<modelName>caj_330i</modelName><txdName>caj_330i</txdName><handlingId>caj_330i</handlingId><gameName>caj_330i</gameName><vehicleMakeName>404330i</vehicleMakeName><handlingName> caj_330i </handlingName><modelName>other</modelName>");
});

test("stream files of the model are renamed, similar names are not", () => {
  assert.equal(renamedStreamName("404330i.yft", "404330i", "caj"), "caj.yft");
  assert.equal(renamedStreamName("404330i_hi.yft", "404330i", "caj"), "caj_hi.yft");
  assert.equal(renamedStreamName("404330i+hi.ytd", "404330i", "caj"), "caj+hi.ytd");
  assert.equal(renamedStreamName("404330i2.yft", "404330i", "caj"), null);
  assert.equal(renamedStreamName("wheel.ydr", "404330i", "caj"), null);
});

test("rename moves the resource, files, meta names and personals", async () => {
  const old = path.join(dir, "fbrp_pv_404330i");
  await mkdir(path.join(old, "stream"), { recursive: true });
  await mkdir(path.join(old, "data"));
  for (const file of ["404330i.yft", "404330i_hi.yft", "404330i.ytd"]) await writeFile(path.join(old, "stream", file), file);
  await writeFile(path.join(old, "data", "vehicles.meta"), "<modelName>404330i</modelName><txdName>404330i</txdName>");
  await writeFile(path.join(old, "fxmanifest.lua"), "description 'Florida Bay personal vehicle: 404330i (converted by the website importer)'\n");
  await writeFile(path.join(old, ".fbrp-import.json"), JSON.stringify({ model: "404330i", by: "1" }));

  const queries = [];
  const importer = createPersonalImporter({
    personals: { assertManager: async () => {}, modelOf: (v) => String(v).toLowerCase() },
    audit: async () => {},
    db: {
      one: async () => null,
      query: async (sql, params) => { queries.push([sql, params]); return { affectedRows: 1 }; },
    },
  });
  const result = await importer.rename("1", { model: "404330i", newModel: "caj_330i" });
  assert.equal(result.model, "caj_330i");
  assert.equal(result.personalsMoved, 1);
  assert.deepEqual((await readdir(path.join(dir, "fbrp_pv_caj_330i", "stream"))).sort(), ["caj_330i.ytd", "caj_330i.yft", "caj_330i_hi.yft"].sort());
  assert.equal(await readFile(path.join(dir, "fbrp_pv_caj_330i", "data", "vehicles.meta"), "utf8"), "<modelName>caj_330i</modelName><txdName>caj_330i</txdName>");
  assert.match(await readFile(path.join(dir, "fbrp_pv_caj_330i", "fxmanifest.lua"), "utf8"), /vehicle: caj_330i /);
  assert.equal(JSON.parse(await readFile(path.join(dir, "fbrp_pv_caj_330i", ".fbrp-import.json"), "utf8")).renamedFrom, "404330i");
  assert.equal(await stat(old).catch(() => null), null);
  assert.deepEqual(queries[0], ["UPDATE personal_vehicles SET model=? WHERE model=?", ["caj_330i", "404330i"]]);
});
