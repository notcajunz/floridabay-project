from __future__ import annotations

import logging

import discord
from discord import app_commands
from discord.ext import commands

from .config import Config
from .database import Database

log = logging.getLogger(__name__)


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
        # Role changes the bot made itself after its own checks; the member-update
        # listener skips cooldowns and conflict checks for these.
        self._managed: set[tuple[str, int, int, int]] = set()

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
        from .cogs.coordination import CoordinationCog
        from .cogs.core import CoreCog
        from .cogs.departments import DepartmentsCog
        from .cogs.email import EmailCog
        from .cogs.events import EventsCog
        from .cogs.members import MembersCog
        from .cogs.panels import PanelsCog
        from .tickets import TicketsCog

        for cog in (CoreCog(self), DepartmentsCog(self), CoordinationCog(self), MembersCog(self), EmailCog(self), EventsCog(self), PanelsCog(self), TicketsCog(self)):
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
