import test from "node:test";
import assert from "node:assert/strict";
import { ownedAssets } from "../src/investigation.js";

test("ownedAssets gathers vehicles, liveries, EUP and tags", async () => {
  const db = {
    async query(sql) {
      if (/FROM personal_vehicles WHERE owner_id/.test(sql)) return [{ id: "4", model: "sultan", label: "Sultan", plate: "FBRP1", enabled: 1 }];
      if (/personal_vehicle_trust/.test(sql)) return [{ id: "9", model: "buffalo", label: "Buffalo", plate: null, owner_id: "111111111111111111" }];
      if (/l\.added_by/.test(sql)) return [{ id: "2", label: "Wrap", personal_id: "9", vehicle: "Buffalo" }];
      if (/personal_liveries/.test(sql)) return [{ id: "1", label: "Stripe", personal_id: "4", vehicle: "Sultan" }];
      if (/custom_eup/.test(sql)) return [{ id: "3", name: "pack", label: "Pack", file_count: "12" }];
      if (/headtag_grants/.test(sql)) return [{ id: "5", kind: "head", label: "VIP" }];
      return [];
    },
  };
  const out = await ownedAssets(db, "222222222222222222");
  assert.equal(out.personals[0].enabled, true);
  assert.equal(out.trusted[0].owner_id, "111111111111111111");
  assert.equal(out.liveries[0].vehicle, "Sultan");
  assert.equal(out.installedLiveries[0].label, "Wrap");
  assert.equal(out.eup[0].file_count, 12);
  assert.equal(out.tags[0].label, "VIP");
  assert.deepEqual(out.failed, []);
});

test("ownedAssets names a failing source and keeps the rest", async () => {
  const db = { async query(sql) { if (/custom_eup/.test(sql)) throw new Error("boom"); return []; } };
  const out = await ownedAssets(db, "1");
  assert.deepEqual(out.failed, ["EUP packs"]);
  assert.deepEqual(out.eup, []);
});
