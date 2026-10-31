const SLUG = /^[a-z0-9_-]{2,40}$/;
const SNOWFLAKE = /^\d{15,24}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

export const ORGANIZATION_SETUP_FAMILIES = Object.freeze({
  gang: { type: "gang", guildKind: "gang", bot: "Aetherus", command: "/creation" },
  business: { type: "business", guildKind: "business", bot: "Business Assistant", command: "/creation" },
  department: { guildKind: "department", bot: "Department Assistant", command: "/dept add" },
});

const departmentTypes = new Set(["leo", "fire", "government", "other"]);
const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);

export function organizationSetupInput(input = {}) {
  const family = clean(input.family, 20).toLowerCase();
  const setup = ORGANIZATION_SETUP_FAMILIES[family];
  if (!setup) throw new Error("Choose gang, business, or department.");
  const type = family === "department" ? clean(input.departmentType, 20).toLowerCase() : setup.type;
  if (family === "department" && !departmentTypes.has(type)) throw new Error("Choose a department type.");
  const name = clean(input.name, 80);
  const slug = clean(input.slug, 40).toLowerCase();
  const tag = clean(input.tag || name, 40);
  const color = clean(input.color || "#43E8D8", 7).toUpperCase();
  const guildId = clean(input.guildId, 24);
  if (name.length < 2) throw new Error("Organization name must be at least 2 characters.");
  if (!SLUG.test(slug)) throw new Error("Slug must be 2–40 lowercase letters, numbers, dashes, or underscores.");
  if (!tag) throw new Error("Headtag is required.");
  if (!COLOR.test(color)) throw new Error("Choose a valid six-digit color.");
  if (!SNOWFLAKE.test(guildId)) throw new Error("Choose the Discord server where the assistant bot will create the roles.");
  return { family, type, name, slug, tag, color, guildId, ...setup };
}

export function defaultOrganizationPermissions(type) {
  if (type === "leo") return ["fbrp.police", "fbrp.police.cuff", "fbrp.police.arrest", "fbrp.police.search", "fbrp.police.escort", "fbrp.vehicles.leo"];
  if (type === "fire") return ["fbrp.vehicles.fire"];
  return ["fbrp.civ.restrain", "fbrp.vehicles"];
}

export async function createOrganizationSetup({ db, client, actorId, input }) {
  const values = organizationSetupInput(input);
  const network = await db.one("SELECT guild_id,kind,name FROM network_guilds WHERE guild_id=?", [values.guildId]);
  const guild = client.guilds.cache.get(values.guildId);
  if (!network || !guild) throw new Error("That Discord server is not a connected network server available to the bot.");
  if (network.kind !== values.guildKind)
    throw new Error(`${guild.name} is registered as a ${network.kind} server, not a ${values.guildKind} server.`);
  const groupName = `org_${values.slug}`;
  const stamp = Date.now();
  try {
    const ids = await db.transaction(async (query) => {
      await query("INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by) VALUES(?,?,300,FALSE,?)", [groupName, `${values.name} Duty`, actorId]);
      for (const object of defaultOrganizationPermissions(values.type))
        await query("INSERT INTO ace_entries(group_name,object,mode) VALUES(?,?,'allow')", [groupName, object]);
      const tag = await query("INSERT INTO headtags(kind,label,color,role_id,guild_id,priority,created_by) VALUES('gang',?,?,NULL,?,0,?)", [values.tag, values.color, values.guildId, actorId]);
      const org = await query(
        "INSERT INTO organizations(slug,name,type,color,tag_id,ace_group,guild_id,role_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
        [values.slug, values.name, values.type, values.color, tag.insertId, groupName, values.guildId, null, actorId],
      );
      await query("UPDATE headtags SET org_id=? WHERE id=?", [org.insertId, tag.insertId]);
      await query("INSERT IGNORE INTO org_roster_settings(org_id,role_sync,auto_rank,updated_by,updated_at) VALUES(?,TRUE,FALSE,?,?)", [org.insertId, actorId, stamp]);
      await query("INSERT IGNORE INTO org_wallets(org_id,balance,updated_at) VALUES(?,0,?)", [org.insertId, stamp]);
      return { orgId: Number(org.insertId), tagId: Number(tag.insertId) };
    });
    return {
      ...ids,
      ...values,
      groupName,
      guildName: guild.name,
      managerField: values.family === "department" ? "org_id" : "fbrp_org_id",
      nextCommand: `${values.command} … ${values.family === "department" ? "org_id" : "fbrp_org_id"}:${ids.orgId}`,
    };
  } catch (error) {
    if (error?.code === "ER_DUP_ENTRY") throw new Error("That slug or generated permission group already exists. Choose a different slug.");
    throw error;
  }
}

export async function linkOrganizationAccessRole({ db, client, actorId, input }) {
  const ref = clean(input.org, 80);
  const family = clean(input.family, 20).toLowerCase();
  const guildId = clean(input.guildId, 24);
  const roleId = clean(input.roleId, 24);
  const setup = ORGANIZATION_SETUP_FAMILIES[family];
  if (!setup || !ref || !SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(roleId)) throw new Error("Invalid organization role link.");
  const org = await db.one(`SELECT id,slug,name,type,guild_id,active FROM organizations WHERE ${/^\d+$/.test(ref) ? "id=?" : "slug=?"}`, [ref]);
  if (!org || !org.active) throw new Error("That organization is missing or inactive.");
  if ((family !== "department" && org.type !== setup.type) || (family === "department" && !departmentTypes.has(org.type)))
    throw new Error(`That organization cannot be linked by ${setup.bot}.`);
  if (String(org.guild_id) !== guildId) throw new Error("The role was created in a different server than the portal setup selected.");
  const network = await db.one("SELECT kind FROM network_guilds WHERE guild_id=?", [guildId]);
  if (network?.kind !== setup.guildKind) throw new Error("The organization server type no longer matches this assistant bot.");
  const guild = client.guilds.cache.get(guildId);
  const role = guild ? await guild.roles.fetch(roleId).catch(() => null) : null;
  if (!role) throw new Error("The new access role could not be found in Discord.");
  const stamp = Date.now();
  await db.transaction(async (query) => {
    await query("DELETE FROM organization_role_requirements WHERE org_id=?", [org.id]);
    await query("INSERT INTO organization_role_requirements(org_id,guild_id,role_id,added_by,added_at) VALUES(?,?,?,?,?)", [org.id, guildId, roleId, actorId, stamp]);
    await query("UPDATE organizations SET role_id=? WHERE id=?", [roleId, org.id]);
  });
  return { org: { id: Number(org.id), slug: org.slug, name: org.name, type: org.type }, guild, role };
}
