import { audit, db } from "./database.js";
import { card, COLORS, roleRef, who } from "./ui.js";

const commandLabel = (name) => `/${String(name || "role manager")}`;

const roleManagerSuperusers = () =>
  new Set(
    String(
      process.env.ROLE_MANAGER_SUPERUSER_IDS ||
      process.env.FBRP_SUPERUSER_IDS ||
      process.env.FBRP_OWNER_DISCORD_ID ||
      "",
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

const platformAdmin = (interaction) =>
  String(interaction.guild.ownerId) === String(interaction.user.id) ||
  roleManagerSuperusers().has(String(interaction.user.id));

async function management(interaction, role) {
  const record = await db.one(
    "SELECT owner_id FROM role_manager_roles WHERE guild_id=? AND role_id=?",
    [interaction.guildId, role.id],
  );
  const admin = platformAdmin(interaction);
  const owner = String(record?.owner_id || "") === String(interaction.user.id);
  const manager = Boolean(
    record &&
      (await db.one(
        "SELECT 1 FROM role_manager_members WHERE guild_id=? AND role_id=? AND discord_id=?",
        [interaction.guildId, role.id, interaction.user.id],
      )),
  );
  return { record, admin, owner, manager };
}

function selectedRole(interaction) {
  if (!interaction.guild) throw new Error("Role-manager commands can only be used in a server.");
  const role = interaction.options.getRole("role", true);
  if (role.id === interaction.guildId) throw new Error("The @everyone role cannot be managed.");
  if (role.managed) throw new Error("Discord-managed and integration roles cannot be managed.");
  if (!role.editable)
    throw new Error(`I cannot edit ${role.name}. Give the bot Manage Roles and move its role above that role.`);
  return role;
}

async function selectedMember(interaction) {
  const user = interaction.options.getUser("member", true);
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) throw new Error("That user is not a member of this server.");
  return member;
}

const requireMembershipManager = (access) => {
  if (access.admin || access.owner || access.manager) return;
  throw new Error("Only this role's owner or one of its managers can manage role members.");
};

const requireRoleOwner = (access) => {
  if (access.admin || access.owner) return;
  throw new Error("Only this role's owner can manage its managers.");
};

async function record(interaction, action, role, target, payload = {}) {
  await audit(interaction.user.id, `role_manager.${action}`, target || role.id, {
    guildId: interaction.guildId,
    roleId: role.id,
    ...payload,
  });
}

async function addRole(interaction, remove = false) {
  const role = selectedRole(interaction);
  const access = await management(interaction, role);
  requireMembershipManager(access);
  const member = await selectedMember(interaction);
  const held = member.roles.cache.has(role.id);
  if (remove && held)
    await member.roles.remove(role, `${commandLabel(interaction.commandName)} by ${interaction.user.tag} (${interaction.user.id})`);
  if (!remove && !held)
    await member.roles.add(role, `${commandLabel(interaction.commandName)} by ${interaction.user.tag} (${interaction.user.id})`);
  await record(interaction, remove ? "remove" : "add", role, member.id, { changed: remove ? held : !held });
  return card(remove ? "Role removed" : "Role added", {
    color: remove ? COLORS.warning : COLORS.success,
    description: remove
      ? held ? `${roleRef(role.id)} was removed from <@${member.id}>.` : `<@${member.id}> did not have ${roleRef(role.id)}.`
      : held ? `<@${member.id}> already has ${roleRef(role.id)}.` : `${roleRef(role.id)} was added to <@${member.id}>.`,
    rows: [["Member", who(member.id)], ["Role", roleRef(role.id)]],
  });
}

async function wipeRole(interaction) {
  const role = selectedRole(interaction);
  const access = await management(interaction, role);
  requireMembershipManager(access);
  await interaction.guild.members.fetch();
  const members = [...role.members.values()];
  let removed = 0;
  const failed = [];
  for (const member of members) {
    const ok = await member.roles
      .remove(role, `${commandLabel(interaction.commandName)} by ${interaction.user.tag} (${interaction.user.id})`)
      .then(() => true, () => false);
    if (ok) removed += 1;
    else failed.push(member.id);
  }
  await record(interaction, "wipe", role, role.id, { found: members.length, removed, failed });
  return card("Role wiped", {
    color: failed.length ? COLORS.warning : COLORS.success,
    description: `${roleRef(role.id)} was removed from ${removed} member${removed === 1 ? "" : "s"}.${failed.length ? ` Discord refused ${failed.length} removal${failed.length === 1 ? "" : "s"}.` : ""}`,
    rows: [["Members found", String(members.length)], ["Removed", String(removed)], ["Failed", String(failed.length)]],
  });
}

async function setOwner(interaction) {
  const role = selectedRole(interaction);
  const access = await management(interaction, role);
  if (access.record) requireRoleOwner(access);
  else if (!access.admin) throw new Error("Only the server owner or a configured role-manager superuser can assign the first owner.");
  const member = await selectedMember(interaction);
  if (member.user.bot) throw new Error("A bot cannot own a managed role.");
  await db.transaction(async (query) => {
    await query(
      `INSERT INTO role_manager_roles(guild_id,role_id,owner_id,created_by,created_at,updated_by,updated_at)
       VALUES(?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)`,
      [interaction.guildId, role.id, member.id, interaction.user.id, Date.now(), interaction.user.id, Date.now()],
    );
    await query(
      "DELETE FROM role_manager_members WHERE guild_id=? AND role_id=? AND discord_id=?",
      [interaction.guildId, role.id, member.id],
    );
  });
  await record(interaction, "owner.set", role, member.id, { previousOwner: access.record?.owner_id || null });
  return card("Role owner set", {
    color: COLORS.success,
    description: `<@${member.id}> now owns ${roleRef(role.id)} and can manage its manager list.`,
    rows: [["Owner", who(member.id)], ["Role", roleRef(role.id)]],
  });
}

async function changeManager(interaction, remove = false) {
  const role = selectedRole(interaction);
  const access = await management(interaction, role);
  if (!access.record) throw new Error(`Set an owner for ${role.name} with /setowner first.`);
  requireRoleOwner(access);
  const member = await selectedMember(interaction);
  if (member.user.bot) throw new Error("A bot cannot be a role manager.");
  if (!remove && String(access.record.owner_id) === member.id) throw new Error("The role owner already has manager access.");
  let changed;
  if (remove) {
    const result = await db.query(
      "DELETE FROM role_manager_members WHERE guild_id=? AND role_id=? AND discord_id=?",
      [interaction.guildId, role.id, member.id],
    );
    changed = Number(result.affectedRows || 0) > 0;
  } else {
    const result = await db.query(
      "INSERT IGNORE INTO role_manager_members(guild_id,role_id,discord_id,added_by,added_at) VALUES(?,?,?,?,?)",
      [interaction.guildId, role.id, member.id, interaction.user.id, Date.now()],
    );
    changed = Number(result.affectedRows || 0) > 0;
  }
  await record(interaction, remove ? "manager.remove" : "manager.add", role, member.id, { changed });
  return card(remove ? "Role manager removed" : "Role manager added", {
    color: remove ? COLORS.warning : COLORS.success,
    description: changed
      ? `<@${member.id}> ${remove ? "can no longer" : "can now"} add, remove, and wipe members of ${roleRef(role.id)}.`
      : `<@${member.id}> was ${remove ? "not a manager of" : "already a manager of"} ${roleRef(role.id)}.`,
    rows: [["Manager", who(member.id)], ["Role", roleRef(role.id)]],
  });
}

async function wipeManagers(interaction) {
  const role = selectedRole(interaction);
  const access = await management(interaction, role);
  if (!access.record) throw new Error(`Set an owner for ${role.name} with /setowner first.`);
  requireRoleOwner(access);
  const result = await db.query(
    "DELETE FROM role_manager_members WHERE guild_id=? AND role_id=?",
    [interaction.guildId, role.id],
  );
  const removed = Number(result.affectedRows || 0);
  await record(interaction, "manager.wipe", role, role.id, { removed });
  return card("Role managers wiped", {
    color: COLORS.warning,
    description: `${removed} manager${removed === 1 ? " was" : "s were"} removed from ${roleRef(role.id)}. The owner was kept.`,
    rows: [["Managers removed", String(removed)], ["Owner", who(access.record.owner_id)]],
  });
}

async function holders(interaction, role) {
  await interaction.guild.members.fetch().catch(() => null);
  const live = interaction.guild.roles.cache.get(role.id) || role;
  return [...live.members.values()].map((m) => m);
}

const rich = (embed) => ({ embeds: [embed], rich: true, allowedMentions: { parse: [] } });

async function viewRole(interaction) {
  if (!interaction.guild) throw new Error("Role-manager commands can only be used in a server.");
  const role = interaction.options.getRole("role", true);
  const count = (await holders(interaction, role)).length;
  const record = await db.one("SELECT owner_id FROM role_manager_roles WHERE guild_id=? AND role_id=?", [interaction.guildId, role.id]);
  const managers = await db.query("SELECT discord_id FROM role_manager_members WHERE guild_id=? AND role_id=?", [interaction.guildId, role.id]);
  const list = managers.map((m) => `<@${m.discord_id}>`).join(" ") || "None";
  return rich(card("Role info", {
    color: role.color || COLORS.primary,
    rows: [
      ["Tag", `<@&${role.id}>`],
      ["Role ID", `\`${role.id}\``],
      ["Holders", String(count)],
      ["Owner", record?.owner_id ? `<@${record.owner_id}>` : "None set"],
      ["Managers", list.slice(0, 1000), false],
    ],
  }));
}

async function viewUsers(interaction) {
  if (!interaction.guild) throw new Error("Role-manager commands can only be used in a server.");
  const role = interaction.options.getRole("role", true);
  const members = await holders(interaction, role);
  const shown = members.slice(0, 150).map((m) => `<@${m.id}>`).join(" ");
  const more = members.length > 150 ? `\n…and ${members.length - 150} more.` : "";
  return rich(card("Role members", {
    color: role.color || COLORS.primary,
    description: members.length ? shown + more : "Nobody holds this role.",
    rows: [["Tag", `<@&${role.id}>`], ["Users", String(members.length)]],
  }));
}

export async function roleManagerCommand(interaction) {
  switch (interaction.commandName) {
    case "addrole": return addRole(interaction, false);
    case "removerole": return addRole(interaction, true);
    case "wiperole": return wipeRole(interaction);
    case "setowner": return setOwner(interaction);
    case "useradd": return changeManager(interaction, false);
    case "userdel": return changeManager(interaction, true);
    case "mgrwipe": return wipeManagers(interaction);
    case "viewrole": return viewRole(interaction);
    case "viewusers": return viewUsers(interaction);
    default: throw new Error("Unknown role-manager command.");
  }
}
