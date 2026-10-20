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

test("only the designated Discord user has fleet-wide personal management", async () => {
  const personals = createPersonals({ db: forbiddenDb, audit: async () => {} });

  assert.equal(await personals.canManage(PERSONALS_MANAGER_ID), true);
  assert.equal(await personals.canManage("1090083387638812754"), false);
  assert.equal(await personals.canManage("1090083387638812756"), false);
  await assert.rejects(
    personals.assertManager("1090083387638812754"),
    /Only the designated personal-vehicle manager/,
  );
  await assert.rejects(
    personals.create("1090083387638812754", { model: "sultan", ownerId: PERSONALS_MANAGER_ID }),
    /Only the designated personal-vehicle manager/,
  );
});
