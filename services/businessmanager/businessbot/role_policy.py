from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import discord
from discord import app_commands

from .common import without_embed_emojis


def is_restricted_role(role: discord.Role, config) -> bool:
    """Return whether a role has the special director-only assignment policy."""
    return role.id in config.restricted_role_ids


def can_manage_restricted_roles(member: discord.Member, config) -> bool:
    """Return whether a director or configured bot owner may manage restricted roles."""
    if member.id in config.owner_ids:
        return True
    return bool(
        set(config.restricted_role_manager_role_ids).intersection(
            role.id for role in member.roles
        )
    )


def require_restricted_role_manager(
    member: discord.abc.User, role: discord.Role, config
) -> None:
    """Enforce the restricted-role policy on a bot-command actor."""
    if not is_restricted_role(role, config):
        return
    if isinstance(member, discord.Member) and can_manage_restricted_roles(member, config):
        return
    ranks = " or ".join(
        f"<@&{role_id}>" for role_id in config.restricted_role_manager_role_ids
    )
    raise app_commands.CheckFailure(
        f"Only members with the {ranks} role can add or remove {role.mention}."
    )


async def business_for_role(db, guild_id: int, role_id: int, column: str = "base_role_id"):
    if column not in {"base_role_id", "command_role_id"}:
        raise ValueError("Invalid business role column")
    return await db.fetch_one(
        f"SELECT * FROM businesses WHERE guild_id=? AND {column}=?", (guild_id, role_id)
    )


async def sync_category_member_role(
    bot, member: discord.Member, category: str
) -> discord.Role | None:
    """Keep ``<category> Member`` in sync with registered base business roles."""
    member_role = member.guild.get_role(
        bot.config.category_member_role_ids.get(category, 0)
    )
    if member_role is None:
        return None

    businesses = await bot.db.fetch_all(
        "SELECT base_role_id FROM businesses WHERE guild_id=? AND business_type=?",
        (member.guild.id, category),
    )
    held_role_ids = {role.id for role in member.roles}
    should_have_role = any(
        business["base_role_id"] in held_role_ids for business in businesses
    )
    has_role = member_role.id in held_role_ids

    if should_have_role and not has_role:
        await member.add_roles(
            member_role, reason=f"Holds a registered {category} business role"
        )
        await send_category_welcome(member, category, member_role)
    elif has_role and not should_have_role:
        await member.remove_roles(
            member_role, reason=f"No longer holds a registered {category} business role"
        )
    return member_role


async def send_category_welcome(
    member: discord.Member, category: str, member_role: discord.Role
) -> None:
    embed = discord.Embed(
        title=f"Welcome to {category}",
        description=(
            f"You are now part of the **{category}** category in "
            f"**{member.guild.name}**."
        ),
        color=member_role.color,
        timestamp=datetime.now(UTC),
    )
    embed.add_field(
        name="Category membership",
        value=(
            f"You received {member_role.mention} because you now hold a registered "
            f"**{category}** business role."
        ),
        inline=False,
    )
    embed.add_field(
        name="Getting started",
        value="Review your category channels and contact your business command or coordinator if you need help.",
        inline=False,
    )
    embed.set_footer(text="Business Manager")
    try:
        await member.send(embed=embed)
    except (discord.Forbidden, discord.HTTPException):
        pass


async def assign_parole(bot, member: discord.Member, business) -> discord.Role:
    role = member.guild.get_role(
        bot.config.parole_role_ids.get(business["business_type"], 0)
    )
    if role is None:
        raise ValueError(
            f"Configure a valid parole role ID for `{business['business_type']}` before removing this business role."
        )
    expires_at = datetime.now(UTC) + timedelta(days=bot.config.parole_days)
    expires = expires_at.isoformat()
    await member.add_roles(role, reason=f"{business['business_type']} business parole")
    await bot.db.execute(
        "INSERT INTO temp_roles(guild_id,member_id,role_id,expires_at) VALUES(?,?,?,?) "
        "ON CONFLICT(guild_id,member_id,role_id) DO UPDATE SET expires_at=excluded.expires_at",
        (member.guild.id, member.id, role.id, expires),
    )
    expires_timestamp = int(expires_at.timestamp())
    embed = discord.Embed(
        title=f"{business['business_type']} Parole Notice",
        description=(
            f"You have been placed on **{business['business_type']} parole** after leaving "
            f"**{business['name']}**."
        ),
        color=discord.Color.orange(),
        timestamp=datetime.now(UTC),
    )
    embed.add_field(name="Parole role", value=role.mention, inline=False)
    embed.add_field(
        name="Expires",
        value=f"<t:{expires_timestamp}:F>\n<t:{expires_timestamp}:R>",
        inline=False,
    )
    embed.add_field(
        name="Until then",
        value=(
            f"You cannot join another **{business['business_type']}** business until this parole expires."
        ),
        inline=False,
    )
    embed.set_footer(text=f"Parole duration: {bot.config.parole_days} day(s)")
    try:
        await member.send(embed=embed)
    except (discord.Forbidden, discord.HTTPException):
        pass
    return role


async def active_parole_role(bot, member: discord.Member, category: str) -> discord.Role | None:
    role = member.guild.get_role(bot.config.parole_role_ids.get(category, 0))
    return role if role and role in member.roles else None


def business_role_restriction(bot, member: discord.Member, *, command_role: bool) -> str | None:
    """Return the configured restriction that prevents a business-role assignment."""
    blocker_id = (
        bot.config.business_command_role_blocker_role_id
        if command_role
        else bot.config.business_role_blocker_role_id
    )
    if blocker_id in {role.id for role in member.roles}:
        kind = "business command roles" if command_role else "business roles"
        return f"Holds <@&{blocker_id}>, which cannot be combined with {kind}"
    return None


async def category_conflict(bot, member: discord.Member, incoming_business):
    member_role_ids = {role.id for role in member.roles}
    if not member_role_ids.intersection(bot.config.multi_business_bypass_role_ids):
        businesses = await bot.db.fetch_all(
            "SELECT name,base_role_id FROM businesses WHERE guild_id=? AND business_type=? AND id!=?",
            (member.guild.id, incoming_business["business_type"], incoming_business["id"]),
        )
        held = [business for business in businesses if business["base_role_id"] in member_role_ids]
        if held:
            return f"Already holds {', '.join(business['name'] for business in held)} in {incoming_business['business_type']}"
    parole = await active_parole_role(bot, member, incoming_business["business_type"])
    if parole:
        return f"Currently has {parole.name}"
    return None


async def send_conflict_alert(
    bot, member: discord.Member, incoming_role: discord.Role, reason: str
) -> None:
    channel = member.guild.get_channel(bot.config.role_conflict_channel_id)
    if not isinstance(channel, discord.abc.Messageable):
        return
    business_roles = []
    rows = await bot.db.fetch_all(
        "SELECT name,business_type,base_role_id FROM businesses WHERE guild_id=?", (member.guild.id,)
    )
    member_role_ids = {role.id for role in member.roles}
    for row in rows:
        if row["base_role_id"] in member_role_ids:
            business_roles.append(f"{row['name']} ({row['business_type']})")
    embed = discord.Embed(
        title="Business Role Conflict",
        description=f"A conflicting business-role assignment for {member.mention} was blocked.",
        color=discord.Color.red(),
        timestamp=datetime.now(UTC),
    )
    embed.set_thumbnail(url=member.display_avatar.url)
    embed.add_field(name="User", value=f"{member.mention}\n`{member.id}`")
    embed.add_field(name="Blocked role", value=incoming_role.mention)
    embed.add_field(name="Reason", value=reason, inline=False)
    embed.add_field(name="Current business roles", value="\n".join(business_roles) or "None", inline=False)
    await channel.send(embed=without_embed_emojis(embed))


async def send_role_action(
    bot,
    member: discord.Member,
    business,
    action: str,
    actor: discord.abc.User,
) -> None:
    channel = member.guild.get_channel(bot.config.role_action_channel_id)
    if not isinstance(channel, discord.abc.Messageable):
        return
    date = datetime.now(ZoneInfo("America/New_York")).strftime("%B %d, %Y")
    await channel.send(
        f"<@!{member.id}> --> {action} from {business['name']} | {date} | {actor.mention}"
    )
