from __future__ import annotations

import logging
from datetime import UTC, datetime

import discord
from discord import app_commands
from discord.ext import tasks

from ..common import (
    DeptCog,
    coordinator_only,
    has_bypass,
    guild_id,
    manager_only,
    refresh_panels,
    reply,
    require_guild,
    send_to,
)
from ..constants import COORDINATOR_RANKS
from ..role_policy import today
from ..roster_sheet import RosterResult, RosterSheet, RosterSheetError

log = logging.getLogger(__name__)

RANK_CHOICES = [app_commands.Choice(name=value, value=value) for value in COORDINATOR_RANKS]


async def job_autocomplete(interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
    jobs = interaction.client.config.coordinator_job_role_ids  # type: ignore[attr-defined]
    return [
        app_commands.Choice(name=name, value=name)
        for name in jobs
        if current.lower() in name.lower()
    ][:25]


class CoordinationCog(DeptCog):
    coord = app_commands.Group(name="coord", description="Department coordination team tools")

    def __init__(self, bot, roster: RosterSheet | None = None):
        super().__init__(bot)
        self.roster = roster
        if roster is None:
            try:
                self.roster = RosterSheet.from_config(bot.config)
            except RosterSheetError as error:
                log.warning("Coordinator roster sync is off: %s", error)

    async def _roster(self, operation) -> str:
        """Run a roster sheet update. The Discord change already happened, so this never fails the command."""
        if self.roster is None:
            return ""
        try:
            result: RosterResult = await operation(self.roster)
        except RosterSheetError as error:
            log.warning("Coordinator roster update failed: %s", error)
            return f"\nRoster sheet: not updated ({error})"
        except Exception:
            log.exception("Coordinator roster update failed")
            return "\nRoster sheet: not updated (unexpected error, logged)."
        return "\n" + result.line()

    def _rank_roles(self, guild: discord.Guild) -> dict[str, discord.Role]:
        roles = {}
        for rank in COORDINATOR_RANKS:
            role = guild.get_role(self.bot.config.coordinator_role_ids.get(rank, 0))
            if role:
                roles[rank] = role
        return roles

    def _team_role_for(self, guild: discord.Guild, rank: str) -> discord.Role | None:
        """The shared coordinator role, for ranks at or above the rank it represents."""
        config = self.bot.config
        team = guild.get_role(config.coord_team_role_id)
        if team is None:
            return None
        team_rank = next((name for name, role_id in config.coordinator_role_ids.items() if role_id == team.id), None)
        if team_rank and COORDINATOR_RANKS.index(rank) > COORDINATOR_RANKS.index(team_rank):
            return None
        return team

    def _require_outranks(self, interaction: discord.Interaction, index: int | None, action: str) -> None:
        """Coordination staff may only act on ranks strictly below their own."""
        if index is None or has_bypass(interaction) or not isinstance(interaction.user, discord.Member):
            return
        own = self.bot.config.rank_index({role.id for role in interaction.user.roles})
        if own is not None and index <= own:
            raise ValueError(f"You can only {action} below your own rank.")

    async def _movement(self, guild: discord.Guild, member: discord.Member, action: str, actor: discord.abc.User) -> None:
        await send_to(
            guild, self.bot.config.coord_movement_channel_id,
            f"<@!{member.id}> --> {action} | {today()} | {actor.mention}",
        )

    @coord.command(name="add", description="Hire, promote or demote a department coordinator")
    @manager_only
    @app_commands.choices(rank=RANK_CHOICES)
    async def coord_add(
        self, interaction: discord.Interaction, member: discord.Member, rank: app_commands.Choice[str] | None = None
    ) -> None:
        guild = require_guild(interaction)
        await interaction.response.defer(ephemeral=True)
        if rank is None:
            configured = list(self.bot.config.coordinator_role_ids)
            if len(configured) != 1:
                raise ValueError("Pick a rank.")
            rank = app_commands.Choice(name=configured[0], value=configured[0])
        self._require_outranks(interaction, COORDINATOR_RANKS.index(rank.value), "assign ranks")
        self._require_outranks(interaction, self.bot.config.rank_index({role.id for role in member.roles}), "change coordinators")
        ranks = self._rank_roles(guild)
        target = ranks.get(rank.value)
        if target is None:
            raise ValueError(f"Configure a valid role ID for `{rank.value}` in config.toml first.")
        held = {role.id for role in member.roles}
        previous = self.bot.config.rank_index(held)
        team = self._team_role_for(guild, rank.value)
        keep = {target.id} | ({team.id} if team else set())
        stale = [role for role in ranks.values() if role.id in held and role.id not in keep]
        if stale:
            await member.remove_roles(*stale, reason=f"Coordinator rank updated by {interaction.user}")
        await member.add_roles(*[role for role in (target, team) if role], reason=f"Coordinator rank set by {interaction.user}")
        new_index = COORDINATOR_RANKS.index(rank.value)
        if previous is None:
            action = f"Hired as {rank.value}"
        elif new_index < previous:
            action = f"Promoted to {rank.value}"
        elif new_index > previous:
            action = f"Demoted to {rank.value}"
        else:
            action = f"Confirmed as {rank.value}"
        await self.service.log(guild.id, "coord", "rank", interaction.user.id, str(member.id), rank.value)
        await self._movement(guild, member, action, interaction.user)
        await refresh_panels(self.bot, guild, "chain")
        sheet = await self._roster(lambda roster: roster.place(member.id, member.display_name, rank.value))
        await reply(interaction, f"{member.mention}: {action}.{sheet}")

    @coord.command(name="remove", description="Remove every coordination rank and position from a member")
    @manager_only
    @app_commands.choices(reason=[
        app_commands.Choice(name="Resigned", value="Resigned"),
        app_commands.Choice(name="Removed", value="Removed"),
    ])
    async def coord_remove(
        self, interaction: discord.Interaction, member: discord.Member, reason: app_commands.Choice[str]
    ) -> None:
        guild = require_guild(interaction)
        await interaction.response.defer(ephemeral=True)
        held = [guild.get_role(role_id) for role_id in self.bot.config.coordinator_role_set()]
        held = [role for role in held if role and role in member.roles]
        if not held:
            raise ValueError(f"{member.mention} has no coordination roles.")
        self._require_outranks(interaction, self.bot.config.rank_index({role.id for role in member.roles}), "remove coordinators")
        await member.remove_roles(*held, reason=f"Coordinator {reason.value.lower()} by {interaction.user}")
        await self.service.log(guild.id, "coord", "remove", interaction.user.id, str(member.id), reason.value)
        await self._movement(guild, member, f"{reason.value} from Department Coordination", interaction.user)
        await refresh_panels(self.bot, guild, "chain")
        sheet = await self._roster(lambda roster: roster.vacate(member.id, member.display_name, reason.value))
        await reply(interaction, f"Removed {len(held)} coordination role(s) from {member.mention}.{sheet}")

    @coord.command(name="job", description="Give or take a coordination position (DC job)")
    @manager_only
    @app_commands.choices(action=[
        app_commands.Choice(name="Add", value="add"),
        app_commands.Choice(name="Remove", value="remove"),
    ])
    @app_commands.autocomplete(job=job_autocomplete)
    async def coord_job(
        self, interaction: discord.Interaction, action: app_commands.Choice[str], member: discord.Member, job: str
    ) -> None:
        guild = require_guild(interaction)
        await interaction.response.defer(ephemeral=True)
        role = guild.get_role(self.bot.config.coordinator_job_role_ids.get(job, 0))
        if role is None:
            raise ValueError(f"`{job}` is not a configured coordination position.")
        if action.value == "add":
            await member.add_roles(role, reason=f"Coordination position by {interaction.user}")
            text = f"Assigned {job}"
        else:
            await member.remove_roles(role, reason=f"Coordination position removed by {interaction.user}")
            text = f"Removed from {job}"
        await self.service.log(guild.id, "coord", f"job-{action.value}", interaction.user.id, str(member.id), job)
        await self._movement(guild, member, text, interaction.user)
        await refresh_panels(self.bot, guild, "chain")
        sheet = await self._roster(lambda roster: roster.set_job(member.id, job, action.value == "add"))
        await reply(interaction, f"{member.mention}: {text}.{sheet}")

    async def cog_load(self) -> None:
        if self.roster is not None:
            self.sheet_sync_loop.start()

    async def cog_unload(self) -> None:
        self.sheet_sync_loop.cancel()

    async def reconcile(self, guild: discord.Guild, *, clear_missing: bool = True, safety_limit: int | None = 3) -> RosterResult:
        """Make the roster sheet match the ranks and jobs people hold in Discord right now."""
        assert self.roster is not None
        config = self.bot.config
        holders: dict[str, tuple[str, str]] = {}
        for rank, role in self._rank_roles(guild).items():  # highest rank first
            for member in role.members:
                if not member.bot and str(member.id) not in holders:
                    holders[str(member.id)] = (member.display_name, rank)
        jobs: dict[str, set[str]] = {}
        for job, role_id in config.coordinator_job_role_ids.items():
            role = guild.get_role(role_id)
            jobs[job.lower()] = {str(member.id) for member in (role.members if role else []) if not member.bot}
        return await self.roster.sync(
            holders, jobs, remove_missing=clear_missing, max_removals=safety_limit,
            job_names=list(config.coordinator_job_role_ids),
        )

    @tasks.loop(minutes=30)
    async def sheet_sync_loop(self) -> None:
        """Catch role changes made by hand in Discord, so the sheet never drifts for long."""
        for guild in self.bot.home_guilds():
            if not guild.chunked:
                continue  # an incomplete member list would look like everyone left
            try:
                result = await self.reconcile(guild)
            except RosterSheetError as error:
                log.warning("Coordinator roster sync skipped for %s: %s", guild.id, error)
                continue
            except Exception:
                log.exception("Coordinator roster sync failed for %s", guild.id)
                continue
            if result.changes:
                log.info("Coordinator roster synced for %s: %s", guild.id, "; ".join(result.changes))
                await self.service.log(guild.id, "coord", "sheet-sync", None, "", "; ".join(result.changes)[:500])

    @sheet_sync_loop.before_loop
    async def _before_sheet_sync(self) -> None:
        await self.bot.wait_until_ready()

    @coord.command(name="sync", description="Make the coordinator roster sheet match the ranks and jobs held in Discord")
    @manager_only
    @app_commands.describe(clear_missing="Also empty sheet rows of people who hold no coordinator rank (default yes)")
    async def coord_sync(self, interaction: discord.Interaction, clear_missing: bool = True) -> None:
        guild = require_guild(interaction)
        if self.roster is None:
            raise ValueError("The coordinator roster sheet is not configured for this server.")
        if not guild.chunked:
            raise ValueError("I do not have the full member list yet. Try again in a minute.")
        await interaction.response.defer(ephemeral=True)
        result = await self.reconcile(guild, clear_missing=clear_missing, safety_limit=None)
        await self.service.log(guild.id, "coord", "sync", interaction.user.id, "", "; ".join(result.changes)[:500])
        await reply(interaction, result.line().replace("Roster sheet:", "Roster sheet synced:"))

    @coord.command(name="update", description="Refresh the chain of command and hours leaderboard now")
    @coordinator_only
    async def coord_update(self, interaction: discord.Interaction) -> None:
        guild = require_guild(interaction)
        await interaction.response.defer(ephemeral=True)
        events = self.bot.get_cog("EventsCog")
        expired = await events.expire_now() if events else 0
        panels = self.bot.get_cog("PanelsCog")
        if panels:
            await panels.refresh(guild, force=True)
        await reply(
            interaction,
            f"Removed {expired} expired cooldown/temporary role(s) and refreshed "
            f"<#{self.bot.config.chain_of_command_channel_id}> and <#{self.bot.config.hours_channel_id}>.",
        )

    @coord.command(name="activity", description="View recent department coordination activity")
    @coordinator_only
    async def coord_activity(self, interaction: discord.Interaction) -> None:
        rows = await self.db.fetch_all(
            "SELECT category,action,actor_id,subject,details,created_at FROM activity_log WHERE guild_id=? ORDER BY id DESC LIMIT 20",
            (guild_id(interaction),),
        )
        lines = []
        for row in rows:
            stamp = int(datetime.fromisoformat(row["created_at"]).replace(tzinfo=UTC).timestamp())
            subject = f"<@{row['subject']}>" if (row["subject"] or "").isdigit() else (row["subject"] or "")
            detail = f" · {row['details']}" if row["details"] and len(row["details"]) <= 60 else ""
            lines.append(f"<t:{stamp}:R> **{row['category']} {row['action']}** {subject}{detail} · <@{row['actor_id']}>")
        embed = discord.Embed(title="Recent activity", description="\n".join(lines)[:4000] or "No activity yet.", color=discord.Color.blurple())
        await reply(interaction, embed=embed)
