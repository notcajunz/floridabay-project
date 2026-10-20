from __future__ import annotations

import logging
import re
import sqlite3
from datetime import UTC, datetime

import discord
from discord import app_commands

from ..common import (
    DeptCog,
    actor_id,
    clean_text,
    coordinator_only,
    department_autocomplete,
    confirm_action,
    email_log,
    guild_id,
    launch_or_manager,
    manager_only,
    refresh_panels,
    reply,
    require_department_access,
    require_guild,
    send_to,
)
from ..constants import DEPARTMENT_CATEGORIES, DEPARTMENT_STATUSES
from ..fbrp_api import FbrpApi, FbrpApiError
from ..role_policy import department_movement_embed, format_hours_line, today
from ..services import duration, parse_color
from ..sheet_api import SheetApi, SheetApiError

log = logging.getLogger(__name__)

CATEGORY_CHOICES = [app_commands.Choice(name=value, value=value) for value in DEPARTMENT_CATEGORIES]
STATUS_CHOICES = [app_commands.Choice(name=value, value=value) for value in DEPARTMENT_STATUSES]
STATUS_COLORS = {
    "In Development": discord.Color.orange(),
    "Launched": discord.Color.green(),
    "Inactive": discord.Color.dark_grey(),
    "Closed": discord.Color.red(),
}


# The email database groups departments into its own categories.
SHEET_CATEGORIES = ("Law Enforcement", "Fire / EMS", "DOT", "Handpicked", "Coordination")
SHEET_CATEGORY_CHOICES = [app_commands.Choice(name=value, value=value) for value in SHEET_CATEGORIES]
SHEET_CATEGORY_DEFAULTS = {
    "Main LEO": "Law Enforcement", "Main FED": "Law Enforcement", "Pre-Main": "Law Enforcement",
    "Armed Forces": "Law Enforcement", "Other": "Handpicked", "Handpicked": "Handpicked",
}


def sheet_code(initials: str | None, name: str) -> str:
    """The short code a department gets in the email database (2 to 10 letters or numbers)."""
    code = re.sub(r"[^A-Z0-9]", "", (initials or "").upper())
    if len(code) < 2:
        code = "".join(word[0] for word in re.findall(r"[A-Za-z0-9]+", name)).upper()
    return code[:10]


def unique_org_error(error: sqlite3.IntegrityError) -> ValueError:
    if "fbrp_org" in str(error):
        return ValueError("That FBRP organization is already linked to another department.")
    return ValueError("A department with that name already exists.")


class DepartmentsCog(DeptCog):
    dept = app_commands.Group(name="dept", description="Create and manage departments")

    def __init__(self, bot, sheet: SheetApi | None = None):
        super().__init__(bot)
        self.sheet = sheet or SheetApi()

    async def _sheet_add(self, interaction, row: dict, *, category: str, folder_link, handpicked: bool, restricted: bool) -> str:
        """Add the department to the email database. Returns a line for the reply; never fails the command."""
        code = sheet_code(row.get("initials"), row["name"])
        if len(code) < 2:
            return "Email database: not added, give `initials` of at least 2 letters or numbers."
        try:
            data = await self.sheet.call(
                "deptAdd", code=code, name=row["name"], category=category, handpicked=handpicked,
                restricted=restricted, folderLink=folder_link or "",
                hcRole=str(row["command_role_id"] or ""), memberRole=str(row["base_role_id"] or ""),
                byName=str(interaction.user), byId=str(interaction.user.id),
            )
        except SheetApiError as error:
            return f"Email database: not added ({error})"
        if not data.get("ok"):
            return f"Email database: not added ({data.get('error', 'rejected')})"
        await email_log(
            self.bot, interaction.guild, "Department added",
            f"{interaction.user.mention} added **{row['name']}** as `{code}` with its own tab.",
            color=discord.Color.green(), fields={"Category": category},
        )
        return f"Email database: added as `{code}` with its own tab."

    async def _sheet_remove(self, interaction, row: dict, *, launched: bool = False) -> str:
        refs = [value for value in (row.get("initials"), row["name"]) if value]
        data: dict = {}
        try:
            for ref in refs:
                data = await self.sheet.call(
                    "deptRemove", code=ref, byName=str(interaction.user), byId=str(interaction.user.id)
                )
                if data.get("ok") or "Unknown department" not in str(data.get("error", "")):
                    break
        except SheetApiError as error:
            return f"Email database: not archived ({error})"
        if data.get("ok"):
            await email_log(
                self.bot, interaction.guild,
                "Department launched" if launched else "Department removed",
                (f"**{row['name']}** was launched; its tab was archived and `/email` no longer works for it."
                 if launched else f"{interaction.user.mention} removed **{row['name']}**; its tab was archived."),
                color=discord.Color.green() if launched else discord.Color.red(),
                fields={"Member records kept": str(data.get("members", 0))},
            )
            return f"Email database: tab archived ({data.get('members', 0)} member record(s) kept)."
        if "Unknown department" in str(data.get("error", "")):
            return "Email database: it was not in there."
        return f"Email database: not archived ({data.get('error', 'rejected')})"

    async def _place_under_divider(self, guild: discord.Guild, category: str, roles: list[discord.Role]) -> None:
        """Move new roles just under their category divider so they sit with the other departments."""
        divider = guild.get_role(self.bot.config.category_member_role_ids.get(category, 0))
        if divider is None:
            return
        try:
            await guild.edit_role_positions({role: max(1, divider.position - 1) for role in roles})
        except (discord.Forbidden, discord.HTTPException):
            log.warning("Could not move new department roles under %s", divider.name)

    async def _post_movement(self, interaction: discord.Interaction, department_id: int, action: str, org=None) -> None:
        row = await self.db.fetch_one("SELECT * FROM departments WHERE id=?", (department_id,))
        if row is None or interaction.guild is None:
            return
        embed = department_movement_embed(self.bot, interaction.guild, dict(row), action, interaction.user, org)
        await send_to(interaction.guild, self.bot.config.movement_channel_id, embed=embed)

    @dept.command(name="create", description="Create a new department and its Discord roles")
    @manager_only
    @app_commands.choices(category=CATEGORY_CHOICES)
    @app_commands.describe(
        name="Full department name, e.g. Los Santos Police Department",
        initials="Short name used in role names, e.g. LSPD",
        color="Role color as hex, e.g. #206694",
        head="Department head (owner)",
        org_id="FBRP organization ID or slug, used for the hours integration",
    )
    async def dept_create(
        self,
        interaction: discord.Interaction,
        name: str,
        category: app_commands.Choice[str],
        initials: str,
        color: str,
        head: discord.Member | None = None,
        org_id: str | None = None,
    ) -> None:
        guild = require_guild(interaction)
        await interaction.response.defer(ephemeral=True)
        name = clean_text(name, 80)
        initials = clean_text(initials, 12).upper()
        role_color = discord.Color(parse_color(color))
        org = await self.service.validate_org_link(org_id)
        config = self.bot.config
        reason = f"Department created by {interaction.user}"
        base_role = await guild.create_role(name=config.base_role_format.format(initials=initials, name=name)[:100], color=role_color, reason=reason)
        command_role = await guild.create_role(name=config.command_role_format.format(initials=initials, name=name)[:100], color=role_color, reason=reason)
        try:
            department_id = await self.service.create(
                guild.id, name, category.value,
                initials=initials,
                role_color=role_color.value,
                base_role_id=base_role.id,
                command_role_id=command_role.id,
                head_id=head.id if head else None,
                fbrp_org_id=str(org["id"]) if org else None,
                created_by=interaction.user.id,
            )
        except Exception as error:
            await base_role.delete(reason="Rolling back failed department creation")
            await command_role.delete(reason="Rolling back failed department creation")
            if isinstance(error, sqlite3.IntegrityError):
                raise unique_org_error(error) from None
            raise
        await self._place_under_divider(guild, category.value, [base_role, command_role])
        if head:
            self.bot.mark_managed("add", guild.id, head.id, base_role.id)
            await head.add_roles(base_role, command_role, reason=f"Department head of {name}")
        await self.service.log(guild.id, "department", "created", actor_id(interaction), name)
        await self._post_movement(interaction, department_id, "Created", org)
        await refresh_panels(self.bot, guild, "hours")
        await reply(
            interaction,
            f"Created **{name}** with {base_role.mention} and {command_role.mention}."
            + ("" if org else " Link its FBRP org with `/dept update org_id:` to track hours."),
        )

    @dept.command(name="add", description="Register a department and its roles (also adds it to the email database)")
    @launch_or_manager
    @app_commands.choices(category=CATEGORY_CHOICES, email_category=SHEET_CATEGORY_CHOICES)
    @app_commands.describe(
        org_id="FBRP organization ID or slug, used for the hours integration",
        folder_link="Google Drive folder for the department's documents (email database)",
        email_category="Email database category (defaults from the department category)",
        handpicked="Members wait for Coordination approval (email database)",
        restricted="Hide the folder from Full Access sharing (email database)",
    )
    async def dept_add(
        self,
        interaction: discord.Interaction,
        name: str,
        category: app_commands.Choice[str],
        base_role: discord.Role,
        command_role: discord.Role,
        head: discord.Member | None = None,
        org_id: str | None = None,
        initials: str | None = None,
        folder_link: str | None = None,
        email_category: app_commands.Choice[str] | None = None,
        handpicked: bool = False,
        restricted: bool = False,
    ) -> None:
        guild = require_guild(interaction)
        if base_role.id == command_role.id:
            raise ValueError("The department role and high command role must be different.")
        await interaction.response.defer(ephemeral=True)
        name = clean_text(name, 80)
        org = await self.service.validate_org_link(org_id)
        try:
            department_id = await self.service.create(
                guild.id, name, category.value,
                initials=clean_text(initials, 12).upper() if initials else None,
                role_color=base_role.color.value,
                base_role_id=base_role.id,
                command_role_id=command_role.id,
                head_id=head.id if head else None,
                fbrp_org_id=str(org["id"]) if org else None,
                created_by=interaction.user.id,
            )
        except sqlite3.IntegrityError as error:
            raise unique_org_error(error) from None
        await self.service.log(guild.id, "department", "added", actor_id(interaction), name)
        await self._post_movement(interaction, department_id, "Registered", org)
        await refresh_panels(self.bot, guild, "hours")
        row = dict(await self.db.fetch_one("SELECT * FROM departments WHERE id=?", (department_id,)))
        sheet_line = await self._sheet_add(
            interaction, row,
            category=email_category.value if email_category else SHEET_CATEGORY_DEFAULTS[category.value],
            folder_link=folder_link, handpicked=handpicked or category.value == "Handpicked", restricted=restricted,
        )
        await reply(interaction, f"Registered **{name}** ({base_role.mention} / {command_role.mention}).\n{sheet_line}")

    @dept.command(name="join", description="Put a member into a department")
    @app_commands.autocomplete(department=department_autocomplete)
    async def dept_join(self, interaction: discord.Interaction, member: discord.Member, department: str) -> None:
        guild = require_guild(interaction)
        row = await self.service.department(guild.id, department)
        role = guild.get_role(row["base_role_id"] or 0)
        if role is None:
            raise ValueError(f"{row['name']} has no department role.")
        members = self.bot.get_cog("MembersCog")
        await members.role_add.callback(members, interaction, role, member)

    @dept.command(name="leave", description="Take a member out of a department")
    @app_commands.autocomplete(department=department_autocomplete)
    @app_commands.choices(reason=[
        app_commands.Choice(name="Resigned", value="Resigned"),
        app_commands.Choice(name="Terminated", value="Terminated"),
        app_commands.Choice(name="Removed (no cooldown)", value="Removed"),
    ])
    async def dept_leave(
        self, interaction: discord.Interaction, member: discord.Member, department: str, reason: app_commands.Choice[str]
    ) -> None:
        guild = require_guild(interaction)
        row = await self.service.department(guild.id, department)
        role = guild.get_role(row["base_role_id"] or 0)
        if role is None:
            raise ValueError(f"{row['name']} has no department role.")
        members = self.bot.get_cog("MembersCog")
        await members.role_remove.callback(members, interaction, role, member, reason)

    @dept.command(name="update", description="Update department details")
    @manager_only
    @app_commands.choices(category=CATEGORY_CHOICES)
    @app_commands.autocomplete(department=department_autocomplete)
    @app_commands.describe(
        org_id="FBRP organization ID or slug for the hours integration",
        unlink_org="Remove the linked FBRP organization",
        hide_from_leaderboard="Hide this department from the hours leaderboard",
    )
    async def dept_update(
        self,
        interaction: discord.Interaction,
        department: str,
        new_name: str | None = None,
        category: app_commands.Choice[str] | None = None,
        initials: str | None = None,
        head: discord.Member | None = None,
        org_id: str | None = None,
        unlink_org: bool = False,
        base_role: discord.Role | None = None,
        command_role: discord.Role | None = None,
        hide_from_leaderboard: bool | None = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self.service.department(guild_id(interaction), department)
        if org_id and unlink_org:
            raise ValueError("Choose either `org_id` or `unlink_org`, not both.")
        org = await self.service.validate_org_link(org_id)
        values = {
            "name": clean_text(new_name, 80) if new_name else None,
            "category": category.value if category else None,
            "initials": clean_text(initials, 12).upper() if initials else None,
            "head_id": head.id if head else None,
            "fbrp_org_id": "" if unlink_org else (str(org["id"]) if org else None),
            "base_role_id": base_role.id if base_role else None,
            "command_role_id": command_role.id if command_role else None,
            "hide_leaderboard": int(hide_from_leaderboard) if hide_from_leaderboard is not None else None,
        }
        updates = [(key, value) for key, value in values.items() if value is not None]
        if not updates:
            raise ValueError("Provide at least one field to update.")
        sql = ",".join(f"{key}=?" for key, _ in updates)
        try:
            await self.db.execute(
                f"UPDATE departments SET {sql},updated_at=CURRENT_TIMESTAMP WHERE id=?",
                [value for _, value in updates] + [row["id"]],
            )
        except sqlite3.IntegrityError as error:
            raise unique_org_error(error) from None
        await self.service.log(guild_id(interaction), "department", "updated", actor_id(interaction), row["name"], sql)
        if org and str(org["id"]) != (row["fbrp_org_id"] or ""):
            await self._post_movement(interaction, row["id"], "Org Linked", org)
        elif unlink_org and row["fbrp_org_id"]:
            await self._post_movement(interaction, row["id"], "Org Unlinked")
        await refresh_panels(self.bot, interaction.guild, "hours")
        await reply(interaction, f"Updated **{values['name'] or row['name']}**.")

    @dept.command(name="status", description="Change a department's status and announce it")
    @manager_only
    @app_commands.choices(status=STATUS_CHOICES)
    @app_commands.autocomplete(department=department_autocomplete)
    async def dept_status(
        self,
        interaction: discord.Interaction,
        department: str,
        status: app_commands.Choice[str],
        note: str | None = None,
    ) -> None:
        guild = require_guild(interaction)
        await interaction.response.defer(ephemeral=True)
        row = await self.service.department(guild.id, department)
        if row["status"] == status.value:
            raise ValueError(f"**{row['name']}** is already `{status.value}`.")
        await self.db.execute(
            "UPDATE departments SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (status.value, row["id"])
        )
        await self.service.log(guild.id, "department", "status", actor_id(interaction), row["name"], status.value)
        base = f"<@&{row['base_role_id']}>" if row["base_role_id"] else f"**{row['name']}**"
        embed = discord.Embed(
            title=f"{row['name']} · {status.value}",
            description=f"{base} --> {status.value} | {today()} | {interaction.user.mention}",
            color=STATUS_COLORS[status.value],
            timestamp=datetime.now(UTC),
        )
        embed.add_field(name="Previous status", value=row["status"])
        embed.add_field(name="Category", value=row["category"])
        if note:
            embed.add_field(name="Note", value=clean_text(note, 1000), inline=False)
        await send_to(guild, self.bot.config.status_channel_id, embed=embed)
        await refresh_panels(self.bot, guild, "hours")
        text = f"**{row['name']}** is now `{status.value}`."
        if status.value == "Launched":
            # A launched department runs on its own systems: leave the email database for good.
            text += "\n" + await self._sheet_remove(interaction, row, launched=True)
            text += f"\n`/email` commands are now closed for **{row['name']}**."
        await reply(interaction, text)

    @dept.command(name="info", description="Show a department's details")
    @coordinator_only
    @app_commands.autocomplete(department=department_autocomplete)
    async def dept_info(self, interaction: discord.Interaction, department: str) -> None:
        row = await self.service.department(guild_id(interaction), department)
        guild = require_guild(interaction)
        base = guild.get_role(row["base_role_id"] or 0)
        embed = discord.Embed(title=row["name"], description=row["category"], color=row["role_color"])
        embed.add_field(name="Status", value=row["status"])
        embed.add_field(name="Initials", value=row["initials"] or "—")
        embed.add_field(name="Department Head", value=f"<@{row['head_id']}>" if row["head_id"] else "—")
        embed.add_field(name="Department role", value=base.mention if base else "Missing")
        embed.add_field(name="High Command", value=f"<@&{row['command_role_id']}>" if row["command_role_id"] else "—")
        embed.add_field(name="Members", value=f"{len(base.members):,}" if base else "—")
        embed.add_field(name="FBRP Org ID", value=f"`{row['fbrp_org_id']}`" if row["fbrp_org_id"] else "Not linked")
        embed.add_field(name="Hours leaderboard", value="Hidden" if row["hide_leaderboard"] else "Shown")
        embed.set_footer(text=f"Registered {row['created_at']} UTC")
        await reply(interaction, embed=embed)

    @dept.command(name="list", description="List every registered department")
    @coordinator_only
    async def dept_list(self, interaction: discord.Interaction) -> None:
        rows = await self.service.all(guild_id(interaction))
        embed = discord.Embed(title="Registered Departments", color=discord.Color.blurple())
        for category in DEPARTMENT_CATEGORIES:
            lines = [
                f"<@&{row['base_role_id']}> · {row['status']}" + (" · org linked" if row["fbrp_org_id"] else "")
                for row in rows
                if row["category"] == category
            ]
            if lines:
                embed.add_field(name=category, value="\n".join(lines)[:1024], inline=False)
        embed.description = None if rows else "No departments are registered yet."
        embed.set_footer(text=f"{len(rows)} department(s)")
        await reply(interaction, embed=embed)

    @dept.command(name="hours", description="Show in-game duty hours for a department's linked FBRP org")
    @app_commands.autocomplete(department=department_autocomplete)
    async def dept_hours(
        self,
        interaction: discord.Interaction,
        department: str,
        days: app_commands.Range[int, 1, 90] = 7,
        member: discord.Member | None = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self.service.department(guild_id(interaction), department)
        await require_department_access(interaction, row)
        if not row["fbrp_org_id"]:
            raise ValueError("This department has no FBRP org linked. Set one with `/dept update org_id:`.")
        until = int(datetime.now(UTC).timestamp() * 1000)
        try:
            data = await FbrpApi().hours(row["fbrp_org_id"], until - days * 86_400_000, until, member.id if member else None)
        except FbrpApiError as error:
            raise ValueError(str(error)) from None
        lines = [format_hours_line(rank, item) for rank, item in enumerate(data["members"][:25], 1)]
        embed = discord.Embed(title=f"{row['name']} duty hours", color=row["role_color"])
        embed.description = "\n".join(lines) or "No duty time recorded."
        embed.set_footer(text=f"Last {days} days · {data['org']['name']} · total {duration(data['totalSeconds'])}")
        await reply(interaction, embed=embed)

    @dept.command(name="role", description="Change a department's role color")
    @manager_only
    @app_commands.autocomplete(department=department_autocomplete)
    async def dept_role(self, interaction: discord.Interaction, department: str, color: str) -> None:
        guild = require_guild(interaction)
        row = await self.service.department(guild.id, department)
        value = parse_color(color)
        for key in ("base_role_id", "command_role_id"):
            role = guild.get_role(row[key] or 0)
            if role:
                await role.edit(color=discord.Color(value), reason=f"Changed by {interaction.user}")
        await self.db.execute("UPDATE departments SET role_color=? WHERE id=?", (value, row["id"]))
        await reply(interaction, f"Updated **{row['name']}** role color to `#{value:06X}`.")

    @dept.command(name="remove", description="Remove a department record and archive its email database tab")
    @launch_or_manager
    @app_commands.autocomplete(department=department_autocomplete)
    async def dept_remove(self, interaction: discord.Interaction, department: str) -> None:
        guild = require_guild(interaction)
        row = await self.service.department(guild.id, department)
        if not await confirm_action(
            interaction,
            f"Remove **{row['name']}**? Its email database tab is archived and sharing is revoked. Discord roles are kept.",
        ):
            return
        await self.db.execute("DELETE FROM departments WHERE id=?", (row["id"],))
        await self.service.log(guild.id, "department", "removed", actor_id(interaction), row["name"])
        base = f"<@&{row['base_role_id']}>" if row["base_role_id"] else f"**{row['name']}**"
        await send_to(
            guild, self.bot.config.movement_channel_id,
            f"{base} --> Removed ({row['category']}) | {today()} | {interaction.user.mention}",
        )
        await refresh_panels(self.bot, guild, "hours")
        sheet_line = await self._sheet_remove(interaction, row)
        await reply(interaction, f"Removed **{row['name']}**. Discord roles were left untouched.\n{sheet_line}")
