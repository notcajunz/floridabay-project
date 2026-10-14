from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

import discord
from discord import app_commands

from ..common import (
    GangCog,
    actor_id,
    clean_text,
    gang_autocomplete,
    guild_channel,
    guild_id,
    manager_only,
    money,
    refresh_panels,
    reply,
    require_gang_access,
    require_gang_type,
    send_market_log,
    without_emojis,
)
from ..components import action_view
from ..services import ASSETS, TRANSFERABLE_ASSETS, bank_fee_rate, deduct_fee, future_timestamp

log = logging.getLogger(__name__)

ASSET_CHOICES = [app_commands.Choice(name=value.title(), value=value) for value in ASSETS]
TRANSFER_CHOICES = [
    app_commands.Choice(name=value.title(), value=value) for value in TRANSFERABLE_ASSETS
]

TRADE_ASSET_DISPLAY = {
    "cash": ("💵", "Cash"),
    "weapons": ("🔫", "Guns"),
    "drugs": ("🌿", "Drugs"),
}


def format_trade_asset(asset: str, amount: int) -> str:
    emoji, label = TRADE_ASSET_DISPLAY[asset]
    return f"{emoji} **{amount:,}** {label}"


def marketplace_text(value: str, maximum: int = 1024) -> str:
    return without_emojis(value).strip()[:maximum]


class EconomyCog(GangCog):
    bank = app_commands.Group(name="bank", description="Gang bank administration")
    launder = app_commands.Group(name="launder", description="Money laundering")
    market = app_commands.Group(name="market", description="Gang market")
    shop = app_commands.Group(name="shop", description="Server shop")
    tax = app_commands.Group(name="tax", description="Gang tax agreements")
    trade = app_commands.Group(name="trade", description="Inter-gang asset trades")

    @bank.command(name="adjust", description="Adjust every gang in a category and tier")
    @manager_only
    async def bank_adjust(
        self,
        interaction: discord.Interaction,
        category: str,
        tier: int,
        cash: int = 0,
        drugs: int = 0,
        weapons: int = 0,
    ) -> None:
        gid = guild_id(interaction)
        rows = await self.db.fetch_all(
            "SELECT name FROM gangs WHERE guild_id=? AND gang_type=? AND tier=?",
            (gid, category, tier),
        )
        if not rows:
            raise ValueError("No gangs match that category and tier.")
        changed = 0
        for row in rows:
            for asset, delta in (("cash", cash), ("drugs", drugs), ("weapons", weapons)):
                if delta:
                    applied = deduct_fee(delta, await bank_fee_rate(self.db, gid))[0] if delta > 0 else delta
                    await self.service.change_balance(gid, row["name"], asset, applied, "bank category adjustment", actor_id(interaction))
            changed += 1
        await refresh_panels(self.bot, interaction.guild, "leaderboard")
        await reply(interaction, f"Adjusted {changed} gang(s) in **{category}**, tier {tier}.")

    @bank.command(name="disperse", description="Give an equal cash bonus to all visible gangs")
    @manager_only
    async def bank_disperse(self, interaction: discord.Interaction, bonus: int) -> None:
        if bonus <= 0:
            raise ValueError("Bonus must be greater than zero.")
        gid = guild_id(interaction)
        rows = await self.db.fetch_all("SELECT name FROM gangs WHERE guild_id=?", (gid,))
        received, fee = deduct_fee(bonus, await bank_fee_rate(self.db, gid))
        for row in rows:
            await self.service.change_balance(gid, row["name"], "cash", received, f"bank bonus (fee {fee})", actor_id(interaction))
        await refresh_panels(self.bot, interaction.guild, "leaderboard")
        await reply(interaction, f"Dispersed {money(received)} net to {len(rows)} gang(s); {money(fee)} fee per gang.")

    @bank.command(name="fee", description="Set the global bank transaction fee")
    @manager_only
    async def bank_fee(self, interaction: discord.Interaction, new_rate: float) -> None:
        rate = self._rate(new_rate)
        await self.service.set_setting(guild_id(interaction), "bank_fee", str(rate))
        await reply(interaction, f"Bank fee set to **{rate:.2%}**.")

    @bank.command(name="give", description="Give an asset to a gang")
    @manager_only
    @app_commands.choices(asset=ASSET_CHOICES)
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def bank_give(self, interaction: discord.Interaction, gang: str, asset: app_commands.Choice[str], amount: int) -> None:
        if amount <= 0:
            raise ValueError("Amount must be greater than zero.")
        received, fee = deduct_fee(amount, await bank_fee_rate(self.db, guild_id(interaction)))
        balance = await self.service.change_balance(guild_id(interaction), gang, asset.value, received, f"bank give (fee {fee})", actor_id(interaction))
        await refresh_panels(self.bot, interaction.guild, "leaderboard")
        await reply(interaction, f"Gave **{gang}** {received:,} {asset.value} after a {fee:,} fee. New balance: {balance:,}.")

    @bank.command(name="remove", description="Remove an asset from a gang")
    @manager_only
    @app_commands.choices(asset=ASSET_CHOICES)
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def bank_remove(self, interaction: discord.Interaction, gang: str, asset: app_commands.Choice[str], amount: int) -> None:
        if amount <= 0:
            raise ValueError("Amount must be greater than zero.")
        balance = await self.service.change_balance(guild_id(interaction), gang, asset.value, -amount, "bank remove", actor_id(interaction))
        await refresh_panels(self.bot, interaction.guild, "leaderboard")
        await reply(interaction, f"Removed {amount:,} {asset.value} from **{gang}**. New balance: {balance:,}.")

    @bank.command(name="income", description="Log income for a gang")
    @manager_only
    @app_commands.choices(asset=ASSET_CHOICES)
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def bank_income(self, interaction: discord.Interaction, gang: str, asset: app_commands.Choice[str], value: int) -> None:
        if value <= 0:
            raise ValueError("Value must be greater than zero.")
        if asset.value == "cash":
            row = await self.service.gang(guild_id(interaction), gang)
            net, tax_total, fee_total = await self._cash_income(
                interaction, row, value, "income"
            )
            await reply(
                interaction,
                f"Logged {money(value)} gross income for **{gang}**; {money(fee_total)} fees, {money(tax_total)} tax, {money(net)} net.",
            )
        else:
            received, fee = deduct_fee(value, await bank_fee_rate(self.db, guild_id(interaction)))
            balance = await self.service.change_balance(guild_id(interaction), gang, asset.value, received, f"income (fee {fee})", actor_id(interaction))
            await reply(interaction, f"Logged {received:,} net {asset.value} income for **{gang}** after a {fee:,} fee (balance {balance:,}).")
        await refresh_panels(self.bot, interaction.guild, "leaderboard")

    @bank.command(name="info", description="Show bank rates and market configuration")
    async def bank_info(self, interaction: discord.Interaction) -> None:
        gid = guild_id(interaction)
        settings = await self.db.fetch_all("SELECT key,value FROM settings WHERE guild_id=? AND (key LIKE 'market:%' OR key LIKE 'rate:%' OR key='bank_fee') ORDER BY key", (gid,))
        embed = discord.Embed(title="Gang Bank", color=discord.Color.green())
        embed.description = "\n".join(f"**{r['key']}**: `{r['value']}`" for r in settings) or "No rates configured yet."
        await reply(interaction, embed=embed)

    @bank.command(name="market", description="Set market prices for an asset")
    @manager_only
    @app_commands.choices(asset=TRANSFER_CHOICES)
    async def bank_market(
        self,
        interaction: discord.Interaction,
        asset: app_commands.Choice[str],
        floor_price: int,
        ceiling_price: int,
        retail_price: int,
    ) -> None:
        if min(floor_price, ceiling_price, retail_price) < 0 or floor_price > ceiling_price:
            raise ValueError("Prices must be non-negative and floor cannot exceed ceiling.")
        data = {"floor": floor_price, "ceiling": ceiling_price, "retail": retail_price}
        await self.service.set_setting(guild_id(interaction), f"market:{asset.value}", data)
        embed = discord.Embed(title="Market prices updated", color=discord.Color.orange())
        embed.add_field(name="Asset", value=asset.value.title())
        embed.add_field(name="Floor", value=money(floor_price))
        embed.add_field(name="Ceiling", value=money(ceiling_price))
        embed.add_field(name="Retail", value=money(retail_price))
        embed.add_field(name="Set by", value=interaction.user.mention)
        await send_market_log(self.bot, interaction.guild, embed)
        await reply(interaction, f"Updated **{asset.value}** market: `{data}`.")

    @bank.command(name="rate", description="Set a custom bank or laundering rate")
    @manager_only
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def bank_rate(
        self,
        interaction: discord.Interaction,
        rate_type: str,
        value: float,
        gang: str | None = None,
        category: str | None = None,
        launder_type: str | None = None,
    ) -> None:
        rate = self._rate(value)
        gang_key = "global"
        if gang:
            gang_key = str((await self.service.gang(guild_id(interaction), gang))["id"])
        key = f"rate:{rate_type.lower()}:{gang_key}:{category or '*'}:{launder_type or '*'}"
        await self.service.set_setting(guild_id(interaction), key, str(rate))
        await reply(interaction, f"Set `{key}` to **{rate:.2%}**.")

    @staticmethod
    def _rate(value: float) -> float:
        # Accept either 0.15 or 15 for operator convenience.
        value = value / 100 if value > 1 else value
        if not 0 <= value <= 1:
            raise ValueError("Rate must be between 0 and 1, or between 0 and 100 percent.")
        return value

    @launder.command(name="rate", description="Set a gang's laundering fee rate")
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def launder_rate(self, interaction: discord.Interaction, gang: str, rate: float) -> None:
        row = await self.service.gang(guild_id(interaction), gang)
        await require_gang_access(interaction, row)
        require_gang_type(row, "Criminal Org", "Laundering")
        parsed = self._rate(rate)
        await self.db.execute("UPDATE gangs SET launder_rate=? WHERE id=?", (parsed, row["id"]))
        await reply(interaction, f"Set **{row['name']}** laundering fee to {parsed:.2%}.")

    @launder.command(name="self", description="Log self-laundering and credit the net cash")
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def launder_self(self, interaction: discord.Interaction, gang: str, amount: int) -> None:
        if amount <= 0:
            raise ValueError("Amount must be greater than zero.")
        row = await self.service.gang(guild_id(interaction), gang)
        await require_gang_access(interaction, row)
        require_gang_type(row, "Criminal Org", "Laundering")
        if row["dirty_money"] < amount:
            raise ValueError(f"{row['name']} only has {money(row['dirty_money'])} in dirty money.")
        gross_payout = round(amount * (1 - row["launder_rate"]))
        payout, bank_fee = deduct_fee(
            gross_payout, await bank_fee_rate(self.db, guild_id(interaction))
        )
        changed = await self.db.execute_count(
            "UPDATE gangs SET dirty_money=dirty_money-?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND dirty_money>=?",
            (amount, row["id"], amount),
        )
        if not changed:
            raise ValueError(f"{row['name']} no longer has enough dirty money.")
        try:
            await self.service.change_balance(
                guild_id(interaction), row["name"], "cash", payout,
                f"self laundering payout (bank fee {bank_fee})", actor_id(interaction),
            )
        except Exception:
            await self.db.execute(
                "UPDATE gangs SET dirty_money=dirty_money+?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (amount, row["id"]),
            )
            raise
        await self.db.execute(
            "INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)",
            (guild_id(interaction), row["id"], "dirty_money", -amount, "self laundering", actor_id(interaction)),
        )
        await refresh_panels(self.bot, interaction.guild, "leaderboard")
        await reply(interaction, f"Laundered {money(amount)} for **{row['name']}**. Net payout: **{money(payout)}** after {money(bank_fee)} bank fee.")

    @launder.command(name="request", description="Request laundering from another gang")
    @app_commands.autocomplete(gang=gang_autocomplete, target_gang=gang_autocomplete)
    async def launder_request(self, interaction: discord.Interaction, gang: str, target_gang: str, amount: int) -> None:
        if amount <= 0:
            raise ValueError("Amount must be greater than zero.")
        source = await self.service.gang(guild_id(interaction), gang)
        target = await self.service.gang(guild_id(interaction), target_gang)
        await require_gang_access(interaction, source)
        require_gang_type(source, "Criminal Org", "Laundering")
        require_gang_type(target, "Criminal Org", "Laundering")
        if source["id"] == target["id"]:
            raise ValueError("Use `/launder self` when a Criminal Org launders its own money.")
        if source["dirty_money"] < amount:
            raise ValueError(f"{source['name']} only has {money(source['dirty_money'])} in dirty money.")
        payout = round(amount * (1 - target["launder_rate"]))
        fee = amount - payout
        request_id = await self.db.execute(
            "INSERT INTO launder_requests(guild_id,gang_id,target_gang_id,amount,rate,status) VALUES(?,?,?,?,?,'pending')",
            (guild_id(interaction), source["id"], target["id"], amount, target["launder_rate"]),
        )
        await self.service.log(guild_id(interaction), "launder", "request", actor_id(interaction), source["name"], f"target={target['name']} gross={amount} payout={payout}")
        await reply(
            interaction,
            f"Laundering request `#{request_id}`: **{target['name']}** processes {money(amount)} for **{source['name']}**. Net {money(payout)}, fee {money(fee)}.",
            ephemeral=False,
            view=action_view("launder", request_id),
        )

    @market.command(name="sell", description="Sell a gang's drugs at the configured retail price")
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def market_sell(self, interaction: discord.Interaction, gang: str, amount: int) -> None:
        if amount <= 0:
            raise ValueError("Amount must be greater than zero.")
        config = await self.service.setting(guild_id(interaction), "market:drugs")
        if not config:
            raise ValueError("The drugs market has not been configured with `/bank market`.")
        price = int(json.loads(config)["retail"])
        row = await self.service.gang(guild_id(interaction), gang)
        await require_gang_access(interaction, row)
        if row["drugs"] < amount:
            raise ValueError(f"{row['name']} only has {row['drugs']:,} drugs.")
        proceeds = amount * price
        changed = await self.db.execute_count(
            "UPDATE gangs SET drugs=drugs-?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND drugs>=?",
            (amount, row["id"], amount),
        )
        if not changed:
            raise ValueError(f"{row['name']} no longer has enough drugs.")
        try:
            net, tax_total, fee_total = await self._cash_income(
                interaction, row, proceeds, "market sale"
            )
        except Exception:
            await self.db.execute(
                "UPDATE gangs SET drugs=drugs+?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (amount, row["id"]),
            )
            raise
        await self.db.execute(
            "INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)",
            (guild_id(interaction), row["id"], "drugs", -amount, "market sale", actor_id(interaction)),
        )
        embed = discord.Embed(title="Market sale", color=discord.Color.green())
        embed.add_field(name="Gang", value=row["name"])
        embed.add_field(name="Sold by", value=interaction.user.mention)
        embed.add_field(name="Drugs sold", value=f"{amount:,} at {money(price)}")
        embed.add_field(name="Gross", value=money(proceeds))
        embed.add_field(name="Fees", value=money(fee_total))
        embed.add_field(name="Tax", value=money(tax_total))
        embed.add_field(name="Net to gang", value=money(net))
        await send_market_log(self.bot, interaction.guild, embed)
        await refresh_panels(self.bot, interaction.guild, "leaderboard")
        await reply(interaction, f"Sold {amount:,} drugs for {money(proceeds)} gross; {money(fee_total)} fees, {money(tax_total)} tax, **{money(net)} net**.")

    async def _cash_income(self, interaction, gang, gross: int, reason: str):
        now = datetime.now(UTC).isoformat()
        taxes = await self.db.fetch_all(
            "SELECT t.id tax_id,t.rate,g.* FROM taxes t JOIN gangs g ON g.id=t.gang_id "
            "WHERE t.guild_id=? AND t.target_gang_id=? AND t.status='active' AND t.expires_at>?",
            (guild_id(interaction), gang["id"], now),
        )
        after_fee, income_fee = deduct_fee(
            gross, await bank_fee_rate(self.db, guild_id(interaction))
        )
        payments = [(tax, round(after_fee * tax["rate"])) for tax in taxes]
        total = sum(amount for _, amount in payments)
        if total > after_fee:
            raise ValueError("Active tax rates exceed 100%; adjust or remove a tax first.")
        net = after_fee - total
        fee_total = income_fee
        entries = [(gang, net, reason)]
        for tax, amount in payments:
            if amount <= 0:
                continue
            received, tax_fee = deduct_fee(
                amount, await bank_fee_rate(self.db, guild_id(interaction))
            )
            fee_total += tax_fee
            entries.append((tax, received, f"tax #{tax['tax_id']} from {gang['name']} {reason} (fee {tax_fee})"))
        await self.service.change_cash_batch(entries, actor_id(interaction))
        return net, total, fee_total

    @shop.command(name="add", description="Add an item to the server shop")
    @manager_only
    async def shop_add(self, interaction: discord.Interaction, item_name: str, price: int, quantity: int, description: str, unit: str) -> None:
        if price < 0 or quantity < 0:
            raise ValueError("Price and quantity cannot be negative.")
        await self.db.execute("INSERT INTO shop_items(guild_id,name,price,quantity,description,unit) VALUES(?,?,?,?,?,?)", (guild_id(interaction), clean_text(item_name, 100), price, quantity, clean_text(description, 500), clean_text(unit, 30)))
        await refresh_panels(self.bot, interaction.guild, "shop")
        await reply(interaction, f"Added **{item_name}** × {quantity} at {money(price)} per {unit}.")

    @shop.command(name="modify", description="Modify a shop item's price, quantity, or description")
    @manager_only
    async def shop_modify(self, interaction: discord.Interaction, item_name: str, price: int | None = None, quantity: int | None = None, description: str | None = None) -> None:
        values = [("price", price), ("quantity", quantity), ("description", description)]
        updates = [(key, value) for key, value in values if value is not None]
        if not updates:
            raise ValueError("Provide a new price, quantity, or description.")
        if (price is not None and price < 0) or (quantity is not None and quantity < 0):
            raise ValueError("Price and quantity cannot be negative.")
        await self.db.execute(f"UPDATE shop_items SET {','.join(key + '=?' for key, _ in updates)} WHERE guild_id=? AND name=?", [value for _, value in updates] + [guild_id(interaction), item_name])
        await refresh_panels(self.bot, interaction.guild, "shop")
        await reply(interaction, f"Updated **{item_name}**.")

    @shop.command(name="remove", description="Remove an item from the server shop")
    @manager_only
    async def shop_remove(self, interaction: discord.Interaction, item_name: str) -> None:
        await self.db.execute("DELETE FROM shop_items WHERE guild_id=? AND name=?", (guild_id(interaction), item_name))
        await refresh_panels(self.bot, interaction.guild, "shop")
        await reply(interaction, f"Removed **{item_name}** from the shop.")

    @shop.command(name="sell", description="Sell a shop item to a gang")
    @manager_only
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def shop_sell(self, interaction: discord.Interaction, gang: str, item_name: str, quantity: int = 1) -> None:
        if quantity <= 0:
            raise ValueError("Quantity must be greater than zero.")
        item = await self.db.fetch_one("SELECT * FROM shop_items WHERE guild_id=? AND name=?", (guild_id(interaction), item_name))
        if item is None or item["quantity"] < quantity:
            raise ValueError("That item does not exist or has insufficient stock.")
        cost = item["price"] * quantity
        await self.service.change_balance(guild_id(interaction), gang, "cash", -cost, f"shop purchase: {item_name} x{quantity}", actor_id(interaction))
        await self.db.execute("UPDATE shop_items SET quantity=quantity-? WHERE id=?", (quantity, item["id"]))
        await refresh_panels(self.bot, interaction.guild, "shop", "leaderboard")
        await reply(interaction, f"Sold {quantity} {item['unit']} of **{item['name']}** to **{gang}** for {money(cost)}.")

    @tax.command(name="offer", description="Offer a temporary tax agreement")
    @app_commands.autocomplete(gang=gang_autocomplete, target_gang=gang_autocomplete)
    async def tax_offer(self, interaction: discord.Interaction, gang: str, target_gang: str, rate: float, duration: int, notes: str) -> None:
        source = await self.service.gang(guild_id(interaction), gang)
        await require_gang_access(interaction, source)
        await self._create_tax(interaction, gang, target_gang, rate, duration, notes, "offered")

    @tax.command(name="force", description="Force a temporary tax agreement")
    @app_commands.autocomplete(gang=gang_autocomplete, target_gang=gang_autocomplete)
    async def tax_force(self, interaction: discord.Interaction, gang: str, target_gang: str, rate: float, duration: int, notes: str) -> None:
        source = await self.service.gang(guild_id(interaction), gang)
        await require_gang_access(interaction, source)
        await self._create_tax(interaction, gang, target_gang, rate, duration, notes, "active")

    async def _create_tax(self, interaction, gang, target_gang, rate, duration, notes, status):
        if duration <= 0:
            raise ValueError("Duration must be a positive number of days.")
        parsed = self._rate(rate)
        source = await self.service.gang(guild_id(interaction), gang)
        target = await self.service.gang(guild_id(interaction), target_gang)
        if source["id"] == target["id"]:
            raise ValueError("A gang cannot tax itself.")
        tax_id = await self.db.execute("INSERT INTO taxes(guild_id,gang_id,target_gang_id,rate,status,notes,expires_at) VALUES(?,?,?,?,?,?,?)", (guild_id(interaction), source["id"], target["id"], parsed, status, clean_text(notes, 500), future_timestamp(duration)))
        await reply(
            interaction,
            f"Tax `#{tax_id}`: **{source['name']} → {target['name']}**, {parsed:.2%}, {duration} day(s), status `{status}`.",
            ephemeral=status != "offered",
            view=action_view("tax", tax_id) if status == "offered" else None,
        )

    @tax.command(name="remove", description="Remove a tax agreement")
    async def tax_remove(self, interaction: discord.Interaction, tax_id: int) -> None:
        tax = await self.db.fetch_one(
            "SELECT t.id AS tax_id,g.* FROM taxes t JOIN gangs g ON g.id=t.gang_id "
            "WHERE t.id=? AND t.guild_id=?",
            (tax_id, guild_id(interaction)),
        )
        if tax is None:
            raise ValueError("That tax agreement does not exist.")
        await require_gang_access(interaction, tax)
        await self.db.execute("DELETE FROM taxes WHERE id=? AND guild_id=?", (tax_id, guild_id(interaction)))
        await reply(interaction, f"Removed tax `#{tax_id}`.")

    @tax.command(name="view", description="View taxes involving a gang")
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def tax_view(self, interaction: discord.Interaction, gang: str) -> None:
        row = await self.service.gang(guild_id(interaction), gang)
        await require_gang_access(interaction, row)
        taxes = await self.db.fetch_all("SELECT t.id,t.rate,t.status,t.expires_at,g1.name source,g2.name target FROM taxes t JOIN gangs g1 ON g1.id=t.gang_id JOIN gangs g2 ON g2.id=t.target_gang_id WHERE t.guild_id=? AND (t.gang_id=? OR t.target_gang_id=?) ORDER BY t.id DESC", (guild_id(interaction), row["id"], row["id"]))
        await reply(interaction, "\n".join(f"`#{x['id']}` {x['source']} → {x['target']}: {x['rate']:.2%} · {x['status']} · until {x['expires_at'][:10]}" for x in taxes) or "No taxes found.")

    @trade.command(name="give", description="Immediately give assets to another gang")
    @app_commands.choices(asset=TRANSFER_CHOICES)
    @app_commands.autocomplete(gang=gang_autocomplete, target_gang=gang_autocomplete)
    async def trade_give(self, interaction: discord.Interaction, gang: str, target_gang: str, asset: app_commands.Choice[str], amount: int, notes: str = "") -> None:
        source_row = await self.service.gang(guild_id(interaction), gang)
        await require_gang_access(interaction, source_row)
        channel = self._trade_channel(interaction)
        fee_rate = await bank_fee_rate(self.db, guild_id(interaction))
        received, fee = deduct_fee(amount, fee_rate)
        await self.service.transfer(guild_id(interaction), gang, target_gang, asset.value, amount, f"trade gift: {notes}", actor_id(interaction), fee_rate)
        await refresh_panels(self.bot, interaction.guild, "leaderboard")
        source = await self.service.gang(guild_id(interaction), gang)
        target = await self.service.gang(guild_id(interaction), target_gang)
        trade_id = await self.db.execute("INSERT INTO trades(guild_id,gang_id,target_gang_id,offer_asset,offer_amount,notes,status) VALUES(?,?,?,?,?,?,?)", (guild_id(interaction), source["id"], target["id"], asset.value, amount, notes, "completed"))
        summary = f"Transferred {amount:,} {asset.value} from **{gang}**; **{target_gang}** received {received:,} after a {fee:,} fee."
        embed = discord.Embed(
            title=f"Marketplace Transfer #{trade_id}",
            description=(
                f"**{marketplace_text(gang)}** sent assets to "
                f"**{marketplace_text(target_gang)}**."
            ),
            color=discord.Color.green(),
            timestamp=datetime.now(UTC),
        )
        embed.add_field(name="Sent", value=format_trade_asset(asset.value, amount))
        embed.add_field(
            name="Received", value=format_trade_asset(asset.value, received)
        )
        embed.add_field(name="Bank fee", value=format_trade_asset(asset.value, fee))
        embed.add_field(name="Initiated by", value=interaction.user.mention, inline=False)
        if notes:
            embed.add_field(
                name="Notes", value=marketplace_text(notes) or "None", inline=False
            )
        embed.set_footer(text="Status: Completed")
        # The transfer is already committed, so a failed post must not fail the command.
        try:
            posted = await channel.send(
                embed=embed,
                allowed_mentions=discord.AllowedMentions.none(),
            )
            summary += f" Logged in {posted.jump_url}."
        except (discord.Forbidden, discord.HTTPException):
            log.exception("Could not post trade gift to the trade channel")
        await reply(interaction, summary)

    @trade.command(name="offer", description="Record a pending two-sided trade offer")
    @app_commands.choices(offer_asset=TRANSFER_CHOICES, request_asset=TRANSFER_CHOICES)
    @app_commands.autocomplete(gang=gang_autocomplete, target_gang=gang_autocomplete)
    async def trade_offer(self, interaction: discord.Interaction, gang: str, target_gang: str, offer_asset: app_commands.Choice[str], offer_amount: int, request_asset: app_commands.Choice[str], request_amount: int, notes: str = "") -> None:
        if offer_amount <= 0 or request_amount <= 0:
            raise ValueError("Trade amounts must be greater than zero.")
        source = await self.service.gang(guild_id(interaction), gang)
        target = await self.service.gang(guild_id(interaction), target_gang)
        await require_gang_access(interaction, source)
        channel = self._trade_channel(interaction)
        trade_id = await self.db.execute("INSERT INTO trades(guild_id,gang_id,target_gang_id,offer_asset,offer_amount,request_asset,request_amount,notes,status) VALUES(?,?,?,?,?,?,?,?,?)", (guild_id(interaction), source["id"], target["id"], offer_asset.value, offer_amount, request_asset.value, request_amount, notes, "pending"))
        embed = discord.Embed(
            title=f"Marketplace Trade Offer #{trade_id}",
            description=(
                f"**{marketplace_text(gang)}** is proposing a trade with "
                f"**{marketplace_text(target_gang)}**."
            ),
            color=discord.Color.gold(),
            timestamp=datetime.now(UTC),
        )
        embed.add_field(
            name=f"{marketplace_text(gang)} offers",
            value=format_trade_asset(offer_asset.value, offer_amount),
        )
        embed.add_field(
            name=f"{marketplace_text(target_gang)} provides",
            value=format_trade_asset(request_asset.value, request_amount),
        )
        embed.add_field(name="Submitted by", value=interaction.user.mention, inline=False)
        if notes:
            embed.add_field(
                name="Notes", value=marketplace_text(notes) or "None", inline=False
            )
        embed.set_footer(text="Target gang command may accept or decline")
        ping = target["command_role_id"]
        try:
            posted = await channel.send(
                content=f"<@&{ping}>" if ping else None,
                embed=embed,
                view=action_view("trade", trade_id),
                allowed_mentions=discord.AllowedMentions(
                    roles=[discord.Object(id=ping)] if ping else False, users=False
                ),
            )
        except (discord.Forbidden, discord.HTTPException):
            await self.db.execute("UPDATE trades SET status='cancelled' WHERE id=?", (trade_id,))
            log.exception("Could not post trade #%s to the trade channel", trade_id)
            raise ValueError("I could not post in the trade channel, so the offer was cancelled.")
        await reply(interaction, f"Trade `#{trade_id}` was posted in {posted.jump_url} for **{target_gang}** to respond.")

    def _trade_channel(self, interaction: discord.Interaction):
        channel = guild_channel(self.bot, interaction.guild, self.bot.config.trade_channel_id)  # type: ignore[attr-defined]
        if channel is None:
            raise ValueError("The trade channel is not configured or I cannot see it.")
        return channel

    @trade.command(name="history", description="View a gang's trade history")
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def trade_history(self, interaction: discord.Interaction, gang: str) -> None:
        row = await self.service.gang(guild_id(interaction), gang)
        await require_gang_access(interaction, row)
        trades = await self.db.fetch_all("SELECT t.*,g1.name source,g2.name target FROM trades t JOIN gangs g1 ON g1.id=t.gang_id JOIN gangs g2 ON g2.id=t.target_gang_id WHERE t.guild_id=? AND (t.gang_id=? OR t.target_gang_id=?) ORDER BY t.id DESC LIMIT 25", (guild_id(interaction), row["id"], row["id"]))
        await reply(interaction, "\n".join(f"`#{x['id']}` {x['source']} → {x['target']}: {x['offer_amount']:,} {x['offer_asset']} · {x['status']}" for x in trades) or "No trade history.")
