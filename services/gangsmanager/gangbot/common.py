from __future__ import annotations

import logging
import re

import discord
from discord import app_commands
from discord.ext import commands

from .services import GangService

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


class GangCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.db = bot.db  # type: ignore[attr-defined]
        self.service = GangService(self.db)


def guild_id(interaction: discord.Interaction) -> int:
    if interaction.guild_id is None:
        raise app_commands.CheckFailure("This command can only be used in a server.")
    return interaction.guild_id


def actor_id(interaction: discord.Interaction) -> int:
    return interaction.user.id


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


def guild_channel(bot, guild: discord.Guild | None, channel_id: int):
    """Return a configured channel the bot can post in, or None."""
    channel = guild.get_channel(channel_id) if guild else None
    return channel if isinstance(channel, discord.abc.Messageable) else None


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


async def send_market_log(bot, guild: discord.Guild | None, embed: discord.Embed) -> None:
    channel = guild_channel(bot, guild, bot.config.market_log_channel_id)
    if channel is None:
        return
    try:
        await channel.send(embed=without_embed_emojis(embed))
    except (discord.Forbidden, discord.HTTPException):
        log.exception("Could not post to the market log channel")


def clean_text(value: str, maximum: int = 1000) -> str:
    value = value.strip()
    if not value:
        raise ValueError("This value cannot be empty.")
    if len(value) > maximum:
        raise ValueError(f"This value cannot be longer than {maximum} characters.")
    return value


def money(value: int | float) -> str:
    return f"${value:,.0f}"


async def gang_autocomplete(
    interaction: discord.Interaction, current: str
) -> list[app_commands.Choice[str]]:
    db = interaction.client.db  # type: ignore[attr-defined]
    if interaction.guild_id is None:
        return []
    rows = await db.fetch_all(
        "SELECT name FROM gangs WHERE guild_id=? AND name LIKE ? ORDER BY name LIMIT 25",
        (interaction.guild_id, f"%{current}%"),
    )
    return [app_commands.Choice(name=row["name"], value=row["name"]) for row in rows]


async def require_manager(interaction: discord.Interaction) -> bool:
    bot = interaction.client
    config = bot.config  # type: ignore[attr-defined]
    if interaction.user.id in config.owner_ids:
        return True
    if not isinstance(interaction.user, discord.Member):
        raise app_commands.CheckFailure("This command can only be used in a server.")
    decision = config.access_decision(
        interaction.command.qualified_name.lower() if interaction.command else "",
        interaction.user.id,
        {role.id for role in interaction.user.roles},
        administrator=interaction.user.guild_permissions.administrator,
    )
    if decision is True:
        return True
    if interaction.user.guild_permissions.administrator:
        return True
    if config.admin_role_id in {role.id for role in interaction.user.roles}:
        return True
    if await _has_permission_override(interaction, interaction.user):
        return True
    raise app_commands.CheckFailure(
        f"You need Administrator, <@&{config.admin_role_id}>, or manager permission."
    )


manager_only = app_commands.check(require_manager)


async def require_gang_manager_plus(interaction: discord.Interaction) -> bool:
    config = interaction.client.config  # type: ignore[attr-defined]
    if interaction.user.id in config.owner_ids:
        return True
    if not isinstance(interaction.user, discord.Member):
        raise app_commands.CheckFailure("This command can only be used in a server.")
    allowed = set(config.gang_manager_plus_role_ids)
    if allowed.intersection(role.id for role in interaction.user.roles):
        return True
    ranks = ", ".join(f"<@&{role_id}>" for role_id in allowed)
    raise app_commands.CheckFailure(
        f"You need one of these coordinator ranks to use this command: {ranks}."
    )


gang_manager_plus_only = app_commands.check(require_gang_manager_plus)


async def require_gang_add_remove(interaction: discord.Interaction) -> bool:
    config = interaction.client.config  # type: ignore[attr-defined]
    if isinstance(interaction.user, discord.Member):
        allowed = {
            *config.gang_manager_plus_role_ids,
            config.gang_add_remove_role_id,
        }
        if allowed.intersection(role.id for role in interaction.user.roles):
            return True
    return await require_manager(interaction)


gang_add_remove_only = app_commands.check(require_gang_add_remove)


async def require_role_management_admin(interaction: discord.Interaction) -> bool:
    config = interaction.client.config  # type: ignore[attr-defined]
    if interaction.user.id in config.owner_ids:
        return True
    if not isinstance(interaction.user, discord.Member):
        raise app_commands.CheckFailure("This command can only be used in a server.")
    required = config.role_management_admin_role_id
    if required in {role.id for role in interaction.user.roles}:
        return True
    raise app_commands.CheckFailure(f"You need <@&{required}> to use this command.")


role_management_admin_only = app_commands.check(require_role_management_admin)


async def require_gang_access(interaction: discord.Interaction, gang) -> None:
    """Allow a gang owner/command member or a configured bot manager."""
    config = interaction.client.config  # type: ignore[attr-defined]
    if interaction.user.id in config.owner_ids:
        return
    if not isinstance(interaction.user, discord.Member):
        raise app_commands.CheckFailure("This command can only be used in a server.")
    member = interaction.user
    role_ids = {role.id for role in member.roles}
    decision = config.access_decision(
        interaction.command.qualified_name.lower() if interaction.command else "",
        member.id,
        role_ids,
        administrator=member.guild_permissions.administrator,
    )
    if decision is True:
        return
    if (
        member.guild_permissions.administrator
        or config.admin_role_id in role_ids
        or member.id == gang["owner_id"]
        or gang["command_role_id"] in role_ids
    ):
        return
    if await _has_permission_override(interaction, member):
        return
    raise app_commands.CheckFailure(
        f"You must own **{gang['name']}** or have its command role to do that."
    )


def require_gang_type(gang, expected: str, feature: str) -> None:
    """Reject a gang-scoped feature when the selected gang has the wrong type."""
    if gang["gang_type"] != expected:
        raise ValueError(f"{feature} is only available to {expected} gangs.")


async def require_role_manager(
    interaction: discord.Interaction, managed_role: discord.Role
) -> None:
    config = interaction.client.config  # type: ignore[attr-defined]
    if interaction.user.id in config.owner_ids:
        return
    if not isinstance(interaction.user, discord.Member):
        raise app_commands.CheckFailure("This command can only be used in a server.")
    member = interaction.user
    role_ids = {role.id for role in member.roles}
    decision = config.access_decision(
        interaction.command.qualified_name.lower() if interaction.command else "",
        member.id,
        role_ids,
        administrator=member.guild_permissions.administrator,
    )
    if (
        decision is True
        or member.guild_permissions.administrator
        or config.admin_role_id in role_ids
        or await _has_permission_override(interaction, member)
    ):
        return
    marks = ",".join("?" for _ in role_ids) or "NULL"
    row = await interaction.client.db.fetch_one(  # type: ignore[attr-defined]
        "SELECT 1 FROM role_managers WHERE guild_id=? AND managed_role_id=? AND "
        f"((manager_type='user' AND manager_id=?) OR (manager_type='role' AND manager_id IN ({marks}))) LIMIT 1",
        (interaction.guild_id, managed_role.id, member.id, *role_ids),
    )
    if row:
        return
    raise app_commands.CheckFailure(
        f"You are not a configured manager of {managed_role.mention}."
    )


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
