from __future__ import annotations

import random
import sqlite3
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import discord
from discord import app_commands

from ..common import (
    BusinessCog,
    actor_id,
    clean_text,
    business_add_remove_only,
    business_autocomplete,
    guild_id,
    manager_only,
    refresh_panels,
    require_business_access,
    require_role_manager,
    role_management_admin_only,
    reply,
    without_embed_emojis,
)
from ..fbrp_api import FbrpApi, FbrpApiError
from ..services import bank_fee_rate, deduct_fee, future_timestamp, parse_color
from ..role_policy import assign_parole, category_conflict, business_for_role, business_role_restriction, require_restricted_role_manager, send_conflict_alert, send_role_action
from ..constants import (
    CATEGORY_COORDINATOR_RANKS,
    COORDINATOR_RANKS,
    BUSINESS_CATEGORIES,
)
from ..components import staff_bypass_view

BUSINESS_TYPES = [app_commands.Choice(name=value, value=value) for value in BUSINESS_CATEGORIES]


def validate_business_type(business_type: str, subtype: str | None) -> str | None:
    if business_type not in BUSINESS_CATEGORIES:
        raise ValueError(f"Business category must be one of: {', '.join(BUSINESS_CATEGORIES)}.")
    return clean_text(subtype, 50) if subtype else None


def movement_enabled(value) -> bool:
    return str(value).lower() in {"1", "true", "yes"}


def coordinator_ranks_at_or_below(rank: str) -> tuple[str, ...]:
    """Return the selected coordinator rank and every lower rank."""
    return COORDINATOR_RANKS[COORDINATOR_RANKS.index(rank):]


class BusinessesCog(BusinessCog):
    business = app_commands.Group(name="business", description="Create and manage businesses")
    coord = app_commands.Group(name="coord", description="Business coordinator tools")
    location = app_commands.Group(name="location", description="Business location tools")
    member = app_commands.Group(name="member", description="Member discipline and history")
    permissions = app_commands.Group(name="permissions", description="Bot permission overrides")
    role = app_commands.Group(name="role", description="Discord role management")
    reward = app_commands.Group(name="reward", description="Business reward management")

    @app_commands.command(name="creation", description="Create a new business and its Discord roles")
    @manager_only
    @app_commands.choices(business_type=BUSINESS_TYPES)
    async def creation(
        self,
        interaction: discord.Interaction,
        business_name: str,
        business_type: app_commands.Choice[str],
        initials: str,
        role_color: str,
        emoji: str,
        specialty: str | None = None,
        fbrp_org_id: str | None = None,
    ) -> None:
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        await interaction.response.defer(ephemeral=True)
        fbrp_org_id = await self.service.validate_org_link(fbrp_org_id)
        color = discord.Color(parse_color(role_color))
        name = clean_text(business_name, 50)
        subtype = validate_business_type(business_type.value, specialty)
        base_role = await guild.create_role(
            name=f"T1 | {name}", color=color, reason=f"Business created by {interaction.user}"
        )
        command_role = await guild.create_role(
            name=f"{name} Command", color=color, reason=f"Business created by {interaction.user}"
        )
        try:
            await self.service.create(
                guild.id,
                name,
                business_type.value,
                initials=clean_text(initials, 10).upper(),
                subtype=subtype,
                role_color=color.value,
                emoji=clean_text(emoji, 30),
                base_role_id=base_role.id,
                command_role_id=command_role.id,
                fbrp_org_id=clean_text(fbrp_org_id, 100) if fbrp_org_id else None,
            )
        except Exception:
            await base_role.delete(reason="Rolling back failed business creation")
            await command_role.delete(reason="Rolling back failed business creation")
            raise
        link_note = ""
        if fbrp_org_id:
            try:
                await self.service.api.link_access_role(fbrp_org_id, guild.id, base_role.id)
            except FbrpApiError as error:
                link_note = f"\n⚠️ The business was created, but its FBRP duty role could not be linked: {error}"
        await self.service.log(guild.id, "business", "created", actor_id(interaction), name)
        await self._update_business_tier_directory(guild)
        await reply(interaction, f"Created **{name}** with {base_role.mention} and {command_role.mention}.{link_note}")

    @business.command(name="add", description="Add an existing business record")
    @business_add_remove_only
    @app_commands.rename(guild_id_value="guild_id")
    @app_commands.choices(type=BUSINESS_TYPES)
    async def business_add(
        self,
        interaction: discord.Interaction,
        name: str,
        type: app_commands.Choice[str],
        tier: app_commands.Range[int, 1, 4],
        base_role: discord.Role,
        command_role: discord.Role,
        business_owner: discord.Member,
        category: discord.CategoryChannel,
        fbrp_org_id: str | None = None,
        guild_id_value: str | None = None,
        specialty: str | None = None,
        movement: bool = False,
        emoji: str | None = None,
    ) -> None:
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        if category.guild.id != guild.id:
            raise ValueError("The voice category must belong to this server.")
        gid = guild.id
        await interaction.response.defer(ephemeral=True)
        fbrp_org_id = await self.service.validate_org_link(fbrp_org_id)
        business_name = clean_text(name, 50)
        business_emoji = clean_text(emoji, 30) if emoji is not None else None
        voice_name = f"{business_emoji}・{business_name}" if business_emoji else business_name
        if len(voice_name) > 100:
            raise ValueError("The emoji and business name together must be at most 100 characters.")
        overwrites = self._voice_overwrites(
            guild,
            connect_roles=(base_role, command_role),
            moderator_roles=(command_role,),
        )
        voice_channel = await guild.create_voice_channel(
            voice_name,
            category=category,
            overwrites=overwrites,
            reason=f"Business added by {interaction.user}",
        )
        try:
            business_id_created = await self.service.create(
                gid,
                business_name,
                type.value,
                tier=max(0, tier),
                base_role_id=base_role.id,
                command_role_id=command_role.id,
                owner_id=business_owner.id,
                fbrp_org_id=fbrp_org_id,
                external_guild_id=guild_id_value,
                subtype=validate_business_type(type.value, specialty),
                movement=int(movement),
                role_color=base_role.color.value,
                emoji=business_emoji,
            )
        except Exception:
            await voice_channel.delete(reason="Rolling back failed business addition")
            raise
        link_note = ""
        if fbrp_org_id:
            try:
                await self.service.api.link_access_role(fbrp_org_id, guild.id, base_role.id)
            except FbrpApiError as error:
                link_note = f"\n⚠️ The business was added, but its FBRP duty role could not be linked: {error}"
        await self.service.log(gid, "business", "added", actor_id(interaction), name)
        await self._update_business_tier_directory(guild)
        if tier == 3:
            await self._alert_tier3_members(
                interaction, business_id_created, name, command_role
            )
        if movement:
            await self._announce_launch(interaction, base_role.id, type.value)
        await reply(
            interaction,
            f"Added **{business_name}** to the business registry and created {voice_channel.mention}.{link_note}",
        )

    @app_commands.command(name="lineadd", description="Create a staff-controlled voice divider")
    @manager_only
    async def lineadd(
        self,
        interaction: discord.Interaction,
        category: discord.CategoryChannel,
    ) -> None:
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        if category.guild.id != guild.id:
            raise ValueError("The voice category must belong to this server.")
        await interaction.response.defer(ephemeral=True)
        overwrites = self._voice_overwrites(guild)
        channel = await guild.create_voice_channel(
            "━━━━━━━━━━━━━━━━━━",
            category=category,
            overwrites=overwrites,
            reason=f"Voice divider added by {interaction.user}",
        )
        await self.service.log(
            guild.id,
            "voice",
            "lineadd",
            actor_id(interaction),
            str(channel.id),
            f"category={category.id}",
        )
        await reply(interaction, f"Created {channel.mention} in **{category.name}**.")

    def _voice_overwrites(
        self,
        guild: discord.Guild,
        *,
        connect_roles: tuple[discord.Role, ...] = (),
        moderator_roles: tuple[discord.Role, ...] = (),
    ) -> dict[discord.Role, discord.PermissionOverwrite]:
        staff_roles: list[discord.Role] = []
        missing: list[int] = []
        management_role_ids = dict.fromkeys((
            *self.bot.config.voice_management_role_ids,
            self.bot.config.business_coord_team_role_id,
        ))
        for role_id in management_role_ids:
            role = guild.get_role(role_id)
            if role is None:
                missing.append(role_id)
            else:
                staff_roles.append(role)
        if missing:
            formatted = ", ".join(str(role_id) for role_id in missing)
            raise ValueError(f"These configured voice-management roles were not found: {formatted}.")

        overwrites: dict[discord.Role, discord.PermissionOverwrite] = {
            guild.default_role: discord.PermissionOverwrite(
                view_channel=True,
                connect=False,
            )
        }
        for role in connect_roles:
            overwrites[role] = discord.PermissionOverwrite(
                view_channel=True,
                connect=True,
                speak=True,
            )
        for role in (*staff_roles, *moderator_roles):
            overwrites[role] = discord.PermissionOverwrite(
                view_channel=True,
                connect=True,
                speak=True,
                move_members=True,
                mute_members=True,
                deafen_members=True,
            )
        return overwrites

    @business.command(name="balance", description="View a business's tracked funds")
    @app_commands.autocomplete(business=business_autocomplete)
    async def business_balance(self, interaction: discord.Interaction, business: str) -> None:
        row = await self.service.business(guild_id(interaction), business)
        if not self.service.allow_local_cash and not row["fbrp_org_id"]:
            raise ValueError("This business has no FBRP organization linked, so it has no cash wallet.")
        embed = discord.Embed(title=f"{row['name']} Balance", color=row["role_color"])
        embed.add_field(name="Cash", value=f"${row['cash']:,}")
        await reply(interaction, embed=embed)

    @business.command(name="info", description="Show a business summary")
    @app_commands.autocomplete(business=business_autocomplete)
    async def business_info(self, interaction: discord.Interaction, business: str) -> None:
        await self._send_business(interaction, business, detailed=False)

    @business.command(name="view", description="Show all details for a business")
    @app_commands.autocomplete(business=business_autocomplete)
    async def business_view(self, interaction: discord.Interaction, business: str) -> None:
        await self._send_business(interaction, business, detailed=True)

    async def _send_business(self, interaction: discord.Interaction, business: str, detailed: bool) -> None:
        row = await self.service.business(guild_id(interaction), business)
        embed = discord.Embed(title=row["name"], color=row["role_color"])
        embed.description = row["business_type"]
        embed.add_field(name="Tier", value=row["tier"])
        embed.add_field(name="Specialty", value=row["subtype"] or "—")
        embed.add_field(name="Owner", value=f"<@{row['owner_id']}>" if row["owner_id"] else "—")
        if detailed:
            embed.add_field(name="Initials", value=row["initials"] or "—")
            embed.add_field(name="Movement", value="Yes" if movement_enabled(row["movement"]) else "No")
            embed.add_field(name="FBRP org", value=row["fbrp_org_id"] or "—")
            embed.add_field(name="Base role", value=f"<@&{row['base_role_id']}>" if row["base_role_id"] else "—")
            embed.add_field(name="Command role", value=f"<@&{row['command_role_id']}>" if row["command_role_id"] else "—")
            embed.add_field(name="Leaderboard", value="Hidden" if row["hide_leaderboard"] else "Visible")
        await reply(interaction, embed=embed)

    @business.command(name="hours", description="Show in-game duty hours for a business's linked FBRP org")
    @app_commands.autocomplete(business=business_autocomplete)
    async def business_hours(
        self,
        interaction: discord.Interaction,
        business: str,
        days: app_commands.Range[int, 1, 90] = 7,
        member: discord.Member | None = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self.service.business(guild_id(interaction), business)
        await require_business_access(interaction, row)
        if not row["fbrp_org_id"]:
            raise ValueError("This business has no FBRP org linked. Set one with `/business update`.")
        until = int(datetime.now(UTC).timestamp() * 1000)
        try:
            data = await FbrpApi().hours(
                row["fbrp_org_id"], until - days * 86_400_000, until, member.id if member else None
            )
        except FbrpApiError as error:
            raise ValueError(str(error)) from None
        def fmt(seconds: int) -> str:
            return f"{seconds // 3600}h {seconds % 3600 // 60}m"
        lines = [
            f"<@{m['discordId']}> — **{fmt(m['seconds'])}** ({m['shifts']} shifts){' 🟢' if m['onDuty'] else ''}"
            for m in data["members"][:25]
        ]
        embed = discord.Embed(title=f"{row['name']} duty hours", color=row["role_color"])
        embed.description = "\n".join(lines) or "No duty time recorded."
        embed.set_footer(text=f"Last {days} days · {data['org']['name']} · total {fmt(data['totalSeconds'])}")
        await reply(interaction, embed=embed)

    @business.command(name="remove", description="Permanently remove a business record")
    @business_add_remove_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def business_remove(self, interaction: discord.Interaction, business: str) -> None:
        gid = guild_id(interaction)
        row = await self.service.business(gid, business)
        await self.db.execute("DELETE FROM businesses WHERE id=?", (row["id"],))
        await self.service.log(gid, "business", "removed", actor_id(interaction), row["name"])
        if interaction.guild:
            await self._update_business_tier_directory(interaction.guild)
            await refresh_panels(self.bot, interaction.guild, "hours")
        await reply(interaction, f"Removed **{row['name']}**. Discord roles were left untouched.")

    @business.command(name="report", description="Generate a monthly business activity report")
    @manager_only
    async def business_report(self, interaction: discord.Interaction, month: str) -> None:
        try:
            start = datetime.strptime(month, "%Y-%m")
        except ValueError as exc:
            raise ValueError("Month must use `YYYY-MM`, for example `2026-10`.") from exc
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
        rows = await self.db.fetch_all(
            "SELECT g.name,COUNT(l.id) entries,COALESCE(SUM(CASE WHEN l.asset='cash' THEN l.delta ELSE 0 END),0) cash "
            "FROM businesses g LEFT JOIN ledger l ON l.business_id=g.id AND l.created_at>=? AND l.created_at<? "
            "WHERE g.guild_id=? GROUP BY g.id ORDER BY entries DESC",
            (start.isoformat(), end.isoformat(), guild_id(interaction)),
        )
        lines = [f"**{r['name']}** — {r['entries']} entries, cash net {r['cash']:+,}" for r in rows[:30]]
        await reply(interaction, "\n".join(lines) or "No businesses found.")

    @business.command(name="role", description="Change a business role's color")
    @manager_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def business_role(self, interaction: discord.Interaction, business: str, color: str) -> None:
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        row = await self.service.business(guild.id, business)
        value = parse_color(color)
        for key in ("base_role_id", "command_role_id"):
            role = guild.get_role(row[key] or 0)
            if role:
                await role.edit(color=discord.Color(value), reason=f"Changed by {interaction.user}")
        await self.db.execute("UPDATE businesses SET role_color=? WHERE id=?", (value, row["id"]))
        await reply(interaction, f"Updated **{row['name']}** role color to `#{value:06X}`.")

    @business.command(name="update", description="Update business details")
    @manager_only
    @app_commands.rename(guild_id_value="guild_id")
    @app_commands.choices(new_type=BUSINESS_TYPES)
    @app_commands.autocomplete(business=business_autocomplete)
    async def business_update(
        self,
        interaction: discord.Interaction,
        business: str,
        new_name: str | None = None,
        new_type: app_commands.Choice[str] | None = None,
        new_tier: app_commands.Range[int, 1, 4] | None = None,
        hide_from_leaderboard: bool | None = None,
        hide_from_recruitment: bool | None = None,
        new_owner: discord.Member | None = None,
        fbrp_org_id: str | None = None,
        guild_id_value: str | None = None,
        new_specialty: str | None = None,
        new_command_role: discord.Role | None = None,
        movement: bool | None = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self.service.business(guild_id(interaction), business)
        if fbrp_org_id is not None:
            fbrp_org_id = await self.service.validate_org_link(fbrp_org_id)
        values = {
            "name": new_name,
            "business_type": new_type.value if new_type else None,
            "tier": new_tier,
            "hide_leaderboard": int(hide_from_leaderboard) if hide_from_leaderboard is not None else None,
            "hide_recruitment": int(hide_from_recruitment) if hide_from_recruitment is not None else None,
            "owner_id": new_owner.id if new_owner else None,
            "fbrp_org_id": fbrp_org_id,
            "external_guild_id": guild_id_value,
            "subtype": clean_text(new_specialty, 50) if new_specialty else None,
            "command_role_id": new_command_role.id if new_command_role else None,
            "movement": int(movement) if movement is not None else None,
        }
        updates = [(key, value) for key, value in values.items() if value is not None]
        if not updates:
            raise ValueError("Provide at least one field to update.")
        resulting_type = new_type.value if new_type else row["business_type"]
        resulting_subtype = new_specialty if new_specialty is not None else row["subtype"]
        validate_business_type(resulting_type, resulting_subtype)
        sql = ",".join(f"{key}=?" for key, _ in updates)
        await self.db.execute(
            f"UPDATE businesses SET {sql},updated_at=CURRENT_TIMESTAMP WHERE id=?",
            [value for _, value in updates] + [row["id"]],
        )
        await self.service.log(guild_id(interaction), "business", "updated", actor_id(interaction), row["name"], sql)
        if interaction.guild:
            await self._update_business_tier_directory(interaction.guild)
            await refresh_panels(self.bot, interaction.guild, "hours")
        resulting_tier = new_tier if new_tier is not None else row["tier"]
        if resulting_tier == 3 and (
            row["tier"] != 3 or new_command_role is not None
        ):
            role = new_command_role or (
                interaction.guild.get_role(row["command_role_id"] or 0)
                if interaction.guild else None
            )
            if role:
                await self._alert_tier3_members(
                    interaction, row["id"], new_name or row["name"], role
                )
        if movement is True and not movement_enabled(row["movement"]):
            await self._announce_launch(
                interaction, row["base_role_id"], resulting_type
            )
        await reply(interaction, f"Updated **{row['name']}**.")

    async def _announce_launch(
        self,
        interaction: discord.Interaction,
        business_role_id: int | None,
        business_type: str,
    ) -> None:
        if not business_role_id:
            raise ValueError("A base business role is required before enabling movement.")
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        channel_id = self.bot.config.launch_channel_id
        channel = guild.get_channel(channel_id)
        if channel is None:
            channel = await self.bot.fetch_channel(channel_id)
        if not isinstance(channel, discord.abc.Messageable):
            raise ValueError("The configured launch channel cannot receive messages.")
        date = datetime.now(ZoneInfo("America/New_York")).strftime("%B %d, %Y")
        await channel.send(
            f"<@&{business_role_id}> --> Launched ({business_type}) | {date} | "
            f"{interaction.user.mention}"
        )

    async def _alert_tier3_members(
        self,
        interaction: discord.Interaction,
        business_id_value: int,
        business_name: str,
        command_role: discord.Role,
    ) -> None:
        channel = interaction.guild.get_channel(self.bot.config.staff_bypass_channel_id) if interaction.guild else None
        if not isinstance(channel, discord.abc.Messageable):
            return
        business = await self.db.fetch_one(
            "SELECT base_role_id FROM businesses WHERE id=?", (business_id_value,)
        )
        for member in command_role.members:
            if business and business["base_role_id"] not in {role.id for role in member.roles}:
                continue
            embed = discord.Embed(
                title="Staff Bypass Decision",
                color=discord.Color.gold(),
                timestamp=datetime.now(UTC),
            )
            embed.add_field(name="User", value=f"{member.mention}\n`{member.id}`")
            embed.add_field(name="Tier 3 business", value=business_name)
            embed.add_field(name="Command role", value=command_role.mention, inline=False)
            await channel.send(
                embed=without_embed_emojis(embed),
                view=staff_bypass_view(member.id, business_id_value),
            )

    @app_commands.command(name="leaderboard", description="Rank businesses by tracked cash")
    async def leaderboard(self, interaction: discord.Interaction) -> None:
        rows = await self.db.fetch_all(
            "SELECT * FROM businesses WHERE guild_id=? AND hide_leaderboard=0",
            (guild_id(interaction),),
        )
        rows = sorted(await self.service.live_cash_rows(rows), key=lambda row: (-row["cash"], row["name"].lower()))[:20]
        embed = discord.Embed(title="Business Leaderboard", color=discord.Color.gold())
        embed.description = "\n".join(
            f"**{i}. {row['name']}** · T{row['tier']} · ${row['cash']:,}"
            for i, row in enumerate(rows, 1)
        ) or "No businesses are on the leaderboard yet."
        await reply(interaction, embed=embed, ephemeral=False)

    @location.command(name="add", description="Add a business location")
    @manager_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def location_add(self, interaction: discord.Interaction, business: str, postal: str, location_type: str) -> None:
        row = await self.service.business(guild_id(interaction), business)
        await self.db.execute(
            "INSERT INTO locations(guild_id,business_id,postal,location_type) VALUES(?,?,?,?)",
            (guild_id(interaction), row["id"], clean_text(postal, 20), clean_text(location_type, 50)),
        )
        await reply(interaction, f"Added `{location_type}` at postal `{postal}` for **{row['name']}**.")

    @location.command(name="remove", description="Remove a business location by postal")
    @manager_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def location_remove(self, interaction: discord.Interaction, business: str, postal: str) -> None:
        row = await self.service.business(guild_id(interaction), business)
        await self.db.execute("DELETE FROM locations WHERE business_id=? AND postal=?", (row["id"], postal))
        await reply(interaction, f"Removed postal `{postal}` from **{row['name']}**.")

    @location.command(name="view", description="View a business's locations")
    @app_commands.autocomplete(business=business_autocomplete)
    async def location_view(self, interaction: discord.Interaction, business: str) -> None:
        row = await self.service.business(guild_id(interaction), business)
        locations = await self.db.fetch_all("SELECT postal,location_type FROM locations WHERE business_id=? ORDER BY location_type,postal", (row["id"],))
        await reply(interaction, "\n".join(f"• `{x['postal']}` — {x['location_type']}" for x in locations) or "No locations recorded.")

    @location.command(name="audit", description="Check a business's location records")
    @manager_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def location_audit(self, interaction: discord.Interaction, business: str) -> None:
        row = await self.service.business(guild_id(interaction), business)
        data = await self.db.fetch_all("SELECT postal,COUNT(*) n FROM locations WHERE business_id=? GROUP BY postal HAVING n>1", (row["id"],))
        await reply(interaction, "No duplicate postals found." if not data else "Duplicate postals: " + ", ".join(x["postal"] for x in data))

    @location.command(name="refresh", description="Run a consistency check across all locations")
    @manager_only
    async def location_refresh(self, interaction: discord.Interaction) -> None:
        result = await self.db.fetch_one("SELECT COUNT(*) n FROM locations WHERE guild_id=?", (guild_id(interaction),))
        await reply(interaction, f"Location index is current with {result['n']} record(s).")

    @coord.command(name="activity", description="View recent coordinator activity")
    @manager_only
    async def coord_activity(self, interaction: discord.Interaction) -> None:
        rows = await self.db.fetch_all("SELECT action,subject,created_at FROM activity_log WHERE guild_id=? ORDER BY id DESC LIMIT 15", (guild_id(interaction),))
        await reply(interaction, "\n".join(f"`{r['created_at']}` **{r['action']}** {r['subject'] or ''}" for r in rows) or "No activity yet.")

    @coord.command(name="liaison", description="Add or remove a coordinator liaison")
    @manager_only
    @app_commands.choices(action=[app_commands.Choice(name="Add", value="add"), app_commands.Choice(name="Remove", value="remove")])
    @app_commands.autocomplete(business=business_autocomplete)
    async def coord_liaison(self, interaction: discord.Interaction, action: app_commands.Choice[str], business: str, member: discord.Member) -> None:
        row = await self.service.business(guild_id(interaction), business)
        if action.value == "add":
            await self.db.execute("INSERT OR IGNORE INTO coordinator_liaisons(guild_id,business_id,member_id) VALUES(?,?,?)", (guild_id(interaction), row["id"], member.id))
        else:
            await self.db.execute("DELETE FROM coordinator_liaisons WHERE guild_id=? AND business_id=? AND member_id=?", (guild_id(interaction), row["id"], member.id))
        await reply(interaction, f"{action.name}ed {member.mention} {'to' if action.value == 'add' else 'from'} **{row['name']}** liaisons.")

    @coord.command(name="add", description="Add or update a business coordinator")
    @manager_only
    @app_commands.choices(
        rank=[app_commands.Choice(name=value, value=value) for value in COORDINATOR_RANKS],
        category=[app_commands.Choice(name=value, value=value) for value in BUSINESS_CATEGORIES],
    )
    async def coord_add(
        self,
        interaction: discord.Interaction,
        member: discord.Member,
        rank: app_commands.Choice[str],
        category: app_commands.Choice[str],
    ) -> None:
        # Discord invalidates an unacknowledged interaction after three seconds.
        # Role updates can take multiple API round trips, so acknowledge before
        # doing any of that work and let reply() use the follow-up webhook.
        await interaction.response.defer(ephemeral=True)
        guild = interaction.guild
        if guild is None:
            raise ValueError("This command can only be used in a server.")
        desired_rank_names = coordinator_ranks_at_or_below(rank.value)
        desired_rank_roles = [
            guild.get_role(self.bot.config.coordinator_role_ids.get(name, 0))
            for name in desired_rank_names
        ]
        missing_rank_names = [
            name
            for name, role in zip(desired_rank_names, desired_rank_roles, strict=True)
            if role is None
        ]
        category_role = interaction.guild.get_role(
            self.bot.config.category_coordinator_role_ids.get(category.value, 0)
        )
        team_role = guild.get_role(self.bot.config.business_coord_team_role_id)
        if missing_rank_names:
            missing = ", ".join(f"`{name}`" for name in missing_rank_names)
            raise ValueError(f"Configure valid role IDs for: {missing}.")
        if category_role is None:
            raise ValueError(
                f"Configure a valid coordinator role ID for `{category.value}` first."
            )
        if team_role is None:
            raise ValueError("Configure a valid `business_coord_team_role_id` first.")
        old_rank_roles = [
            guild.get_role(
                self.bot.config.coordinator_role_ids.get(value, 0)
            )
            for value in COORDINATOR_RANKS
        ]
        desired_rank_ids = {
            role.id for role in desired_rank_roles if role is not None
        }
        ranks_to_remove = [
            role
            for role in old_rank_roles
            if role and role in member.roles and role.id not in desired_rank_ids
        ]
        if ranks_to_remove:
            await member.remove_roles(
                *ranks_to_remove, reason=f"Coordinator rank updated by {interaction.user}"
            )
        roles_to_add = [
            *[role for role in desired_rank_roles if role is not None],
            category_role,
            team_role,
        ]
        await member.add_roles(
            *roles_to_add, reason=f"Coordinator added by {interaction.user}"
        )
        await self.db.execute(
            "UPDATE coordinators SET rank=? WHERE guild_id=? AND member_id=?",
            (rank.value, guild_id(interaction), member.id),
        )
        await self.db.execute(
            "INSERT INTO coordinators(guild_id,member_id,rank,category) VALUES(?,?,?,?) "
            "ON CONFLICT(guild_id,member_id,category) DO UPDATE SET rank=excluded.rank",
            (guild_id(interaction), member.id, rank.value, category.value),
        )
        await reply(interaction, f"Added {member.mention} as **{rank.value}** for **{category.value}**.")

    @coord.command(name="remove", description="Remove all coordinator assignments from a member")
    @manager_only
    async def coord_remove(self, interaction: discord.Interaction, member: discord.Member) -> None:
        await interaction.response.defer(ephemeral=True)
        if interaction.guild:
            role_ids = {
                *self.bot.config.coordinator_role_ids.values(),
                *self.bot.config.category_coordinator_role_ids.values(),
                self.bot.config.business_coord_team_role_id,
            }
            roles = [interaction.guild.get_role(role_id) for role_id in role_ids]
            held = [role for role in roles if role and role in member.roles]
            if held:
                await member.remove_roles(
                    *held, reason=f"Coordinator removed by {interaction.user}"
                )
        await self.db.execute("DELETE FROM coordinators WHERE guild_id=? AND member_id=?", (guild_id(interaction), member.id))
        await self.db.execute("DELETE FROM coordinator_liaisons WHERE guild_id=? AND member_id=?", (guild_id(interaction), member.id))
        await reply(interaction, f"Removed all coordinator and liaison assignments for {member.mention}.")

    @coord.command(name="update", description="Run scheduled expiry and maintenance tasks now")
    @manager_only
    async def coord_update(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True)
        now = datetime.now(UTC).isoformat()
        guild = interaction.guild
        expired = await self.db.fetch_all("SELECT member_id,role_id FROM temp_roles WHERE guild_id=? AND expires_at<=?", (guild_id(interaction), now))
        removed = 0
        if guild:
            for row in expired:
                member = guild.get_member(row["member_id"])
                role = guild.get_role(row["role_id"])
                if member and role:
                    try:
                        await member.remove_roles(role, reason="Temporary role expired")
                        removed += 1
                    except discord.Forbidden:
                        pass
        await self.db.execute("DELETE FROM temp_roles WHERE guild_id=? AND expires_at<=?", (guild_id(interaction), now))
        panels = await self._update_coord_panels(interaction) if guild else 0
        chain_updated = await self._update_coord_chain(interaction) if guild else False
        tiers_updated = await self._update_business_tier_directory(guild) if guild else False
        chain_status = " and the chain of command" if chain_updated else ""
        tier_status = " and the business tier directory" if tiers_updated else ""
        await reply(
            interaction,
            f"Maintenance complete; removed {removed} expired Discord role(s) and "
            f"updated {panels} coordinator panel(s){chain_status}{tier_status}.",
        )

    async def _update_coord_panels(self, interaction: discord.Interaction) -> int:
        guild = interaction.guild
        if guild is None:
            return 0
        updated = 0
        for category in BUSINESS_CATEGORIES:
            channel = guild.get_channel(
                self.bot.config.coord_channel_ids.get(category, 0)
            )
            if not isinstance(channel, discord.TextChannel):
                continue
            coordinators = await self.db.fetch_all(
                "SELECT member_id,rank FROM coordinators WHERE guild_id=? AND category=?",
                (guild.id, category),
            )
            businesses = await self.db.fetch_all(
                "SELECT id,name,base_role_id FROM businesses WHERE guild_id=? AND business_type=? ORDER BY name",
                (guild.id, category),
            )
            colors = {
                "Car Clubs & Automotive": discord.Color.red(),
                "Security & Protection": discord.Color.blue(),
                "Trucking & Contracting": discord.Color.orange(),
                "Miscellaneous": discord.Color.purple(),
            }
            category_role = guild.get_role(
                self.bot.config.category_coordinator_role_ids.get(category, 0)
            )
            role_heading = category_role.mention if category_role else f"**{category} Coordination**"
            embed = discord.Embed(
                title=f"{category} Coordination",
                description=(
                    f"{role_heading}\n"
                    f"Coordinator roster and business liaison directory for **{category}**."
                ),
                color=colors.get(category, discord.Color.blurple()),
                timestamp=datetime.now(UTC),
            )
            if guild.icon:
                embed.set_thumbnail(url=guild.icon.url)
            for rank in CATEGORY_COORDINATOR_RANKS:
                members = [
                    f"• <@{row['member_id']}>"
                    for row in coordinators
                    if row["rank"] == rank
                ]
                embed.add_field(
                    name=rank,
                    value="\n".join(members) or "*Vacant*",
                    inline=True,
                )
            liaison_lines = []
            for business in businesses:
                liaisons = await self.db.fetch_all(
                    "SELECT member_id FROM coordinator_liaisons WHERE guild_id=? AND business_id=?",
                    (guild.id, business["id"]),
                )
                mentions = ", ".join(f"<@{row['member_id']}>" for row in liaisons) or "*Unassigned*"
                business_label = (
                    f"<@&{business['base_role_id']}>"
                    if business["base_role_id"]
                    else f"`{business['name']} — role not configured`"
                )
                liaison_lines.append(f"{business_label}\n└ {mentions}")
            liaison_chunks = self._embed_line_chunks(
                liaison_lines or ["*No businesses configured for this category.*"]
            )
            for index, chunk in enumerate(liaison_chunks):
                embed.add_field(
                    name="Business Liaisons" if index == 0 else "Business Liaisons · continued",
                    value=chunk,
                    inline=False,
                )
            unique_coordinators = len(
                {
                    row["member_id"]
                    for row in coordinators
                    if row["rank"] in CATEGORY_COORDINATOR_RANKS
                }
            )
            embed.set_footer(
                text=(
                    f"{unique_coordinators} coordinator(s) • {len(businesses)} business(s) "
                    "• Updated via /coord update"
                )
            )
            key = f"coord_panel:{category}"
            saved = await self.service.setting(guild.id, key)
            message = None
            if saved:
                try:
                    message = await channel.fetch_message(int(saved))
                except (discord.NotFound, discord.Forbidden):
                    message = None
            if message:
                await message.edit(embed=without_embed_emojis(embed))
            else:
                message = await channel.send(embed=without_embed_emojis(embed))
                await self.service.set_setting(guild.id, key, str(message.id))
            updated += 1
        return updated

    async def _update_coord_chain(self, interaction: discord.Interaction) -> bool:
        guild = interaction.guild
        if guild is None:
            return False
        channel = guild.get_channel(self.bot.config.coord_chain_channel_id)
        if not isinstance(channel, discord.TextChannel):
            return False
        coordinators = await self.db.fetch_all(
            "SELECT member_id,rank FROM coordinators WHERE guild_id=?",
            (guild.id,),
        )
        embed = discord.Embed(
            title="Business Coordination · Chain of Command",
            description=(
                "The official Business Coordination hierarchy, ordered from highest "
                "authority to entry-level coordination."
            ),
            color=discord.Color.gold(),
            timestamp=datetime.now(UTC),
        )
        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)
        assigned_members: set[int] = set()
        for position, rank in enumerate(COORDINATOR_RANKS, start=1):
            role = guild.get_role(self.bot.config.coordinator_role_ids.get(rank, 0))
            role_label = role.mention if role else f"`{rank} role not found`"
            member_ids = sorted(
                {
                    row["member_id"]
                    for row in coordinators
                    if row["rank"] == rank
                }
            )
            assigned_members.update(member_ids)
            members = "\n".join(f"└ <@{member_id}>" for member_id in member_ids)
            embed.add_field(
                name=f"{position:02d}  {rank}",
                value=f"{role_label}\n{members or '└ *No members assigned*'}",
                inline=False,
            )
        embed.set_footer(
            text=f"{len(assigned_members)} team member(s) • Updated via /coord update"
        )
        key = "coord_chain_panel"
        saved = await self.service.setting(guild.id, key)
        message = None
        if saved:
            try:
                message = await channel.fetch_message(int(saved))
            except (discord.NotFound, discord.Forbidden):
                message = None
        if message:
            await message.edit(embed=without_embed_emojis(embed))
        else:
            message = await channel.send(embed=without_embed_emojis(embed))
            await self.service.set_setting(guild.id, key, str(message.id))
        return True

    async def _update_business_tier_directory(self, guild: discord.Guild) -> bool:
        channel = guild.get_channel(self.bot.config.business_tier_channel_id)
        if not isinstance(channel, discord.TextChannel):
            return False
        businesses = await self.db.fetch_all(
            "SELECT name,tier,business_type,base_role_id FROM businesses "
            "WHERE guild_id=? ORDER BY tier DESC,name",
            (guild.id,),
        )
        embed = discord.Embed(
            title="Business Tier Directory",
            description=(
                "Current standing of every registered business.\n"
                "**Tier 1** is the lowest rank and **Tier 4** is the highest."
            ),
            color=discord.Color.gold(),
            timestamp=datetime.now(UTC),
        )
        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)
        tier_labels = {
            4: "Tier 4 · Highest",
            3: "Tier 3",
            2: "Tier 2",
            1: "Tier 1 · Lowest",
        }
        for tier in range(4, 0, -1):
            tier_businesses = [business for business in businesses if business["tier"] == tier]
            lines = []
            for business in tier_businesses:
                business_label = (
                    f"<@&{business['base_role_id']}>"
                    if business["base_role_id"]
                    else f"**{business['name']}**"
                )
                lines.append(f"• {business_label}  ·  `{business['business_type']}`")
            embed.add_field(
                name=tier_labels[tier],
                value="\n".join(lines) or "*No businesses in this tier*",
                inline=False,
            )
        unranked = [business for business in businesses if business["tier"] not in {1, 2, 3, 4}]
        if unranked:
            embed.add_field(
                name="Unranked",
                value="\n".join(
                    f"<@&{business['base_role_id']}>"
                    if business["base_role_id"]
                    else f"**{business['name']}**"
                    for business in unranked
                ),
                inline=False,
            )
        embed.set_footer(
            text=f"{len(businesses)} registered business(s) • Updates automatically"
        )
        key = "business_tier_directory"
        try:
            saved = await self.service.setting(guild.id, key)
            message = None
            if saved:
                try:
                    message = await channel.fetch_message(int(saved))
                except (discord.NotFound, discord.Forbidden):
                    message = None
            if message:
                await message.edit(embed=without_embed_emojis(embed))
            else:
                message = await channel.send(embed=without_embed_emojis(embed))
                await self.service.set_setting(guild.id, key, str(message.id))
        except (discord.Forbidden, discord.HTTPException):
            return False
        return True

    @staticmethod
    def _embed_line_chunks(lines: list[str], limit: int = 1024) -> list[str]:
        """Keep complete liaison entries together while respecting embed field limits."""
        chunks: list[str] = []
        current = ""
        for line in lines:
            candidate = f"{current}\n\n{line}" if current else line
            if len(candidate) <= limit:
                current = candidate
                continue
            if current:
                chunks.append(current)
            current = line[:limit]
        if current:
            chunks.append(current)
        return chunks

    @member.command(name="logpunishment", description="Log a punishment for a member")
    @manager_only
    @app_commands.choices(
        punishment=[
            app_commands.Choice(name="Warning", value="Warning"),
            app_commands.Choice(name="Strike", value="Strike"),
            app_commands.Choice(name="Suspension", value="Suspension"),
        ]
    )
    @app_commands.autocomplete(business=business_autocomplete)
    async def log_punishment(
        self,
        interaction: discord.Interaction,
        target: discord.Member,
        punishment: app_commands.Choice[str],
        notes: str,
        business: str,
        duration: app_commands.Range[int, 1] | None = None,
    ) -> None:
        row = await self.service.business(guild_id(interaction), business)
        notes = clean_text(notes, 1000)
        if punishment.value == "Suspension" and duration is None:
            raise ValueError("A suspension requires a duration in days.")
        if punishment.value != "Suspension" and duration is not None:
            raise ValueError("Duration can only be set for a suspension.")
        await interaction.response.defer(ephemeral=True)
        if punishment.value == "Suspension":
            role = interaction.guild.get_role(self.bot.config.suspension_role_id) if interaction.guild else None
            if role is None:
                raise ValueError("The configured suspension role was not found.")
            require_restricted_role_manager(interaction.user, role, self.bot.config)
            await target.add_roles(role, reason=f"Business suspension by {interaction.user}")
            expires = future_timestamp(duration)
            await self.db.execute(
                "INSERT INTO temp_roles(guild_id,member_id,role_id,expires_at) VALUES(?,?,?,?) "
                "ON CONFLICT(guild_id,member_id,role_id) DO UPDATE SET expires_at=excluded.expires_at",
                (guild_id(interaction), target.id, role.id, expires),
            )
        item_id = await self.db.execute(
            "INSERT INTO punishments(guild_id,member_id,business_id,punishment,notes,actor_id,duration_days) VALUES(?,?,?,?,?,?,?)",
            (guild_id(interaction), target.id, row["id"], punishment.value, notes, actor_id(interaction), duration),
        )
        date = datetime.now(ZoneInfo("America/New_York")).strftime("%B %d, %Y")
        duration_text = f"{duration} day(s)" if duration else "N/A"
        command_mention = f"<@&{row['command_role_id']}>" if row["command_role_id"] else "Command role not set"
        message = (
            f"{command_mention} <@!{target.id}> --> {punishment.value} | {notes} | "
            f"{duration_text} | {date} | {interaction.user.mention}"
        )
        if interaction.guild:
            for channel_id in self.bot.config.punishment_channel_ids:
                channel = interaction.guild.get_channel(channel_id)
                if isinstance(channel, discord.abc.Messageable):
                    await channel.send(message)
            if punishment.value == "Suspension":
                suspension_log = interaction.guild.get_channel(
                    self.bot.config.suspension_log_channel_id
                )
                if isinstance(suspension_log, discord.abc.Messageable):
                    await suspension_log.send(message)
        await reply(interaction, f"Logged {punishment.value.lower()} `#{item_id}` for {target.mention}.")

    @member.command(name="history", description="View a member's punishment history")
    @manager_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def member_history(self, interaction: discord.Interaction, target: discord.Member, business: str | None = None) -> None:
        params: list[object] = [guild_id(interaction), target.id]
        clause = ""
        if business:
            clause = " AND p.business_id=?"
            params.append((await self.service.business(guild_id(interaction), business))["id"])
        rows = await self.db.fetch_all("SELECT p.id,p.punishment,p.notes,p.active,p.created_at FROM punishments p WHERE p.guild_id=? AND p.member_id=?" + clause + " ORDER BY p.id DESC LIMIT 25", params)
        await reply(interaction, "\n".join(f"`#{r['id']}` {r['punishment']} ({'active' if r['active'] else 'deleted'}) — {r['notes'] or 'no notes'}" for r in rows) or "No punishment history.")

    @member.command(name="editpunishment", description="Edit a punishment record")
    @manager_only
    async def edit_punishment(self, interaction: discord.Interaction, punishment_id: int, new_punishment: str, new_reason: str) -> None:
        await self.db.execute("UPDATE punishments SET punishment=?,edit_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND guild_id=?", (clean_text(new_punishment, 200), clean_text(new_reason, 500), punishment_id, guild_id(interaction)))
        await reply(interaction, f"Updated punishment `#{punishment_id}`.")

    @member.command(name="deletepunishment", description="Soft-delete a punishment record")
    @manager_only
    async def delete_punishment(self, interaction: discord.Interaction, punishment_id: int, reason: str) -> None:
        await self.db.execute("UPDATE punishments SET active=0,edit_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND guild_id=?", (clean_text(reason, 500), punishment_id, guild_id(interaction)))
        await reply(interaction, f"Deactivated punishment `#{punishment_id}`.")

    @permissions.command(name="set", description="Set a user or role permission override")
    @manager_only
    @app_commands.choices(action=[app_commands.Choice(name="Allow", value="allow"), app_commands.Choice(name="Deny", value="deny"), app_commands.Choice(name="Clear", value="clear")])
    async def permissions_set(self, interaction: discord.Interaction, action: app_commands.Choice[str], permission: str, target: discord.Member | discord.Role) -> None:
        kind = "role" if isinstance(target, discord.Role) else "user"
        if action.value == "clear":
            await self.db.execute("DELETE FROM permissions WHERE guild_id=? AND target_type=? AND target_id=? AND permission=?", (guild_id(interaction), kind, target.id, permission.lower()))
        else:
            await self.db.execute("INSERT INTO permissions(guild_id,target_type,target_id,permission,allowed) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,target_type,target_id,permission) DO UPDATE SET allowed=excluded.allowed", (guild_id(interaction), kind, target.id, permission.lower(), int(action.value == "allow")))
        await reply(interaction, f"Permission `{permission.lower()}` for {target.mention}: **{action.name}**.")

    @permissions.command(name="view", description="View a user or role permission override")
    @manager_only
    async def permissions_view(self, interaction: discord.Interaction, permission: str, target: discord.Member | discord.Role) -> None:
        kind = "role" if isinstance(target, discord.Role) else "user"
        row = await self.db.fetch_one("SELECT allowed FROM permissions WHERE guild_id=? AND target_type=? AND target_id=? AND permission=?", (guild_id(interaction), kind, target.id, permission.lower()))
        state = "not set" if row is None else ("allowed" if row["allowed"] else "denied")
        await reply(interaction, f"{target.mention} `{permission.lower()}` is **{state}**.")

    @role.command(name="add", description="Give a managed role to a member")
    async def role_add(
        self, interaction: discord.Interaction, role: discord.Role, target: discord.Member
    ) -> None:
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        await require_role_manager(interaction, role)
        business = await business_for_role(self.db, guild_id(interaction), role.id)
        if business:
            conflict = business_role_restriction(self.bot, target, command_role=False)
            conflict = conflict or await category_conflict(self.bot, target, business)
            if conflict:
                await send_conflict_alert(self.bot, target, role, conflict)
                raise ValueError(f"Business role blocked: {conflict}.")
        else:
            command_business = await business_for_role(
                self.db, guild_id(interaction), role.id, "command_role_id"
            )
            if command_business:
                conflict = business_role_restriction(
                    self.bot, target, command_role=True
                )
                if conflict:
                    await send_conflict_alert(self.bot, target, role, conflict)
                    raise ValueError(f"Business command role blocked: {conflict}.")
        await target.add_roles(role, reason=f"Managed role added by {interaction.user}")
        await self.service.log(
            guild_id(interaction), "role", "add", actor_id(interaction),
            str(target.id), f"role={role.id}",
        )
        await reply(interaction, f"Added {role.mention} to {target.mention}.")

    @role.command(name="remove", description="Remove a managed role from a member")
    @app_commands.choices(
        reason=[
            app_commands.Choice(name="Resigned", value="Resigned"),
            app_commands.Choice(name="Terminated", value="Terminated"),
        ]
    )
    async def role_remove(
        self,
        interaction: discord.Interaction,
        role: discord.Role,
        target: discord.Member,
        reason: app_commands.Choice[str],
    ) -> None:
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        await require_role_manager(interaction, role)
        protected = await self.db.fetch_one(
            "SELECT 1 FROM protected_roles WHERE guild_id=? AND role_id=?",
            (guild_id(interaction), role.id),
        )
        if protected:
            raise ValueError("That role is protected. Unprotect it first.")
        business = await business_for_role(self.db, guild_id(interaction), role.id)
        if business:
            self.bot.mark_managed_business_removal(guild_id(interaction), target.id, role.id)
            try:
                await assign_parole(self.bot, target, business)
            except Exception:
                self.bot.consume_managed_business_removal(
                    guild_id(interaction), target.id, role.id
                )
                raise
            await send_role_action(self.bot, target, business, reason.value, interaction.user)
        try:
            await target.remove_roles(role, reason=f"Managed role removed by {interaction.user}")
        except Exception:
            if business:
                self.bot.consume_managed_business_removal(
                    guild_id(interaction), target.id, role.id
                )
            raise
        await self.service.log(
            guild_id(interaction), "role", "remove", actor_id(interaction),
            str(target.id), f"role={role.id}",
        )
        suffix = f" and applied {self.bot.config.parole_days}-day {business['business_type']} parole" if business else ""
        await reply(interaction, f"Removed {role.mention} from {target.mention}{suffix}.")

    @app_commands.command(name="useradd", description="Delegate management of a Discord role")
    @role_management_admin_only
    async def useradd(
        self,
        interaction: discord.Interaction,
        manager: discord.Member | discord.Role,
        role: discord.Role,
    ) -> None:
        manager_type = "role" if isinstance(manager, discord.Role) else "user"
        await self.db.execute(
            "INSERT OR IGNORE INTO role_managers(guild_id,managed_role_id,manager_type,manager_id) VALUES(?,?,?,?)",
            (guild_id(interaction), role.id, manager_type, manager.id),
        )
        await reply(interaction, f"{manager.mention} can now manage {role.mention}.")

    @app_commands.command(name="userdel", description="Remove delegated management of a Discord role")
    @role_management_admin_only
    async def userdel(
        self,
        interaction: discord.Interaction,
        manager: discord.Member | discord.Role,
        role: discord.Role,
    ) -> None:
        manager_type = "role" if isinstance(manager, discord.Role) else "user"
        await self.db.execute(
            "DELETE FROM role_managers WHERE guild_id=? AND managed_role_id=? AND manager_type=? AND manager_id=?",
            (guild_id(interaction), role.id, manager_type, manager.id),
        )
        await reply(interaction, f"{manager.mention} can no longer manage {role.mention}.")

    @app_commands.command(name="rolewipe", description="Remove a managed role from every member")
    async def rolewipe(self, interaction: discord.Interaction, role: discord.Role) -> None:
        require_restricted_role_manager(interaction.user, role, self.bot.config)
        await require_role_manager(interaction, role)
        protected = await self.db.fetch_one(
            "SELECT 1 FROM protected_roles WHERE guild_id=? AND role_id=?",
            (guild_id(interaction), role.id),
        )
        if protected:
            raise ValueError("That role is protected. Unprotect it first.")
        await interaction.response.defer(ephemeral=True)
        removed = 0
        failed = 0
        for member in list(role.members):
            try:
                await member.remove_roles(role, reason=f"Role wipe by {interaction.user}")
                removed += 1
            except discord.Forbidden:
                failed += 1
        await self.service.log(
            guild_id(interaction), "role", "wipe", actor_id(interaction),
            str(role.id), f"removed={removed} failed={failed}",
        )
        await reply(
            interaction,
            f"Wiped {role.mention} from {removed} member(s)."
            + (f" {failed} removal(s) failed due to Discord hierarchy." if failed else ""),
        )

    @role.command(name="protection", description="Protect or unprotect a role from bot removal")
    @role_management_admin_only
    @app_commands.choices(action=[app_commands.Choice(name="Protect", value="protect"), app_commands.Choice(name="Unprotect", value="unprotect")])
    async def role_protection(self, interaction: discord.Interaction, action: app_commands.Choice[str], role: discord.Role) -> None:
        if action.value == "protect":
            await self.db.execute("INSERT OR IGNORE INTO protected_roles(guild_id,role_id) VALUES(?,?)", (guild_id(interaction), role.id))
        else:
            await self.db.execute("DELETE FROM protected_roles WHERE guild_id=? AND role_id=?", (guild_id(interaction), role.id))
        await reply(interaction, f"{role.mention} is now **{action.value}ed**.")

    @reward.command(name="give", description="Give a business reward slot to a user")
    @manager_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def reward_give(
        self,
        interaction: discord.Interaction,
        business: str,
        user: discord.Member,
        amount: app_commands.Range[int, 1],
    ) -> None:
        row = await self.service.business(guild_id(interaction), business)
        existing = await self.db.fetch_one(
            "SELECT 1 FROM rewards WHERE business_id=? AND user_id=?", (row["id"], user.id)
        )
        if existing:
            raise ValueError("That user already has a reward assignment for this business.")
        count = await self.db.fetch_one("SELECT COUNT(*) n FROM rewards WHERE business_id=?", (row["id"],))
        if count["n"] >= row["reward_slots"]:
            raise ValueError("That business has no open reward slots.")
        received, fee = deduct_fee(
            amount, await bank_fee_rate(self.db, guild_id(interaction))
        )
        await self.service.change_balance(
            guild_id(interaction), row["name"], "cash", received,
            f"reward for {user.id} (fee {fee})", actor_id(interaction),
        )
        await self.db.execute(
            "INSERT INTO rewards(guild_id,business_id,user_id,cash_amount) VALUES(?,?,?,?)",
            (guild_id(interaction), row["id"], user.id, received),
        )
        await reply(interaction, f"Rewarded **{row['name']}** {received:,} cash for {user.mention} after a {fee:,} fee.")

    @reward.command(name="remove", description="Remove a user's business reward")
    @manager_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def reward_remove(self, interaction: discord.Interaction, business: str, user: discord.Member) -> None:
        row = await self.service.business(guild_id(interaction), business)
        await self.db.execute("DELETE FROM rewards WHERE business_id=? AND user_id=?", (row["id"], user.id))
        await reply(interaction, f"Removed {user.mention}'s **{row['name']}** reward.")

    @reward.command(name="slots", description="Set the number of business reward slots")
    @manager_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def reward_slots(self, interaction: discord.Interaction, business: str, slots: int) -> None:
        if slots < 0:
            raise ValueError("Slots cannot be negative.")
        row = await self.service.business(guild_id(interaction), business)
        await self.db.execute("UPDATE businesses SET reward_slots=? WHERE id=?", (slots, row["id"]))
        await reply(interaction, f"Set **{row['name']}** reward slots to {slots}.")

    @reward.command(name="manage", description="View a business's current rewards")
    @manager_only
    @app_commands.autocomplete(business=business_autocomplete)
    async def reward_manage(self, interaction: discord.Interaction, business: str) -> None:
        row = await self.service.business(guild_id(interaction), business)
        users = await self.db.fetch_all("SELECT user_id,cash_amount,granted_at FROM rewards WHERE business_id=?", (row["id"],))
        await reply(interaction, f"**{row['name']}** rewards ({len(users)}/{row['reward_slots']}):\n" + ("\n".join(f"• <@{x['user_id']}> — {x['cash_amount']:,} cash" for x in users) or "None"))

    @reward.command(name="refresh", description="Remove rewards beyond reduced slot limits")
    @manager_only
    async def reward_refresh(self, interaction: discord.Interaction) -> None:
        businesses = await self.db.fetch_all("SELECT id,reward_slots FROM businesses WHERE guild_id=?", (guild_id(interaction),))
        removed = 0
        for business in businesses:
            rows = await self.db.fetch_all("SELECT user_id FROM rewards WHERE business_id=? ORDER BY granted_at", (business["id"],))
            for row in rows[business["reward_slots"]:]:
                await self.db.execute("DELETE FROM rewards WHERE business_id=? AND user_id=?", (business["id"], row["user_id"]))
                removed += 1
        await reply(interaction, f"Reward assignments refreshed; removed {removed} overflow assignment(s).")

    @app_commands.command(name="quiz", description="Send a business knowledge quiz question to a member")
    @manager_only
    async def quiz(self, interaction: discord.Interaction, member: discord.Member, category: str) -> None:
        questions = {
            "rules": ["What is the escalation process before starting a conflict?", "When must a scene be reported to staff?"],
            "business": ["Who is your current business command?", "Explain your business's chain of command."],
            "roleplay": ["What does valuing your life mean in roleplay?", "Define metagaming in your own words."],
        }
        pool = questions.get(category.lower(), sum(questions.values(), []))
        question = random.choice(pool)
        await member.send(f"**{category.title()} quiz**\n{question}\n\nReply to your coordinator with your answer.")
        await reply(interaction, f"Sent a **{category}** quiz question to {member.mention}.")
