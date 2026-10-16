from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import discord
from discord import app_commands

from .common import send_to
from .constants import NO_COOLDOWN_CATEGORIES
from .services import duration

EASTERN = ZoneInfo("America/New_York")


def today() -> str:
    return datetime.now(EASTERN).strftime("%B %d, %Y")


def is_restricted_role(role: discord.Role, config) -> bool:
    """Return whether a role has the special director-only assignment policy."""
    return role.id in config.restricted_role_ids


def can_manage_restricted_roles(member: discord.Member, config) -> bool:
    if member.id in config.owner_ids:
        return True
    return bool(set(config.restricted_role_manager_role_ids).intersection(role.id for role in member.roles))


def require_restricted_role_manager(member: discord.abc.User, role: discord.Role, config) -> None:
    """Enforce the restricted-role policy on a bot-command actor."""
    if not is_restricted_role(role, config):
        return
    if isinstance(member, discord.Member) and can_manage_restricted_roles(member, config):
        return
    ranks = " or ".join(f"<@&{role_id}>" for role_id in config.restricted_role_manager_role_ids)
    raise app_commands.CheckFailure(f"Only members with the {ranks} role can add or remove {role.mention}.")


async def department_for_role(db, guild_id: int, role_id: int, column: str = "base_role_id"):
    if column not in {"base_role_id", "command_role_id"}:
        raise ValueError("Invalid department role column")
    row = await db.fetch_one(f"SELECT * FROM departments WHERE guild_id=? AND {column}=?", (guild_id, role_id))
    return dict(row) if row else None


async def sync_category_member_roles(bot, member: discord.Member) -> None:
    """Keep the category divider roles in line with the registered departments a member holds.

    Several categories may share one divider role (Main LEO and Main FED both use the
    Main Department divider), so a role is removed only when no category needs it.
    """
    configured = bot.config.category_member_role_ids
    if not configured:
        return
    departments = await bot.db.fetch_all(
        "SELECT category,base_role_id FROM departments WHERE guild_id=?", (member.guild.id,)
    )
    held = {role.id for role in member.roles}
    wanted = {
        configured[row["category"]]
        for row in departments
        if row["base_role_id"] in held and row["category"] in configured
    }
    to_add = [member.guild.get_role(role_id) for role_id in wanted - held]
    to_remove = [member.guild.get_role(role_id) for role_id in (set(configured.values()) - wanted) & held]
    to_add = [role for role in to_add if role]
    to_remove = [role for role in to_remove if role]
    if to_add:
        await member.add_roles(*to_add, reason="Holds a registered department role")
    if to_remove:
        await member.remove_roles(*to_remove, reason="No longer holds a department role in this category")


def cooldown_role(bot, guild: discord.Guild, kind: str, category: str) -> discord.Role | None:
    return guild.get_role(bot.config.cooldown_role_id(kind, category))


async def assign_cooldown(
    bot, member: discord.Member, category: str, kind: str, *, department: str | None = None, days: int | None = None
) -> discord.Role | None:
    """Give the category's transfer or resignation cooldown role and schedule its removal.

    Returns None for categories without that cooldown (for example "Other").
    """
    role = cooldown_role(bot, member.guild, kind, category)
    if role is None:
        return None
    days = bot.config.cooldown_days(kind) if days is None else days
    expires_at = datetime.now(UTC) + timedelta(days=days)
    await member.add_roles(role, reason=f"{category} {kind.lower()} cooldown")
    await bot.db.execute(
        "INSERT INTO temp_roles(guild_id,member_id,role_id,expires_at) VALUES(?,?,?,?) "
        "ON CONFLICT(guild_id,member_id,role_id) DO UPDATE SET expires_at=excluded.expires_at",
        (member.guild.id, member.id, role.id, expires_at.isoformat()),
    )
    stamp = int(expires_at.timestamp())
    source = f" after leaving **{department}**" if department and kind == "Resignation" else ""
    if department and kind == "Transfer":
        source = f" after transferring to **{department}**"
    embed = discord.Embed(
        title=f"{category} {kind} Cooldown",
        description=f"You have been placed on a **{category} {kind.lower()} cooldown**{source}.",
        color=discord.Color.orange(),
        timestamp=datetime.now(UTC),
    )
    embed.add_field(name="Cooldown role", value=role.mention, inline=False)
    embed.add_field(name="Expires", value=f"<t:{stamp}:F>\n<t:{stamp}:R>", inline=False)
    embed.add_field(
        name="Until then",
        value=(
            f"You cannot transfer to another **{category}** department."
            if kind == "Transfer"
            else f"You cannot join another **{category}** department."
        ),
        inline=False,
    )
    embed.set_footer(text=f"{member.guild.name} · {days} day(s)")
    try:
        await member.send(embed=embed)
    except (discord.Forbidden, discord.HTTPException):
        pass
    return role


def active_cooldowns(bot, member: discord.Member, category: str) -> list[discord.Role]:
    held = {role.id for role in member.roles}
    return [
        role
        for kind in ("Transfer", "Resignation")
        if (role := cooldown_role(bot, member.guild, kind, category)) and role.id in held
    ]


async def category_conflict(bot, member: discord.Member, incoming) -> str | None:
    """Reason a member may not join ``incoming``, or None. "Other" and "Handpicked" departments never conflict."""
    category = incoming["category"]
    if category in NO_COOLDOWN_CATEGORIES:
        return None
    held = {role.id for role in member.roles}
    if not held.intersection(bot.config.multi_department_bypass_role_ids):
        rows = await bot.db.fetch_all(
            "SELECT name,base_role_id FROM departments WHERE guild_id=? AND category=? AND id!=?",
            (member.guild.id, category, incoming["id"]),
        )
        others = [row["name"] for row in rows if row["base_role_id"] in held]
        if others:
            return f"Already in {', '.join(others)} ({category})"
    cooldowns = active_cooldowns(bot, member, category)
    if cooldowns:
        return f"On {', '.join(role.name for role in cooldowns)}"
    return None


async def send_conflict_alert(bot, member: discord.Member, incoming_role: discord.Role, reason: str) -> None:
    rows = await bot.db.fetch_all(
        "SELECT name,category,base_role_id FROM departments WHERE guild_id=?", (member.guild.id,)
    )
    held = {role.id for role in member.roles}
    current = [f"{row['name']} ({row['category']})" for row in rows if row["base_role_id"] in held]
    embed = discord.Embed(
        title="Department Role Conflict",
        description=f"A conflicting department-role assignment for {member.mention} was blocked.",
        color=discord.Color.red(),
        timestamp=datetime.now(UTC),
    )
    embed.set_thumbnail(url=member.display_avatar.url)
    embed.add_field(name="User", value=f"{member.mention}\n`{member.id}`")
    embed.add_field(name="Blocked role", value=incoming_role.mention)
    embed.add_field(name="Reason", value=reason, inline=False)
    embed.add_field(name="Current departments", value="\n".join(current) or "None", inline=False)
    await send_to(member.guild, bot.config.role_conflict_channel_id, embed=embed)


async def send_member_movement(bot, member: discord.Member, department, action: str, actor: discord.abc.User | None) -> None:
    """One-line member movement, e.g. ``@user --> Resigned from LSPD | October 15, 2026 | @coord``."""
    by = actor.mention if actor else "Unknown"
    await send_to(
        member.guild,
        bot.config.member_movement_channel_id,
        f"<@!{member.id}> --> {action} {department['name']} | {today()} | {by}",
    )


def department_movement_embed(
    bot,
    guild: discord.Guild,
    department,
    action: str,
    actor: discord.abc.User,
    org: dict | None = None,
) -> discord.Embed:
    """Admin movement for a created, registered or relinked department, including its FBRP org and hours."""
    config = bot.config
    base = f"<@&{department['base_role_id']}>" if department.get("base_role_id") else f"**{department['name']}**"
    embed = discord.Embed(
        title=f"Department {action}",
        description=f"{base} --> {action} ({department['category']}) | {today()} | {actor.mention}",
        color=department.get("role_color") or discord.Color.blurple(),
        timestamp=datetime.now(UTC),
    )
    embed.add_field(name="Department", value=f"{department['name']}\n{base}")
    embed.add_field(name="Category", value=department["category"])
    embed.add_field(name="Initials", value=department.get("initials") or "—")
    embed.add_field(
        name="High Command",
        value=f"<@&{department['command_role_id']}>" if department.get("command_role_id") else "—",
    )
    embed.add_field(name="Department Head", value=f"<@{department['head_id']}>" if department.get("head_id") else "—")
    embed.add_field(name="Status", value=department.get("status") or "In Development")
    org_id = department.get("fbrp_org_id")
    if org_id:
        label = f"`{org_id}`" + (f" · {org['name']} ({org.get('type', 'org')})" if org else "")
        hours = (
            f"Linked. In-game duty hours count toward <#{config.hours_channel_id}> "
            f"(last {config.hours_days} days) and `/dept hours`."
        )
    else:
        label = "Not linked · set it with `/dept update org_id:`"
        hours = "Off until an FBRP org is linked."
    embed.add_field(name="FBRP Org ID", value=label, inline=False)
    embed.add_field(name="Hours Integration", value=hours, inline=False)
    embed.set_footer(text=f"{guild.name} · Department Movements")
    return embed


def format_hours_line(rank: int, member: dict) -> str:
    on_duty = " · on duty" if member.get("onDuty") else ""
    return f"`{rank}.` <@{member['discordId']}> · **{duration(int(member['seconds']))}** ({member['shifts']} shifts){on_duty}"
