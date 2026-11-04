from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands

from .config import Config
from .database import Database

log = logging.getLogger(__name__)

# Events the bot still handles for department Discord servers. Everything else (logs, cooldowns,
# role conflicts, stickies, tickets) belongs to the home server only.
FOREIGN_GUILD_EVENTS = frozenset({"guild_join", "guild_remove", "guild_available", "interaction"})


def event_guild_id(args) -> int | None:
    """The server an event belongs to, from its first argument (member, role, message, payload...)."""
    if not args:
        return None
    first = args[0]
    if isinstance(first, discord.Guild):
        return first.id
    guild = getattr(first, "guild", None)
    if isinstance(guild, discord.Guild):
        return guild.id
    raw = getattr(first, "guild_id", None)
    return int(raw) if isinstance(raw, int) else None


class AccessCommandTree(app_commands.CommandTree):
    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.command is None or not isinstance(interaction.user, discord.Member):
            return True
        config = self.client.config  # type: ignore[attr-defined]
        decision = config.access_decision(
            interaction.command.qualified_name.lower(),
            interaction.user.id,
            {role.id for role in interaction.user.roles},
            administrator=interaction.user.guild_permissions.administrator,
        )
        if decision is False:
            raise app_commands.CheckFailure("You are not allowed to use this command by `config.toml`.")
        return True


class DepartmentManagerBot(commands.Bot):
    def __init__(self, config: Config):
        intents = discord.Intents.default()
        intents.members = True
        intents.message_content = True
        super().__init__(
            command_prefix=commands.when_mentioned,
            intents=intents,
            tree_cls=AccessCommandTree,
            allowed_mentions=discord.AllowedMentions(everyone=False, roles=False, users=True),
        )
        self.config = config
        self.db = Database(config.database_path)
        # Department Discord servers linked with /dept add guild_id. Their events pass the guild
        # guard so the bot sees them, but only role commands run there.
        self.linked_guild_ids: set[int] = set()
        self._limit_to_guild(config.guild_id)
        # Role changes the bot made itself after its own checks; the member-update
        # listener skips cooldowns and conflict checks for these.
        self._managed: set[tuple[str, int, int, int]] = set()

    def _limit_to_guild(self, guild_id: int | None) -> None:
        """Drop gateway events of other servers.

        One bot application runs one instance per Discord server (Department Hub,
        Armed Forces), each with its own config and database. Every instance
        receives every event of the application, so each ignores the servers that
        are not its own, including interactions for buttons and modals. Department
        servers linked to this instance's departments are its own too.
        """
        if not guild_id:
            return
        guild_events = {"GUILD_CREATE", "GUILD_UPDATE", "GUILD_DELETE"}
        parsers = self._connection.parsers
        linked = self.linked_guild_ids

        def guarded(name: str, parser):
            def parse(data):
                raw = data.get("id") if name in guild_events else data.get("guild_id")
                if raw is not None and int(raw) != guild_id and int(raw) not in linked:
                    return None
                return parser(data)

            return parse

        for name, parser in list(parsers.items()):
            parsers[name] = guarded(name, parser)

    def home_guilds(self) -> list[discord.Guild]:
        """The server(s) this instance runs (not the linked department servers)."""
        if not self.config.guild_id:
            return [guild for guild in self.guilds if guild.id not in self.linked_guild_ids]
        guild = self.get_guild(self.config.guild_id)
        return [guild] if guild else []

    def is_foreign(self, guild_id: int | None) -> bool:
        return guild_id is not None and guild_id in self.linked_guild_ids and guild_id != self.config.guild_id

    def dispatch(self, event_name: str, /, *args, **kwargs) -> None:
        if event_name not in FOREIGN_GUILD_EVENTS and self.is_foreign(event_guild_id(args)):
            return
        super().dispatch(event_name, *args, **kwargs)

    def mark_managed(self, kind: str, guild_id: int, member_id: int, role_id: int) -> None:
        self._managed.add((kind, guild_id, member_id, role_id))

    def consume_managed(self, kind: str, guild_id: int, member_id: int, role_id: int) -> bool:
        key = (kind, guild_id, member_id, role_id)
        if key in self._managed:
            self._managed.remove(key)
            return True
        return False

    async def setup_hook(self) -> None:
        await self.db.connect()
        from .services import DepartmentService

        self.linked_guild_ids.update(await DepartmentService(self.db).linked_guild_ids(self.config.guild_id))
        from .cogs.coordination import CoordinationCog
        from .cogs.badges import BadgesCog
        from .cogs.core import CoreCog
        from .cogs.departments import DepartmentsCog
        from .cogs.dept_guilds import DeptGuildsCog
        from .cogs.email import EmailCog
        from .cogs.events import EventsCog
        from .cogs.members import MembersCog
        from .cogs.panels import PanelsCog
        from .cogs.positions import PositionsCog
        from .cogs.stickies import StickiesCog
        from .tickets import TicketsCog

        for cog in (CoreCog(self), BadgesCog(self), DepartmentsCog(self), CoordinationCog(self), MembersCog(self), EmailCog(self), EventsCog(self), PanelsCog(self), PositionsCog(self), StickiesCog(self), TicketsCog(self), DeptGuildsCog(self)):
            await self.add_cog(cog)

        self.tree.on_error = self.on_tree_error
        if self.config.guild_id:
            target = discord.Object(id=self.config.guild_id)
            self.tree.copy_global_to(guild=target)
            synced = await self.tree.sync(guild=target)
            log.info("Synced %d commands to guild %d", len(synced), target.id)
        else:
            synced = await self.tree.sync()
            log.info("Synced %d global commands", len(synced))
        await self.get_cog("DeptGuildsCog").sync_all()

    async def close(self) -> None:
        await self.db.close()
        await super().close()

    async def on_ready(self) -> None:
        log.info("Logged in as %s (%s)", self.user, self.user.id if self.user else "unknown")
        await self.change_presence(activity=discord.Game(name="Managing departments | /help"))

    async def on_tree_error(self, interaction: discord.Interaction, error: app_commands.AppCommandError) -> None:
        original = getattr(error, "original", error)
        if isinstance(original, app_commands.CommandOnCooldown):
            message = f"Try again in {original.retry_after:.1f} seconds."
        elif isinstance(original, app_commands.CheckFailure):
            message = str(original) or "You do not have permission to use this command."
        elif isinstance(original, discord.Forbidden):
            message = "Discord refused that action. Check the bot's role position and permissions."
        elif isinstance(original, (ValueError, KeyError)):
            message = str(original).strip("'")
        else:
            log.exception("Unhandled slash command error", exc_info=original)
            message = "Something went wrong while running that command. The error was logged."
        if interaction.response.is_done():
            await interaction.followup.send(message, ephemeral=True)
        else:
            await interaction.response.send_message(message, ephemeral=True)
