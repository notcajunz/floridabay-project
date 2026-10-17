from __future__ import annotations

import asyncio
import io
import platform
import time
import urllib.request
import urllib.parse

import discord
from discord import app_commands

from .. import __version__
from ..common import DeptCog, clean_text, director_only, guild_id, manager_only, reply, send_to, without_embed_emojis
from ..services import parse_color, parse_message_id


def _download(url: str) -> bytes:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Avatar URL must use HTTP or HTTPS.")
    request = urllib.request.Request(url, headers={"User-Agent": "DepartmentManagerBot/1.0"})
    with urllib.request.urlopen(request, timeout=10) as response:
        content_type = response.headers.get_content_type()
        if not content_type.startswith("image/"):
            raise ValueError("Avatar URL must point directly to an image.")
        if response.length and response.length > 8_000_000:
            raise ValueError("Avatar image is too large (8 MB maximum).")
        data = response.read(8_000_001)
    if len(data) > 8_000_000:
        raise ValueError("Avatar image is too large (8 MB maximum).")
    return data


class CoreCog(DeptCog):
    admin = app_commands.Group(name="admin", description="Bot administration")
    dm = app_commands.Group(name="dm", description="Direct-message tools")
    embed = app_commands.Group(name="embed", description="Embed tools")

    def __init__(self, bot):
        super().__init__(bot)
        self.started_at = time.monotonic()

    @admin.command(name="avatar", description="Change the bot avatar")
    @director_only
    async def admin_avatar(
        self,
        interaction: discord.Interaction,
        avatar: discord.Attachment | None = None,
        url: str | None = None,
    ) -> None:
        if not avatar and not url:
            raise ValueError("Provide either an avatar attachment or an image URL.")
        data = await avatar.read() if avatar else await asyncio.to_thread(_download, url or "")
        if not self.bot.user:
            raise RuntimeError("Bot user is not ready")
        await self.bot.user.edit(avatar=data)
        await reply(interaction, "Bot avatar updated.")

    @admin.command(name="rolecheck", description="Audit department roles and configured role IDs")
    @manager_only
    async def rolecheck(self, interaction: discord.Interaction) -> None:
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        config = self.bot.config
        rows = await self.db.fetch_all(
            "SELECT name,base_role_id,command_role_id FROM departments WHERE guild_id=? ORDER BY name",
            (guild.id,),
        )
        issues: list[str] = []
        for row in rows:
            if not row["base_role_id"] or guild.get_role(row["base_role_id"]) is None:
                issues.append(f"• {row['name']}: missing department role")
            if row["command_role_id"] and guild.get_role(row["command_role_id"]) is None:
                issues.append(f"• {row['name']}: missing high command role")
        configured = {
            **{f"rank {name}": role_id for name, role_id in config.coordinator_role_ids.items()},
            **{f"position {name}": role_id for name, role_id in config.coordinator_job_role_ids.items()},
            **{f"{name} divider": role_id for name, role_id in config.category_member_role_ids.items()},
            **{f"{name} transfer cooldown": role_id for name, role_id in config.transfer_cooldown_role_ids.items()},
            **{f"{name} resignation cooldown": role_id for name, role_id in config.resignation_cooldown_role_ids.items()},
            "member role": config.member_role_id,
            "transfer blacklist role": config.transfer_blacklist_role_id,
        }
        me = guild.me
        for label, role_id in configured.items():
            role = guild.get_role(role_id) if role_id else None
            if role_id and role is None:
                issues.append(f"• config {label}: role `{role_id}` not found")
            elif role and me and role >= me.top_role:
                issues.append(f"• {role.mention} is above the bot's role")
        text = "\n".join(issues[:30]) if issues else "All department and configured roles are valid."
        await reply(interaction, text)

    @admin.command(name="info", description="Show bot and database information")
    @manager_only
    async def admin_info(self, interaction: discord.Interaction) -> None:
        gid = guild_id(interaction)
        departments = await self.db.fetch_one("SELECT COUNT(*) AS n FROM departments WHERE guild_id=?", (gid,))
        cooldowns = await self.db.fetch_one("SELECT COUNT(*) AS n FROM temp_roles WHERE guild_id=?", (gid,))
        uptime = int(time.monotonic() - self.started_at)
        embed = discord.Embed(title="Department Manager", color=discord.Color.blurple())
        embed.add_field(name="Version", value=__version__)
        embed.add_field(name="Python", value=platform.python_version())
        embed.add_field(name="discord.py", value=discord.__version__)
        embed.add_field(name="Departments", value=f"{departments['n']:,}")
        embed.add_field(name="Timed roles", value=f"{cooldowns['n']:,}")
        embed.add_field(name="Uptime", value=f"{uptime // 3600}h {(uptime % 3600) // 60}m")
        await reply(interaction, embed=embed)

    @admin.command(name="nick", description="Change a server member's nickname")
    @manager_only
    async def admin_nick(
        self, interaction: discord.Interaction, user: discord.Member, nickname: str
    ) -> None:
        nickname = clean_text(nickname, 32)
        await user.edit(nick=nickname, reason=f"Department manager: {interaction.user}")
        await reply(interaction, f"Updated {user.mention}'s nickname to `{nickname}`.")

    @admin.command(name="username", description="Change the bot username")
    @director_only
    async def admin_username(self, interaction: discord.Interaction, username: str) -> None:
        username = clean_text(username, 32)
        if not self.bot.user:
            raise RuntimeError("Bot user is not ready")
        await self.bot.user.edit(username=username)
        await reply(interaction, f"Bot username updated to `{username}`.")

    @dm.command(name="send", description="Send a direct message to a user")
    @manager_only
    async def dm_send(
        self, interaction: discord.Interaction, user: discord.User, message: str
    ) -> None:
        message = clean_text(message, 1900)
        await user.send(message)
        await send_to(
            interaction.guild, self.bot.config.custom_message_log_channel_id,
            f"DM to {user.mention} ({user.id}) by {interaction.user.mention}:\n>>> {message}",
        )
        await reply(interaction, f"Message sent to {user.mention}.")

    @embed.command(name="post", description="Post a custom embed")
    @manager_only
    async def embed_post(
        self,
        interaction: discord.Interaction,
        channel: discord.TextChannel,
        title: str,
        description: str,
        color: str = "#5865F2",
    ) -> None:
        sent = await channel.send(
            embed=without_embed_emojis(discord.Embed(
                title=clean_text(title, 256),
                description=clean_text(description, 4000),
                color=parse_color(color),
            ))
        )
        await send_to(
            interaction.guild, self.bot.config.custom_message_log_channel_id,
            f"Embed posted in {channel.mention} by {interaction.user.mention}: {sent.jump_url}",
        )
        await reply(interaction, f"Embed posted: {sent.jump_url}")

    @embed.command(name="get", description="Get the JSON for an embed message")
    @manager_only
    async def embed_get(
        self, interaction: discord.Interaction, message: str, channel: discord.TextChannel
    ) -> None:
        target = await channel.fetch_message(parse_message_id(message))
        if not target.embeds:
            raise ValueError("That message does not contain an embed.")
        payload = str(target.embeds[0].to_dict())
        if len(payload) <= 1850:
            await reply(interaction, f"```py\n{payload}\n```")
        else:
            file = discord.File(io.BytesIO(payload.encode()), filename="embed.txt")
            await interaction.response.send_message(file=file, ephemeral=True)

    @embed.command(name="edit", description="Edit an embed message sent by this bot")
    @manager_only
    async def embed_edit(
        self,
        interaction: discord.Interaction,
        message: str,
        channel: discord.TextChannel,
        title: str,
        description: str,
        color: str = "#5865F2",
    ) -> None:
        target = await channel.fetch_message(parse_message_id(message))
        await target.edit(
            embed=without_embed_emojis(discord.Embed(
                title=clean_text(title, 256),
                description=clean_text(description, 4000),
                color=parse_color(color),
            ))
        )
        await send_to(
            interaction.guild, self.bot.config.custom_message_log_channel_id,
            f"Embed edited in {channel.mention} by {interaction.user.mention}: {target.jump_url}",
        )
        await reply(interaction, f"Embed updated: {target.jump_url}")

    @app_commands.command(name="help", description="Show the Department Manager command guide")
    async def help_command(self, interaction: discord.Interaction) -> None:
        config = self.bot.config
        embed = discord.Embed(
            title="Department Manager Help",
            description=(
                "Manages departments, their roles, transfers and cooldowns for the Department Hub. "
                f"Chain of command: <#{config.chain_of_command_channel_id}> · "
                f"Hours leaderboard: <#{config.hours_channel_id}>."
            ),
            color=discord.Color.blurple(),
        )
        sections = {
            "Departments": "/dept create, add, update, status, info, list, hours, role, remove, join, leave",
            "Members": "/role add, /role remove, /transfer member, /transfer blacklist, /member logpunishment, history",
            "Cooldowns": "/cooldown apply, clear, view · /temprole extend, delete, list",
            "Coordination": "/position set, remove · /coord add, remove, job, update, activity",
            "Administration": "/admin, /permissions, /role protection, /useradd, /userdel, /rolewipe, /embed, /dm",
        }
        for name, value in sections.items():
            embed.add_field(name=name, value=value, inline=False)
        embed.add_field(
            name="Access",
            value=(
                (
                    "Coordinator, management and administration commands need a chain-of-command position or the coordinator role. "
                    if config.level_roles else
                    f"Coordinator commands need {config.level_ranks['coordinator']}+, management commands "
                    f"{config.level_ranks['manager']}+, and administration {config.level_ranks['director']}+. "
                ) +
                "Department heads and high command can manage their own department role."
            ),
            inline=False,
        )
        await reply(interaction, embed=embed)
