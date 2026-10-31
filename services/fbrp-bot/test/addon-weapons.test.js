import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const resources = path.join(repo, "server-data/resources");
const guns = path.join(resources, "[fbrp]/fbrp_guns2");
const vmenu = path.join(resources, "[standalone]/vMenu/config");
const read = (file) => readFile(file, "utf8");
const jsonc = async (file) => JSON.parse((await read(file)).split("\n").filter((line) => !line.trim().startsWith("//")).join("\n"));

// File names are only a convention (weapon_taccarbine.meta defines WEAPON_TACTICALCARBINE), so read the weapon's real name.
const weaponNames = async () => Promise.all((await readdir(path.join(guns, "meta"))).filter((f) => /^weapon_.+\.meta$/.test(f))
  .map(async (f) => (await read(path.join(guns, "meta", f))).match(/<Item type="CWeaponInfo">\s*<Name>(WEAPON_[A-Za-z0-9_]+)<\/Name>/)[1].toLowerCase()));

test("every addon weapon is in legacy vMenu, behind the Custom Weapons role and guarded client side", async () => {
  const weapons = await weaponNames();
  assert.ok(weapons.length >= 23, "the original eight and the R4/SIG weapons are installed");
  const names = new Set(weapons);
  const migrations = (await Promise.all(["052_custom_weapons_role.sql", "081_custom_weapons_r4_pack.sql"].map((f) => read(path.join(resources, "[fbrp]/fbrp_core/migrations", f))))).join("\n");
  const restore = await read(path.join(resources, "[fbrp]/fbrp_core/migrations/095_restore_legacy_vmenu.sql"));
  const guard = await read(path.join(guns, "cl_weaponNames.lua"));
  const listed = new Set((await jsonc(path.join(vmenu, "addons.json"))).weapons);
  assert.deepEqual([...listed].sort(), [...names].sort(), "addons.json lists exactly the installed addon weapons");
  // Whitelisted: each answers only to its own permission, never to a weapon group or WeaponOptions.All for everyone.
  assert.deepEqual([...(await jsonc(path.join(vmenu, "model-whitelists.json"))).whitelistedweapons].sort(), [...names].sort());
  for (const weapon of names) {
    assert.ok(migrations.includes(`WhitelistedModels.${weapon}'`), `${weapon} is granted to the Custom Weapons role`);
    assert.ok(guard.includes(`joaat('${weapon.toUpperCase()}')`), `${weapon} is removed from players without the role`);
    assert.match(guard, new RegExp(`AddTextEntry\\("${weapon.toUpperCase()}", "[^"]+"\\)`), `${weapon} has a display name`);
  }
  assert.match(restore, /REPLACE\(object, 'vMenu\.WeaponOptions\.WhitelistedModels\.weapon_', 'vMenu\.WeaponOptions\.WhitelistedModels\.'/);
  assert.match(await read(path.join(guns, "sv_access.lua")), /local accessObject = 'vMenu\.WeaponOptions\.WhitelistedModels\.mp9a'/);
});

test("every addon weapon component has its metadata and the weapons' model files exist", async () => {
  const components = (await jsonc(path.join(vmenu, "addons.json"))).weapon_components.map((c) => c.toLowerCase());
  const meta = new Set(await readdir(path.join(guns, "meta")));
  const added = components.filter((c) => meta.has(`weaponcomponents_${c}.meta`));
  assert.ok(added.length >= 18, "the new packs' components each have a metadata file");
  for (const component of ["component_mp9a_clip_02", "component_at_scope_m700", "component_xm7_clip_01", "component_at_vortex"]) assert.ok(components.includes(component), component);
  const stream = new Set((await readdir(path.join(guns, "stream"))).map((f) => f.toLowerCase()));
  for (const weapon of ["m4iron", "saw", "urgi", "xm7", "mcxspear"]) {
    const archetypes = await read(path.join(guns, "meta", `weaponarchetypes_${weapon}.meta`));
    const model = archetypes.match(/<modelName>([^<]+)<\/modelName>/)?.[1]?.toLowerCase();
    assert.ok(model && stream.has(`${model}.ydr`), `${weapon}: ${model}.ydr is streamed`);
  }
});

test("the withdrawn October weapon pack and its ACE grants are absent", async () => {
  const withdrawn = ["nsr9", "sa80", "benellim2", "mp7a2", "scar17fm", "akm", "asval", "g17", "g36", "hkump", "m6ic"];
  const addons = await jsonc(path.join(vmenu, "addons.json"));
  const models = await jsonc(path.join(vmenu, "model-whitelists.json"));
  for (const name of withdrawn) {
    assert.ok(!addons.weapons.includes(`weapon_${name}`), name);
    assert.ok(!models.whitelistedweapons.includes(`weapon_${name}`), name);
  }
  const cleanup = await read(path.join(resources, "[fbrp]/fbrp_core/migrations/106_remove_self_contained_weapon_pack.sql"));
  for (const name of withdrawn) assert.match(cleanup, new RegExp(`WhitelistedModels\\.${name}`), name);
});
