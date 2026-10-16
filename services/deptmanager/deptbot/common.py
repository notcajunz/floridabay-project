from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

import discord
from discord import app_commands
from discord.ext import commands

from .constants import COORDINATOR_RANKS
from .services import DepartmentService

log = logging.getLogger(__name__)

_CUSTOM_EMOJI = re.compile(r"<a?:[A-Za-z0-9_]+:[0-9]+>")
_UNICODE_EMOJI = re.compile(
    "["
    "\U0001F000-\U0001FAFF"
    "\u2600-\u27BF"
    "]"
)


def without_emojis(value: str) -> str:
    """Remove Discord custom emoji markup and Unicode emoji characters."""
    value = _CUSTOM_EMOJI.sub("", value)
    value = _UNICODE_EMOJI.sub("", value)
    value = value.replace("\ufe0f", "").replace("\u200d", "").replace("\u20e3", "")
    return re.sub(r"[ \t]{2,}", " ", value)


def without_embed_emojis(embed: discord.Embed) -> discord.Embed:
    """Strip emojis from every user-visible text section of an embed."""
    if embed.title:
        embed.title = without_emojis(embed.title).strip()
    if embed.description:
        embed.description = without_emojis(embed.description).strip()
    if embed.author and embed.author.name:
        author = {"name": without_emojis(embed.author.name).strip()}
        if embed.author.url:
            author["url"] = embed.author.url
        if embed.author.icon_url:
            author["icon_url"] = embed.author.icon_url
        embed.set_author(**author)
    if embed.footer and embed.footer.text:
        footer = {"text": without_emojis(embed.footer.text).strip()}
        if embed.footer.icon_url:
            footer["icon_url"] = embed.footer.icon_url
        embed.set_footer(**footer)
    fields = [
        (
            without_emojis(field.name).strip(),
            without_emojis(field.value).strip(),
            field.inline,
        )
        for field in embed.fields
    ]
    if fields:
        embed.clear_fields()
        for name, value, inline in fields:
            embed.add_field(name=name or "\u200b", value=value or "\u200b", inline=inline)
    return embed


class DeptCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.db = bot.db  # type: ignore[attr-defined]
        self.service = DepartmentService(self.db)


def guild_id(interaction: discord.Interaction) -> int:
    if interaction.guild_id is None:
        raise app_commands.CheckFailure("This command can only be used in a server.")
    return interaction.guild_id


def actor_id(interaction: discord.Interaction) -> int:
    return interaction.user.id


def require_guild(interaction: discord.Interaction) -> discord.Guild:
    if interaction.guild is None:
        raise ValueError("This command can only be used in a server.")
    return interaction.guild


async def reply(
    interaction: discord.Interaction,
    message: str | None = None,
    *,
    embed: discord.Embed | None = None,
    ephemeral: bool = True,
    view: discord.ui.View | None = None,
) -> None:
    # discord.py 2.7 expects an omitted view rather than view=None. Building the
    # payload conditionally also avoids passing null embeds to follow-up sends.
    kwargs = {"ephemeral": ephemeral}
    if message is not None:
        kwargs["content"] = message
    if embed is not None:
        kwargs["embed"] = without_embed_emojis(embed)
    if view is not None:
        kwargs["view"] = view
    if interaction.response.is_done():
        await interaction.followup.send(**kwargs)
    else:
        await interaction.response.send_message(**kwargs)


def guild_channel(guild: discord.Guild | None, channel_id: int):
    """Return a configured channel the bot can post in, or None."""
    channel = guild.get_channel(channel_id) if guild and channel_id else None
    return channel if isinstance(channel, discord.abc.Messageable) else None


async def send_to(
    guild: discord.Guild | None,
    channel_id: int,
    content: str | None = None,
    *,
    embed: discord.Embed | None = None,
) -> discord.Message | None:
    """Post to a configured channel. Logging never fails the command that triggered it."""
    channel = guild_channel(guild, channel_id)
    if channel is None:
        return None
    try:
        return await channel.send(
            content=content,
            embed=without_embed_emojis(embed) if embed else None,
            allowed_mentions=discord.AllowedMentions.none(),
        )
    except (discord.Forbidden, discord.HTTPException):
        log.exception("Could not post to channel %s", channel_id)
        return None


async def refresh_panels(bot, guild: discord.Guild | None, *kinds: str) -> None:
    """Update the auto-updating embeds now instead of waiting for the next loop tick."""
    cog = bot.get_cog("PanelsCog")
    if cog is None or guild is None:
        return
    try:
        await cog.refresh(guild, *kinds)
    except Exception:
        # The command already succeeded; the panel loop will retry.
        log.exception("Could not refresh the %s panel(s)", ", ".join(kinds) or "all")


def clean_text(value: str, maximum: int = 1000) -> str:
    value = value.strip()
    if not value:
        raise ValueError("This value cannot be empty.")
    if len(value) > maximum:
        raise ValueError(f"This value cannot be longer than {maximum} characters.")
    return value


async def department_autocomplete(
    interaction: discord.Interaction, current: str
) -> list[app_commands.Choice[str]]:
    db = interaction.client.db  # type: ignore[attr-defined]
    if interaction.guild_id is None:
        return []
    rows = await db.fetch_all(
        "SELECT name FROM departments WHERE guild_id=? AND name LIKE ? ORDER BY name LIMIT 25",
        (interaction.guild_id, f"%{current}%"),
    )
    return [app_commands.Choice(name=row["name"], value=row["name"]) for row in rows]


def _command_name(interaction: discord.Interaction) -> str:
    return interaction.command.qualified_name.lower() if interaction.command else ""


def has_bypass(interaction: discord.Interaction) -> bool:
    """Owners, Discord administrators, network management and explicit allowlists pass every rank check."""
    config = interaction.client.config  # type: ignore[attr-defined]
    if interaction.user.id in config.owner_ids:
        return True
    if not isinstance(interaction.user, discord.Member):
        return False
    member = interaction.user
    role_ids = {role.id for role in member.roles}
    if member.guild_permissions.administrator or role_ids.intersection(config.bypass_role_ids):
        return True
    return config.access_decision(
        _command_name(interaction), member.id, role_ids,
        administrator=member.guild_permissions.administrator,
    ) is True


def meets_level(member: discord.Member, config, level: str) -> bool:
    """Whether the member's highest coordination rank is at or above the level's minimum rank."""
    index = config.rank_index({role.id for role in member.roles})
    return index is not None and index <= COORDINATOR_RANKS.index(config.level_ranks[level])


async def require_level(interaction: discord.Interaction, level: str) -> bool:
    config = interaction.client.config  # type: ignore[attr-defined]
    if has_bypass(interaction):
        return True
    if not isinstance(interaction.user, discord.Member):
        raise app_commands.CheckFailure("This command can only be used in a server.")
    if meets_level(interaction.user, config, level):
        return True
    if await _has_permission_override(interaction, interaction.user):
        return True
    rank = config.level_ranks[level]
    role_id = config.coordinator_role_ids.get(rank)
    raise app_commands.CheckFailure(
        f"You need {f'<@&{role_id}>' if role_id else rank} or a higher rank to use this command."
    )


async def _coordinator(interaction: discord.Interaction) -> bool:
    return await require_level(interaction, "coordinator")


async def _manager(interaction: discord.Interaction) -> bool:
    return await require_level(interaction, "manager")


async def _director(interaction: discord.Interaction) -> bool:
    return await require_level(interaction, "director")


coordinator_only = app_commands.check(_coordinator)
manager_only = app_commands.check(_manager)
director_only = app_commands.check(_director)


async def require_department_access(interaction: discord.Interaction, department) -> None:
    """Allow coordination staff, the department head, or the department's high command."""
    config = interaction.client.config  # type: ignore[attr-defined]
    if has_bypass(interaction):
        return
    if not isinstance(interaction.user, discord.Member):
        raise app_commands.CheckFailure("This command can only be used in a server.")
    member = interaction.user
    role_ids = {role.id for role in member.roles}
    if (
        meets_level(member, config, "coordinator")
        or member.id == department["head_id"]
        or (department["command_role_id"] and department["command_role_id"] in role_ids)
        or await _has_permission_override(interaction, member)
    ):
        return
    raise app_commands.CheckFailure(
        f"You must lead **{department['name']}**, hold its high command role, or be a coordinator."
    )


async def require_role_manager(
    interaction: discord.Interaction, managed_role: discord.Role
) -> None:
    """Managers manage any role; coordinators, department heads and high command manage department roles."""
    config = interaction.client.config  # type: ignore[attr-defined]
    if has_bypass(interaction):
        return
    if not isinstance(interaction.user, discord.Member):
        raise app_commands.CheckFailure("This command can only be used in a server.")
    member = interaction.user
    role_ids = {role.id for role in member.roles}
    if meets_level(member, config, "manager") or await _has_permission_override(interaction, member):
        return
    db = interaction.client.db  # type: ignore[attr-defined]
    department = await db.fetch_one(
        "SELECT * FROM departments WHERE guild_id=? AND base_role_id=?",
        (interaction.guild_id, managed_role.id),
    )
    if department and (
        meets_level(member, config, "coordinator")
        or member.id == department["head_id"]
        or (department["command_role_id"] and department["command_role_id"] in role_ids)
    ):
        return
    marks = ",".join("?" for _ in role_ids) or "NULL"
    row = await db.fetch_one(
        "SELECT 1 FROM role_managers WHERE guild_id=? AND managed_role_id=? AND "
        f"((manager_type='user' AND manager_id=?) OR (manager_type='role' AND manager_id IN ({marks}))) LIMIT 1",
        (interaction.guild_id, managed_role.id, member.id, *role_ids),
    )
    if row:
        return
    raise app_commands.CheckFailure(f"You are not allowed to manage {managed_role.mention}.")


async def _has_permission_override(
    interaction: discord.Interaction, member: discord.Member
) -> bool:
    qualified = interaction.command.qualified_name if interaction.command else ""
    root = qualified.split(" ", 1)[0]
    role_ids = [role.id for role in member.roles]
    role_marks = ",".join("?" for _ in role_ids) or "NULL"
    rows = await interaction.client.db.fetch_all(  # type: ignore[attr-defined]
        "SELECT target_type,permission,allowed FROM permissions WHERE guild_id=? "
        "AND permission IN ('manager',?,?) AND "
        f"((target_type='user' AND target_id=?) OR (target_type='role' AND target_id IN ({role_marks})))",
        (interaction.guild_id, qualified, root, member.id, *role_ids),
    )
    # Exact command beats root group, which beats the broad manager permission.
    # A user override beats a role override at the same scope.
    scope_rank = {qualified: 0, root: 1, "manager": 2}
    if not rows:
        return False
    chosen = min(
        rows,
        key=lambda row: (scope_rank.get(row["permission"], 3), 0 if row["target_type"] == "user" else 1),
    )
    return bool(chosen["allowed"])


async def _launch_or_manager(interaction: discord.Interaction) -> bool:
    """Department Launch Group members, or managers and above."""
    config = interaction.client.config  # type: ignore[attr-defined]
    if has_bypass(interaction):
        return True
    if (
        config.launch_group_role_id
        and isinstance(interaction.user, discord.Member)
        and any(role.id == config.launch_group_role_id for role in interaction.user.roles)
    ):
        return True
    return await require_level(interaction, "manager")


launch_or_manager = app_commands.check(_launch_or_manager)


class _ConfirmView(discord.ui.View):
    def __init__(self, user_id: int):
        super().__init__(timeout=60)
        self.user_id = user_id
        self.confirmed = False

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.user_id:
            await interaction.response.send_message("Only the person who ran the command can answer.", ephemeral=True)
            return False
        return True

    @discord.ui.button(label="Confirm", style=discord.ButtonStyle.danger)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        self.confirmed = True
        await interaction.response.edit_message(content="Working...", view=None)
        self.stop()

    @discord.ui.button(label="Cancel", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.edit_message(content="Cancelled.", view=None)
        self.stop()


async def confirm_action(interaction: discord.Interaction, prompt: str) -> bool:
    """Ask the invoker to confirm with buttons. The command carries on with followups when True."""
    view = _ConfirmView(interaction.user.id)
    if interaction.response.is_done():
        await interaction.followup.send(prompt, view=view, ephemeral=True)
    else:
        await interaction.response.send_message(prompt, view=view, ephemeral=True)
    await view.wait()
    return view.confirmed


async def email_log(
    bot, guild: discord.Guild | None, title: str, description: str,
    *, color: discord.Color | None = None, fields: dict[str, str] | None = None,
) -> None:
    """One line in the email-logs channel for everything that happens in the email database."""
    embed = discord.Embed(
        title=title, description=description, color=color or discord.Color.blurple(),
        timestamp=datetime.now(UTC),
    )
    for name, value in (fields or {}).items():
        if value:
            embed.add_field(name=name, value=str(value)[:1000], inline=True)
    await send_to(guild, bot.config.email_log_channel_id, embed=embed)
