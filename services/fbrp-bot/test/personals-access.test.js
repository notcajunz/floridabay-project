import assert from "node:assert/strict";
import test from "node:test";
import { createPersonals, emergencyClassOf, PERSONALS_MANAGER_ID } from "../src/personals.js";

test("personal emergency classes are normalized and restricted", () => {
  assert.equal(emergencyClassOf("LEO"), "leo");
  assert.equal(emergencyClassOf(""), "civilian");
  assert.throws(() => emergencyClassOf("military"), /Vehicle type must be/);
});

const forbiddenDb = new Proxy({}, {
  get() {
    return async () => { throw new Error("database must not be reached for a rejected manager action"); };
  },
});

test("the owner and members with the personals ACE have fleet-wide management", async () => {
  const checked = [];
  const personals = createPersonals({
    db: forbiddenDb,
    audit: async () => {},
    hasPermission: async (id, object) => {
      checked.push([id, object]);
      return id === "1090083387638812754" && object === "fbrp.personals.manage";
    },
  });

  assert.equal(await personals.canManage(PERSONALS_MANAGER_ID), true);
  assert.deepEqual(checked, []);
  assert.equal(await personals.canManage("1090083387638812754"), true);
  assert.equal(await personals.canManage("1090083387638812756"), false);
  assert.deepEqual(checked, [
    ["1090083387638812754", "fbrp.personals.manage"],
    ["1090083387638812756", "fbrp.personals.manage"],
  ]);
  await assert.rejects(
    personals.assertManager("1090083387638812756"),
    /fbrp\.personals\.manage/,
  );
  await assert.rejects(
    personals.create("1090083387638812756", { model: "sultan", ownerId: PERSONALS_MANAGER_ID }),
    /fbrp\.personals\.manage/,
  );
});

test("personals manager ACE reaches manager actions", async () => {
  let queried = false;
  const personals = createPersonals({
    db: {
      one: async () => { queried = true; throw new Error("reached database"); },
      query: async () => { queried = true; throw new Error("reached database"); },
    },
    audit: async () => {},
    hasPermission: async (id, object) => id === "1090083387638812754" && object === "fbrp.personals.manage",
  });

  await assert.rejects(
    personals.create("1090083387638812754", { model: "sultan", ownerId: PERSONALS_MANAGER_ID }),
    /reached database/,
  );
  assert.equal(queried, true);
});

test("portal owners receive only personals they own while managers receive every personal", async () => {
  const viewer = "1090083387638812756";
  const rows = [
    { id: 1, model: "owned", label: "Owned", owner_id: viewer, enabled: 1, bulletproof: 0, emergency_class: "civilian", locked: 0, created_at: 1 },
    { id: 2, model: "trusted", label: "Trusted", owner_id: "1090083387638812757", enabled: 1, bulletproof: 0, emergency_class: "civilian", locked: 0, created_at: 1 },
    { id: 3, model: "tagged", label: "Tagged", owner_id: "1090083387638812758", enabled: 1, bulletproof: 0, emergency_class: "civilian", locked: 0, created_at: 1 },
  ];
  const db = {
    query: async (sql, params = []) => {
      if (/FROM personal_vehicles WHERE owner_id/.test(sql)) return rows.filter((row) => row.owner_id === params[0]);
      if (/SELECT \* FROM personal_vehicles ORDER/.test(sql)) return rows;
      if (/FROM personal_vehicle_trust/.test(sql)) return [{ personal_id: 2, discord_id: viewer, added_at: 1 }];
      if (/FROM personal_vehicle_tags/.test(sql)) return [{ personal_id: 3, id: 99, label: "VIP", color: "#fff", kind: "head", enabled: 1 }];
      if (/FROM headtag_grants/.test(sql)) return [];
      if (/FROM headtags/.test(sql)) return [];
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const ownerView = await createPersonals({ db, audit: async () => {}, hasPermission: async () => false }).portalData(viewer);
  assert.deepEqual(ownerView.mine.map((row) => row.id), [1]);
  assert.equal(ownerView.all, undefined);

  const managerView = await createPersonals({ db, audit: async () => {}, hasPermission: async () => true }).portalData(viewer);
  assert.deepEqual(managerView.all.map((row) => row.id), [1, 2, 3]);
});
