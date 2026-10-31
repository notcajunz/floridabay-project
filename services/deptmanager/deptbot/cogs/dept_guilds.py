"""Commands inside department Discord servers.

`/dept add guild_id:` links a department to its own Discord server. Once the bot is in that server
it gets these commands there (and only there):

- `/role add|remove` give and take roles, `/role view` shows who holds a role and who may give it,
  `/role create` makes a coloured role (Department Management, the Launch Group, server admins).
- `/request role` asks for a role; the request is posted with Approve/Deny buttons.
- `/roleperms` (Department Management only) sets who can or cannot give each role, the all-role
  permission, and the channel requests go to.

Department Management is the Hub's manager level (Assistant Department Manager and up), the owners
and network management. Their Hub roles are read from the Hub, so the rules are the same everywhere.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Union

import discord
from discord import app_commands
from discord.ext import commands

from ..common import DeptCog, meets_level, reply, send_to
from ..dept_roles import ALL_ROLES, describe_rule, grant_decision, role_problem
from ..services import parse_color

log = logging.getLogger(__name__)

REQUEST_CHANNEL_KEY = "role_request_channel"
ACCESS_CHOICES = [
    app_commands.Choice(name="Allow", value="allow"),
    app_commands.Choice(name="Deny", value="deny"),
]
Subject = Union[discord.Member, discord.Role]


def bot_invite_url(application_id: int, guild_id: int) -> str:
    """Invite link that adds the bot straight to one department server."""
    permissions = discord.Permissions(
        view_channel=True, send_messages=True, embed_links=True, read_message_history=True,
        manage_roles=True, create_instant_invite=True,
    )
    return discord.utils.oauth_url(
        application_id, permissions=permissions, guild=discord.Object(id=guild_id),
        disable_guild_select=True, scopes=("bot", "applications.commands"),
    )


def hub_member(bot, user_id: int) -> discord.Member | None:
    guild = bot.get_guild(bot.config.guild_id) if bot.config.guild_id else None
    return guild.get_member(user_id) if guild else None


def is_dept_management(bot, user_id: int) -> bool:
    """Owners, network management, Hub administrators and the Hub's manager level."""
    config = bot.config
    if user_id in config.owner_ids:
        return True
    member = hub_member(bot, user_id)
    if member is None:
        return False
    role_ids = {role.id for role in member.roles}
    return (
        member.guild_permissions.administrator
        or bool(role_ids.intersection(config.bypass_role_ids))
        or meets_level(member, config, "manager")
    )


def is_launch_team(bot, user_id: int) -> bool:
    member = hub_member(bot, user_id)
    role_id = bot.config.launch_group_role_id
    return bool(member and role_id and any(role.id == role_id for role in member.roles))


def is_server_admin(member: discord.Member) -> bool:
    return member.guild.owner_id == member.id or member.guild_permissions.administrator


def subject_parts(subject: Subject) -> tuple[str, int]:
    return ("role", subject.id) if isinstance(subject, discord.Role) else ("user", subject.id)


class RoleRequestButton(
    discord.ui.DynamicItem[discord.ui.Button], template=r"deptreq:(?P<action>approve|deny):(?P<id>[0-9]{1,12})"
):
    """Approve/Deny on a posted role request. Survives restarts: the request id is in the custom id."""

    def __init__(self, action: str, request_id: int):
        approve = action == "approve"
        super().__init__(
            discord.ui.Button(
                label="Approve" if approve else "Deny",
                style=discord.ButtonStyle.success if approve else discord.ButtonStyle.danger,
                custom_id=f"deptreq:{action}:{request_id}",
            )
        )
        self.action = action
        self.request_id = request_id

    @classmethod
    async def from_custom_id(cls, interaction: discord.Interaction, item: discord.ui.Button, match):
        return cls(match["action"], int(match["id"]))

    async def callback(self, interaction: discord.Interaction) -> None:
        cog = interaction.client.get_cog("DeptGuildsCog")
        try:
            await cog.review_request(interaction, self.request_id, self.action)
        except (ValueError, app_commands.CheckFailure, discord.HTTPException) as error:
            message = str(error) if not isinstance(error, discord.Forbidden) else (
                "Discord refused that. Check the bot's role is above the role being given."
            )
            if interaction.response.is_done():
                await interaction.followup.send(message, ephemeral=True)
            else:
                await interaction.response.send_message(message, ephemeral=True)


def request_view(request_id: int) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(RoleRequestButton("approve", request_id))
    view.add_item(RoleRequestButton("deny", request_id))
    return view


class RoleGroup(app_commands.Group):
    def __init__(self, cog: "DeptGuildsCog"):
        super().__init__(name="role", description="Give, take and look up roles in this department server")
        self.cog = cog

    @app_commands.command(name="add", description="Give a member a role")
    async def add(self, interaction: discord.Interaction, member: discord.Member, role: discord.Role, reason: str | None = None) -> None:
        await self.cog.change_role(interaction, member, role, add=True, reason=reason)

    @app_commands.command(name="remove", description="Take a role from a member")
    async def remove(self, interaction: discord.Interaction, member: discord.Member, role: discord.Role, reason: str | None = None) -> None:
        await self.cog.change_role(interaction, member, role, add=False, reason=reason)

    @app_commands.command(name="view", description="See who holds a role and who may give it")
    async def view(self, interaction: discord.Interaction, role: discord.Role) -> None:
        await self.cog.view_role(interaction, role)

    @app_commands.command(name="create", description="Create a coloured role (Department Management, Launch Group, server admins)")
    @app_commands.describe(color="Hex colour, e.g. #206694", hoist="Show members separately in the member list")
    async def create(
        self, interaction: discord.Interaction, name: str, color: str,
        hoist: bool = False, mentionable: bool = False,
    ) -> None:
        await self.cog.create_role(interaction, name, color, hoist=hoist, mentionable=mentionable)


class RequestGroup(app_commands.Group):
    def __init__(self, cog: "DeptGuildsCog"):
        super().__init__(name="request", description="Ask for something in this department server")
        self.cog = cog

    @app_commands.command(name="role", description="Ask for a role; it is posted for approval")
    async def role(self, interaction: discord.Interaction, role: discord.Role, reason: str | None = None) -> None:
        await self.cog.request_role(interaction, role, reason)


class RolePermsGroup(app_commands.Group):
    def __init__(self, cog: "DeptGuildsCog"):
        super().__init__(name="roleperms", description="Department Management: who may give which roles here")
        self.cog = cog

    @app_commands.command(name="set", description="Allow or deny a member or role giving one specific role")
    @app_commands.choices(access=ACCESS_CHOICES)
    @app_commands.describe(role="The role being given", who="Member or role the rule is for")
    async def set(self, interaction: discord.Interaction, role: discord.Role, who: Subject, access: app_commands.Choice[str]) -> None:
        await self.cog.set_rule(interaction, role.id, who, access.value == "allow")

    @app_commands.command(name="all", description="Allow or deny a member or role giving every role (all-role permission)")
    @app_commands.choices(access=ACCESS_CHOICES)
    async def all(self, interaction: discord.Interaction, who: Subject, access: app_commands.Choice[str]) -> None:
        await self.cog.set_rule(interaction, ALL_ROLES, who, access.value == "allow")

    @app_commands.command(name="clear", description="Remove a rule (leave role empty for the all-role rule)")
    async def clear(self, interaction: discord.Interaction, who: Subject, role: discord.Role | None = None) -> None:
        await self.cog.clear_rule(interaction, role.id if role else ALL_ROLES, who)

    @app_commands.command(name="list", description="Show the role permission rules of this server")
    async def list(self, interaction: discord.Interaction, role: discord.Role | None = None) -> None:
        await self.cog.list_rules(interaction, role)

    @app_commands.command(name="requests", description="Set the channel /request role posts to")
    async def requests(self, interaction: discord.Interaction, channel: discord.TextChannel) -> None:
        await self.cog.set_request_channel(interaction, channel)


class DeptGuildsCog(DeptCog):
    def __init__(self, bot):
        super().__init__(bot)
        self.groups = (RoleGroup(self), RequestGroup(self), RolePermsGroup(self))

    async def cog_load(self) -> None:
        self.bot.add_dynamic_items(RoleRequestButton)

    # registration ------------------------------------------------------------------------------

    def register(self, guild_id: int) -> None:
        target = discord.Object(id=guild_id)
        for group in self.groups:
            self.bot.tree.add_command(group, guild=target, override=True)

    async def sync_guild(self, guild_id: int) -> bool:
        """Push this server's commands. False while the bot has not been added to it yet."""
        try:
            await self.bot.tree.sync(guild=discord.Object(id=guild_id))
            return True
        except discord.Forbidden:
            return False
        except discord.HTTPException:
            log.exception("Could not sync commands to department server %s", guild_id)
            return False

    async def sync_all(self) -> None:
        for guild_id in sorted(self.bot.linked_guild_ids):
            self.register(guild_id)
            await self.sync_guild(guild_id)

    async def link(self, guild_id: int) -> bool:
        """Start serving a newly linked department server. True when the bot is already in it."""
        self.bot.linked_guild_ids.add(guild_id)
        self.register(guild_id)
        if self.bot.get_guild(guild_id) is None:
            return False
        return await self.sync_guild(guild_id)

    async def unlink(self, guild_id: int) -> None:
        target = discord.Object(id=guild_id)
        for group in self.groups:
            self.bot.tree.remove_command(group.name, guild=target)
        if self.bot.get_guild(guild_id) is not None:
            await self.sync_guild(guild_id)
        self.bot.linked_guild_ids.discard(guild_id)

    @commands.Cog.listener()
    async def on_guild_join(self, guild: discord.Guild) -> None:
        if guild.id not in self.bot.linked_guild_ids:
            return
        self.register(guild.id)
        synced = await self.sync_guild(guild.id)
        department = await self.service.department_for_guild(guild.id)
        hub = self.bot.get_guild(self.bot.config.guild_id) if self.bot.config.guild_id else None
        if hub and department:
            await send_to(
                hub, self.bot.config.movement_channel_id,
                f"**{department['name']}** · the bot joined its Discord **{discord.utils.escape_markdown(guild.name)}** (`{guild.id}`)."
                + ("" if synced else " Its commands could not be synced yet."),
            )

    # checks ------------------------------------------------------------------------------------

    async def department_here(self, interaction: discord.Interaction) -> dict:
        department = await self.service.department_for_guild(interaction.guild_id or 0)
        if department is None or not isinstance(interaction.user, discord.Member):
            raise ValueError("This server is not linked to a department. Link it with `/dept add guild_id:` in the Department Hub.")
        return department

    def require_management(self, interaction: discord.Interaction) -> None:
        if not is_dept_management(self.bot, interaction.user.id):
            raise app_commands.CheckFailure("Only Department Management can change role permissions.")

    async def rules(self, guild_id: int, role_id: int | None = None) -> list[dict]:
        if role_id is None:
            rows = await self.db.fetch_all(
                "SELECT * FROM dept_role_perms WHERE guild_id=? ORDER BY role_id,subject_type,subject_id", (guild_id,)
            )
        else:
            rows = await self.db.fetch_all(
                "SELECT * FROM dept_role_perms WHERE guild_id=? AND role_id IN (?,?) ORDER BY role_id DESC,subject_type DESC",
                (guild_id, role_id, ALL_ROLES),
            )
        return [dict(row) for row in rows]

    async def require_can_give(self, interaction: discord.Interaction, role: discord.Role, *, self_target: bool = False) -> None:
        """Department Management and server admins give any role; everyone else follows /roleperms."""
        guild = interaction.guild
        member = interaction.user
        problem = role_problem(role, guild.me.top_role.position if guild.me else 0)
        if problem:
            raise ValueError(problem)
        if is_dept_management(self.bot, member.id) or is_server_admin(member):
            return
        if role.permissions.administrator:
            raise app_commands.CheckFailure("Only Department Management or server administrators can give a role with Administrator.")
        if self_target:
            raise app_commands.CheckFailure("You cannot approve or change your own roles. Ask someone else who can give it.")
        decision = grant_decision(await self.rules(guild.id, role.id), role.id, member.id, [r.id for r in member.roles])
        if not decision:
            raise app_commands.CheckFailure(
                f"You are not allowed to give {role.mention}. Department Management sets this with `/roleperms`."
            )
        if role >= member.top_role:
            raise app_commands.CheckFailure("You can only give roles below your own highest role.")

    # commands ----------------------------------------------------------------------------------

    async def change_role(self, interaction: discord.Interaction, member: discord.Member, role: discord.Role, *, add: bool, reason: str | None) -> None:
        department = await self.department_here(interaction)
        await self.require_can_give(interaction, role, self_target=member.id == interaction.user.id)
        if add and role in member.roles:
            raise ValueError(f"{member.mention} already has {role.mention}.")
        if not add and role not in member.roles:
            raise ValueError(f"{member.mention} does not have {role.mention}.")
        note = f"{'Given' if add else 'Removed'} by {interaction.user} via /role" + (f": {reason[:200]}" if reason else "")
        if add:
            await member.add_roles(role, reason=note)
        else:
            await member.remove_roles(role, reason=note)
        await self.service.log(
            interaction.guild_id, "dept_role", "add" if add else "remove", interaction.user.id,
            str(member.id), f"{department['name']}: {role.id}",
        )
        await reply(interaction, f"{'Gave' if add else 'Removed'} {role.mention} {'to' if add else 'from'} {member.mention}.")

    async def view_role(self, interaction: discord.Interaction, role: discord.Role) -> None:
        await self.department_here(interaction)
        holders = sorted(role.members, key=lambda m: m.display_name.lower())
        embed = discord.Embed(title=role.name, color=role.color, timestamp=datetime.now(UTC))
        embed.add_field(name="Members", value=f"{len(holders):,}")
        embed.add_field(name="Position", value=str(role.position))
        embed.add_field(name="Created", value=discord.utils.format_dt(role.created_at, "D"))
        shown = " ".join(member.mention for member in holders[:60])
        if len(holders) > 60:
            shown += f" … and {len(holders) - 60:,} more"
        embed.add_field(name="Held by", value=shown[:1024] or "Nobody", inline=False)
        rules = [rule for rule in await self.rules(interaction.guild_id, role.id)]
        embed.add_field(
            name="Who may give it",
            value="\n".join(describe_rule(rule) for rule in rules)[:1024]
            or "Department Management and server admins only.",
            inline=False,
        )
        pending = await self.db.fetch_one(
            "SELECT COUNT(*) n FROM dept_role_requests WHERE guild_id=? AND role_id=? AND status='pending'",
            (interaction.guild_id, role.id),
        )
        embed.set_footer(text=f"Role ID {role.id} · {pending['n']} pending request(s)")
        await reply(interaction, embed=embed)

    async def create_role(self, interaction: discord.Interaction, name: str, color: str, *, hoist: bool, mentionable: bool) -> None:
        department = await self.department_here(interaction)
        user = interaction.user
        if not (is_dept_management(self.bot, user.id) or is_launch_team(self.bot, user.id) or is_server_admin(user)):
            raise app_commands.CheckFailure("Only Department Management, the Launch Group or server admins can create roles.")
        name = name.strip()[:100]
        if not name:
            raise ValueError("Give the role a name.")
        role = await interaction.guild.create_role(
            name=name, color=discord.Color(parse_color(color)), hoist=hoist, mentionable=mentionable,
            reason=f"Created by {user} via /role create",
        )
        await self.service.log(interaction.guild_id, "dept_role", "create", user.id, str(role.id), department["name"])
        await reply(interaction, f"Created {role.mention}.")

    async def request_role(self, interaction: discord.Interaction, role: discord.Role, reason: str | None) -> None:
        await self.department_here(interaction)
        guild = interaction.guild
        member = interaction.user
        problem = role_problem(role, guild.me.top_role.position if guild.me else 0)
        if problem:
            raise ValueError(problem)
        if role.permissions.administrator:
            raise ValueError("Roles with Administrator cannot be requested.")
        if role in member.roles:
            raise ValueError(f"You already have {role.mention}.")
        if await self.db.fetch_one(
            "SELECT 1 FROM dept_role_requests WHERE guild_id=? AND member_id=? AND role_id=? AND status='pending'",
            (guild.id, member.id, role.id),
        ):
            raise ValueError(f"You already have a pending request for {role.mention}.")
        channel_id = int(await self.service.setting(guild.id, REQUEST_CHANNEL_KEY, "0") or 0)
        channel = guild.get_channel(channel_id)
        if not isinstance(channel, discord.TextChannel):
            raise ValueError("Role requests are not set up here yet. Department Management sets the channel with `/roleperms requests`.")
        reason = (reason or "").strip()[:500] or None
        request_id = await self.db.execute(
            "INSERT INTO dept_role_requests(guild_id,member_id,role_id,reason,channel_id) VALUES(?,?,?,?,?)",
            (guild.id, member.id, role.id, reason, channel.id),
        )
        embed = self.request_embed(member.id, role, reason, "Pending")
        try:
            message = await channel.send(embed=embed, view=request_view(request_id), allowed_mentions=discord.AllowedMentions.none())
        except discord.HTTPException:
            await self.db.execute("DELETE FROM dept_role_requests WHERE id=?", (request_id,))
            raise ValueError(f"The bot cannot post in {channel.mention}. Ask Department Management to fix its permissions.") from None
        await self.db.execute("UPDATE dept_role_requests SET message_id=? WHERE id=?", (message.id, request_id))
        await reply(interaction, f"Your request for {role.mention} was posted in {channel.mention}.")

    @staticmethod
    def request_embed(member_id: int, role: discord.Role, reason: str | None, status: str, reviewer_id: int | None = None) -> discord.Embed:
        colors = {"Pending": discord.Color.orange(), "Approved": discord.Color.green(), "Denied": discord.Color.red()}
        embed = discord.Embed(title=f"Role request · {status}", color=colors.get(status, discord.Color.dark_grey()), timestamp=datetime.now(UTC))
        embed.add_field(name="Member", value=f"<@{member_id}>")
        embed.add_field(name="Role", value=role.mention if role else "Deleted role")
        if reviewer_id:
            embed.add_field(name="Reviewed by", value=f"<@{reviewer_id}>")
        embed.add_field(name="Reason", value=reason or "No reason given", inline=False)
        return embed

    async def review_request(self, interaction: discord.Interaction, request_id: int, action: str) -> None:
        row = await self.db.fetch_one("SELECT * FROM dept_role_requests WHERE id=? AND guild_id=?", (request_id, interaction.guild_id or 0))
        if row is None or row["status"] != "pending":
            raise ValueError("That request was already handled.")
        guild = interaction.guild
        role = guild.get_role(row["role_id"])
        if role is None:
            await self.db.execute("UPDATE dept_role_requests SET status='cancelled' WHERE id=?", (request_id,))
            raise ValueError("That role no longer exists.")
        await self.require_can_give(interaction, role, self_target=row["member_id"] == interaction.user.id)
        member = guild.get_member(row["member_id"])
        if member is None:
            try:
                member = await guild.fetch_member(row["member_id"])
            except discord.NotFound:
                member = None
        approve = action == "approve"
        if approve:
            if member is None:
                raise ValueError("That member is no longer in this server.")
            if role not in member.roles:
                await member.add_roles(role, reason=f"Role request #{request_id} approved by {interaction.user}")
        status = "approved" if approve else "denied"
        await self.db.execute(
            "UPDATE dept_role_requests SET status=?,reviewer_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'",
            (status, interaction.user.id, request_id),
        )
        await self.service.log(guild.id, "dept_role", f"request_{status}", interaction.user.id, str(row["member_id"]), str(role.id))
        embed = self.request_embed(row["member_id"], role, row["reason"], status.title(), interaction.user.id)
        await interaction.response.edit_message(embed=embed, view=None)
        if member is not None:
            text = (
                f"Your request for **{role.name}** in **{guild.name}** was "
                + ("approved." if approve else "denied.")
            )
            try:
                await member.send(text)
            except discord.HTTPException:
                pass

    async def set_rule(self, interaction: discord.Interaction, role_id: int, who: Subject, allowed: bool) -> None:
        await self.department_here(interaction)
        self.require_management(interaction)
        kind, subject_id = subject_parts(who)
        if role_id and role_id == interaction.guild_id:
            raise ValueError("@everyone cannot be given, so it needs no rule.")
        await self.db.execute(
            "INSERT INTO dept_role_perms(guild_id,role_id,subject_type,subject_id,allowed,set_by) VALUES(?,?,?,?,?,?) "
            "ON CONFLICT(guild_id,role_id,subject_type,subject_id) DO UPDATE SET allowed=excluded.allowed,"
            "set_by=excluded.set_by,updated_at=CURRENT_TIMESTAMP",
            (interaction.guild_id, role_id, kind, subject_id, int(allowed), interaction.user.id),
        )
        rule = {"role_id": role_id, "subject_type": kind, "subject_id": subject_id, "allowed": allowed}
        await self.service.log(interaction.guild_id, "dept_role", "perm_set", interaction.user.id, describe_rule(rule))
        await reply(interaction, f"Saved: {describe_rule(rule)}.")

    async def clear_rule(self, interaction: discord.Interaction, role_id: int, who: Subject) -> None:
        await self.department_here(interaction)
        self.require_management(interaction)
        kind, subject_id = subject_parts(who)
        removed = await self.db.execute_count(
            "DELETE FROM dept_role_perms WHERE guild_id=? AND role_id=? AND subject_type=? AND subject_id=?",
            (interaction.guild_id, role_id, kind, subject_id),
        )
        if not removed:
            raise ValueError("There was no such rule.")
        await self.service.log(interaction.guild_id, "dept_role", "perm_clear", interaction.user.id, f"{kind}:{subject_id} role:{role_id}")
        await reply(interaction, "Rule removed.")

    async def list_rules(self, interaction: discord.Interaction, role: discord.Role | None) -> None:
        department = await self.department_here(interaction)
        rules = await self.rules(interaction.guild_id, role.id if role else None)
        channel_id = int(await self.service.setting(interaction.guild_id, REQUEST_CHANNEL_KEY, "0") or 0)
        embed = discord.Embed(
            title=f"{department['name']} · role permissions" + (f" for {role.name}" if role else ""),
            description="\n".join(describe_rule(rule) for rule in rules)[:4000]
            or "No rules yet. Only Department Management and server admins can give roles.",
            color=discord.Color.blurple(),
        )
        embed.add_field(name="Request channel", value=f"<#{channel_id}>" if channel_id else "Not set (`/roleperms requests`)")
        embed.set_footer(text="A rule for a role beats the all-role rule; a rule for a member beats rules for their roles.")
        await reply(interaction, embed=embed)

    async def set_request_channel(self, interaction: discord.Interaction, channel: discord.TextChannel) -> None:
        await self.department_here(interaction)
        self.require_management(interaction)
        permissions = channel.permissions_for(interaction.guild.me)
        if not (permissions.view_channel and permissions.send_messages and permissions.embed_links):
            raise ValueError(f"The bot needs View Channel, Send Messages and Embed Links in {channel.mention}.")
        await self.service.set_setting(interaction.guild_id, REQUEST_CHANNEL_KEY, str(channel.id))
        await reply(interaction, f"`/request role` now posts to {channel.mention}.")
