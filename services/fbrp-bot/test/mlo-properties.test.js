import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_SHOP } from "../src/economy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverData = path.resolve(here, "../../../server-data");
const read = (relative) => fs.readFileSync(path.join(serverData, relative), "utf8");

test("every MLO property has a shipped, started map resource", () => {
  const mlos = DEFAULT_SHOP.filter((row) => row.item_key.startsWith("mlo_"));
  assert.equal(mlos.length, 16);
  const cfg = read("config/phone.cfg");
  for (const resource of ["lev_laundromat", "pp_pipedown", "fury_gs_01", "soa_clubhouse", "iak_pipeline_inn", "iak_yatchclub", "iak_drug_farm", "iak_wonkas_fudge_factory", "powerst_records", "mlo_drugshuis"]) {
    assert.match(read(`resources/[mlo]/${resource}/fxmanifest.lua`) + (fs.existsSync(path.join(serverData, `resources/[mlo]/${resource}/__resource.lua`)) ? read(`resources/[mlo]/${resource}/__resource.lua`) : ""), /this_is_a_map 'yes'/);
    assert.match(cfg, new RegExp(`^ensure ${resource}$`, "m"));
  }
  assert.ok(mlos.some((row) => row.data.business === "hideout" && row.org_types === "gang"));
});

test("properties without an interior are no longer offered and the migration hides the live rows", () => {
  const keys = new Set(DEFAULT_SHOP.filter((row) => row.kind === "property").map((row) => row.item_key));
  const sql = read("resources/[fbrp]/fbrp_core/migrations/098_mlo_properties.sql");
  for (const gone of ["bennys", "golf_club", "lab_sandy", "hq_lost_vinewood", "hq_rockford", "lsia_hangar"]) {
    assert.ok(!keys.has(gone), gone);
    assert.match(sql, new RegExp(`'${gone}'`));
  }
  for (const kept of ["lsc_burton", "hayes_autos", "pdm", "yellow_jack", "vanilla_unicorn"]) assert.ok(keys.has(kept), kept);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM org_properties/);
  assert.doesNotMatch(sql, /^\s*DELETE\s/im);
  assert.doesNotMatch(read("config/phone.cfg"), /ensure iak_pipeline_inn_core/);
});
