from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable

import discord
from discord.ext import commands, tasks

from ..fbrp_api import FbrpApi, FbrpApiError
from ..common import BusinessCog, without_embed_emojis

log = logging.getLogger(__name__)

PAGE_LIMIT = 3800  # Embed descriptions allow 4096 characters.
KINDS = ("hours",)
HOURS_DAYS = 7


def paginate(lines: list[str], limit: int = PAGE_LIMIT) -> list[str]:
    """Pack lines into pages without splitting an entry across two pages."""
    pages: list[str] = []
    current = ""
    for line in lines:
        line = line[:limit]
        candidate = f"{current}\n{line}" if current else line
        if len(candidate) <= limit:
            current = candidate
            continue
        pages.append(current)
        current = line
    if current:
        pages.append(current)
    return pages


class PanelsCog(BusinessCog):
    """Self-updating weekly FBRP organization-hours panel."""

    def __init__(self, bot: commands.Bot):
        super().__init__(bot)
        self._rendered: dict[tuple[int, str], str] = {}

    async def cog_load(self) -> None:
        self.refresh_loop.start()

    async def cog_unload(self) -> None:
        self.refresh_loop.cancel()

    def _channel_id(self, kind: str) -> int:
        config = self.bot.config  # type: ignore[attr-defined]
        return {"hours": config.hours_channel_id}[kind]

    @tasks.loop(minutes=1)
    async def refresh_loop(self) -> None:
        # Org-hour totals change outside Discord, so this loop is the catch-all.
        for guild in self.bot.guilds:
            await self.refresh(guild)

    @refresh_loop.before_loop
    async def before_refresh_loop(self) -> None:
        await self.bot.wait_until_ready()

    @commands.Cog.listener()
    async def on_raw_message_delete(self, payload: discord.RawMessageDeleteEvent) -> None:
        if payload.guild_id is None:
            return
        for kind in KINDS:
            saved = await self._saved_ids(payload.guild_id, kind)
            if payload.message_id in saved:
                self._rendered.pop((payload.guild_id, kind), None)

    async def refresh(self, guild: discord.Guild, *kinds: str) -> None:
        builders: dict[str, Callable[[discord.Guild], Awaitable[list[discord.Embed]]]] = {
            "hours": self._hours_embeds,
        }
        for kind in kinds or KINDS:
            if kind not in builders:
                continue
            channel = guild.get_channel(self._channel_id(kind))
            if not isinstance(channel, discord.abc.Messageable):
                continue
            try:
                embeds = await builders[kind](guild)
                fingerprint = json.dumps([embed.to_dict() for embed in embeds], sort_keys=True)
                if self._rendered.get((guild.id, kind)) == fingerprint:
                    continue
                await self._sync(guild, kind, channel, embeds)
                self._rendered[(guild.id, kind)] = fingerprint
            except (discord.Forbidden, discord.HTTPException):
                log.exception("Could not update the %s panel", kind)

    async def _saved_ids(self, guild_id: int, kind: str) -> list[int]:
        raw = await self.service.setting(guild_id, f"panel:{kind}")
        try:
            return [int(value) for value in json.loads(raw)] if raw else []
        except (ValueError, TypeError):
            return []

    async def _sync(
        self,
        guild: discord.Guild,
        kind: str,
        channel: discord.abc.Messageable,
        embeds: list[discord.Embed],
    ) -> None:
        """Edit the saved messages in place, resending from the first missing one."""
        saved = await self._saved_ids(guild.id, kind)
        kept: list[int] = []
        for index, embed in enumerate(embeds):
            embed = without_embed_emojis(embed)
            if index < len(saved):
                try:
                    await channel.get_partial_message(saved[index]).edit(embed=embed)  # type: ignore[attr-defined]
                    kept.append(saved[index])
                    continue
                except discord.NotFound:
                    # Anything after a missing page would now be out of order.
                    await self._delete_messages(channel, saved[index + 1 :])
                    saved = saved[: index]
            message = await channel.send(embed=embed)
            kept.append(message.id)
        await self._delete_messages(channel, saved[len(embeds) :])
        await self.service.set_setting(guild.id, f"panel:{kind}", json.dumps(kept))

    @staticmethod
    async def _delete_messages(channel: discord.abc.Messageable, ids: list[int]) -> None:
        for message_id in ids:
            try:
                await channel.get_partial_message(message_id).delete()  # type: ignore[attr-defined]
            except (discord.NotFound, discord.Forbidden):
                pass

    @staticmethod
    def _pages(
        title: str, color: discord.Color, lines: list[str], empty: str, footer: str
    ) -> list[discord.Embed]:
        pages = paginate(lines) or [empty]
        embeds = []
        for number, page in enumerate(pages, 1):
            embed = discord.Embed(
                title=title if len(pages) == 1 else f"{title} ({number}/{len(pages)})",
                description=page,
                color=color,
            )
            embed.set_footer(text=footer)
            embeds.append(embed)
        return embeds

    async def _hours_embeds(self, guild: discord.Guild) -> list[discord.Embed]:
        """Weekly in-game duty hours for every business linked to an FBRP org."""
        rows = await self.db.fetch_all(
            "SELECT name,tier,fbrp_org_id FROM businesses WHERE guild_id=? AND hide_leaderboard=0 "
            "AND fbrp_org_id IS NOT NULL AND fbrp_org_id<>''",
            (guild.id,),
        )
        api = FbrpApi()
        until = int(time.time() * 1000)

        async def fetch(row):
            try:
                data = await api.hours(row["fbrp_org_id"], until - HOURS_DAYS * 86_400_000, until)
            except FbrpApiError:
                return None
            return row, data

        results = [r for r in await asyncio.gather(*(fetch(r) for r in rows)) if r]
        results.sort(key=lambda item: (-item[1]["totalSeconds"], item[0]["name"].lower()))
        lines = []
        for rank, (row, data) in enumerate(results, 1):
            total = int(data["totalSeconds"])
            on_duty = sum(1 for m in data["members"] if m["onDuty"])
            lines.append(
                f"`{rank}.` **{row['name']}** · T{row['tier']} · **{total // 3600}h {total % 3600 // 60}m**\n"
                f"┗ {len(data['members'])} active member(s)" + (f" · {on_duty} on duty" if on_duty else "")
            )
        return self._pages(
            "Hours Leaderboard",
            discord.Color.green(),
            lines,
            "No businesses have an FBRP org linked yet." if not rows else "No duty hours recorded yet.",
            f"Last {HOURS_DAYS} days of in-game duty • Updates automatically",
        )
