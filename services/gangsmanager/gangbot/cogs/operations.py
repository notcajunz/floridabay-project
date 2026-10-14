from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import discord
from discord import app_commands

from ..common import (
    GangCog,
    actor_id,
    clean_text,
    gang_manager_plus_only,
    gang_autocomplete,
    guild_id,
    manager_only,
    refresh_panels,
    reply,
    require_gang_access,
    require_gang_type,
    without_embed_emojis,
)
from ..services import TRANSFERABLE_ASSETS, future_timestamp
from ..role_policy import require_restricted_role_manager


class OperationsCog(GangCog):
    log = app_commands.Group(name="log", description="Operational logging")
    relations = app_commands.Group(name="relations", description="Gang relations")
    temprole = app_commands.Group(name="temprole", description="Temporary Discord roles")
    turfwar = app_commands.Group(name="turfwar", description="Turf-war operations")

    @log.command(name="purchase", description="Log a gang purchase")
    @manager_only
    @app_commands.autocomplete(gang=gang_autocomplete)
    async def log_purchase(
        self,
        interaction: discord.Interaction,
        purchase_type: str,
        gang: str,
        purchaser: discord.Member,
    ) -> None:
        row = await self.service.gang(guild_id(interaction), gang)
        await self.service.log(
            guild_id(interaction), "purchase", clean_text(purchase_type, 100),
            actor_id(interaction), row["name"], f"purchaser={purchaser.id}",
        )
        await reply(interaction, f"Logged **{purchase_type}** purchase by {purchaser.mention} for **{row['name']}**.")

    @log.command(name="transfer", description="Transfer a member's Discord role between gangs")
    @gang_manager_plus_only
    @app_commands.autocomplete(from_gang=gang_autocomplete, to_gang=gang_autocomplete)
    async def log_transfer(
        self,
        interaction: discord.Interaction,
        member: discord.Member,
        from_gang: str,
        to_gang: str,
    ) -> None:
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        source = await self.service.gang(guild.id, from_gang)
        target = await self.service.gang(guild.id, to_gang)
        if source["id"] == target["id"]:
            raise ValueError("The source and destination gangs must be different.")
        old_role = guild.get_role(source["base_role_id"] or 0)
        new_role = guild.get_role(target["base_role_id"] or 0)
        if old_role is None:
            raise ValueError(f"{source['name']} does not have a valid gang role configured.")
        if new_role is None:
            raise ValueError(f"{target['name']} does not have a valid gang role configured.")
        if old_role not in member.roles:
            raise ValueError(f"{member.mention} does not have {old_role.mention}.")
        require_restricted_role_manager(interaction.user, old_role, self.bot.config)
        require_restricted_role_manager(interaction.user, new_role, self.bot.config)
        self.bot.mark_managed_gang_removal(guild.id, member.id, old_role.id)
        try:
            await member.remove_roles(old_role, reason=f"Gang transfer by {interaction.user}")
        except Exception:
            self.bot.consume_managed_gang_removal(guild.id, member.id, old_role.id)
            raise
        try:
            await member.add_roles(new_role, reason=f"Gang transfer by {interaction.user}")
        except Exception:
            await member.add_roles(old_role, reason="Rolling back failed gang transfer")
            raise
        await self.service.log(guild.id, "member", "transfer", actor_id(interaction), str(member.id), f"{source['name']} -> {target['name']}")
        await reply(interaction, f"Transferred {member.mention} from **{source['name']}** to **{target['name']}**.")

    @relations.command(name="set", description="Set a timed relation between two gangs")
    @app_commands.autocomplete(gang=gang_autocomplete, other_gang=gang_autocomplete)
    async def relations_set(
        self,
        interaction: discord.Interaction,
        gang: str,
        other_gang: str,
        relation: str,
        days: int,
    ) -> None:
        if days <= 0:
            raise ValueError("Days must be greater than zero.")
        source = await self.service.gang(guild_id(interaction), gang)
        other = await self.service.gang(guild_id(interaction), other_gang)
        await require_gang_access(interaction, source)
        if source["id"] == other["id"]:
            raise ValueError("A gang cannot set a relation with itself.")
        previous = await self.db.fetch_one(
            "SELECT relation,expires_at FROM relations WHERE guild_id=? AND gang_id=? AND other_gang_id=?",
            (guild_id(interaction), source["id"], other["id"]),
        )
        await self.db.execute(
            "INSERT INTO relations(guild_id,gang_id,other_gang_id,relation,expires_at) VALUES(?,?,?,?,?) "
            "ON CONFLICT(guild_id,gang_id,other_gang_id) DO UPDATE SET relation=excluded.relation,expires_at=excluded.expires_at",
            (guild_id(interaction), source["id"], other["id"], clean_text(relation, 50), future_timestamp(days)),
        )
        channel = interaction.guild.get_channel(self.bot.config.alliance_log_channel_id) if interaction.guild else None
        if isinstance(channel, discord.abc.Messageable):
            embed = discord.Embed(
                title="Alliance Relation Updated" if previous else "Alliance Relation Added",
                color=discord.Color.blurple(),
                timestamp=datetime.now(UTC),
            )
            embed.add_field(name="Gangs", value=f"**{source['name']}** ↔ **{other['name']}**", inline=False)
            embed.add_field(name="New relation", value=relation)
            embed.add_field(name="Duration", value=f"{days} day(s)")
            if previous:
                embed.add_field(name="Previous relation", value=previous["relation"])
            embed.set_footer(text=f"Changed by {interaction.user} ({interaction.user.id})")
            await channel.send(embed=without_embed_emojis(embed))
        await reply(interaction, f"Set **{source['name']} ↔ {other['name']}** to `{relation}` for {days} day(s).")

    @temprole.command(name="extend", description="Add or extend a temporary role")
    @manager_only
    async def temprole_extend(
        self,
        interaction: discord.Interaction,
        member: discord.Member,
        role: discord.Role,
        days: int,
    ) -> None:
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        if days <= 0:
            raise ValueError("Days must be greater than zero.")
        current = await self.db.fetch_one(
            "SELECT expires_at FROM temp_roles WHERE guild_id=? AND member_id=? AND role_id=?",
            (guild_id(interaction), member.id, role.id),
        )
        if current:
            base = datetime.fromisoformat(current["expires_at"])
            base = max(base, datetime.now(UTC))
            expires = (base + timedelta(days=days)).isoformat()
        else:
            expires = future_timestamp(days)
        await member.add_roles(role, reason=f"Temporary role by {interaction.user}")
        await self.db.execute(
            "INSERT INTO temp_roles(guild_id,member_id,role_id,expires_at) VALUES(?,?,?,?) "
            "ON CONFLICT(guild_id,member_id,role_id) DO UPDATE SET expires_at=excluded.expires_at",
            (guild_id(interaction), member.id, role.id, expires),
        )
        timestamp = int(datetime.fromisoformat(expires).timestamp())
        await reply(interaction, f"{role.mention} for {member.mention} now expires <t:{timestamp}:R>.")

    @temprole.command(name="delete", description="Delete a member's temporary role")
    @manager_only
    async def temprole_delete(
        self, interaction: discord.Interaction, member: discord.Member, role: discord.Role
    ) -> None:
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        await member.remove_roles(role, reason=f"Temporary role removed by {interaction.user}")
        await self.db.execute(
            "DELETE FROM temp_roles WHERE guild_id=? AND member_id=? AND role_id=?",
            (guild_id(interaction), member.id, role.id),
        )
        await reply(interaction, f"Removed temporary {role.mention} from {member.mention}.")

    @temprole.command(name="list", description="List a member's temporary roles")
    @manager_only
    async def temprole_list(self, interaction: discord.Interaction, member: discord.Member) -> None:
        rows = await self.db.fetch_all(
            "SELECT role_id,expires_at FROM temp_roles WHERE guild_id=? AND member_id=? ORDER BY expires_at",
            (guild_id(interaction), member.id),
        )
        lines = []
        for row in rows:
            timestamp = int(datetime.fromisoformat(row["expires_at"]).timestamp())
            lines.append(f"• <@&{row['role_id']}> expires <t:{timestamp}:R>")
        await reply(interaction, "\n".join(lines) or "No temporary roles found.")

    async def _member_gang(
        self, interaction: discord.Interaction, gang_type: str | None = None
    ):
        if not isinstance(interaction.user, discord.Member):
            raise ValueError("Your gang cannot be determined outside a server.")
        role_ids = {role.id for role in interaction.user.roles}
        rows = await self.db.fetch_all(
            "SELECT * FROM gangs WHERE guild_id=?", (guild_id(interaction),)
        )
        for row in rows:
            if gang_type is not None and row["gang_type"] != gang_type:
                continue
            if row["base_role_id"] in role_ids or row["command_role_id"] in role_ids:
                return row
        suffix = f" for a {gang_type} gang" if gang_type else ""
        raise ValueError(f"You do not have a registered gang role{suffix}.")

    @turfwar.command(name="action", description="Challenge, accept, decline, or forfeit a turf war")
    @app_commands.choices(
        action=[
            app_commands.Choice(name="Challenge", value="challenge"),
            app_commands.Choice(name="Accept", value="accept"),
            app_commands.Choice(name="Decline", value="decline"),
            app_commands.Choice(name="Forfeit", value="forfeit"),
        ]
    )
    @app_commands.autocomplete(opponent_gang=gang_autocomplete)
    async def turfwar_action(
        self,
        interaction: discord.Interaction,
        action: app_commands.Choice[str],
        opponent_gang: str,
    ) -> None:
        mine = await self._member_gang(interaction, "Street Gang")
        opponent = await self.service.gang(guild_id(interaction), opponent_gang)
        await require_gang_access(interaction, mine)
        require_gang_type(opponent, "Street Gang", "Turf wars")
        if mine["id"] == opponent["id"]:
            raise ValueError("You cannot start a turf war against your own gang.")
        if action.value == "challenge":
            war_id = await self.db.execute(
                "INSERT INTO turf_wars(guild_id,offending_gang_id,defending_gang_id,stage) VALUES(?,?,?,?)",
                (guild_id(interaction), mine["id"], opponent["id"], "challenged"),
            )
            message = f"Created turf war `#{war_id}`: **{mine['name']}** challenged **{opponent['name']}**."
        else:
            war = await self.db.fetch_one(
                "SELECT id FROM turf_wars WHERE guild_id=? AND ((offending_gang_id=? AND defending_gang_id=?) OR (offending_gang_id=? AND defending_gang_id=?)) ORDER BY id DESC LIMIT 1",
                (guild_id(interaction), mine["id"], opponent["id"], opponent["id"], mine["id"]),
            )
            if war is None:
                raise ValueError("No turf war exists between those gangs.")
            stage = {"accept": "active", "decline": "declined", "forfeit": "completed"}[action.value]
            outcome = f"{mine['name']} forfeited" if action.value == "forfeit" else None
            await self.db.execute(
                "UPDATE turf_wars SET stage=?,outcome=COALESCE(?,outcome),updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (stage, outcome, war["id"]),
            )
            message = f"Turf war `#{war['id']}` is now **{stage}**."
        await reply(interaction, message, ephemeral=False)

    @turfwar.command(name="invest", description="Invest gang assets into a turf war")
    @app_commands.choices(asset_type=[app_commands.Choice(name=x.title(), value=x) for x in TRANSFERABLE_ASSETS])
    @app_commands.autocomplete(my_gang=gang_autocomplete, opponent_gang=gang_autocomplete)
    async def turfwar_invest(
        self,
        interaction: discord.Interaction,
        my_gang: str,
        opponent_gang: str,
        asset_type: app_commands.Choice[str],
        amount: int,
    ) -> None:
        if amount <= 0:
            raise ValueError("Amount must be greater than zero.")
        mine = await self.service.gang(guild_id(interaction), my_gang)
        opponent = await self.service.gang(guild_id(interaction), opponent_gang)
        await require_gang_access(interaction, mine)
        require_gang_type(mine, "Street Gang", "Turf wars")
        require_gang_type(opponent, "Street Gang", "Turf wars")
        war = await self.db.fetch_one(
            "SELECT id FROM turf_wars WHERE guild_id=? AND stage IN ('challenged','active') AND ((offending_gang_id=? AND defending_gang_id=?) OR (offending_gang_id=? AND defending_gang_id=?)) ORDER BY id DESC LIMIT 1",
            (guild_id(interaction), mine["id"], opponent["id"], opponent["id"], mine["id"]),
        )
        if war is None:
            raise ValueError("No active turf war exists between those gangs.")
        if mine[asset_type.value] < amount:
            raise ValueError(f"{mine['name']} does not have enough {asset_type.value}.")
        reason = f"turf war #{war['id']} investment"
        records = [
            ("INSERT INTO turf_investments(guild_id,war_id,gang_id,asset,amount,actor_id) VALUES(?,?,?,?,?,?)", (guild_id(interaction), war["id"], mine["id"], asset_type.value, amount, actor_id(interaction))),
            ("INSERT INTO activity_log(guild_id,category,action,actor_id,subject,details) VALUES(?,?,?,?,?,?)", (guild_id(interaction), "turfwar", "invest", actor_id(interaction), str(war["id"]), f"gang={mine['name']} {asset_type.value}={amount}")),
        ]
        if asset_type.value == "cash":
            await self.service.change_balance(
                guild_id(interaction), mine["name"], "cash", -amount, reason, actor_id(interaction)
            )
            try:
                await self.db.transaction(records)
            except Exception:
                await self.service.change_balance(
                    guild_id(interaction), mine["name"], "cash", amount,
                    f"rollback failed {reason}", actor_id(interaction),
                )
                raise
            await refresh_panels(self.bot, interaction.guild, "leaderboard")
        else:
            await self.db.transaction([
                (f"UPDATE gangs SET {asset_type.value}={asset_type.value}-?,updated_at=CURRENT_TIMESTAMP WHERE id=?", (amount, mine["id"])),
                ("INSERT INTO ledger(guild_id,gang_id,asset,delta,reason,actor_id) VALUES(?,?,?,?,?,?)", (guild_id(interaction), mine["id"], asset_type.value, -amount, reason, actor_id(interaction))),
                *records,
            ])
        await reply(interaction, f"Invested {amount:,} {asset_type.value} from **{mine['name']}** into turf war `#{war['id']}`.")

    @turfwar.command(name="stage", description="Create or update a turf-war stage")
    @manager_only
    @app_commands.autocomplete(offending_gang=gang_autocomplete, defending_gang=gang_autocomplete)
    async def turfwar_stage(
        self,
        interaction: discord.Interaction,
        stage: str,
        location: str,
        offending_gang: str,
        defending_gang: str,
        outcome: str | None = None,
    ) -> None:
        offense = await self.service.gang(guild_id(interaction), offending_gang)
        defense = await self.service.gang(guild_id(interaction), defending_gang)
        require_gang_type(offense, "Street Gang", "Turf wars")
        require_gang_type(defense, "Street Gang", "Turf wars")
        war = await self.db.fetch_one(
            "SELECT id FROM turf_wars WHERE guild_id=? AND offending_gang_id=? AND defending_gang_id=? ORDER BY id DESC LIMIT 1",
            (guild_id(interaction), offense["id"], defense["id"]),
        )
        auto_resolve = bool(outcome and outcome.lower() == "auto")
        stored_outcome = None if auto_resolve else outcome
        if war:
            await self.db.execute(
                "UPDATE turf_wars SET stage=?,location=?,outcome=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (clean_text(stage, 50), clean_text(location, 100), stored_outcome, war["id"]),
            )
            war_id = war["id"]
        else:
            war_id = await self.db.execute(
                "INSERT INTO turf_wars(guild_id,location,offending_gang_id,defending_gang_id,stage,outcome) VALUES(?,?,?,?,?,?)",
                (guild_id(interaction), clean_text(location, 100), offense["id"], defense["id"], clean_text(stage, 50), stored_outcome),
            )
        if auto_resolve:
            stored_outcome = await self._auto_turf_outcome(
                interaction, war_id, offense, defense
            )
            await self.db.execute(
                "UPDATE turf_wars SET outcome=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (stored_outcome, war_id),
            )
        suffix = f" Outcome: **{stored_outcome}**." if stored_outcome else ""
        await reply(interaction, f"Turf war `#{war_id}` set to **{stage}** at **{location}**.{suffix}", ephemeral=False)

    async def _auto_turf_outcome(self, interaction, war_id, offense, defense) -> str:
        rows = await self.db.fetch_all(
            "SELECT gang_id,asset,SUM(amount) amount FROM turf_investments "
            "WHERE guild_id=? AND war_id=? GROUP BY gang_id,asset",
            (guild_id(interaction), war_id),
        )
        prices = {"cash": 1}
        for asset in ("drugs", "weapons"):
            configured = await self.service.setting(guild_id(interaction), f"market:{asset}")
            if configured:
                prices[asset] = int(json.loads(configured)["retail"])
        totals = {offense["id"]: 0, defense["id"]: 0}
        for row in rows:
            if row["asset"] not in prices:
                raise ValueError(
                    f"Configure the `{row['asset']}` retail price with `/bank market` before automatic resolution."
                )
            if row["gang_id"] in totals:
                totals[row["gang_id"]] += row["amount"] * prices[row["asset"]]
        offense_score = totals[offense["id"]]
        defense_score = totals[defense["id"]]
        if offense_score == defense_score:
            return f"Draw ({offense_score:,}–{defense_score:,})"
        winner = offense if offense_score > defense_score else defense
        return f"{winner['name']} won ({offense_score:,}–{defense_score:,})"

    @turfwar.command(name="history", description="View a gang's turf-war history")
    @app_commands.autocomplete(gang_name=gang_autocomplete)
    async def turfwar_history(self, interaction: discord.Interaction, gang_name: str) -> None:
        gang = await self.service.gang(guild_id(interaction), gang_name)
        await require_gang_access(interaction, gang)
        require_gang_type(gang, "Street Gang", "Turf wars")
        rows = await self.db.fetch_all(
            "SELECT w.id,w.stage,w.location,w.outcome,w.created_at,a.name offense,d.name defense FROM turf_wars w LEFT JOIN gangs a ON a.id=w.offending_gang_id LEFT JOIN gangs d ON d.id=w.defending_gang_id WHERE w.guild_id=? AND (w.offending_gang_id=? OR w.defending_gang_id=?) ORDER BY w.id DESC LIMIT 25",
            (guild_id(interaction), gang["id"], gang["id"]),
        )
        await reply(
            interaction,
            "\n".join(
                f"`#{r['id']}` {r['offense']} vs {r['defense']} · {r['stage']} · {r['location'] or 'TBD'} · {r['outcome'] or 'no outcome'}"
                for r in rows
            ) or "No turf-war history.",
        )
