from __future__ import annotations

from datetime import UTC, datetime, timedelta

import discord
from discord import app_commands

from ..common import (
    DeptCog,
    actor_id,
    clean_text,
    coordinator_only,
    department_autocomplete,
    director_only,
    guild_id,
    has_bypass,
    manager_only,
    meets_level,
    reply,
    require_guild,
    require_role_manager,
    send_to,
)
from ..constants import COOLDOWN_KINDS, DEPARTMENT_CATEGORIES, NO_COOLDOWN_CATEGORIES
from ..role_policy import (
    active_cooldowns,
    assign_cooldown,
    category_conflict,
    department_for_role,
    require_restricted_role_manager,
    send_conflict_alert,
    send_member_movement,
    today,
)
from ..services import future_timestamp

COOLDOWN_CATEGORY_CHOICES = [app_commands.Choice(name=value, value=value) for value in DEPARTMENT_CATEGORIES if value not in NO_COOLDOWN_CATEGORIES]
COOLDOWN_KIND_CHOICES = [app_commands.Choice(name=value, value=value) for value in COOLDOWN_KINDS]


class MembersCog(DeptCog):
    member = app_commands.Group(name="member", description="Member discipline and history")
    role = app_commands.Group(name="role", description="Department role management")
    cooldown = app_commands.Group(name="cooldown", description="Transfer and resignation cooldowns")
    transfer = app_commands.Group(name="transfer", description="Department transfers")
    temprole = app_commands.Group(name="temprole", description="Temporary Discord roles")
    permissions = app_commands.Group(name="permissions", description="Bot permission overrides")

    # ---- Punishments -------------------------------------------------------------------------

    @member.command(name="logpunishment", description="Log a punishment for a member")
    @coordinator_only
    @app_commands.choices(punishment=[
        app_commands.Choice(name="Warning", value="Warning"),
        app_commands.Choice(name="Strike", value="Strike"),
        app_commands.Choice(name="Suspension", value="Suspension"),
    ])
    @app_commands.autocomplete(department=department_autocomplete)
    async def log_punishment(
        self,
        interaction: discord.Interaction,
        target: discord.Member,
        punishment: app_commands.Choice[str],
        notes: str,
        department: str | None = None,
        duration: app_commands.Range[int, 1, 365] | None = None,
    ) -> None:
        guild = require_guild(interaction)
        notes = clean_text(notes, 1000)
        row = await self.service.department(guild.id, department) if department else None
        if punishment.value == "Suspension" and duration is None:
            raise ValueError("A suspension requires a duration in days.")
        if punishment.value != "Suspension" and duration is not None:
            raise ValueError("Duration can only be set for a suspension.")
        await interaction.response.defer(ephemeral=True)
        if punishment.value == "Suspension" and self.bot.config.suspension_role_id:
            role = guild.get_role(self.bot.config.suspension_role_id)
            if role is None:
                raise ValueError("The configured suspension role was not found.")
            require_restricted_role_manager(interaction.user, role, self.bot.config)
            await target.add_roles(role, reason=f"Department suspension by {interaction.user}")
            await self.db.execute(
                "INSERT INTO temp_roles(guild_id,member_id,role_id,expires_at) VALUES(?,?,?,?) "
                "ON CONFLICT(guild_id,member_id,role_id) DO UPDATE SET expires_at=excluded.expires_at",
                (guild.id, target.id, role.id, future_timestamp(duration)),
            )
        item_id = await self.db.execute(
            "INSERT INTO punishments(guild_id,member_id,department_id,punishment,notes,actor_id,duration_days) VALUES(?,?,?,?,?,?,?)",
            (guild.id, target.id, row["id"] if row else None, punishment.value, notes, actor_id(interaction), duration),
        )
        scope = f" ({row['name']})" if row else ""
        duration_text = f"{duration} day(s)" if duration else "N/A"
        message = (
            f"<@!{target.id}>{scope} --> {punishment.value} | {notes} | "
            f"{duration_text} | {today()} | {interaction.user.mention}"
        )
        for channel_id in self.bot.config.punishment_channel_ids:
            await send_to(guild, channel_id, message)
        await reply(interaction, f"Logged {punishment.value.lower()} `#{item_id}` for {target.mention}.")

    @member.command(name="history", description="View a member's punishment history")
    @coordinator_only
    async def member_history(self, interaction: discord.Interaction, target: discord.Member) -> None:
        rows = await self.db.fetch_all(
            "SELECT p.id,p.punishment,p.notes,p.active,p.created_at,d.name department FROM punishments p "
            "LEFT JOIN departments d ON d.id=p.department_id WHERE p.guild_id=? AND p.member_id=? ORDER BY p.id DESC LIMIT 25",
            (guild_id(interaction), target.id),
        )
        lines = [
            f"`#{r['id']}` {r['punishment']}{' · ' + r['department'] if r['department'] else ''} "
            f"({'active' if r['active'] else 'deleted'}) · {r['notes'] or 'no notes'}"
            for r in rows
        ]
        await reply(interaction, "\n".join(lines)[:1900] or "No punishment history.")

    @member.command(name="editpunishment", description="Edit a punishment record")
    @manager_only
    async def edit_punishment(self, interaction: discord.Interaction, punishment_id: int, new_punishment: str, new_reason: str) -> None:
        changed = await self.db.execute_count(
            "UPDATE punishments SET punishment=?,edit_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND guild_id=?",
            (clean_text(new_punishment, 200), clean_text(new_reason, 500), punishment_id, guild_id(interaction)),
        )
        if not changed:
            raise ValueError(f"Punishment `#{punishment_id}` was not found.")
        await reply(interaction, f"Updated punishment `#{punishment_id}`.")

    @member.command(name="deletepunishment", description="Soft-delete a punishment record")
    @manager_only
    async def delete_punishment(self, interaction: discord.Interaction, punishment_id: int, reason: str) -> None:
        changed = await self.db.execute_count(
            "UPDATE punishments SET active=0,edit_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND guild_id=?",
            (clean_text(reason, 500), punishment_id, guild_id(interaction)),
        )
        if not changed:
            raise ValueError(f"Punishment `#{punishment_id}` was not found.")
        await reply(interaction, f"Deactivated punishment `#{punishment_id}`.")

    # ---- Department roles --------------------------------------------------------------------

    @role.command(name="add", description="Give a department (or delegated) role to a member")
    async def role_add(self, interaction: discord.Interaction, role: discord.Role, target: discord.Member) -> None:
        guild = require_guild(interaction)
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        await require_role_manager(interaction, role)
        department = await department_for_role(self.db, guild.id, role.id)
        if department:
            conflict = await category_conflict(self.bot, target, department)
            if conflict:
                await send_conflict_alert(self.bot, target, role, conflict)
                raise ValueError(f"Department role blocked: {conflict}.")
            self.bot.mark_managed("add", guild.id, target.id, role.id)
        await target.add_roles(role, reason=f"Added by {interaction.user}")
        if department:
            await send_member_movement(self.bot, target, department, "Joined", interaction.user)
        await self.service.log(guild.id, "role", "add", actor_id(interaction), str(target.id), f"role={role.id}")
        await reply(interaction, f"Added {role.mention} to {target.mention}.")

    @role.command(name="remove", description="Remove a department (or delegated) role from a member")
    @app_commands.choices(reason=[
        app_commands.Choice(name="Resigned", value="Resigned"),
        app_commands.Choice(name="Terminated", value="Terminated"),
        app_commands.Choice(name="Removed (no cooldown)", value="Removed"),
    ])
    async def role_remove(
        self, interaction: discord.Interaction, role: discord.Role, target: discord.Member, reason: app_commands.Choice[str]
    ) -> None:
        guild = require_guild(interaction)
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        await require_role_manager(interaction, role)
        if await self.db.fetch_one("SELECT 1 FROM protected_roles WHERE guild_id=? AND role_id=?", (guild.id, role.id)):
            raise ValueError("That role is protected. Unprotect it first.")
        if role not in target.roles:
            raise ValueError(f"{target.mention} does not have {role.mention}.")
        if reason.value == "Removed" and not (
            has_bypass(interaction)
            or (isinstance(interaction.user, discord.Member) and meets_level(interaction.user, self.bot.config, "coordinator"))
        ):
            raise ValueError("Only coordinators can remove a department role without a cooldown.")
        department = await department_for_role(self.db, guild.id, role.id)
        if department:
            self.bot.mark_managed("remove", guild.id, target.id, role.id)
        try:
            await target.remove_roles(role, reason=f"{reason.value} · removed by {interaction.user}")
        except Exception:
            if department:
                self.bot.consume_managed("remove", guild.id, target.id, role.id)
            raise
        suffix = ""
        if department:
            await send_member_movement(self.bot, target, department, f"{reason.value} from", interaction.user)
            if reason.value != "Removed":
                cooldown = await assign_cooldown(self.bot, target, department["category"], "Resignation", department=department["name"])
                if cooldown:
                    suffix = f" and applied {cooldown.mention} for {self.bot.config.resignation_cooldown_days} day(s)"
        await self.service.log(guild.id, "role", "remove", actor_id(interaction), str(target.id), f"role={role.id} reason={reason.value}")
        await reply(interaction, f"Removed {role.mention} from {target.mention}{suffix}.")

    @role.command(name="protection", description="Protect or unprotect a role from bot removal")
    @director_only
    @app_commands.choices(action=[
        app_commands.Choice(name="Protect", value="protect"),
        app_commands.Choice(name="Unprotect", value="unprotect"),
    ])
    async def role_protection(self, interaction: discord.Interaction, action: app_commands.Choice[str], role: discord.Role) -> None:
        if action.value == "protect":
            await self.db.execute("INSERT OR IGNORE INTO protected_roles(guild_id,role_id) VALUES(?,?)", (guild_id(interaction), role.id))
        else:
            await self.db.execute("DELETE FROM protected_roles WHERE guild_id=? AND role_id=?", (guild_id(interaction), role.id))
        await reply(interaction, f"{role.mention} is now **{action.value}ed**.")

    @app_commands.command(name="useradd", description="Delegate management of a Discord role")
    @director_only
    async def useradd(self, interaction: discord.Interaction, manager: discord.Member | discord.Role, role: discord.Role) -> None:
        manager_type = "role" if isinstance(manager, discord.Role) else "user"
        await self.db.execute(
            "INSERT OR IGNORE INTO role_managers(guild_id,managed_role_id,manager_type,manager_id) VALUES(?,?,?,?)",
            (guild_id(interaction), role.id, manager_type, manager.id),
        )
        await reply(interaction, f"{manager.mention} can now manage {role.mention}.")

    @app_commands.command(name="userdel", description="Remove delegated management of a Discord role")
    @director_only
    async def userdel(self, interaction: discord.Interaction, manager: discord.Member | discord.Role, role: discord.Role) -> None:
        manager_type = "role" if isinstance(manager, discord.Role) else "user"
        await self.db.execute(
            "DELETE FROM role_managers WHERE guild_id=? AND managed_role_id=? AND manager_type=? AND manager_id=?",
            (guild_id(interaction), role.id, manager_type, manager.id),
        )
        await reply(interaction, f"{manager.mention} can no longer manage {role.mention}.")

    @app_commands.command(name="rolewipe", description="Remove a role from every member (no cooldowns)")
    @manager_only
    async def rolewipe(self, interaction: discord.Interaction, role: discord.Role) -> None:
        guild = require_guild(interaction)
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        if await self.db.fetch_one("SELECT 1 FROM protected_roles WHERE guild_id=? AND role_id=?", (guild.id, role.id)):
            raise ValueError("That role is protected. Unprotect it first.")
        await interaction.response.defer(ephemeral=True)
        department = await department_for_role(self.db, guild.id, role.id)
        removed = failed = 0
        for member in list(role.members):
            if department:
                self.bot.mark_managed("remove", guild.id, member.id, role.id)
            try:
                await member.remove_roles(role, reason=f"Role wipe by {interaction.user}")
                removed += 1
            except discord.HTTPException:
                if department:
                    self.bot.consume_managed("remove", guild.id, member.id, role.id)
                failed += 1
        await self.service.log(guild.id, "role", "wipe", actor_id(interaction), str(role.id), f"removed={removed} failed={failed}")
        await reply(
            interaction,
            f"Wiped {role.mention} from {removed} member(s)." + (f" {failed} removal(s) failed." if failed else ""),
        )

    # ---- Cooldowns ---------------------------------------------------------------------------

    @cooldown.command(name="apply", description="Put a member on a transfer or resignation cooldown")
    @coordinator_only
    @app_commands.choices(category=COOLDOWN_CATEGORY_CHOICES, kind=COOLDOWN_KIND_CHOICES)
    async def cooldown_apply(
        self,
        interaction: discord.Interaction,
        member: discord.Member,
        category: app_commands.Choice[str],
        kind: app_commands.Choice[str],
        days: app_commands.Range[int, 1, 90] | None = None,
    ) -> None:
        role = await assign_cooldown(self.bot, member, category.value, kind.value, days=days)
        if role is None:
            raise ValueError(f"No {kind.value.lower()} cooldown role is configured for {category.value}.")
        length = days or self.bot.config.cooldown_days(kind.value)
        await self.service.log(guild_id(interaction), "cooldown", "apply", actor_id(interaction), str(member.id), f"{role.name} {length}d")
        await reply(interaction, f"Applied {role.mention} to {member.mention} for {length} day(s).")

    @cooldown.command(name="clear", description="Lift a member's cooldowns in a category")
    @manager_only
    @app_commands.choices(category=COOLDOWN_CATEGORY_CHOICES)
    async def cooldown_clear(self, interaction: discord.Interaction, member: discord.Member, category: app_commands.Choice[str]) -> None:
        roles = active_cooldowns(self.bot, member, category.value)
        if not roles:
            raise ValueError(f"{member.mention} has no {category.value} cooldown.")
        await member.remove_roles(*roles, reason=f"Cooldown lifted by {interaction.user}")
        for role in roles:
            await self.db.execute(
                "DELETE FROM temp_roles WHERE guild_id=? AND member_id=? AND role_id=?", (member.guild.id, member.id, role.id)
            )
        await self.service.log(guild_id(interaction), "cooldown", "clear", actor_id(interaction), str(member.id), category.value)
        await reply(interaction, f"Lifted {' '.join(role.mention for role in roles)} from {member.mention}.")

    @cooldown.command(name="view", description="Show a member's active cooldowns")
    @coordinator_only
    async def cooldown_view(self, interaction: discord.Interaction, member: discord.Member) -> None:
        cooldown_ids = self.bot.config.all_cooldown_role_ids()
        rows = await self.db.fetch_all(
            "SELECT role_id,expires_at FROM temp_roles WHERE guild_id=? AND member_id=? ORDER BY expires_at",
            (guild_id(interaction), member.id),
        )
        expiries = {row["role_id"]: row["expires_at"] for row in rows}
        lines = []
        for role in member.roles:
            if role.id not in cooldown_ids:
                continue
            expires = expiries.get(role.id)
            when = f"expires <t:{int(datetime.fromisoformat(expires).timestamp())}:R>" if expires else "no expiry recorded"
            lines.append(f"• {role.mention} · {when}")
        await reply(interaction, "\n".join(lines) or f"{member.mention} has no cooldowns.")

    # ---- Transfers ---------------------------------------------------------------------------

    @transfer.command(name="member", description="Move a member from one department to another")
    @app_commands.autocomplete(from_department=department_autocomplete, to_department=department_autocomplete)
    async def transfer_member(
        self, interaction: discord.Interaction, member: discord.Member, from_department: str, to_department: str
    ) -> None:
        guild = require_guild(interaction)
        config = self.bot.config
        if not (
            has_bypass(interaction)
            or (isinstance(interaction.user, discord.Member) and (
                meets_level(interaction.user, config, "manager")
                or config.coordinator_job_role_ids.get("Transfer Coordinator", 0) in {r.id for r in interaction.user.roles}
            ))
        ):
            raise app_commands.CheckFailure("Only Transfer Coordinators and department management can process transfers.")
        source = await self.service.department(guild.id, from_department)
        target = await self.service.department(guild.id, to_department)
        if source["id"] == target["id"]:
            raise ValueError("The source and destination departments must be different.")
        old_role = guild.get_role(source["base_role_id"] or 0)
        new_role = guild.get_role(target["base_role_id"] or 0)
        if old_role is None or new_role is None:
            raise ValueError("Both departments need a valid department role.")
        if old_role not in member.roles:
            raise ValueError(f"{member.mention} does not have {old_role.mention}.")
        if config.transfer_blacklist_role_id in {role.id for role in member.roles}:
            raise ValueError(f"{member.mention} is transfer blacklisted.")
        transfer_cooldown = guild.get_role(config.cooldown_role_id("Transfer", target["category"]))
        if transfer_cooldown and transfer_cooldown in member.roles:
            raise ValueError(f"{member.mention} is on {transfer_cooldown.mention}.")
        # The member is leaving the source, so only that department may be held in the target category.
        conflict = await category_conflict(self.bot, member, target)
        if conflict and not conflict.startswith(f"Already in {source['name']} ("):
            raise ValueError(f"Transfer blocked: {conflict}.")
        await interaction.response.defer(ephemeral=True)
        self.bot.mark_managed("remove", guild.id, member.id, old_role.id)
        self.bot.mark_managed("add", guild.id, member.id, new_role.id)
        try:
            await member.remove_roles(old_role, reason=f"Transfer by {interaction.user}")
            await member.add_roles(new_role, reason=f"Transfer by {interaction.user}")
        except Exception:
            self.bot.consume_managed("remove", guild.id, member.id, old_role.id)
            self.bot.consume_managed("add", guild.id, member.id, new_role.id)
            if old_role not in member.roles:
                await member.add_roles(old_role, reason="Rolling back failed transfer")
            raise
        cooldown = await assign_cooldown(self.bot, member, target["category"], "Transfer", department=target["name"])
        await send_member_movement(self.bot, member, target, f"Transferred from {source['name']} to", interaction.user)
        embed = discord.Embed(title="Department Transfer", color=discord.Color.blurple(), timestamp=datetime.now(UTC))
        embed.add_field(name="Member", value=f"{member.mention}\n`{member.id}`")
        embed.add_field(name="From", value=old_role.mention)
        embed.add_field(name="To", value=new_role.mention)
        embed.add_field(name="Cooldown", value=f"{cooldown.mention} · {config.transfer_cooldown_days} day(s)" if cooldown else "None")
        embed.add_field(name="Processed by", value=interaction.user.mention)
        await send_to(guild, config.transfer_log_channel_id, embed=embed)
        await self.service.log(guild.id, "member", "transfer", actor_id(interaction), str(member.id), f"{source['name']} -> {target['name']}")
        await reply(interaction, f"Transferred {member.mention} from **{source['name']}** to **{target['name']}**.")

    @transfer.command(name="blacklist", description="Add or remove a member's transfer blacklist")
    @manager_only
    @app_commands.choices(action=[
        app_commands.Choice(name="Add", value="add"),
        app_commands.Choice(name="Remove", value="remove"),
    ])
    async def transfer_blacklist(
        self,
        interaction: discord.Interaction,
        action: app_commands.Choice[str],
        member: discord.Member,
        reason: str,
        days: app_commands.Range[int, 1, 365] | None = None,
    ) -> None:
        guild = require_guild(interaction)
        role = guild.get_role(self.bot.config.transfer_blacklist_role_id)
        if role is None:
            raise ValueError("The transfer blacklist role is not configured.")
        reason = clean_text(reason, 500)
        if action.value == "add":
            await member.add_roles(role, reason=f"Transfer blacklist by {interaction.user}: {reason}")
            if days:
                await self.db.execute(
                    "INSERT INTO temp_roles(guild_id,member_id,role_id,expires_at) VALUES(?,?,?,?) "
                    "ON CONFLICT(guild_id,member_id,role_id) DO UPDATE SET expires_at=excluded.expires_at",
                    (guild.id, member.id, role.id, future_timestamp(days)),
                )
        else:
            await member.remove_roles(role, reason=f"Transfer blacklist lifted by {interaction.user}: {reason}")
            await self.db.execute(
                "DELETE FROM temp_roles WHERE guild_id=? AND member_id=? AND role_id=?", (guild.id, member.id, role.id)
            )
        length = f"{days} day(s)" if days and action.value == "add" else ("Permanent" if action.value == "add" else "N/A")
        await send_to(
            guild, self.bot.config.transfer_blacklist_log_channel_id,
            f"<@!{member.id}> --> Transfer Blacklist {'Added' if action.value == 'add' else 'Removed'} | {reason} | "
            f"{length} | {today()} | {interaction.user.mention}",
        )
        await self.service.log(guild.id, "transfer", f"blacklist-{action.value}", actor_id(interaction), str(member.id), reason)
        await reply(interaction, f"Transfer blacklist {'added to' if action.value == 'add' else 'removed from'} {member.mention}.")

    # ---- Temporary roles ---------------------------------------------------------------------

    @temprole.command(name="extend", description="Add or extend a temporary role")
    @manager_only
    async def temprole_extend(
        self, interaction: discord.Interaction, member: discord.Member, role: discord.Role, days: app_commands.Range[int, 1, 365]
    ) -> None:
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        current = await self.db.fetch_one(
            "SELECT expires_at FROM temp_roles WHERE guild_id=? AND member_id=? AND role_id=?",
            (guild_id(interaction), member.id, role.id),
        )
        base = max(datetime.fromisoformat(current["expires_at"]), datetime.now(UTC)) if current else datetime.now(UTC)
        expires = (base + timedelta(days=days)).isoformat()
        await member.add_roles(role, reason=f"Temporary role by {interaction.user}")
        await self.db.execute(
            "INSERT INTO temp_roles(guild_id,member_id,role_id,expires_at) VALUES(?,?,?,?) "
            "ON CONFLICT(guild_id,member_id,role_id) DO UPDATE SET expires_at=excluded.expires_at",
            (guild_id(interaction), member.id, role.id, expires),
        )
        await reply(interaction, f"{role.mention} for {member.mention} now expires <t:{int(datetime.fromisoformat(expires).timestamp())}:R>.")

    @temprole.command(name="delete", description="Remove a member's temporary role now")
    @manager_only
    async def temprole_delete(self, interaction: discord.Interaction, member: discord.Member, role: discord.Role) -> None:
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        await member.remove_roles(role, reason=f"Temporary role removed by {interaction.user}")
        await self.db.execute(
            "DELETE FROM temp_roles WHERE guild_id=? AND member_id=? AND role_id=?", (guild_id(interaction), member.id, role.id)
        )
        await reply(interaction, f"Removed temporary {role.mention} from {member.mention}.")

    @temprole.command(name="list", description="List a member's temporary roles and cooldowns")
    @coordinator_only
    async def temprole_list(self, interaction: discord.Interaction, member: discord.Member) -> None:
        rows = await self.db.fetch_all(
            "SELECT role_id,expires_at FROM temp_roles WHERE guild_id=? AND member_id=? ORDER BY expires_at",
            (guild_id(interaction), member.id),
        )
        lines = [
            f"• <@&{row['role_id']}> expires <t:{int(datetime.fromisoformat(row['expires_at']).timestamp())}:R>"
            for row in rows
        ]
        await reply(interaction, "\n".join(lines) or "No temporary roles found.")

    # ---- Permission overrides ----------------------------------------------------------------

    @permissions.command(name="set", description="Allow or deny a user/role a command (or 'manager')")
    @director_only
    @app_commands.choices(action=[
        app_commands.Choice(name="Allow", value="allow"),
        app_commands.Choice(name="Deny", value="deny"),
        app_commands.Choice(name="Clear", value="clear"),
    ])
    async def permissions_set(
        self, interaction: discord.Interaction, action: app_commands.Choice[str], permission: str, target: discord.Member | discord.Role
    ) -> None:
        kind = "role" if isinstance(target, discord.Role) else "user"
        permission = clean_text(permission, 60).lower()
        if action.value == "clear":
            await self.db.execute(
                "DELETE FROM permissions WHERE guild_id=? AND target_type=? AND target_id=? AND permission=?",
                (guild_id(interaction), kind, target.id, permission),
            )
        else:
            await self.db.execute(
                "INSERT INTO permissions(guild_id,target_type,target_id,permission,allowed) VALUES(?,?,?,?,?) "
                "ON CONFLICT(guild_id,target_type,target_id,permission) DO UPDATE SET allowed=excluded.allowed",
                (guild_id(interaction), kind, target.id, permission, int(action.value == "allow")),
            )
        await reply(interaction, f"Permission `{permission}` for {target.mention}: **{action.name}**.")

    @permissions.command(name="view", description="View a user or role permission override")
    @director_only
    async def permissions_view(self, interaction: discord.Interaction, permission: str, target: discord.Member | discord.Role) -> None:
        kind = "role" if isinstance(target, discord.Role) else "user"
        row = await self.db.fetch_one(
            "SELECT allowed FROM permissions WHERE guild_id=? AND target_type=? AND target_id=? AND permission=?",
            (guild_id(interaction), kind, target.id, permission.lower()),
        )
        state = "not set" if row is None else ("allowed" if row["allowed"] else "denied")
        await reply(interaction, f"{target.mention} `{permission.lower()}` is **{state}**.")
