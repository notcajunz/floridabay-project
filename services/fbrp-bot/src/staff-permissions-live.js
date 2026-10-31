// Live staff permission matrix for the website. fbrp_core builds the matrix from the live ACE tables, so
// whatever changes a permission (the website, the bot, an AI release, a migration) shows up here without
// any hook of its own. Requests inside the cache window share one read from the game.

import { matrixHash, fetchMatrix } from "./staff-permissions-sheet.js";

export function createLiveStaffPermissions({ origin, token, ttlMs = 2000, load, now = () => Date.now() } = {}) {
  const read = load || (() => fetchMatrix({ origin, token }));
  let cached = null;
  let pending = null;
  async function current() {
    if (cached && now() - cached.at < ttlMs) return cached;
    pending ||= read()
      .then((matrix) => {
        cached = { at: now(), matrix, hash: matrixHash(matrix) };
        return cached;
      })
      .finally(() => {
        pending = null;
      });
    try {
      return await pending;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }
  /** { hash, changed:false } when the caller already has this version, otherwise the whole matrix. */
  async function snapshot(knownHash = "") {
    const { matrix, hash, at } = await current();
    if (knownHash && knownHash === hash) return { hash, changed: false, checkedAt: at };
    return { hash, changed: true, checkedAt: at, generatedAt: matrix.generatedAt, ranks: matrix.ranks, sections: matrix.sections };
  }
  return { snapshot };
}
