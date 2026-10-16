"""In-game duty hours for the DOHS organization, read from the FBRP portal."""
from __future__ import annotations

import logging
import os
import time

import discord
from discord import app_commands
from discord.ext import tasks

from .fbrp_api import FbrpApi, FbrpApiError
from .roster_bot import (CFG, DATA_DIR, MEMBER_ROLE_ID, RosterBot, RosterError, _id, clip, has_any_role,
                         roster_staff, write_json)

log = logging.getLogger("dohs.hours")

ORG_REF = str(CFG["fbrp_org_id"]).strip()
HOURS_CHANNEL_ID = _id(CFG["hours_channel_id"])
DEFAULT_DAYS = max(1, min(int(CFG["hours_days"] or 7), 90))
REQUIRED_SECONDS = max(0, int(float(CFG["hours_required"] or 0) * 3600))
EXEMPT_STATUSES = {str(x).lower() for x in CFG["hours_exempt_statuses"]}
BOARD_FILE = os.getenv("HOURS_FILE", os.path.join(DATA_DIR, "hours.json"))
BOARD_LINES = 25
MAX_DAYS = 90


def fmt_duration(seconds: int) -> str:
    seconds = max(0, int(seconds))
    h, rest = divmod(seconds, 3600)
    return f"{h}h {rest // 60:02d}m"


def window(days: int) -> tuple[int, int]:
    """(since_ms, until_ms) for the last `days` days."""
    now = int(time.time() * 1000)
    return now - days * 86_400_000, now


def clamp_days(days: int | None) -> int:
    return max(1, min(days or DEFAULT_DAYS, MAX_DAYS))


def board_lines(members: list[dict], required: int = REQUIRED_SECONDS) -> list[str]:
    lines = []
    for i, m in enumerate(members[:BOARD_LINES], start=1):
        flag = "🟢 " if m["onDuty"] else ""
        short = " ⚠️" if required and m["seconds"] < required else ""
        lines.append(f"`{i:>2}.` <@{m['discordId']}> · **{fmt_duration(m['seconds'])}** · {m['shifts']} shifts {flag}{short}".rstrip())
    return lines


def board_embed(data: dict, days: int) -> discord.Embed:
    members = data["members"]
    e = discord.Embed(title=f"⏱️ DOHS Duty Hours · last {days} day{'s' if days != 1 else ''}",
                      colour=discord.Colour.gold(), timestamp=discord.utils.utcnow())
    text = "\n".join(board_lines(members)) or "*Nobody has clocked duty hours in this window.*"
    e.description = text[:4000]
    on_duty = sum(1 for m in members if m["onDuty"])
    footer = f"{len(members)} member(s) · {fmt_duration(data['totalSeconds'])} total · {on_duty} on duty now"
    if REQUIRED_SECONDS:
        footer += f" · quota {fmt_duration(REQUIRED_SECONDS)}"
    e.set_footer(text=footer)
    return e


class HoursStore:
    def __init__(self, path: str):
        self.path = path
        self.channel_id = 0
        self.message_id = 0
        try:
            import json
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
            self.channel_id, self.message_id = int(d.get("channel_id", 0)), int(d.get("message_id", 0))
        except (OSError, ValueError):
            pass

    def set(self, channel_id: int, message_id: int) -> None:
        self.channel_id, self.message_id = channel_id, message_id
        write_json(self.path, {"channel_id": str(channel_id), "message_id": str(message_id)})


def member_only():
    def predicate(interaction: discord.Interaction) -> bool:
        if not MEMBER_ROLE_ID or has_any_role(interaction.user, {MEMBER_ROLE_ID}):
            return True
        raise app_commands.CheckFailure("Only DOHS members can use this.")
    return app_commands.check(predicate)


class HoursGroup(app_commands.Group):
    def __init__(self, bot: RosterBot):
        super().__init__(name="hours", description="DOHS in-game duty hours", guild_only=True)
        self.bot = bot
        self.api = FbrpApi()
        self.store = HoursStore(BOARD_FILE)
        self._last: str | None = None
        self.board_loop.start()

    # ---------- data ----------
    async def fetch(self, days: int, discord_id: int | None = None) -> dict:
        if not self.api.configured:
            raise RosterError("The FBRP hours API isn't configured for this bot.")
        since, until = window(days)
        try:
            return await self.api.hours(ORG_REF, since, until, discord_id)
        except FbrpApiError as error:
            raise RosterError(f"Couldn't read duty hours: {error}") from None

    # ---------- live leaderboard ----------
    async def refresh_board(self, force: bool = False) -> None:
        if not self.store.message_id:
            return
        data = await self.fetch(DEFAULT_DAYS)
        embed = board_embed(data, DEFAULT_DAYS)
        signature = repr([(m["discordId"], m["seconds"] // 60, m["onDuty"]) for m in data["members"][:BOARD_LINES]])
        if signature == self._last and not force:
            return
        try:
            channel = self.bot.get_channel(self.store.channel_id) or await self.bot.fetch_channel(self.store.channel_id)
            await channel.get_partial_message(self.store.message_id).edit(
                embed=embed, allowed_mentions=discord.AllowedMentions.none())
            self._last = signature
        except discord.NotFound:
            log.warning("Hours board message was deleted; run /hours setup again.")
            self.store.set(0, 0)
        except discord.HTTPException:
            log.exception("Couldn't update the hours board")

    @tasks.loop(minutes=5)
    async def board_loop(self):
        try:
            await self.refresh_board()
        except Exception:
            log.exception("Hours board refresh failed")

    @board_loop.before_loop
    async def before_board_loop(self):
        await self.bot.wait_until_ready()

    # ---------- commands ----------
    @app_commands.command(name="me", description="Your own DOHS duty hours")
    @app_commands.describe(days="How many days back (default from config, max 90)")
    @member_only()
    async def cmd_me(self, interaction: discord.Interaction, days: app_commands.Range[int, 1, MAX_DAYS] | None = None):
        await interaction.response.defer(ephemeral=True)
        await interaction.followup.send(embed=await self._member_embed(interaction.user.id, clamp_days(days)),
                                        ephemeral=True)

    @app_commands.command(name="member", description="A member's DOHS duty hours")
    @app_commands.describe(member="Discord member", days="How many days back (max 90)")
    @roster_staff()
    async def cmd_member(self, interaction: discord.Interaction, member: discord.Member,
                         days: app_commands.Range[int, 1, MAX_DAYS] | None = None):
        await interaction.response.defer(ephemeral=True)
        await interaction.followup.send(embed=await self._member_embed(member.id, clamp_days(days)), ephemeral=True)

    async def _member_embed(self, discord_id: int, days: int) -> discord.Embed:
        data = await self.fetch(days, discord_id)
        row = next((m for m in data["members"] if int(m["discordId"]) == discord_id), None)
        seconds = row["seconds"] if row else 0
        e = discord.Embed(title=f"⏱️ Duty hours · last {days} day{'s' if days != 1 else ''}",
                          colour=discord.Colour.gold(), timestamp=discord.utils.utcnow())
        e.add_field(name="Member", value=f"<@{discord_id}>")
        e.add_field(name="Time on duty", value=fmt_duration(seconds))
        e.add_field(name="Shifts", value=str(row["shifts"] if row else 0))
        if row and row["onDuty"]:
            e.add_field(name="Right now", value="🟢 On duty")
        if REQUIRED_SECONDS:
            met = seconds >= REQUIRED_SECONDS
            e.add_field(name="Quota", value=f"{'✅' if met else '⚠️'} {fmt_duration(seconds)} / {fmt_duration(REQUIRED_SECONDS)}"
                                            + ("" if days == DEFAULT_DAYS else f" (quota is per {DEFAULT_DAYS} days)"),
                        inline=False)
        return e

    @app_commands.command(name="leaderboard", description="Top DOHS members by duty hours")
    @app_commands.describe(days="How many days back (default from config, max 90)")
    @member_only()
    async def cmd_leaderboard(self, interaction: discord.Interaction,
                              days: app_commands.Range[int, 1, MAX_DAYS] | None = None):
        await interaction.response.defer()
        d = clamp_days(days)
        await interaction.followup.send(embed=board_embed(await self.fetch(d), d),
                                        allowed_mentions=discord.AllowedMentions.none())

    @app_commands.command(name="report", description="Roster members and their hours; flags those under quota")
    @app_commands.describe(days="How many days back (default from config, max 90)",
                           only_under_quota="Only list members below the quota")
    @roster_staff()
    async def cmd_report(self, interaction: discord.Interaction,
                         days: app_commands.Range[int, 1, MAX_DAYS] | None = None, only_under_quota: bool = False):
        await interaction.response.defer(ephemeral=True)
        d = clamp_days(days)
        data = await self.fetch(d)
        seconds = {str(m["discordId"]): m for m in data["members"]}
        people = await self.bot.run_sheet(self.bot.roster.members)
        required = REQUIRED_SECONDS * d // DEFAULT_DAYS if REQUIRED_SECONDS else 0
        rows = []
        for p in people:
            if p["status"].lower() in EXEMPT_STATUSES:
                continue
            row = seconds.get(str(p["discord_id"]))
            secs = row["seconds"] if row else 0
            if only_under_quota and (not required or secs >= required):
                continue
            rows.append((secs, p))
        rows.sort(key=lambda r: r[0])
        lines = []
        for secs, p in rows:
            who = f"<@{p['discord_id']}>" if p["discord_id"] else p["name"]
            tail = f" · {p['callsign']}" if p["callsign"] else ""
            mark = "⚠️" if required and secs < required else "✅"
            lines.append(f"{mark} **{fmt_duration(secs)}** · {who} · {p['rank']}{tail}")
        text = "\n".join(lines) or "*Nobody to show.*"
        if len(text) > 3900:
            text = text[:3900].rsplit("\n", 1)[0] + "\n…"
        e = discord.Embed(title=f"📋 Hours report · last {d} days", description=text, colour=discord.Colour.dark_teal())
        under = sum(1 for secs, _ in rows if required and secs < required)
        e.set_footer(text=(f"{under} under the {fmt_duration(required)} quota · " if required else "No quota set · ")
                          + f"exempt statuses skipped: {', '.join(sorted(EXEMPT_STATUSES)) or 'none'}")
        await interaction.followup.send(embed=e, ephemeral=True, allowed_mentions=discord.AllowedMentions.none())

    @app_commands.command(name="setup", description="Post the live duty-hours leaderboard in a channel")
    @app_commands.describe(channel="Channel to post in (default: the configured hours channel, else here)")
    @roster_staff()
    async def cmd_setup(self, interaction: discord.Interaction, channel: discord.TextChannel | None = None):
        await interaction.response.defer(ephemeral=True)
        channel = channel or (interaction.guild.get_channel(HOURS_CHANNEL_ID) if HOURS_CHANNEL_ID else None) \
            or interaction.channel
        data = await self.fetch(DEFAULT_DAYS)
        try:
            msg = await channel.send(embed=board_embed(data, DEFAULT_DAYS), allowed_mentions=discord.AllowedMentions.none())
        except discord.Forbidden:
            raise RosterError(f"I can't send messages in {channel.mention}.") from None
        old_channel, old_message = self.store.channel_id, self.store.message_id
        self.store.set(channel.id, msg.id)
        self._last = None
        if old_message:
            try:
                old = self.bot.get_channel(old_channel) or await self.bot.fetch_channel(old_channel)
                await old.get_partial_message(old_message).delete()
            except discord.HTTPException:
                pass
        await interaction.followup.send(f"✅ Hours leaderboard posted in {channel.mention}. It refreshes every 5 minutes.",
                                        ephemeral=True)

    @app_commands.command(name="org", description="Show the FBRP organization this bot counts hours for")
    @roster_staff()
    async def cmd_org(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            org = await self.api.org(ORG_REF)
        except FbrpApiError as error:
            raise RosterError(f"Couldn't read the organization: {error}") from None
        e = discord.Embed(title=f"🏛️ {clip(org['name'], 200)}", colour=discord.Colour.dark_teal())
        e.add_field(name="Org ID", value=str(org["id"]))
        e.add_field(name="Type", value=str(org["type"]))
        e.add_field(name="Active", value="Yes" if org.get("active") else "No")
        e.add_field(name="Members in game", value=str(org.get("members", 0)))
        await interaction.followup.send(embed=e, ephemeral=True)
