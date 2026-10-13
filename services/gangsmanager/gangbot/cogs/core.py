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
from ..common import GangCog, clean_text, guild_id, manager_only, reply, without_embed_emojis
from ..services import parse_color, parse_message_id


def _download(url: str) -> bytes:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Avatar URL must use HTTP or HTTPS.")
    request = urllib.request.Request(url, headers={"User-Agent": "GangManagerBot/1.0"})
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


class CoreCog(GangCog):
    admin = app_commands.Group(name="admin", description="Bot administration")
    admin_gang = app_commands.Group(
        name="gang", description="Gang administration", parent=admin
    )
    dm = app_commands.Group(name="dm", description="Direct-message tools")
    embed = app_commands.Group(name="embed", description="Embed tools")

    def __init__(self, bot):
        super().__init__(bot)
        self.started_at = time.monotonic()

    @admin.command(name="avatar", description="Change the bot avatar")
    @manager_only
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

    @admin_gang.command(name="rolecheck", description="Audit gang roles and configured role IDs")
    @manager_only
    async def rolecheck(self, interaction: discord.Interaction) -> None:
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        rows = await self.db.fetch_all(
            "SELECT name,base_role_id,command_role_id FROM gangs WHERE guild_id=? ORDER BY name",
            (guild.id,),
        )
        issues: list[str] = []
        for row in rows:
            if not row["base_role_id"] or guild.get_role(row["base_role_id"]) is None:
                issues.append(f"• {row['name']}: missing base role")
            if row["command_role_id"] and guild.get_role(row["command_role_id"]) is None:
                issues.append(f"• {row['name']}: missing command role")
        text = "\n".join(issues[:30]) if issues else "All configured gang roles are valid."
        await reply(interaction, text)

    @admin.command(name="info", description="Show bot and database information")
    @manager_only
    async def admin_info(self, interaction: discord.Interaction) -> None:
        gid = guild_id(interaction)
        gangs = await self.db.fetch_one("SELECT COUNT(*) AS n FROM gangs WHERE guild_id=?", (gid,))
        ledger = await self.db.fetch_one("SELECT COUNT(*) AS n FROM ledger WHERE guild_id=?", (gid,))
        uptime = int(time.monotonic() - self.started_at)
        embed = discord.Embed(title="Gang Manager", color=discord.Color.blurple())
        embed.add_field(name="Version", value=__version__)
        embed.add_field(name="Python", value=platform.python_version())
        embed.add_field(name="discord.py", value=discord.__version__)
        embed.add_field(name="Gangs", value=f"{gangs['n']:,}")
        embed.add_field(name="Ledger entries", value=f"{ledger['n']:,}")
        embed.add_field(name="Uptime", value=f"{uptime // 3600}h {(uptime % 3600) // 60}m")
        await reply(interaction, embed=embed)

    @admin.command(name="nick", description="Change a server member's nickname")
    @manager_only
    async def admin_nick(
        self, interaction: discord.Interaction, user: discord.Member, nickname: str
    ) -> None:
        nickname = clean_text(nickname, 32)
        await user.edit(nick=nickname, reason=f"Gang manager: {interaction.user}")
        await reply(interaction, f"Updated {user.mention}'s nickname to `{nickname}`.")

    @admin.command(name="refreshgangtiers", description="Rename gang roles to include current tier")
    @manager_only
    async def refresh_gang_tiers(self, interaction: discord.Interaction) -> None:
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        await interaction.response.defer(ephemeral=True)
        rows = await self.db.fetch_all(
            "SELECT name,tier,base_role_id FROM gangs WHERE guild_id=?", (guild.id,)
        )
        updated = 0
        for row in rows:
            role = guild.get_role(row["base_role_id"] or 0)
            expected = f"T{row['tier']} | {row['name']}"
            if role and role.name != expected:
                await role.edit(name=expected, reason="Gang tier refresh")
                updated += 1
        await reply(interaction, f"Updated {updated} gang role(s).")

    @admin.command(name="reloadcog", description="Reload one of the bot's command modules")
    @manager_only
    @app_commands.describe(cog_name="core, gangs, economy, or operations")
    async def reload_cog(self, interaction: discord.Interaction, cog_name: str) -> None:
        from .economy import EconomyCog
        from .gangs import GangsCog
        from .operations import OperationsCog

        available = {
            "core": CoreCog,
            "gangs": GangsCog,
            "economy": EconomyCog,
            "operations": OperationsCog,
        }
        key = cog_name.lower()
        if key not in available:
            raise ValueError(f"Cog must be one of: {', '.join(sorted(available))}")
        await interaction.response.defer(ephemeral=True)
        cls = available[key]
        await self.bot.remove_cog(cls.__name__)
        await self.bot.add_cog(cls(self.bot))
        if self.bot.config.guild_id:
            target = discord.Object(id=self.bot.config.guild_id)
            self.bot.tree.copy_global_to(guild=target)
            await self.bot.tree.sync(guild=target)
        else:
            await self.bot.tree.sync()
        await reply(interaction, f"Reloaded and re-synced `{key}`.")

    @admin.command(name="username", description="Change the bot username")
    @manager_only
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
        await reply(interaction, f"Embed updated: {target.jump_url}")

    @app_commands.command(name="help", description="Show the Gang Manager command guide")
    async def help_command(self, interaction: discord.Interaction) -> None:
        embed = discord.Embed(
            title="Gang Manager Help",
            description="Use `/gang info` for gang details and `/gang balance` for assets.",
            color=discord.Color.blurple(),
        )
        sections = {
            "Gang management": "/creation, /gang, /member, /location, /relations",
            "Economy": "/bank, /market, /launder, /shop, /trade, /tax",
            "Operations": "/coord, /reward, /turfwar, /quiz, /log, /temprole",
            "Administration": "/admin, /permissions, /role, /embed, /dm",
        }
        for name, value in sections.items():
            embed.add_field(name=name, value=value, inline=False)
        embed.set_footer(text="Commands only appear when you have Discord permission to use them.")
        await reply(interaction, embed=embed)
