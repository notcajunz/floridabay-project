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
