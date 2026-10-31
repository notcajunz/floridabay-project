import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("headtag management honors its ACE without a hidden staff-rank gate", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const body = source.match(/async function headtagCommand\(i, sub\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(body, /requirePermission\(i, "fbrp\.headtags\.manage"\)/);
  assert.doesNotMatch(body, /requireCoOwnerControl|requireMinimumStaffRank/);
});

test("the command reference describes headtag access as ACE-driven", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /headtag: "`fbrp\.headtags\.manage`"/);
});
