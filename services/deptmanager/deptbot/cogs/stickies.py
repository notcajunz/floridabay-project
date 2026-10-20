from __future__ import annotations

import asyncio
import json
import logging

import discord
from discord import app_commands
from discord.ext import commands

from ..common import DeptCog, manager_only, reply, require_guild, send_to, without_embed_emojis
from ..forms import EmbedForm, embed_defaults

log = logging.getLogger(__name__)

# A sticky is re-posted once the channel has been quiet for this long, so a busy chat does not
# make the bot delete and send on every single message.
REPOST_DELAY = 3.0


class StickiesCog(DeptCog):
    """Sticky messages: an embed that stays as the newest message of a channel."""

    sticky = app_commands.Group(name="sticky", description="Sticky messages that stay at the bottom of a channel")

    def __init__(self, bot: commands.Bot, delay: float = REPOST_DELAY):
        super().__init__(bot)
        self.delay = delay
        self._pending: dict[int, asyncio.Task] = {}
        self._locks: dict[int, asyncio.Lock] = {}
        self._channels: set[int] | None = None  # channels with a sticky, so chat costs no database read

    async def cog_unload(self) -> None:
        for task in self._pending.values():
            task.cancel()

    # storage ---------------------------------------------------------------------

    async def _row(self, guild_id: int, channel_id: int):
        return await self.db.fetch_one(
            "SELECT * FROM stickies WHERE guild_id=? AND channel_id=?", (guild_id, channel_id)
        )

    async def _sticky_channels(self) -> set[int]:
        if self._channels is None:
            rows = await self.db.fetch_all("SELECT channel_id FROM stickies")
            self._channels = {row["channel_id"] for row in rows}
        return self._channels

    @staticmethod
    def _embed(row) -> discord.Embed:
        return without_embed_emojis(discord.Embed.from_dict(json.loads(row["embed"])))

    # posting ---------------------------------------------------------------------

    async def restick(self, channel: discord.abc.Messageable) -> None:
        """Delete the old sticky and post it again as the newest message."""
        guild = getattr(channel, "guild", None)
        if guild is None:
            return
        lock = self._locks.setdefault(channel.id, asyncio.Lock())
        async with lock:
            row = await self._row(guild.id, channel.id)
            if row is None:
                return
            if row["message_id"]:
                try:
                    await channel.get_partial_message(row["message_id"]).delete()
                except (discord.NotFound, discord.Forbidden):
                    pass
                except discord.HTTPException:
                    log.warning("Could not delete the old sticky in %s", channel.id)
            try:
                sent = await channel.send(embed=self._embed(row), allowed_mentions=discord.AllowedMentions.none())
            except (discord.Forbidden, discord.HTTPException):
                log.warning("Could not post the sticky in %s", channel.id)
                return
            await self.db.execute(
                "UPDATE stickies SET message_id=? WHERE guild_id=? AND channel_id=?", (sent.id, guild.id, channel.id)
            )

    async def _later(self, channel: discord.abc.Messageable) -> None:
        try:
            await asyncio.sleep(self.delay)
            await self.restick(channel)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Sticky repost failed")
        finally:
            self._pending.pop(channel.id, None)

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message) -> None:
        if message.guild is None or (self.bot.user and message.author.id == self.bot.user.id):
            return
        if message.channel.id in self._pending:
            return
        if message.channel.id not in await self._sticky_channels():
            return
        self._pending[message.channel.id] = asyncio.create_task(self._later(message.channel))

    # commands --------------------------------------------------------------------

    @sticky.command(name="set", description="Create or change a channel's sticky message in a pop-up form")
    @manager_only
    async def sticky_set(self, interaction: discord.Interaction, channel: discord.TextChannel) -> None:
        guild = require_guild(interaction)
        existing = await self._row(guild.id, channel.id)
        defaults = embed_defaults(self._embed(existing)) if existing else {}

        async def submit(form_interaction: discord.Interaction, embed: discord.Embed) -> None:
            await self.db.execute(
                "INSERT INTO stickies(guild_id,channel_id,embed,created_by) VALUES(?,?,?,?) "
                "ON CONFLICT(guild_id,channel_id) DO UPDATE SET embed=excluded.embed,updated_at=CURRENT_TIMESTAMP",
                (guild.id, channel.id, json.dumps(embed.to_dict()), form_interaction.user.id),
            )
            self._channels = None
            await form_interaction.response.defer(ephemeral=True)
            await self.restick(channel)
            await self.service.log(guild.id, "sticky", "set", form_interaction.user.id, str(channel.id))
            await send_to(
                guild, self.bot.config.custom_message_log_channel_id,
                f"Sticky {'updated' if existing else 'created'} in {channel.mention} by {form_interaction.user.mention}.",
            )
            await reply(form_interaction, f"Sticky {'updated' if existing else 'created'} in {channel.mention}.")

        await interaction.response.send_modal(
            EmbedForm(f"Sticky for #{channel.name}", submit, defaults)
        )

    @sticky.command(name="remove", description="Stop sticking a message to a channel and delete it")
    @manager_only
    async def sticky_remove(self, interaction: discord.Interaction, channel: discord.TextChannel) -> None:
        guild = require_guild(interaction)
        row = await self._row(guild.id, channel.id)
        if row is None:
            raise ValueError(f"{channel.mention} has no sticky message.")
        task = self._pending.pop(channel.id, None)
        if task:
            task.cancel()
        await self.db.execute("DELETE FROM stickies WHERE guild_id=? AND channel_id=?", (guild.id, channel.id))
        self._channels = None
        if row["message_id"]:
            try:
                await channel.get_partial_message(row["message_id"]).delete()
            except discord.HTTPException:
                pass
        await self.service.log(guild.id, "sticky", "remove", interaction.user.id, str(channel.id))
        await reply(interaction, f"Removed the sticky from {channel.mention}.")

    @sticky.command(name="list", description="List the channels that have a sticky message")
    @manager_only
    async def sticky_list(self, interaction: discord.Interaction) -> None:
        guild = require_guild(interaction)
        rows = await self.db.fetch_all(
            "SELECT channel_id,embed FROM stickies WHERE guild_id=? ORDER BY channel_id", (guild.id,)
        )
        lines = []
        for row in rows:
            data = json.loads(row["embed"])
            preview = (data.get("title") or data.get("description") or "").replace("\n", " ")
            lines.append(f"<#{row['channel_id']}> · {preview[:80]}")
        await reply(interaction, "\n".join(lines) or "No channel has a sticky message yet.")
