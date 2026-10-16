from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

import discord
from discord.ext import commands, tasks

from ..common import refresh_panels, without_embed_emojis
from ..role_policy import (
    assign_cooldown,
    can_manage_restricted_roles,
    category_conflict,
    department_for_role,
    is_restricted_role,
    send_conflict_alert,
    send_member_movement,
    sync_category_member_roles,
)

log = logging.getLogger(__name__)


class EventsCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.db = bot.db

    async def cog_load(self) -> None:
        self.expire_temporary_roles.start()

    async def cog_unload(self) -> None:
        self.expire_temporary_roles.cancel()

    async def expire_now(self) -> int:
        """Remove every cooldown and temporary role whose time is up. Returns how many were removed."""
        now = datetime.now(UTC).isoformat()
        rows = await self.db.fetch_all(
            "SELECT guild_id,member_id,role_id FROM temp_roles WHERE expires_at<=?", (now,)
        )
        removed = 0
        for row in rows:
            guild = self.bot.get_guild(row["guild_id"])
            member = guild.get_member(row["member_id"]) if guild else None
            role = guild.get_role(row["role_id"]) if guild else None
            if member and role and role in member.roles:
                try:
                    await member.remove_roles(role, reason="Cooldown or temporary role expired")
                    removed += 1
                except discord.Forbidden:
                    continue
            await self.db.execute(
                "DELETE FROM temp_roles WHERE guild_id=? AND member_id=? AND role_id=?",
                (row["guild_id"], row["member_id"], row["role_id"]),
            )
        return removed

    @tasks.loop(minutes=1)
    async def expire_temporary_roles(self) -> None:
        await self.expire_now()

    @expire_temporary_roles.before_loop
    async def before_expiry_loop(self) -> None:
        await self.bot.wait_until_ready()

    async def _send_log(self, guild: discord.Guild, channel_id: int, embed: discord.Embed) -> None:
        channel = guild.get_channel(channel_id) if channel_id else None
        if isinstance(channel, discord.abc.Messageable):
            try:
                await channel.send(embed=without_embed_emojis(embed))
            except (discord.Forbidden, discord.HTTPException):
                log.exception("Could not post to log channel %s", channel_id)

    @commands.Cog.listener()
    async def on_member_update(self, before: discord.Member, after: discord.Member) -> None:
        before_ids = {role.id for role in before.roles}
        after_ids = {role.id for role in after.roles}
        added = [role for role in after.roles if role.id not in before_ids]
        removed = [role for role in before.roles if role.id not in after_ids]
        if not added and not removed and before.nick == after.nick:
            return
        added, removed = await self._enforce_restricted_role_changes(after, added, removed)
        guild = after.guild
        departments_changed = False

        for role in added:
            department = await department_for_role(self.db, guild.id, role.id)
            if department is None:
                continue
            departments_changed = True
            if self.bot.consume_managed("add", guild.id, after.id, role.id):
                continue
            # Someone gave the department role by hand: hold it to the same rules as /role add.
            conflict = await category_conflict(self.bot, after, department)
            if conflict:
                self.bot.mark_managed("remove", guild.id, after.id, role.id)
                try:
                    await after.remove_roles(role, reason=f"Department role policy: {conflict}")
                except discord.HTTPException:
                    self.bot.consume_managed("remove", guild.id, after.id, role.id)
                    raise
                await send_conflict_alert(self.bot, after, role, conflict)
            else:
                actor = await self._role_change_actor(after, added_role_ids={role.id})
                await send_member_movement(self.bot, after, department, "Joined", actor)

        for role in removed:
            department = await department_for_role(self.db, guild.id, role.id)
            if department is None:
                continue
            departments_changed = True
            if self.bot.consume_managed("remove", guild.id, after.id, role.id):
                continue
            # A hand removal counts as leaving the department: resignation cooldown applies.
            actor = await self._role_change_actor(after, removed_role_ids={role.id})
            try:
                await assign_cooldown(self.bot, after, department["category"], "Resignation", department=department["name"])
            except (ValueError, discord.Forbidden):
                log.exception("Could not apply a resignation cooldown")
            await send_member_movement(self.bot, after, department, "Removed from", actor)

        if departments_changed:
            try:
                await sync_category_member_roles(self.bot, after)
            except discord.Forbidden:
                pass
            await refresh_panels(self.bot, guild, "hours")

        coordination = self.bot.config.coordinator_role_set()
        if coordination.intersection(role.id for role in (*added, *removed)):
            await refresh_panels(self.bot, guild, "chain")

        if added or removed or before.nick != after.nick:
            embed = discord.Embed(title="Member Updated", color=discord.Color.blurple(), timestamp=datetime.now(UTC))
            embed.set_author(name=str(after), icon_url=after.display_avatar.url)
            embed.add_field(name="User", value=f"{after.mention}\n`{after.id}`", inline=False)
            if added:
                embed.add_field(name="Roles added", value=" ".join(role.mention for role in added)[:1024], inline=False)
            if removed:
                embed.add_field(name="Roles removed", value=" ".join(role.mention for role in removed)[:1024], inline=False)
            if before.nick != after.nick:
                embed.add_field(name="Nickname", value=f"{before.nick or before.name} → {after.nick or after.name}", inline=False)
            await self._send_log(guild, self.bot.config.member_log_channel_id, embed)

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

    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member) -> None:
        member_role = member.guild.get_role(self.bot.config.member_role_id)
        if member_role and member_role not in member.roles:
            try:
                await member.add_roles(member_role, reason="Automatic role for new server member")
            except discord.HTTPException:
                pass
        embed = discord.Embed(title="Member Joined", color=discord.Color.green(), timestamp=datetime.now(UTC))
        embed.set_thumbnail(url=member.display_avatar.url)
        embed.add_field(name="User", value=f"{member.mention}\n`{member.id}`")
        embed.add_field(name="Account created", value=f"<t:{int(member.created_at.timestamp())}:R>")
        embed.add_field(name="Member count", value=f"{member.guild.member_count:,}")
        await self._send_log(member.guild, self.bot.config.join_leave_log_channel_id, embed)

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
            channel.guild, self.bot.config.channel_log_channel_id, embed
        )

    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel) -> None:
        embed = discord.Embed(title="Channel Deleted", description=f"{channel.name} (`{channel.id}`)", color=discord.Color.red(), timestamp=datetime.now(UTC))
        await self._send_log(
            channel.guild, self.bot.config.channel_log_channel_id, embed
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
            after.guild, self.bot.config.channel_log_channel_id, embed
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
