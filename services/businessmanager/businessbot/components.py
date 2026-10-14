from __future__ import annotations

import sqlite3

import discord
from discord import app_commands

from .role_policy import require_restricted_role_manager


def staff_bypass_view(user_id: int, business_id: int) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(
        discord.ui.Button(
            label="Add",
            style=discord.ButtonStyle.success,
            custom_id=f"businessbot:bypass:add:{user_id}:{business_id}",
        )
    )
    view.add_item(
        discord.ui.Button(
            label="Ignore",
            style=discord.ButtonStyle.secondary,
            custom_id=f"businessbot:bypass:ignore:{user_id}:{business_id}",
        )
    )
    return view


async def handle_component(interaction: discord.Interaction, custom_id: str) -> None:
    try:
        parts = custom_id.split(":")
        if len(parts) != 5 or parts[1] != "bypass":
            raise ValueError("Malformed Business Manager action.")
        _, _, action, raw_user_id, raw_business_id = parts
        await _handle_staff_bypass(
            interaction, int(raw_user_id), int(raw_business_id), action
        )
    except (
        ValueError,
        app_commands.CheckFailure,
        sqlite3.Error,
        discord.HTTPException,
    ) as exc:
        message = str(exc) or "That action could not be completed."
        if interaction.response.is_done():
            await interaction.followup.send(message, ephemeral=True)
        else:
            await interaction.response.send_message(message, ephemeral=True)


async def _handle_staff_bypass(
    interaction: discord.Interaction, user_id: int, business_id: int, action: str
) -> None:
    config = interaction.client.config  # type: ignore[attr-defined]
    is_owner = interaction.user.id in config.owner_ids
    if not isinstance(interaction.user, discord.Member):
        raise ValueError("This action can only be used in a server.")
    if not is_owner and config.staff_bypass_reviewer_role_id not in {
        role.id for role in interaction.user.roles
    }:
        raise ValueError("You do not have the business bypass reviewer role.")
    guild = interaction.guild
    if guild is None:
        raise ValueError("This action can only be used in a server.")
    business = await interaction.client.db.fetch_one(  # type: ignore[attr-defined]
        "SELECT name FROM businesses WHERE id=? AND guild_id=?",
        (business_id, guild.id),
    )
    if business is None:
        raise ValueError("That business no longer exists.")
    if action == "add":
        member = guild.get_member(user_id)
        role = guild.get_role(config.staff_bypass_grant_role_id)
        if member is None or role is None:
            raise ValueError("The target member or configured business bypass role was not found.")
        require_restricted_role_manager(interaction.user, role, config)
        await member.add_roles(role, reason=f"Business bypass approved by {interaction.user}")
        result = f"Added for **{business['name']}** by {interaction.user.mention}"
    elif action == "ignore":
        result = f"Ignored for **{business['name']}** by {interaction.user.mention}"
    else:
        raise ValueError("Unknown business bypass action.")
    if interaction.message:
        await interaction.response.edit_message(
            content=f"**{result}**", embeds=interaction.message.embeds, view=None
        )
    else:
        await interaction.response.send_message(result, ephemeral=True)
