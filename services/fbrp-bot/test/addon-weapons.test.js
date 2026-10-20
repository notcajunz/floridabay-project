import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const resources = path.join(repo, "server-data/resources");
const guns = path.join(resources, "[fbrp]/fbrp_guns2");
const read = (file) => readFile(file, "utf8");

// File names are only a convention (weapon_taccarbine.meta defines WEAPON_TACTICALCARBINE), so read the weapon's real name.
const weaponNames = async () => Promise.all((await readdir(path.join(guns, "meta"))).filter((f) => /^weapon_.+\.meta$/.test(f))
  .map(async (f) => (await read(path.join(guns, "meta", f))).match(/<Item type="CWeaponInfo">\s*<Name>(WEAPON_[A-Za-z0-9_]+)<\/Name>/)[1].toLowerCase()));

test("every addon weapon is in vMenu, behind the Custom Weapons role and guarded client side", async () => {
  const weapons = await weaponNames();
  assert.ok(weapons.length >= 23, "the original eight and the R4/SIG weapons are installed");
  const names = new Set(weapons);
  const migrations = (await Promise.all(["052_custom_weapons_role.sql", "081_custom_weapons_r4_pack.sql"].map((f) => read(path.join(resources, "[fbrp]/fbrp_core/migrations", f))))).join("\n");
  const guard = await read(path.join(guns, "cl_weaponNames.lua"));
  for (const dir of ["config", "config.pre-game-mount"]) {
    const addons = JSON.parse(await read(path.join(resources, "[standalone]/vMenu", dir, "addons.json")));
    assert.deepEqual([...addons.weapons].sort(), [...names].sort(), `${dir}/addons.json lists exactly the installed addon weapons`);
  }
  for (const weapon of names) {
    assert.ok(migrations.includes(`WhitelistedModels.${weapon}'`), `${weapon} is granted to the Custom Weapons role`);
    assert.ok(guard.includes(`joaat('${weapon.toUpperCase()}')`), `${weapon} is removed from players without the role`);
    assert.ok(guard.includes(`AddTextEntry("${weapon.toUpperCase()}"`), `${weapon} has a display name`);
  }
});

test("every addon weapon component has its metadata and the weapons' model files exist", async () => {
  const addons = JSON.parse(await read(path.join(resources, "[standalone]/vMenu/config/addons.json")));
  const meta = new Set(await readdir(path.join(guns, "meta")));
  const added = addons.weapon_components.filter((c) => meta.has(`weaponcomponents_${c}.meta`));
  assert.ok(added.length >= 18, "the new packs' components each have a metadata file");
  const stream = new Set((await readdir(path.join(guns, "stream"))).map((f) => f.toLowerCase()));
  for (const weapon of ["m4iron", "saw", "urgi", "xm7", "mcxspear"]) {
    const archetypes = await read(path.join(guns, "meta", `weaponarchetypes_${weapon}.meta`));
    const model = archetypes.match(/<modelName>([^<]+)<\/modelName>/)?.[1]?.toLowerCase();
    assert.ok(model && stream.has(`${model}.ydr`), `${weapon}: ${model}.ydr is streamed`);
  }
});
