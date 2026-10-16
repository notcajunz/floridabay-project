/** Main-server /role assign and /role unassign implementation. */
export function createRoleMembershipCommands({
  db,
  audit,
  requireMinimumStaffRank,
  requireProtectedRoleManagerId,
  card,
  colors,
  roleRef,
  who,
  log,
}) {
  async function command(i, sub) {
    if (!i.guild) throw new Error("Role commands can only be used in a server.");
    if (!new Set(["assign", "unassign"]).has(sub)) throw new Error("Unknown role action.");

    const main = await db.one("SELECT guild_id FROM network_guilds WHERE kind='main' ORDER BY added_at LIMIT 1");
    if (!main) throw new Error("The main Florida Bay Discord is not configured.");
    if (String(i.guildId) !== String(main.guild_id))
      throw new Error("This command can only be used in the main Florida Bay Discord.");

    await requireMinimumStaffRank(i, "Assistant Community Manager", "assign or unassign roles");

    const role = i.options.getRole("role", true);
    if (role.id === i.guildId) throw new Error("The @everyone role cannot be assigned or unassigned.");
    if (role.managed) throw new Error("Discord-managed and integration roles cannot be assigned or unassigned.");

    // A role protected through /protectrole keeps the stricter protected-role policy.
    // The Discord audit log sees the bot as the actor, so this must be checked before mutation.
    const protectedRole = await db.one(
      "SELECT 1 FROM protected_roles WHERE guild_id=? AND role_id=?",
      [i.guildId, role.id],
    );
    if (protectedRole) {
      requireProtectedRoleManagerId(i.user.id);
      await requireMinimumStaffRank(i, "Co-Owner", "assign or unassign protected roles");
    }

    if (!role.editable)
      throw new Error(`I cannot edit ${role.name}. Give the bot Manage Roles and move its role above that role.`);

    const user = i.options.getUser("member", true);
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    if (!member) throw new Error("That user is not a member of the main Florida Bay Discord.");

    const assigning = sub === "assign";
    const held = member.roles.cache.has(role.id);
    const changed = assigning ? !held : held;
    if (changed) {
      const reason = `/role ${sub} by ${i.user.tag} (${i.user.id})`;
      if (assigning) await member.roles.add(role, reason);
      else await member.roles.remove(role, reason);
    }

    await audit(i.user.id, `role.${sub}`, member.id, {
      guildId: i.guildId,
      roleId: role.id,
      changed,
      protected: Boolean(protectedRole),
    });
    await log(i.guild, {
      title: assigning ? "Role assigned" : "Role unassigned",
      color: assigning ? colors.success : colors.warning,
      actor: i.user.id,
      target: member.id,
      fields: [
        ["Role", roleRef(role.id)],
        ["Result", changed ? (assigning ? "Assigned" : "Unassigned") : assigning ? "Already assigned" : "Not assigned"],
      ],
    }, "staff_audit");

    return card(assigning ? "Role assigned" : "Role unassigned", {
      color: assigning ? colors.success : colors.warning,
      description: changed
        ? `${roleRef(role.id)} was ${assigning ? "assigned to" : "removed from"} <@${member.id}>.`
        : assigning
          ? `<@${member.id}> already has ${roleRef(role.id)}.`
          : `<@${member.id}> does not have ${roleRef(role.id)}.`,
      rows: [["Member", who(member.id)], ["Role", roleRef(role.id)]],
    });
  }

  return { command };
}
