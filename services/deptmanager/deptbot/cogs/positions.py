from __future__ import annotations

import discord
from discord import app_commands

from ..common import DeptCog, has_bypass, manager_only, refresh_panels, reply, require_guild, send_to
from ..role_policy import today


async def position_autocomplete(interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
    positions = interaction.client.config.positions  # type: ignore[attr-defined]
    return [app_commands.Choice(name=name, value=name) for name in positions if current.lower() in name.lower()][:25]


class PositionsCog(DeptCog):
    """Chain-of-command positions (Commander in Chief, Secretary of Defense, ...) from `[bot.positions]`."""

    position = app_commands.Group(name="position", description="Chain of command positions")

    def _role(self, guild: discord.Guild, name: str) -> discord.Role:
        role = guild.get_role(self.bot.config.positions.get(name, 0))
        if role is None:
            raise ValueError(f"`{name}` is not a configured position.")
        return role

    def _require_outranks(self, interaction: discord.Interaction, name: str, member: discord.Member) -> None:
        """Position holders may only hand out and take positions strictly below their own."""
        config = self.bot.config
        if has_bypass(interaction) or not isinstance(interaction.user, discord.Member):
            return
        own = config.position_index({role.id for role in interaction.user.roles})
        if own is None:
            return
        target = list(config.positions).index(name)
        if target <= own:
            raise ValueError("You can only manage positions below your own.")
        current = config.position_index({role.id for role in member.roles})
        if current is not None and current <= own:
            raise ValueError("You can only change members whose position is below your own.")

    @position.command(name="set", description="Put a member into a chain-of-command position")
    @manager_only
    @app_commands.autocomplete(position=position_autocomplete)
    async def position_set(self, interaction: discord.Interaction, member: discord.Member, position: str) -> None:
        guild = require_guild(interaction)
        role = self._role(guild, position)
        self._require_outranks(interaction, position, member)
        if role in member.roles:
            raise ValueError(f"{member.mention} already holds {role.mention}.")
        await member.add_roles(role, reason=f"Position set by {interaction.user}")
        await self._done(interaction, guild, member, position, f"Appointed {position}")

    @position.command(name="remove", description="Take a chain-of-command position from a member")
    @manager_only
    @app_commands.autocomplete(position=position_autocomplete)
    async def position_remove(self, interaction: discord.Interaction, member: discord.Member, position: str) -> None:
        guild = require_guild(interaction)
        role = self._role(guild, position)
        self._require_outranks(interaction, position, member)
        if role not in member.roles:
            raise ValueError(f"{member.mention} does not hold {role.mention}.")
        await member.remove_roles(role, reason=f"Position removed by {interaction.user}")
        await self._done(interaction, guild, member, position, f"Removed from {position}")

    async def _done(self, interaction, guild, member, position: str, text: str) -> None:
        await self.service.log(guild.id, "position", text.split()[0].lower(), interaction.user.id, str(member.id), position)
        await send_to(guild, self.bot.config.coord_movement_channel_id, f"<@!{member.id}> --> {text} | {today()} | {interaction.user.mention}")
        await refresh_panels(self.bot, guild, "chain")
        await reply(interaction, f"{member.mention}: {text}.")
