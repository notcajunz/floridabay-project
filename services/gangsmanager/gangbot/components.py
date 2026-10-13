from __future__ import annotations

import sqlite3

import discord
from discord import app_commands

from .role_policy import require_restricted_role_manager
from .services import bank_fee_rate, deduct_fee


def action_view(kind: str, item_id: int) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(
        discord.ui.Button(
            label="Accept",
            style=discord.ButtonStyle.success,
            custom_id=f"gangbot:{kind}:accept:{item_id}",
        )
    )
    view.add_item(
        discord.ui.Button(
            label="Decline",
            style=discord.ButtonStyle.danger,
            custom_id=f"gangbot:{kind}:decline:{item_id}",
        )
    )
    return view


def staff_bypass_view(user_id: int, gang_id: int) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(
        discord.ui.Button(
            label="Add",
            style=discord.ButtonStyle.success,
            custom_id=f"gangbot:bypass:add:{user_id}:{gang_id}",
        )
    )
    view.add_item(
        discord.ui.Button(
            label="Ignore",
            style=discord.ButtonStyle.secondary,
            custom_id=f"gangbot:bypass:ignore:{user_id}:{gang_id}",
        )
    )
    return view


async def _require_target_command_role(interaction: discord.Interaction, role_id: int | None) -> None:
    if interaction.user.id in interaction.client.config.owner_ids:  # type: ignore[attr-defined]
        return
    if not isinstance(interaction.user, discord.Member):
        raise ValueError("This action can only be used in a server.")
    if not role_id:
        raise ValueError("The target gang does not have a command role configured.")
    if role_id not in {role.id for role in interaction.user.roles}:
        raise ValueError("Only the target gang's command role can respond to this offer.")


async def handle_component(interaction: discord.Interaction, custom_id: str) -> None:
    try:
        parts = custom_id.split(":")
        if len(parts) < 4:
            raise ValueError("Malformed Gang Manager action.")
        _, kind, action, raw_id, *extra = parts
        item_id = int(raw_id)
        if kind == "trade":
            await _handle_trade(interaction, item_id, action)
        elif kind == "tax":
            await _handle_tax(interaction, item_id, action)
        elif kind == "launder":
            await _handle_launder(interaction, item_id, action)
        elif kind == "bypass":
            await _handle_staff_bypass(
                interaction, item_id, int(extra[0]) if extra else 0, action
            )
        else:
            raise ValueError("Unknown Gang Manager action.")
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


async def _handle_trade(
    interaction: discord.Interaction, trade_id: int, action: str
) -> None:
    db = interaction.client.db  # type: ignore[attr-defined]
    trade = await db.fetch_one(
        "SELECT t.*,target.command_role_id,target.name target_name,source.name source_name "
        "FROM trades t JOIN gangs target ON target.id=t.target_gang_id "
        "JOIN gangs source ON source.id=t.gang_id WHERE t.id=? AND t.guild_id=?",
        (trade_id, interaction.guild_id),
    )
    if trade is None:
        raise ValueError("That trade no longer exists.")
    await _require_target_command_role(interaction, trade["command_role_id"])
    if trade["status"] != "pending":
        raise ValueError(f"That trade is already `{trade['status']}`.")
    if action == "decline":
        changed = await db.execute_count(
            "UPDATE trades SET status='declined' WHERE id=? AND status='pending'", (trade_id,)
        )
        if not changed:
            raise ValueError("Someone already responded to that trade.")
        await _finish_message(interaction, f"Declined by {interaction.user.mention}")
        return
    if action != "accept":
        raise ValueError("Unknown trade action.")
    changed = await db.execute_count(
        "UPDATE trades SET status='processing' WHERE id=? AND status='pending'", (trade_id,)
    )
    if not changed:
        raise ValueError("Someone already responded to that trade.")
    fee_rate = await bank_fee_rate(db, interaction.guild_id)
    offer_received, offer_fee = deduct_fee(trade["offer_amount"], fee_rate)
    request_received, request_fee = deduct_fee(trade["request_amount"], fee_rate)
    try:
        await db.transaction([
            (f"UPDATE gangs SET {trade['offer_asset']}={trade['offer_asset']}-? WHERE id=?", (trade["offer_amount"], trade["gang_id"])),
            (f"UPDATE gangs SET {trade['offer_asset']}={trade['offer_asset']}+? WHERE id=?", (offer_received, trade["target_gang_id"])),
            (f"UPDATE gangs SET {trade['request_asset']}={trade['request_asset']}-? WHERE id=?", (trade["request_amount"], trade["target_gang_id"])),
            (f"UPDATE gangs SET {trade['request_asset']}={trade['request_asset']}+? WHERE id=?", (request_received, trade["gang_id"])),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (interaction.guild_id, trade["gang_id"], trade["offer_asset"], -trade["offer_amount"], f"trade #{trade_id}", interaction.user.id)),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (interaction.guild_id, trade["target_gang_id"], trade["offer_asset"], offer_received, f"trade #{trade_id} (fee {offer_fee})", interaction.user.id)),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (interaction.guild_id, trade["target_gang_id"], trade["request_asset"], -trade["request_amount"], f"trade #{trade_id}", interaction.user.id)),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (interaction.guild_id, trade["gang_id"], trade["request_asset"], request_received, f"trade #{trade_id} (fee {request_fee})", interaction.user.id)),
            ("UPDATE trades SET status='completed' WHERE id=?", (trade_id,)),
        ])
    except sqlite3.IntegrityError as exc:
        await db.execute("UPDATE trades SET status='pending' WHERE id=?", (trade_id,))
        raise ValueError("A gang no longer has enough assets to complete that trade.") from exc
    await _finish_message(interaction, f"Accepted by {interaction.user.mention}")


async def _handle_tax(interaction: discord.Interaction, tax_id: int, action: str) -> None:
    db = interaction.client.db  # type: ignore[attr-defined]
    tax = await db.fetch_one(
        "SELECT t.*,target.command_role_id FROM taxes t "
        "JOIN gangs target ON target.id=t.target_gang_id WHERE t.id=? AND t.guild_id=?",
        (tax_id, interaction.guild_id),
    )
    if tax is None:
        raise ValueError("That tax offer no longer exists.")
    await _require_target_command_role(interaction, tax["command_role_id"])
    if tax["status"] != "offered":
        raise ValueError(f"That tax offer is already `{tax['status']}`.")
    status = "active" if action == "accept" else "declined" if action == "decline" else None
    if status is None:
        raise ValueError("Unknown tax action.")
    changed = await db.execute_count(
        "UPDATE taxes SET status=? WHERE id=? AND status='offered'", (status, tax_id)
    )
    if not changed:
        raise ValueError("Someone already responded to that tax offer.")
    await _finish_message(interaction, f"{status.title()} by {interaction.user.mention}")


async def _handle_launder(
    interaction: discord.Interaction, request_id: int, action: str
) -> None:
    db = interaction.client.db  # type: ignore[attr-defined]
    request = await db.fetch_one(
        "SELECT r.*,target.command_role_id,target.name target_name,source.name source_name "
        "FROM launder_requests r JOIN gangs target ON target.id=r.target_gang_id "
        "JOIN gangs source ON source.id=r.gang_id WHERE r.id=? AND r.guild_id=?",
        (request_id, interaction.guild_id),
    )
    if request is None:
        raise ValueError("That laundering request no longer exists.")
    await _require_target_command_role(interaction, request["command_role_id"])
    if request["status"] != "pending":
        raise ValueError(f"That laundering request is already `{request['status']}`.")
    if action == "decline":
        changed = await db.execute_count(
            "UPDATE launder_requests SET status='declined' WHERE id=? AND status='pending'",
            (request_id,),
        )
        if not changed:
            raise ValueError("Someone already responded to that laundering request.")
        await _finish_message(interaction, f"Declined by {interaction.user.mention}")
        return
    if action != "accept":
        raise ValueError("Unknown laundering action.")
    changed = await db.execute_count(
        "UPDATE launder_requests SET status='processing' WHERE id=? AND status='pending'",
        (request_id,),
    )
    if not changed:
        raise ValueError("Someone already responded to that laundering request.")
    payout = round(request["amount"] * (1 - request["rate"]))
    fee = request["amount"] - payout
    fee_rate = await bank_fee_rate(db, interaction.guild_id)
    payout_received, payout_bank_fee = deduct_fee(payout, fee_rate)
    processor_received, processor_bank_fee = deduct_fee(fee, fee_rate)
    try:
        await db.transaction([
            ("UPDATE gangs SET dirty_money=dirty_money-?,cash=cash+?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (request["amount"], payout_received, request["gang_id"])),
            ("UPDATE gangs SET cash=cash+?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (processor_received, request["target_gang_id"])),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (interaction.guild_id, request["gang_id"], "dirty_money", -request["amount"], f"launder request #{request_id}", interaction.user.id)),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (interaction.guild_id, request["gang_id"], "cash", payout_received, f"launder request #{request_id} payout (fee {payout_bank_fee})", interaction.user.id)),
            ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (interaction.guild_id, request["target_gang_id"], "cash", processor_received, f"launder request #{request_id} fee income (fee {processor_bank_fee})", interaction.user.id)),
            ("UPDATE launder_requests SET status='completed' WHERE id=?", (request_id,)),
        ])
    except sqlite3.IntegrityError as exc:
        await db.execute(
            "UPDATE launder_requests SET status='pending' WHERE id=?", (request_id,)
        )
        raise ValueError(
            f"{request['source_name']} no longer has enough dirty money."
        ) from exc
    await _finish_message(interaction, f"Accepted by {interaction.user.mention}")


async def _finish_message(interaction: discord.Interaction, result: str) -> None:
    original = interaction.message.content if interaction.message else "Offer"
    await interaction.response.edit_message(content=f"{original}\n\n**{result}**", view=None)


async def _handle_staff_bypass(
    interaction: discord.Interaction, user_id: int, gang_id: int, action: str
) -> None:
    config = interaction.client.config  # type: ignore[attr-defined]
    is_owner = interaction.user.id in config.owner_ids
    if not isinstance(interaction.user, discord.Member):
        raise ValueError("This action can only be used in a server.")
    if not is_owner and config.staff_bypass_reviewer_role_id not in {
        role.id for role in interaction.user.roles
    }:
        raise ValueError("You do not have the staff bypass reviewer role.")
    guild = interaction.guild
    if guild is None:
        raise ValueError("This action can only be used in a server.")
    if action == "add":
        member = guild.get_member(user_id)
        role = guild.get_role(config.staff_bypass_grant_role_id)
        if member is None or role is None:
            raise ValueError("The target member or configured staff bypass role was not found.")
        require_restricted_role_manager(interaction.user, role, config)
        await member.add_roles(role, reason=f"Staff bypass approved by {interaction.user}")
        result = f"Added by {interaction.user.mention}"
    elif action == "ignore":
        result = f"Ignored by {interaction.user.mention}"
    else:
        raise ValueError("Unknown staff bypass action.")
    if interaction.message:
        await interaction.response.edit_message(
            content=f"**{result}**", embeds=interaction.message.embeds, view=None
        )
    else:
        await interaction.response.send_message(result, ephemeral=True)
