from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

import discord
from discord import app_commands
from discord.ext import commands, tasks

from ..common import (
    DeptCog,
    clean_text,
    confirm_action,
    coordinator_only,
    department_autocomplete,
    guild_id,
    has_bypass,
    reply,
    require_department_access,
    require_guild,
)
from ..constants import COORDINATOR_RANKS
from ..sheet_api import SheetApi, SheetApiError

log = logging.getLogger(__name__)

ACCESS_CHOICES = [app_commands.Choice(name=name, value=name) for name in ("Whitelisted", "Folder")]
LIST_CHOICES = [app_commands.Choice(name=name, value=value) for name, value in (
    ("Granted access", "granted"), ("Everyone", "all"), ("Pending", "pending"))]
DECISION_COLORS = {"Approved": discord.Color.green(), "Denied": discord.Color.red()}
ROLE_SYNC_BATCH = 100


def sheet_refs(department) -> list[str]:
    """How the email database may know a department: its code (initials) or its name."""
    refs: list[str] = []
    for value in (department.get("initials"), department["name"]):
        if value and str(value).strip() and str(value).strip() not in refs:
            refs.append(str(value).strip())
    return refs


def can_decide(interaction: discord.Interaction) -> bool:
    """Senior Department Coordinators and above (config `email_approver_rank`) decide access requests."""
    if has_bypass(interaction):
        return True
    config = interaction.client.config  # type: ignore[attr-defined]
    if not isinstance(interaction.user, discord.Member):
        return False
    index = config.rank_index({role.id for role in interaction.user.roles})
    return index is not None and index <= COORDINATOR_RANKS.index(config.email_approver_rank)


class DecisionButton(
    discord.ui.DynamicItem[discord.ui.Button],
    template=r"email:(?P<verdict>approve|deny):(?P<id>REQ-\d+)",
):
    """Approve / Deny buttons on an access request. They survive restarts because the id is in the custom id."""

    def __init__(self, verdict: str, request_id: str):
        approve = verdict == "approve"
        super().__init__(
            discord.ui.Button(
                label="Approve" if approve else "Deny",
                style=discord.ButtonStyle.success if approve else discord.ButtonStyle.danger,
                custom_id=f"email:{verdict}:{request_id}",
            )
        )
        self.verdict = verdict
        self.request_id = request_id

    @classmethod
    async def from_custom_id(cls, interaction, item, match, /):
        return cls(match["verdict"], match["id"])

    async def callback(self, interaction: discord.Interaction) -> None:
        cog = interaction.client.get_cog("EmailCog")  # type: ignore[attr-defined]
        if cog is None:
            return
        await cog.decide(interaction, self.request_id, self.verdict == "approve")


def request_view(request_id: str) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(DecisionButton("approve", request_id))
    view.add_item(DecisionButton("deny", request_id))
    return view


class EmailCog(DeptCog):
    email = app_commands.Group(name="email", description="Department email database and document access")

    def __init__(self, bot: commands.Bot, sheet: SheetApi | None = None):
        super().__init__(bot)
        self.sheet = sheet or SheetApi()

    async def cog_load(self) -> None:
        self.bot.add_dynamic_items(DecisionButton)
        if self.sheet.configured:
            self.role_sync_loop.start()

    async def cog_unload(self) -> None:
        self.role_sync_loop.cancel()

    # sheet calls -----------------------------------------------------------------

    async def dept_call(self, department, action: str, key: str = "dept", **args):
        """Call an action, trying the department's code then its name until the sheet knows it."""
        data: dict = {}
        for ref in sheet_refs(department):
            data = await self.sheet.call(action, **{key: ref}, **args)
            if data.get("ok") or "Unknown department" not in str(data.get("error", "")):
                return data
        return data

    @staticmethod
    def fail(data: dict, default: str = "The email database rejected that.") -> ValueError:
        error = str(data.get("error") or default)
        if "Unknown department" in error:
            error = "That department is not in the email database yet. Ask the Launch Group to add it with `/dept add`."
        return ValueError(error)

    # commands --------------------------------------------------------------------

    @email.command(name="registrar", description="Save your email to a department's database tab")
    @app_commands.autocomplete(department=department_autocomplete)
    @app_commands.describe(
        department="Your department", email="The Google email address that should get document access",
        rank="Your rank in the department", name="Your name (defaults to your server nickname)",
    )
    async def registrar(
        self, interaction: discord.Interaction, department: str, email: str, rank: str, name: str | None = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        guild = require_guild(interaction)
        row = await self.service.department(guild.id, department)
        member = interaction.user
        if not has_bypass(interaction) and not (
            isinstance(member, discord.Member) and any(role.id == row["base_role_id"] for role in member.roles)
        ):
            raise ValueError(f"You need the <@&{row['base_role_id']}> role to register in **{row['name']}**.")
        data = await self.dept_call(
            row, "register",
            discordId=str(member.id),
            name=clean_text(name, 80) if name else member.display_name[:80],
            rank=clean_text(rank, 80),
            email=clean_text(email, 120),
            roles=[str(role.id) for role in member.roles] if isinstance(member, discord.Member) else [],
        )
        if not data.get("ok"):
            raise self.fail(data)
        await self.service.log(guild.id, "email", "registrar", member.id, row["name"])
        note = " Your registration was updated." if data.get("updated") else ""
        status = data.get("status", "Active")
        waiting = "" if status == "Active" else f" Your status is **{status}** until you hold the department role."
        await reply(interaction, f"Saved your email for **{row['name']}**.{note}{waiting}")

    @email.command(name="adduser", description="Request document access for a registered department member")
    @app_commands.autocomplete(department=department_autocomplete)
    @app_commands.choices(access=ACCESS_CHOICES)
    @app_commands.describe(
        member="The member who needs access", department="Their department",
        access="Whitelisted (listed documents) or Folder (the department folder)",
        reason="Why they need it", docs="Google Drive links (required for Whitelisted)",
    )
    async def adduser(
        self, interaction: discord.Interaction, member: discord.Member, department: str,
        access: app_commands.Choice[str], reason: str, docs: str | None = None,
    ) -> None:
        await self._submit(interaction, member, department, access.value, reason, docs)

    @email.command(name="removeuser", description="Request that a member's document access be removed")
    @app_commands.autocomplete(department=department_autocomplete)
    @app_commands.describe(member="The member to remove access from", department="Their department", reason="Why")
    async def removeuser(
        self, interaction: discord.Interaction, member: discord.Member, department: str, reason: str,
    ) -> None:
        await self._submit(interaction, member, department, "Remove Access", reason, None)

    async def _submit(
        self, interaction: discord.Interaction, member: discord.Member, department: str,
        kind: str, reason: str, docs: str | None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        guild = require_guild(interaction)
        row = await self.service.department(guild.id, department)
        await require_department_access(interaction, row)
        data = await self.dept_call(
            row, "request",
            memberId=str(member.id), type=kind, docs=(docs or "").strip(),
            reason=clean_text(reason, 500), byName=str(interaction.user), byId=str(interaction.user.id),
        )
        issues = data.get("issues") or []
        if not data.get("ok"):
            if issues:
                raise ValueError(f"Request {data.get('id', '')} was not accepted:\n- " + "\n- ".join(issues))
            raise self.fail(data)
        await self.service.log(guild.id, "email", kind, interaction.user.id, row["name"], f"{member.id} {data.get('id')}")
        if data.get("decision") == "Approved":
            await reply(interaction, f"**{data['id']}** was approved automatically. {kind} for {member.mention} is applied.")
            return
        posted = await self._post_request(guild, interaction.user, member, row, data, kind, docs, reason)
        if not posted:
            await reply(
                interaction,
                f"**{data['id']}** is waiting for coordination, but no approval channel is set up. "
                "Coordination can approve it on the sheet.",
            )
            return
        await reply(interaction, f"**{data['id']}** sent to coordination for approval. You'll be told here when it is decided.")

    async def _post_request(self, guild, requester, member, row, data, kind, docs, reason) -> bool:
        channel = guild.get_channel(self.bot.config.email_channel_id)
        if not isinstance(channel, discord.abc.Messageable):
            return False
        config = self.bot.config
        cutoff = COORDINATOR_RANKS.index(config.email_approver_rank)
        role_ids = [config.coordinator_role_ids.get(rank, 0) for rank in COORDINATOR_RANKS[: cutoff + 1]]
        ping = " ".join(f"<@&{role_id}>" for role_id in role_ids if role_id)
        embed = discord.Embed(
            title=f"{data['id']} · {kind}",
            description=f"{requester.mention} asks for **{kind}** for {member.mention} in **{row['name']}**.",
            color=discord.Color.orange(), timestamp=datetime.now(UTC),
        )
        embed.add_field(name="Reason", value=reason[:1000], inline=False)
        if docs:
            embed.add_field(name="Documents", value=docs[:1000], inline=False)
        email = (data.get("member") or {}).get("email")
        if email:
            embed.add_field(name="Email on file", value=email)
        embed.add_field(name="Requested by", value=requester.mention)
        embed.set_footer(text="Senior Department Coordinator or higher can decide")
        try:
            await channel.send(
                content=ping or None, embed=embed, view=request_view(data["id"]),
                allowed_mentions=discord.AllowedMentions(roles=True, users=False),
            )
        except (discord.Forbidden, discord.HTTPException):
            log.exception("Could not post the access request")
            return False
        return True

    async def decide(self, interaction: discord.Interaction, request_id: str, approve: bool) -> None:
        if not can_decide(interaction):
            role_id = self.bot.config.coordinator_role_ids.get(self.bot.config.email_approver_rank)
            await interaction.response.send_message(
                f"Only {f'<@&{role_id}>' if role_id else self.bot.config.email_approver_rank} or higher can decide this.",
                ephemeral=True,
            )
            return
        await interaction.response.defer()
        verdict = "Approved" if approve else "Denied"
        try:
            data = await self.sheet.call(
                "decide", id=request_id, decision=verdict,
                byName=str(interaction.user), byId=str(interaction.user.id),
            )
        except SheetApiError as error:
            await interaction.followup.send(str(error), ephemeral=True)
            return
        if data.get("already"):
            await interaction.followup.send(f"{request_id} was already {str(data.get('decision', '')).lower()}.", ephemeral=True)
            await self._finish_message(interaction, str(data.get("decision") or verdict), interaction.user, data.get("reviewedBy"))
            return
        if not data.get("ok"):
            await interaction.followup.send(str(data.get("error") or "The email database rejected that."), ephemeral=True)
            return
        await self._finish_message(interaction, verdict, interaction.user)
        embed = interaction.message.embeds[0] if interaction.message and interaction.message.embeds else None
        requester = re.search(r"<@!?(\d+)>", embed.description or "") if embed else None
        applied = str(data.get("applied") or "")
        extra = f" It could not be applied: {applied}" if applied.startswith("Failed") else ""
        await interaction.followup.send(
            (f"<@{requester.group(1)}> " if requester else "")
            + f"**{request_id}** was **{verdict.lower()}** by {interaction.user.mention}.{extra}",
            allowed_mentions=discord.AllowedMentions(users=True),
        )

    async def _finish_message(self, interaction, verdict: str, by, reviewed_by=None) -> None:
        message = interaction.message
        if message is None or not message.embeds:
            return
        embed = message.embeds[0]
        embed.color = DECISION_COLORS.get(verdict, discord.Color.light_grey())
        embed.add_field(name="Decision", value=f"{verdict} by {reviewed_by or by.mention}", inline=False)
        embed.set_footer(text=f"Decided {datetime.now(UTC):%Y-%m-%d %H:%M} UTC")
        try:
            await message.edit(embed=embed, view=None)
        except discord.HTTPException:
            log.exception("Could not update the request message")

    @email.command(name="wipe", description="Delete a member from a department's database tab")
    @coordinator_only
    @app_commands.autocomplete(department=department_autocomplete)
    async def wipe(self, interaction: discord.Interaction, department: str, member: discord.Member) -> None:
        guild = require_guild(interaction)
        row = await self.service.department(guild.id, department)
        if not await confirm_action(
            interaction, f"Delete {member.mention} from **{row['name']}** in the email database? Their document sharing is removed."
        ):
            return
        data = await self.dept_call(
            row, "wipe", memberId=str(member.id), byName=str(interaction.user), byId=str(interaction.user.id)
        )
        if not data.get("ok"):
            raise self.fail(data)
        await self.service.log(guild.id, "email", "wipe", interaction.user.id, row["name"], str(member.id))
        await reply(interaction, f"Removed {member.mention} from **{row['name']}** in the email database.")

    @email.command(name="list", description="List a department's members and their access")
    @app_commands.autocomplete(department=department_autocomplete)
    @app_commands.choices(show=LIST_CHOICES)
    async def list_members(
        self, interaction: discord.Interaction, department: str, show: app_commands.Choice[str] | None = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self.service.department(guild_id(interaction), department)
        await require_department_access(interaction, row)
        flavor = show.value if show else "granted"
        data = await self.dept_call(row, "list", filter=flavor)
        if not data.get("ok"):
            raise self.fail(data)
        members = data.get("members", [])
        lines = []
        for item in members:
            who = f"<@{item['discordId']}>" if item.get("discordId") else item.get("name", "?")
            lines.append(
                f"{who} · {item.get('rank') or '-'} · {item.get('status') or '-'} · "
                f"{item.get('access') or 'No access'}"
                + (f" · {item['docs']} doc(s)" if item.get("docs") else "")
                + (f" · {item['email']}" if item.get("email") else "")
            )
        text = ""
        shown = 0
        for line in lines:
            if len(text) + len(line) + 1 > 3900:
                break
            text += line + "\n"
            shown += 1
        embed = discord.Embed(
            title=f"{row['name']} · {dict((c.value, c.name) for c in LIST_CHOICES)[flavor]}",
            description=text or "Nobody matches.", color=row["role_color"],
        )
        embed.set_footer(text=f"{shown} of {len(lines)} shown")
        await reply(interaction, embed=embed)

    # keeping the sheet's view of Discord roles current -----------------------------

    async def sync_roles(self, guild: discord.Guild) -> int:
        """Report the hub roles of every registered person so the sheet can grant and revoke by role."""
        ids = (await self.sheet.checked("registeredIds")).get("ids", [])
        entries = []
        for raw in ids:
            member = guild.get_member(int(raw))
            if member is None:
                try:
                    member = await guild.fetch_member(int(raw))
                except discord.NotFound:
                    member = None
                except discord.HTTPException:
                    continue  # unknown, so do not claim they left
            entries.append({
                "id": str(raw),
                "inServer": member is not None,
                "roles": [str(role.id) for role in member.roles] if member else [],
            })
        for start in range(0, len(entries), ROLE_SYNC_BATCH):
            await self.sheet.checked("roleSync", entries=entries[start:start + ROLE_SYNC_BATCH])
        return len(entries)

    @tasks.loop(minutes=15)
    async def role_sync_loop(self) -> None:
        for guild in self.bot.guilds:
            try:
                await self.sync_roles(guild)
            except Exception:
                log.exception("Email database role sync failed for %s", guild.id)

    @role_sync_loop.before_loop
    async def _before_role_sync(self) -> None:
        await self.bot.wait_until_ready()
