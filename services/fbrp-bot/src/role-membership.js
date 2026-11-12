import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";

/** Main-server /role assign and /role unassign, plus the bulk /roleall and /unroleall. */
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
  mainGuildId = null,
  dangerousPermissions = 0n,
  isBotOwner = () => false,
  confirmMs = 60_000,
}) {
  const running = new Set();

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

  /** Roles that carry staff authority or ACE access must never be handed to everyone in one command. */
  async function staffBound(roleId) {
    return db.one(
      `SELECT 1 hit FROM (
         SELECT discord_role_id role_id FROM staff_roster_ranks WHERE discord_role_id=?
         UNION ALL SELECT discord_role_id FROM staff_roster_jobs WHERE discord_role_id=?
         UNION ALL SELECT role_id FROM network_sync_roles WHERE role_id=?
         UNION ALL SELECT b.role_id FROM discord_role_bindings b JOIN ace_groups g ON g.name=b.group_name WHERE b.role_id=? AND g.staff_only=1
         UNION ALL SELECT s.role_id FROM discord_role_sources s JOIN ace_groups g ON g.name=s.group_name WHERE s.role_id=? AND g.staff_only=1
       ) bound LIMIT 1`,
      [roleId, roleId, roleId, roleId, roleId],
    );
  }

  /**
   * /roleall and /unroleall: give or take one role from every human in the main server.
   * Executive Management and higher, main server only, with a confirmation before anything changes.
   */
  async function bulk(i, sub) {
    const assigning = sub === "assign";
    const name = assigning ? "roleall" : "unroleall";
    if (!i.guild) throw new Error(`/${name} can only be used in a server.`);
    if (!mainGuildId || String(i.guildId) !== String(mainGuildId))
      throw new Error(`/${name} can only be used in the main Florida Bay Discord.`);
    await requireMinimumStaffRank(i, "Executive Management", `use /${name}`);

    const role = i.options.getRole("role", true);
    if (role.id === i.guildId) throw new Error("The @everyone role cannot be given or taken from everyone.");
    if (role.managed) throw new Error("Discord-managed and integration roles cannot be changed.");
    if (!role.editable) throw new Error(`I cannot edit ${role.name}. Move the bot's role above it first.`);
    if (BigInt(role.permissions?.bitfield ?? 0n) & BigInt(dangerousPermissions) && !isBotOwner(i.user.id))
      throw new Error(`${role.name} has dangerous Discord permissions, so only a bot owner can give it to or take it from everyone.`);
    if (await staffBound(role.id))
      throw new Error(`${role.name} is a staff, ACE or synced role. Use /staff, /ace or /globalsync for those, never a bulk command.`);
    if (await db.one("SELECT 1 FROM protected_roles WHERE guild_id=? AND role_id=?", [i.guildId, role.id])) {
      requireProtectedRoleManagerId(i.user.id);
      await requireMinimumStaffRank(i, "Co-Owner", `use /${name} on a protected role`);
    }
    if (running.has(i.guildId)) throw new Error("A bulk role change is already running in this server. Wait for it to finish.");

    const everyone = await i.guild.members.fetch();
    const humans = [...everyone.values()].filter((member) => !member.user?.bot);
    const targets = humans.filter((member) => member.roles.cache.has(role.id) !== assigning);
    if (!targets.length)
      return card("Nothing to change", {
        color: colors.warning,
        description: assigning
          ? `Every one of the ${humans.length} members already has ${roleRef(role.id)}.`
          : `None of the ${humans.length} members has ${roleRef(role.id)}.`,
      });

    const verb = assigning ? "give" : "remove";
    const confirm = new ButtonBuilder().setCustomId(`${name}:confirm`).setLabel(`${assigning ? "Give" : "Remove"} for ${targets.length} members`).setStyle(assigning ? ButtonStyle.Primary : ButtonStyle.Danger);
    const cancel = new ButtonBuilder().setCustomId(`${name}:cancel`).setLabel("Cancel").setStyle(ButtonStyle.Secondary);
    await i.editReply({
      embeds: [card(`Confirm /${name}`, {
        color: colors.warning,
        description: `This will ${verb} ${roleRef(role.id)} ${assigning ? "to" : "from"} **${targets.length}** of **${humans.length}** members. Bots are skipped.\nPress the button within ${Math.round(confirmMs / 1000)} seconds.`,
      })],
      components: [new ActionRowBuilder().addComponents(confirm, cancel)],
    });
    const reply = await i.fetchReply();
    const press = await reply
      .awaitMessageComponent({ componentType: ComponentType.Button, time: confirmMs, filter: (c) => c.user.id === i.user.id })
      .catch(() => null);
    if (!press || press.customId !== `${name}:confirm`) {
      if (press) await press.deferUpdate().catch(() => {});
      return { embeds: [card("Cancelled", { color: colors.warning, description: "No roles were changed." })], components: [] };
    }
    await press.deferUpdate().catch(() => {});

    running.add(i.guildId);
    let done = 0;
    let failed = 0;
    try {
      const reason = `/${name} by ${i.user.tag} (${i.user.id})`;
      for (const [index, member] of targets.entries()) {
        try {
          if (assigning) await member.roles.add(role, reason);
          else await member.roles.remove(role, reason);
          done += 1;
        } catch (error) {
          failed += 1;
        }
        if ((index + 1) % 20 === 0 && index + 1 < targets.length)
          await i.editReply({ embeds: [card(`/${name} running`, { color: colors.warning, description: `${index + 1} of ${targets.length} processed...` })], components: [] }).catch(() => {});
      }
    } finally {
      running.delete(i.guildId);
    }

    await audit(i.user.id, `role.${name}`, role.id, { guildId: i.guildId, roleId: role.id, targeted: targets.length, changed: done, failed });
    await log(i.guild, {
      title: assigning ? "Role given to everyone" : "Role removed from everyone",
      color: assigning ? colors.success : colors.warning,
      actor: i.user.id,
      fields: [["Role", roleRef(role.id)], ["Changed", String(done)], ["Failed", String(failed)], ["Members", String(humans.length)]],
    }, "staff_audit");
    return {
      embeds: [card(assigning ? "Role given to everyone" : "Role removed from everyone", {
        color: failed ? colors.warning : colors.success,
        description: `${roleRef(role.id)} was ${assigning ? "given to" : "removed from"} **${done}** member${done === 1 ? "" : "s"}.${failed ? ` **${failed}** could not be changed; run the command again to retry them.` : ""}`,
      })],
      components: [],
    };
  }

  return { command, bulk };
}
