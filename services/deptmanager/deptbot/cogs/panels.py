from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

import discord
from discord.ext import commands, tasks

from ..common import DeptCog, without_embed_emojis
from ..constants import COORDINATOR_RANKS, DEPARTMENT_CATEGORIES
from ..fbrp_api import FbrpApi, FbrpApiError
from ..role_policy import format_hours_line
from ..services import duration

log = logging.getLogger(__name__)

KINDS = ("chain", "hours")
HOURS_EVERY = 5  # minutes; each refresh calls the portal once per linked department
TOP_MEMBERS = 10
FIELD_LIMIT = 1024


def chunk_lines(lines: list[str], limit: int = FIELD_LIMIT) -> list[str]:
    """Pack lines into embed-field-sized chunks without splitting a line."""
    chunks: list[str] = []
    current = ""
    for line in lines:
        line = line[:limit]
        candidate = f"{current}\n{line}" if current else line
        if len(candidate) <= limit:
            current = candidate
            continue
        chunks.append(current)
        current = line
    if current:
        chunks.append(current)
    return chunks


def build_chain_embed(guild: discord.Guild, config) -> discord.Embed:
    """Chain of command from the rank roles themselves. Each person appears once, under their highest rank."""
    embed = discord.Embed(
        title="Department Coordination · Chain of Command",
        description="The Department Coordination hierarchy, from highest authority down.",
        color=discord.Color.gold(),
        timestamp=datetime.now(UTC),
    )
    if guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    placed: set[int] = set()
    for position, rank in enumerate(COORDINATOR_RANKS, start=1):
        role = guild.get_role(config.coordinator_role_ids.get(rank, 0))
        if role is None:
            continue
        holders = sorted(
            (member for member in role.members if member.id not in placed and not member.bot),
            key=lambda member: member.display_name.lower(),
        )
        placed.update(member.id for member in holders)
        lines = [f"└ {member.mention}" for member in holders] or ["└ *Vacant*"]
        for index, chunk in enumerate(chunk_lines([role.mention, *lines])):
            embed.add_field(name=f"{position:02d}  {rank}" if index == 0 else "​", value=chunk, inline=False)
    jobs = []
    for name, role_id in config.coordinator_job_role_ids.items():
        role = guild.get_role(role_id)
        if role is None:
            continue
        holders = sorted((m for m in role.members if not m.bot), key=lambda m: m.display_name.lower())
        jobs.append(f"{role.mention}: " + (", ".join(m.mention for m in holders) or "*Vacant*"))
    for index, chunk in enumerate(chunk_lines(jobs)):
        embed.add_field(name="Coordination Positions" if index == 0 else "​", value=chunk, inline=False)
    embed.set_footer(text=f"{len(placed)} team member(s) • Updates automatically")
    return embed


class PanelsCog(DeptCog):
    """Self-updating embeds: the chain of command and the department hours leaderboard."""

    def __init__(self, bot: commands.Bot):
        super().__init__(bot)
        self._rendered: dict[tuple[int, str], str] = {}
        self._ticks = 0
        self._lock = asyncio.Lock()

    async def cog_load(self) -> None:
        self.refresh_loop.start()

    async def cog_unload(self) -> None:
        self.refresh_loop.cancel()

    def _channel_id(self, kind: str) -> int:
        config = self.bot.config  # type: ignore[attr-defined]
        return {"chain": config.chain_of_command_channel_id, "hours": config.hours_channel_id}[kind]

    @tasks.loop(minutes=1)
    async def refresh_loop(self) -> None:
        kinds = KINDS if self._ticks % HOURS_EVERY == 0 else ("chain",)
        self._ticks += 1
        for guild in self.bot.guilds:
            await self.refresh(guild, *kinds)

    @refresh_loop.before_loop
    async def before_refresh_loop(self) -> None:
        await self.bot.wait_until_ready()

    @commands.Cog.listener()
    async def on_raw_message_delete(self, payload: discord.RawMessageDeleteEvent) -> None:
        if payload.guild_id is None:
            return
        for kind in KINDS:
            if payload.message_id in await self._saved_ids(payload.guild_id, kind):
                self._rendered.pop((payload.guild_id, kind), None)

    async def refresh(self, guild: discord.Guild, *kinds: str, force: bool = False) -> None:
        builders: dict[str, Callable[[discord.Guild], Awaitable[list[discord.Embed]]]] = {
            "chain": self._chain_embeds,
            "hours": self._hours_embeds,
        }
        async with self._lock:
            for kind in kinds or KINDS:
                channel = guild.get_channel(self._channel_id(kind))
                if not isinstance(channel, discord.abc.Messageable):
                    continue
                try:
                    embeds = [without_embed_emojis(embed) for embed in await builders[kind](guild)]
                    fingerprint = json.dumps(
                        [{k: v for k, v in embed.to_dict().items() if k != "timestamp"} for embed in embeds],
                        sort_keys=True,
                    )
                    if not force and self._rendered.get((guild.id, kind)) == fingerprint:
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

    async def _sync(self, guild: discord.Guild, kind: str, channel, embeds: list[discord.Embed]) -> None:
        """Edit the saved messages in place, resending from the first missing one."""
        saved = await self._saved_ids(guild.id, kind)
        kept: list[int] = []
        for index, embed in enumerate(embeds):
            if index < len(saved):
                try:
                    await channel.get_partial_message(saved[index]).edit(embed=embed)
                    kept.append(saved[index])
                    continue
                except discord.NotFound:
                    # Anything after a missing page would now be out of order.
                    await self._delete_messages(channel, saved[index + 1 :])
                    saved = saved[:index]
            message = await channel.send(embed=embed)
            kept.append(message.id)
        await self._delete_messages(channel, saved[len(embeds) :])
        await self.service.set_setting(guild.id, f"panel:{kind}", json.dumps(kept))

    @staticmethod
    async def _delete_messages(channel, ids: list[int]) -> None:
        for message_id in ids:
            try:
                await channel.get_partial_message(message_id).delete()
            except (discord.NotFound, discord.Forbidden):
                pass

    async def _chain_embeds(self, guild: discord.Guild) -> list[discord.Embed]:
        return [build_chain_embed(guild, self.bot.config)]

    async def _hours_embeds(self, guild: discord.Guild) -> list[discord.Embed]:
        """Department ranking by in-game duty hours, then one embed per department with its top members."""
        days = self.bot.config.hours_days
        rows = await self.db.fetch_all(
            "SELECT * FROM departments WHERE guild_id=? AND hide_leaderboard=0 AND status!='Closed'",
            (guild.id,),
        )
        linked = [dict(row) for row in rows if row["fbrp_org_id"]]
        api = FbrpApi()
        until = int(time.time() * 1000)

        async def fetch(row):
            try:
                return row, await api.hours(row["fbrp_org_id"], until - days * 86_400_000, until)
            except FbrpApiError:
                log.warning("Could not read hours for %s", row["name"])
                return None

        results = [item for item in await asyncio.gather(*(fetch(row) for row in linked)) if item]
        results.sort(key=lambda item: (-int(item[1]["totalSeconds"]), item[0]["name"].lower()))
        order = {name: index for index, name in enumerate(DEPARTMENT_CATEGORIES)}

        summary = discord.Embed(
            title="Department Hours Leaderboard",
            color=discord.Color.gold(),
            timestamp=datetime.now(UTC),
        )
        lines = []
        for rank, (row, data) in enumerate(results, 1):
            on_duty = sum(1 for member in data["members"] if member["onDuty"])
            role = f"<@&{row['base_role_id']}>" if row["base_role_id"] else f"**{row['name']}**"
            lines.append(
                f"`{rank}.` {role} · **{duration(int(data['totalSeconds']))}**\n"
                f"┗ {len(data['members'])} active member(s)" + (f" · {on_duty} on duty" if on_duty else "")
            )
        summary.description = "\n".join(lines)[:4000] or (
            "No departments have an FBRP org linked yet. Link one with `/dept update org_id:`."
            if not linked else "No duty hours recorded yet."
        )
        unlinked = sorted(
            (dict(row) for row in rows if not row["fbrp_org_id"]),
            key=lambda row: (order.get(row["category"], 99), row["name"].lower()),
        )
        if unlinked:
            summary.add_field(
                name="Not tracked (no FBRP org linked)",
                value=", ".join(f"<@&{row['base_role_id']}>" if row["base_role_id"] else row["name"] for row in unlinked)[:1024],
                inline=False,
            )
        summary.set_footer(text=f"Last {days} days of in-game duty • Updates every {HOURS_EVERY} minutes")
        embeds = [summary]
        for rank, (row, data) in enumerate(results, 1):
            embed = discord.Embed(
                title=f"#{rank} · {row['name']}",
                color=row["role_color"] or discord.Color.blurple(),
            )
            top = [format_hours_line(position, member) for position, member in enumerate(data["members"][:TOP_MEMBERS], 1)]
            embed.description = "\n".join(top) or "No duty time recorded."
            embed.set_footer(
                text=f"{row['category']} · Org {row['fbrp_org_id']} · total {duration(int(data['totalSeconds']))} · last {days} days"
            )
            embeds.append(embed)
        # Discord allows 10 embeds per message; one message per embed keeps edits simple.
        return embeds[:25]
