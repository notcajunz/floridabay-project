from __future__ import annotations

import asyncio
import base64
import io
import logging
import os

import discord
from discord import app_commands

from ..badge_render import BadgeError, render_badge, to_data_url
from ..callsigns import STYLE_EXAMPLES, STYLE_SAMPLES, callsign_style, matches_style, normalize_callsign
from ..common import (
    DeptCog,
    department_autocomplete,
    require_department_access,
    require_guild,
)
from ..fbrp_api import FbrpApi, FbrpApiError
from ..services import parse_color

log = logging.getLogger(__name__)

ALIGN_CHOICES = [app_commands.Choice(name=name.title(), value=name) for name in ("left", "center", "right")]
MAX_UPLOAD = 12_000_000
DEFAULT_LABEL = "Default badge"


def orgs_link(org_ref: str) -> str:
    base = os.getenv("FBRP_ORGS_URL", "https://floridabay.net/orgs").rstrip("/")
    return f"{base}/#/o/{org_ref}/badges"


async def _overview_for(interaction: discord.Interaction) -> dict | None:
    cog = interaction.client.get_cog("BadgesCog")  # type: ignore[attr-defined]
    chosen = getattr(interaction.namespace, "department", None)
    if cog is None or not chosen or interaction.guild_id is None:
        return None
    try:
        row = await cog.service.department(interaction.guild_id, chosen)
        return await cog.api.badge_overview(row["fbrp_org_id"]) if row["fbrp_org_id"] else None
    except Exception:
        return None


async def badge_autocomplete(interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
    """The default badge and one entry per rank of the chosen department."""
    overview = await _overview_for(interaction)
    if not overview:
        return []
    names = [DEFAULT_LABEL] + [rank["name"] for rank in sorted(overview.get("ranks", []), key=lambda r: -r["level"])]
    return [app_commands.Choice(name=name[:100], value=name[:100]) for name in names if current.lower() in name.lower()][:25]


async def rank_autocomplete(interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
    overview = await _overview_for(interaction)
    if not overview:
        return []
    return [
        app_commands.Choice(name=rank["name"][:100], value=rank["name"][:100])
        for rank in sorted(overview.get("ranks", []), key=lambda r: -r["level"]) if current.lower() in rank["name"].lower()
    ][:25]


class BadgesCog(DeptCog):
    """Department ID badges: one template picture per rank, plus a default for ranks without their own. Names and
    ranks are printed on the template; only the callsign is filled in for each member."""

    badge = app_commands.Group(name="badge", description="Department ID badges")

    def __init__(self, bot, api: FbrpApi | None = None):
        super().__init__(bot)
        self.api = api or FbrpApi()

    # helpers ---------------------------------------------------------------------

    async def _department(self, interaction: discord.Interaction, department: str):
        row = await self.service.department(require_guild(interaction).id, department)
        if not row["fbrp_org_id"]:
            raise ValueError(
                f"**{row['name']}** is not linked to an FBRP organization yet, and badges are kept there. "
                "Link it with `/dept update org_id:`."
            )
        return row

    async def _manage(self, interaction: discord.Interaction, department: str):
        """The department for a command that changes its badges: coordinators, the head and high command only."""
        row = await self._department(interaction, department)
        await require_department_access(interaction, row)
        return row

    @staticmethod
    def _holds(member: discord.abc.User, row) -> bool:
        return isinstance(member, discord.Member) and any(role.id == row["base_role_id"] for role in member.roles)

    async def _avatar(self, member: discord.abc.User) -> bytes | None:
        try:
            return await member.display_avatar.replace(size=256, format="png").read()
        except (discord.HTTPException, ValueError):
            return None

    async def _render(self, row, template: dict, values: dict[str, str], member: discord.abc.User) -> bytes:
        image = base64.b64decode(template["image"])
        avatar = await self._avatar(member) if template["fields"].get("avatar", {}).get("enabled") else None
        return await asyncio.to_thread(render_badge, image, template["fields"], values, avatar)

    @staticmethod
    def _file(png: bytes, row) -> discord.File:
        slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in (row["initials"] or row["name"])).strip("-") or "badge"
        return discord.File(io.BytesIO(png), filename=f"{slug}-badge.png")

    async def _slot(self, row, text: str) -> tuple[str, str, int | None]:
        """Resolve "Default badge" or a rank name to (slot key, label, rank id)."""
        wanted = text.strip().lower()
        if wanted in ("default", DEFAULT_LABEL.lower()):
            return "member", DEFAULT_LABEL, None
        try:
            overview = await self.api.badge_overview(row["fbrp_org_id"])
        except FbrpApiError as error:
            raise ValueError(str(error)) from None
        match = next((r for r in overview.get("ranks", []) if r["name"].lower() == wanted), None)
        if match is None:
            raise ValueError(
                f"**{row['name']}** has no rank called `{text}`. Pick **{DEFAULT_LABEL}** or one of its ranks; "
                "ranks are managed on the orgs website."
            )
        return f"r{match['id']}", match["name"], int(match["id"])

    async def _template(self, row, tier: str, rank_id: int | None = None) -> dict:
        try:
            return await self.api.badge_template(row["fbrp_org_id"], tier, rank_id)
        except FbrpApiError as error:
            if "not uploaded" in str(error):
                raise ValueError(
                    f"**{row['name']}** has no badge pictures yet. High command can add one with "
                    f"`/badge upload` or on the orgs website: {orgs_link(row['fbrp_org_id'])}"
                ) from None
            raise ValueError(str(error)) from None

    # commands --------------------------------------------------------------------

    # commands --------------------------------------------------------------------

    @badge.command(name="get", description="Get your department badge with your callsign on it")
    @app_commands.autocomplete(department=department_autocomplete, rank=rank_autocomplete)
    @app_commands.describe(
        department="Your department (leave empty if you are in only one)",
        member="Make the badge for someone else (high command)",
        callsign="Use this callsign instead of the one on the roster (high command)",
        rank="Make the badge of this rank instead of the member's own (high command)",
        public="Post the badge in the channel instead of only to you",
    )
    async def badge_get(
        self, interaction: discord.Interaction, department: str | None = None, member: discord.Member | None = None,
        callsign: str | None = None, rank: str | None = None, public: bool = False,
    ) -> None:
        guild = require_guild(interaction)
        await interaction.response.defer(ephemeral=not public)
        target = member or interaction.user
        if not isinstance(target, discord.Member):
            raise ValueError("Pick a server member.")
        if department:
            row = await self._department(interaction, department)
        else:
            rows = [r for r in await self.service.all(guild.id) if self._holds(target, r)]
            if not rows:
                raise ValueError(f"{target.display_name} is not in a registered department. Pick one with `department`.")
            if len(rows) > 1:
                raise ValueError("You are in more than one department. Pick one with `department`.")
            row = await self._department(interaction, rows[0]["name"])
        if target.id != interaction.user.id or callsign or rank:
            await require_department_access(interaction, row)
        if not self._holds(target, row):
            raise ValueError(f"{target.display_name} does not hold the <@&{row['base_role_id']}> role.")
        info = await self.api.badge_member(row["fbrp_org_id"], target.id)
        style = callsign_style(row)
        callsign_text = normalize_callsign(callsign or info.get("callsign") or "")
        if not callsign_text:
            who = "you have" if target.id == interaction.user.id else f"{target.display_name} has"
            raise ValueError(
                f"{who} no callsign on **{row['name']}**'s roster yet"
                + ("" if info.get("onRoster") else " (and are not on the roster)")
                + ". High command can set one on the orgs website roster, or pass `callsign` here."
            )
        rank_id = info["rank"]["id"] if info.get("rank") else None
        rank_name = info["rank"]["name"] if info.get("rank") else None
        if rank:
            _, rank_name, rank_id = await self._slot(row, rank)
        template = await self._template(row, info.get("tier") or "member", rank_id)
        png = await self._render(row, template, {"callsign": callsign_text}, target)
        notes = []
        if rank_id is not None and template["tier"] != f"r{rank_id}":
            fallback = "the default badge" if template["tier"] == "member" else "an older style badge"
            notes.append(f"{rank_name} has no badge of its own yet, so this uses {fallback}.")
        if not matches_style(style, callsign_text):
            notes.append(f"`{callsign_text}` is not a usual callsign shape for {row['name']} (like {STYLE_EXAMPLES[style]}). Check the roster.")
        await self.service.log(guild.id, "badge", "get", interaction.user.id, str(target.id), f"{row['name']} {template['tier']}")
        await interaction.followup.send(
            f"**{row['name']}**" + (f" · {rank_name}" if rank_name else "") + f" · {callsign_text}" + ("\n" + " ".join(notes) if notes else ""),
            file=self._file(png, row), ephemeral=not public,
        )

    @badge.command(name="preview", description="Preview a badge with a sample callsign (high command)")
    @app_commands.autocomplete(department=department_autocomplete, badge=badge_autocomplete)
    @app_commands.describe(badge="The default badge or a rank")
    async def badge_preview(self, interaction: discord.Interaction, department: str, badge: str) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self._manage(interaction, department)
        key, label, _ = await self._slot(row, badge)
        await self._send_preview(interaction, row, key, label)

    async def _send_preview(self, interaction: discord.Interaction, row, key: str, label: str, lead: str = "") -> None:
        template = await self._template(row, key)
        values = {"callsign": STYLE_SAMPLES[callsign_style(row)]}
        png = await self._render(row, template, values, interaction.user)
        await interaction.followup.send(
            f"{lead}Preview of the **{label}** badge with a sample callsign. Fine-tune it on the orgs website: "
            f"{orgs_link(row['fbrp_org_id'])}",
            file=self._file(png, row), ephemeral=True,
        )

    @badge.command(name="upload", description="Upload the badge picture for a rank; the AI finds the callsign space once (high command)")
    @app_commands.autocomplete(department=department_autocomplete, badge=badge_autocomplete)
    @app_commands.describe(
        badge="The default badge (for ranks without their own) or a rank",
        picture="A picture of the badge with its name and rank printed and a sample callsign where the callsign goes",
    )
    async def badge_upload(self, interaction: discord.Interaction, department: str, badge: str, picture: discord.Attachment) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self._manage(interaction, department)
        key, label, _ = await self._slot(row, badge)
        if picture.size > MAX_UPLOAD:
            raise ValueError("That picture is over 12 MB. Shrink it first.")
        try:
            data_url = await asyncio.to_thread(to_data_url, await picture.read())
            # The website reads the picture with the AI exactly once, as part of saving it.
            result = await self.api.badge_save(row["fbrp_org_id"], key, image=data_url, actor_id=interaction.user.id)
        except (BadgeError, FbrpApiError) as error:
            raise ValueError(str(error)) from None
        await self.service.log(interaction.guild_id, "badge", "upload", interaction.user.id, row["name"], key)
        if result.get("found"):
            lead = "Uploaded. The AI found the callsign space" + (" and removed the sample callsign from the picture" if result.get("erased") else "") + "."
        else:
            lead = "Uploaded, but " + ("; ".join(result.get("notes") or []) or "the AI found no callsign space") + "."
        await self._send_preview(interaction, row, key, label, lead=lead + " Move it with `/badge layout` or drag it on the orgs website.\n")

    @badge.command(name="layout", description="Move or restyle the callsign on a badge (high command)")
    @app_commands.autocomplete(department=department_autocomplete, badge=badge_autocomplete)
    @app_commands.choices(align=ALIGN_CHOICES)
    @app_commands.describe(
        badge="The default badge or a rank",
        x="Horizontal position, 0 (left) to 100 (right)", y="Vertical position, 0 (top) to 100 (bottom)",
        size="Text height as a percent of the badge height",
        color="Text colour as hex, e.g. #ffffff",
    )
    async def badge_layout(
        self, interaction: discord.Interaction, department: str, badge: str,
        x: app_commands.Range[float, 0.0, 100.0] | None = None, y: app_commands.Range[float, 0.0, 100.0] | None = None,
        size: app_commands.Range[float, 0.5, 80.0] | None = None, color: str | None = None,
        align: app_commands.Choice[str] | None = None,
    ) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self._manage(interaction, department)
        key, label, _ = await self._slot(row, badge)
        change: dict = {}
        if x is not None:
            change["x"] = x / 100
        if y is not None:
            change["y"] = y / 100
        if size is not None:
            change["size"] = size / 100
        if color:
            change["color"] = f"#{parse_color(color):06x}"
        if align:
            change["align"] = align.value
        if not change:
            raise ValueError("Give at least one thing to change: x, y, size, color or align.")
        try:
            await self.api.badge_save(row["fbrp_org_id"], key, fields={"callsign": change}, actor_id=interaction.user.id)
        except FbrpApiError as error:
            raise ValueError(str(error)) from None
        await self.service.log(interaction.guild_id, "badge", "layout", interaction.user.id, row["name"], key)
        await self._send_preview(interaction, row, key, label, lead="Updated the callsign.\n")

    @badge.command(name="remove", description="Delete a badge picture (high command)")
    @app_commands.autocomplete(department=department_autocomplete, badge=badge_autocomplete)
    @app_commands.describe(badge="The default badge or a rank")
    async def badge_remove(self, interaction: discord.Interaction, department: str, badge: str) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self._manage(interaction, department)
        key, label, _ = await self._slot(row, badge)
        try:
            await self.api.badge_remove(row["fbrp_org_id"], key, interaction.user.id)
        except FbrpApiError as error:
            raise ValueError(str(error)) from None
        await self.service.log(interaction.guild_id, "badge", "remove", interaction.user.id, row["name"], key)
        await interaction.followup.send(f"Removed the **{label}** badge picture for **{row['name']}**.", ephemeral=True)

    @badge.command(name="list", description="Show which ranks have a badge picture (high command)")
    @app_commands.autocomplete(department=department_autocomplete)
    async def badge_list(self, interaction: discord.Interaction, department: str) -> None:
        await interaction.response.defer(ephemeral=True)
        row = await self._manage(interaction, department)
        try:
            overview = await self.api.badge_overview(row["fbrp_org_id"])
        except FbrpApiError as error:
            raise ValueError(str(error)) from None
        embed = discord.Embed(title=f"{row['name']} badges", color=row["role_color"] or discord.Color.blurple())
        slots = overview.get("slots", [])
        embed.description = "\n".join(f"{'Uploaded' if slot['has'] else 'No picture'} · **{slot['label']}**" for slot in slots)[:4000] or "No ranks yet."
        embed.set_footer(text="A rank without its own badge uses the default badge. Edit on the orgs website: Badges tab")
        await interaction.followup.send(content=orgs_link(row["fbrp_org_id"]), embed=embed, ephemeral=True)
