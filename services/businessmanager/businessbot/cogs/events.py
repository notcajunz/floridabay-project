from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import discord
from discord.ext import commands, tasks

from ..common import without_embed_emojis
from ..components import staff_bypass_view
from ..role_policy import (
    assign_parole,
    can_manage_restricted_roles,
    category_conflict,
    business_for_role,
    business_role_restriction,
    is_restricted_role,
    send_conflict_alert,
    send_role_action,
    sync_category_member_role,
)


class EventsCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.db = bot.db

    async def cog_load(self) -> None:
        self.expire_temporary_roles.start()

    async def cog_unload(self) -> None:
        self.expire_temporary_roles.cancel()

    @tasks.loop(minutes=1)
    async def expire_temporary_roles(self) -> None:
        now = datetime.now(UTC).isoformat()
        rows = await self.db.fetch_all(
            "SELECT guild_id,member_id,role_id FROM temp_roles WHERE expires_at<=?", (now,)
        )
        for row in rows:
            guild = self.bot.get_guild(row["guild_id"])
            member = guild.get_member(row["member_id"]) if guild else None
            role = guild.get_role(row["role_id"]) if guild else None
            if member and role:
                try:
                    await member.remove_roles(role, reason="Temporary role expired")
                except discord.Forbidden:
                    continue
            await self.db.execute(
                "DELETE FROM temp_roles WHERE guild_id=? AND member_id=? AND role_id=?",
                (row["guild_id"], row["member_id"], row["role_id"]),
            )

    @expire_temporary_roles.before_loop
    async def before_expiry_loop(self) -> None:
        await self.bot.wait_until_ready()

    async def _send_log(
        self, guild: discord.Guild, channel_id: int, embed: discord.Embed
    ) -> None:
        channel = guild.get_channel(channel_id)
        if isinstance(channel, discord.abc.Messageable):
            await channel.send(embed=without_embed_emojis(embed))

    @commands.Cog.listener()
    async def on_member_update(self, before: discord.Member, after: discord.Member) -> None:
        before_ids = {role.id for role in before.roles}
        after_ids = {role.id for role in after.roles}
        added = [role for role in after.roles if role.id not in before_ids]
        removed = [role for role in before.roles if role.id not in after_ids]
        added, removed = await self._enforce_restricted_role_changes(
            after, added, removed
        )
        alerted_t3: set[int] = set()
        categories_to_sync: set[str] = set()

        added_ids = {role.id for role in added}
        base_blocker_added = self.bot.config.business_role_blocker_role_id in added_ids
        command_blocker_added = (
            self.bot.config.business_command_role_blocker_role_id in added_ids
        )
        if base_blocker_added or command_blocker_added:
            businesses = await self.db.fetch_all(
                "SELECT * FROM businesses WHERE guild_id=?", (after.guild.id,)
            )
            for business in businesses:
                prohibited_role_id = (
                    business["base_role_id"] if base_blocker_added else None
                )
                if (
                    prohibited_role_id
                    and prohibited_role_id in after_ids
                    and prohibited_role_id not in added_ids
                ):
                    prohibited_role = after.guild.get_role(prohibited_role_id)
                    if prohibited_role:
                        reason = business_role_restriction(
                            self.bot, after, command_role=False
                        )
                        await after.remove_roles(
                            prohibited_role,
                            reason="Business role exclusion role was added",
                        )
                        await send_conflict_alert(
                            self.bot, after, prohibited_role, reason or "Business role excluded"
                        )
                prohibited_role_id = (
                    business["command_role_id"] if command_blocker_added else None
                )
                if (
                    prohibited_role_id
                    and prohibited_role_id in after_ids
                    and prohibited_role_id not in added_ids
                ):
                    prohibited_role = after.guild.get_role(prohibited_role_id)
                    if prohibited_role:
                        reason = business_role_restriction(
                            self.bot, after, command_role=True
                        )
                        await after.remove_roles(
                            prohibited_role,
                            reason="Business command-role exclusion role was added",
                        )
                        await send_conflict_alert(
                            self.bot,
                            after,
                            prohibited_role,
                            reason or "Business command role excluded",
                        )

        for role in added:
            business = await business_for_role(self.db, after.guild.id, role.id)
            if business:
                categories_to_sync.add(business["business_type"])
                conflict = business_role_restriction(
                    self.bot, after, command_role=False
                )
                conflict = conflict or await category_conflict(self.bot, after, business)
                if conflict:
                    self.bot.mark_managed_business_removal(after.guild.id, after.id, role.id)
                    await after.remove_roles(role, reason=f"Business role policy: {conflict}")
                    await send_conflict_alert(self.bot, after, role, conflict)
                elif business["tier"] == 3 and business["command_role_id"] in after_ids:
                    await self._send_staff_bypass(after, business)
                    alerted_t3.add(business["id"])
            command_business = await business_for_role(
                self.db, after.guild.id, role.id, "command_role_id"
            )
            command_conflict = (
                business_role_restriction(self.bot, after, command_role=True)
                if command_business
                else None
            )
            if command_business and command_conflict:
                await after.remove_roles(
                    role, reason=f"Business command role policy: {command_conflict}"
                )
                await send_conflict_alert(
                    self.bot, after, role, command_conflict
                )
                continue
            if (
                command_business
                and command_business["tier"] == 3
                and command_business["base_role_id"] in after_ids
                and command_business["id"] not in alerted_t3
            ):
                await self._send_staff_bypass(after, command_business)
                alerted_t3.add(command_business["id"])

        for role in removed:
            business = await business_for_role(self.db, after.guild.id, role.id)
            if business:
                categories_to_sync.add(business["business_type"])
                if not self.bot.consume_managed_business_removal(
                    after.guild.id, after.id, role.id
                ):
                    try:
                        await assign_parole(self.bot, after, business)
                        actor = await self._role_change_actor(after)
                        await send_role_action(
                            self.bot, after, business, "Terminated", actor or self.bot.user
                        )
                    except (ValueError, discord.Forbidden):
                        pass

        if set(self.bot.config.parole_role_ids.values()).intersection(added_ids):
            businesses = await self.db.fetch_all(
                "SELECT * FROM businesses WHERE guild_id=?", (after.guild.id,)
            )
            held_ids = {role.id for role in after.roles}
            for business in businesses:
                if business["base_role_id"] not in held_ids:
                    continue
                business_role = after.guild.get_role(business["base_role_id"])
                conflict = await category_conflict(self.bot, after, business)
                if business_role and conflict and "Parole" in conflict:
                    self.bot.mark_managed_business_removal(after.guild.id, after.id, business_role.id)
                    await after.remove_roles(business_role, reason=f"Business parole policy: {conflict}")
                    await send_conflict_alert(self.bot, after, business_role, conflict)

        for category in categories_to_sync:
            try:
                await sync_category_member_role(self.bot, after, category)
            except discord.Forbidden:
                pass

        if added or removed or before.nick != after.nick:
            embed = discord.Embed(
                title="Member Updated",
                color=discord.Color.blurple(),
                timestamp=datetime.now(UTC),
            )
            embed.set_author(name=str(after), icon_url=after.display_avatar.url)
            embed.add_field(name="User", value=f"{after.mention}\n`{after.id}`", inline=False)
            if added:
                embed.add_field(name="Roles added", value=" ".join(role.mention for role in added), inline=False)
            if removed:
                embed.add_field(name="Roles removed", value=" ".join(role.mention for role in removed), inline=False)
            if before.nick != after.nick:
                embed.add_field(name="Nickname", value=f"{before.nick or before.name} → {after.nick or after.name}", inline=False)
            await self._send_log(
                after.guild, self.bot.config.member_log_channel_id, embed
            )

    async def _enforce_restricted_role_changes(
        self,
        member: discord.Member,
        added: list[discord.Role],
        removed: list[discord.Role],
    ) -> tuple[list[discord.Role], list[discord.Role]]:
        """Undo native/API edits of protected roles made by non-directors."""
        restricted_added = [
            role for role in added if is_restricted_role(role, self.bot.config)
        ]
        restricted_removed = [
            role for role in removed if is_restricted_role(role, self.bot.config)
        ]
        if not restricted_added and not restricted_removed:
            return added, removed

        actor = await self._role_change_actor(
            member,
            added_role_ids={role.id for role in restricted_added},
            removed_role_ids={role.id for role in restricted_removed},
        )
        actor_id = getattr(actor, "id", None)
        bot_id = getattr(self.bot.user, "id", None)
        actor_member = (
            actor
            if isinstance(actor, discord.Member)
            else member.guild.get_member(actor_id) if actor_id else None
        )
        if actor_id == bot_id or (
            actor_member is not None
            and can_manage_restricted_roles(actor_member, self.bot.config)
        ):
            return added, removed

        # Unknown actors are denied too. This fails closed when the audit-log
        # entry is unavailable, rather than leaving a protected role changed.
        if restricted_added:
            await member.remove_roles(
                *restricted_added,
                reason="Reverted unauthorized restricted-role assignment",
            )
        if restricted_removed:
            await member.add_roles(
                *restricted_removed,
                reason="Reverted unauthorized restricted-role removal",
            )

        action = []
        if restricted_added:
            action.append(
                "Added: " + " ".join(role.mention for role in restricted_added)
            )
        if restricted_removed:
            action.append(
                "Removed: " + " ".join(role.mention for role in restricted_removed)
            )
        embed = discord.Embed(
            title="Restricted Role Change Blocked",
            color=discord.Color.red(),
            timestamp=datetime.now(UTC),
        )
        embed.add_field(name="Member", value=f"{member.mention}\n`{member.id}`")
        embed.add_field(
            name="Actor",
            value=(f"{actor.mention}\n`{actor.id}`" if actor else "Unknown"),
        )
        embed.add_field(name="Reverted change", value="\n".join(action), inline=False)
        await self._send_log(
            member.guild, self.bot.config.member_log_channel_id, embed
        )

        restricted_ids = {
            role.id for role in (*restricted_added, *restricted_removed)
        }
        return (
            [role for role in added if role.id not in restricted_ids],
            [role for role in removed if role.id not in restricted_ids],
        )

    async def _role_change_actor(
        self,
        member: discord.Member,
        *,
        added_role_ids: set[int] | None = None,
        removed_role_ids: set[int] | None = None,
    ):
        match_roles = bool(added_role_ids or removed_role_ids)
        for attempt in range(2 if match_roles else 1):
            try:
                async for entry in member.guild.audit_logs(
                    limit=6, action=discord.AuditLogAction.member_role_update
                ):
                    if not entry.target or entry.target.id != member.id:
                        continue
                    if datetime.now(UTC) - entry.created_at >= timedelta(seconds=15):
                        continue
                    if match_roles:
                        entry_added = {
                            role.id
                            for role in getattr(entry.after, "roles", ())
                        }
                        entry_removed = {
                            role.id
                            for role in getattr(entry.before, "roles", ())
                        }
                        if not (
                            entry_added.intersection(added_role_ids or set())
                            or entry_removed.intersection(removed_role_ids or set())
                        ):
                            continue
                    return entry.user
            except discord.Forbidden:
                return None
            if attempt == 0:
                # Discord can publish the gateway update just before its audit
                # entry becomes readable.
                await asyncio.sleep(0.5)
        return None

    async def _send_staff_bypass(self, member: discord.Member, business) -> None:
        channel = member.guild.get_channel(self.bot.config.staff_bypass_channel_id)
        if not isinstance(channel, discord.abc.Messageable):
            return
        embed = discord.Embed(
            title="Staff Bypass Decision",
            color=discord.Color.gold(),
            timestamp=datetime.now(UTC),
        )
        embed.add_field(name="User", value=f"{member.mention}\n`{member.id}`")
        embed.add_field(name="Tier 3 business", value=business["name"])
        embed.add_field(name="Command role", value=f"<@&{business['command_role_id']}>", inline=False)
        await channel.send(
            embed=without_embed_emojis(embed),
            view=staff_bypass_view(member.id, business["id"]),
        )

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        business_member_role = member.guild.get_role(self.bot.config.business_member_role_id)
        if business_member_role and business_member_role not in member.roles:
            try:
                await member.add_roles(
                    business_member_role, reason="Automatic role for new server member"
                )
            except discord.Forbidden:
                pass
        embed = discord.Embed(title="Member Joined", color=discord.Color.green(), timestamp=datetime.now(UTC))
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.add_field(name="User", value=f"{member.mention}\n`{member.id}`")
        embed.add_field(name="Account created", value=f"<t:{int(member.created_at.timestamp())}:R>")
        embed.add_field(name="Member count", value=f"{member.guild.member_count:,}")
        await self._send_log(
            member.guild, self.bot.config.join_leave_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member) -> None:
        roles = [role.mention for role in member.roles if not role.is_default()]
        embed = discord.Embed(title="Member Left", color=discord.Color.red(), timestamp=datetime.now(UTC))
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.add_field(name="User", value=f"{member}\n`{member.id}`", inline=False)
        embed.add_field(name="Joined server", value=f"<t:{int(member.joined_at.timestamp())}:R>" if member.joined_at else "Unknown")
        embed.add_field(name="Roles before leaving", value=" ".join(roles)[:1024] or "None", inline=False)
        embed.add_field(name="Member count", value=f"{member.guild.member_count:,}")
        await self._send_log(
            member.guild, self.bot.config.join_leave_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_voice_state_update(self, member, before, after) -> None:
        if before.channel == after.channel:
            return
        embed = discord.Embed(title="Voice Activity", color=discord.Color.teal(), timestamp=datetime.now(UTC))
        embed.add_field(name="User", value=member.mention)
        embed.add_field(name="From", value=before.channel.mention if before.channel else "Disconnected")
        embed.add_field(name="To", value=after.channel.mention if after.channel else "Disconnected")
        await self._send_log(
            member.guild, self.bot.config.voice_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_message_delete(self, message: discord.Message) -> None:
        if not message.guild or message.author.bot:
            return
        embed = discord.Embed(title="Message Deleted", color=discord.Color.red(), timestamp=datetime.now(UTC))
        embed.add_field(name="Author", value=message.author.mention)
        embed.add_field(name="Channel", value=message.channel.mention)
        embed.add_field(name="Content", value=(message.content or "No cached text")[:1024], inline=False)
        await self._send_log(
            message.guild, self.bot.config.message_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_message_edit(self, before: discord.Message, after: discord.Message) -> None:
        if not after.guild or after.author.bot or before.content == after.content:
            return
        embed = discord.Embed(title="Message Edited", color=discord.Color.orange(), timestamp=datetime.now(UTC), url=after.jump_url)
        embed.add_field(name="Author", value=after.author.mention)
        embed.add_field(name="Channel", value=after.channel.mention)
        embed.add_field(name="Before", value=(before.content or "No cached text")[:1024], inline=False)
        embed.add_field(name="After", value=(after.content or "No cached text")[:1024], inline=False)
        await self._send_log(
            after.guild, self.bot.config.message_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_guild_channel_create(self, channel) -> None:
        embed = discord.Embed(title="Channel Created", description=f"{channel.mention} (`{channel.id}`)", color=discord.Color.green(), timestamp=datetime.now(UTC))
        await self._send_log(
            channel.guild, self.bot.config.server_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel) -> None:
        embed = discord.Embed(title="Channel Deleted", description=f"{channel.name} (`{channel.id}`)", color=discord.Color.red(), timestamp=datetime.now(UTC))
        await self._send_log(
            channel.guild, self.bot.config.server_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_guild_channel_update(self, before, after) -> None:
        changes = []
        if before.name != after.name:
            changes.append(f"Name: `{before.name}` → `{after.name}`")
        if before.category_id != after.category_id:
            changes.append("Category changed")
        if not changes:
            return
        embed = discord.Embed(title="Channel Updated", description="\n".join(changes), color=discord.Color.orange(), timestamp=datetime.now(UTC))
        embed.add_field(name="Channel", value=f"{after.mention} (`{after.id}`)")
        await self._send_log(
            after.guild, self.bot.config.server_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_guild_role_create(self, role) -> None:
        embed = discord.Embed(title="Role Created", description=f"{role.mention} (`{role.id}`)", color=discord.Color.green(), timestamp=datetime.now(UTC))
        await self._send_log(
            role.guild, self.bot.config.server_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_guild_role_delete(self, role) -> None:
        embed = discord.Embed(title="Role Deleted", description=f"{role.name} (`{role.id}`)", color=discord.Color.red(), timestamp=datetime.now(UTC))
        await self._send_log(
            role.guild, self.bot.config.server_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_guild_role_update(self, before, after) -> None:
        changes = []
        if before.name != after.name:
            changes.append(f"Name: `{before.name}` → `{after.name}`")
        if before.permissions != after.permissions:
            changes.append("Permissions changed")
        if before.colour != after.colour:
            changes.append("Color changed")
        if not changes:
            return
        embed = discord.Embed(title="Role Updated", description="\n".join(changes), color=discord.Color.orange(), timestamp=datetime.now(UTC))
        embed.add_field(name="Role", value=f"{after.mention} (`{after.id}`)")
        await self._send_log(
            after.guild, self.bot.config.server_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_member_ban(self, guild: discord.Guild, user: discord.User) -> None:
        embed = discord.Embed(title="Member Banned", description=f"{user} (`{user.id}`)", color=discord.Color.red(), timestamp=datetime.now(UTC))
        await self._send_log(guild, self.bot.config.server_log_channel_id, embed)

    @commands.Cog.listener()
    async def on_member_unban(self, guild: discord.Guild, user: discord.User) -> None:
        embed = discord.Embed(title="Member Unbanned", description=f"{user} (`{user.id}`)", color=discord.Color.green(), timestamp=datetime.now(UTC))
        await self._send_log(guild, self.bot.config.server_log_channel_id, embed)
