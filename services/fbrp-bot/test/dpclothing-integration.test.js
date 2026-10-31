import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const resource = path.join(root, "server-data/resources/[fbrp]/fbrp_dpclothing");
const text = (file) => readFile(path.join(resource, file), "utf8");
const sha256 = async (file) => createHash("sha256").update(await readFile(path.join(resource, file))).digest("hex");

test("dpClothing is a core dependency with rebindable, context-safe controls", async () => {
  const [core, manifest, gui, functions, economy, justice] = await Promise.all([
    readFile(path.join(root, "server-data/resources/[fbrp]/fbrp_core/fxmanifest.lua"), "utf8"),
    text("fxmanifest.lua"),
    text("Client/GUI.lua"),
    text("Client/Functions.lua"),
    readFile(path.join(root, "server-data/resources/[fbrp]/fbrp_core/client/economy.lua"), "utf8"),
    readFile(path.join(root, "server-data/resources/[fbrp]/fbrp_core/client/justice.lua"), "utf8"),
  ]);

  assert.match(core, /dependency 'fbrp_dpclothing'/);
  assert.match(manifest, /fx_version 'cerulean'/);
  assert.match(gui, /RegisterKeyMapping\('\+fbrp_clothing_wheel'/);
  assert.doesNotMatch(gui, /IsControlPressed\(1, Config\.GUI\.Key\)/);
  for (const guard of ["fbrp:downed", "fbrp:restrained", "fbrp:jailed", "fbrp:communityService"])
    assert.ok(gui.includes(guard));
  assert.match(functions, /TriggerEvent\('ox_lib:notify'/);
  assert.match(functions, /function CanUseClothing/);
  assert.match(functions, /fbrp:appearanceChanged/);
  assert.match(economy, /TriggerEvent\('fbrp:appearanceChanged'\)/);
  assert.equal((justice.match(/TriggerEvent\('fbrp:appearanceChanged'\)/g) || []).length, 2);
});

test("dpClothing wheel assets match the reviewed upstream commit", async () => {
  assert.equal(await sha256("stream/dp_clothing.ytd"), "1cf39b557509da5670d361c1692a20a6d69f580f3e8243cc155d7cb3d531a7c8");
  assert.equal(await sha256("stream/dp_wheel.ytd"), "4c349d972a7baa7d0aaf2db0d33a631839723f26762917fab44fdbb70db49881");
  assert.match(await text("UPSTREAM.md"), /62d24c3b67c6e3cb6315fcb3162978125e858487/);
});
