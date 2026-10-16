"""Support tickets: a panel of buttons, one private channel per ticket, HTML transcripts.

The same module ships in the business, gang and department bots. Everything that
differs per server (categories, staff roles, transcript channels, forms) lives in
the ``[tickets]`` section of ``config.toml``.
"""

from __future__ import annotations

import asyncio
import html
import io
import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import discord
from discord import app_commands
from discord.ext import commands, tasks

log = logging.getLogger(__name__)

BRAND = "FBRP"
TRANSCRIPT_LIMIT = 5000
STATUS_COLORS = {
    "open": 0x43B581,
    "claimed": 0x9B59B6,
    "closed": 0x95A5A6,
}
CLOSE_GRACE_SECONDS = 5

TICKET_SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id INTEGER NOT NULL,
        channel_id INTEGER,
        control_message_id INTEGER,
        author_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        claimed_by INTEGER,
        claimed_at INTEGER,
        form_data TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        closed_at INTEGER,
        closed_by INTEGER,
        close_reason TEXT,
        reopen_count INTEGER NOT NULL DEFAULT 0
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_tickets_channel ON tickets(channel_id)",
    "CREATE INDEX IF NOT EXISTS idx_tickets_author ON tickets(guild_id, author_id, status)",
    """
    CREATE TABLE IF NOT EXISTS ticket_participants (
        ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        added_by INTEGER,
        added_at INTEGER NOT NULL,
        PRIMARY KEY(ticket_id, user_id)
    )
    """,
)


class TicketError(ValueError):
    """A problem the person using the ticket system should read as-is."""


# --- configuration -----------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TicketField:
    id: str
    label: str
    style: str = "short"
    required: bool = True
    max_length: int = 1000
    placeholder: str = ""


def _f(id: str, label: str, style: str = "short", required: bool = True, max_length: int = 1000, placeholder: str = "") -> TicketField:
    return TicketField(id, label, style, required, max_length, placeholder)


# Form presets, selected by a ticket type's ``preset`` (or its key). Discord
# modals take at most five inputs and labels are limited to 45 characters.
FIELD_PRESETS: dict[str, tuple[TicketField, ...]] = {
    "support": (
        _f("subject", "Subject", max_length=100),
        _f("details", "How can we help?", "paragraph"),
        _f("tried", "What have you already tried?", "paragraph", False, 500),
    ),
    "report": (
        _f("who", "Who or what are you reporting?", max_length=100),
        _f("when", "When did this happen?", required=False, max_length=100),
        _f("what", "What happened?", "paragraph"),
        _f("evidence", "Evidence (links or clip names)", "paragraph", False, 500),
    ),
    "coord_report": (
        _f("who", "Which coordinator?", max_length=100),
        _f("when", "When did this happen?", required=False, max_length=100),
        _f("what", "What happened?", "paragraph"),
        _f("evidence", "Evidence (links or clip names)", "paragraph", False, 500),
    ),
    "executive": (
        _f("subject", "Subject", max_length=100),
        _f("details", "Describe your request", "paragraph"),
        _f("outcome", "What outcome do you want?", "paragraph", False, 500),
    ),
    "recruitment": (
        _f("name", "Name of the group you recruit for", max_length=100),
        _f("request", "What do you need from us?", "paragraph"),
        _f("links", "Relevant links", "paragraph", False, 500),
    ),
    "business_creation": (
        _f("name", "Business name", max_length=100),
        _f("category", "Category", max_length=100, placeholder="Car Clubs, Security, Trucking, Miscellaneous"),
        _f("owner", "Owner (name and Discord)", max_length=100),
        _f("description", "What does the business do?", "paragraph", max_length=800),
        _f("members", "Roster you start with", required=False, max_length=100),
    ),
    "gang_creation": (
        _f("name", "Gang name", max_length=100),
        _f("kind", "Gang type", max_length=100, placeholder="Cartel, Militia, Criminal Org, Street Gang, Motorcycle Club"),
        _f("leader", "Leader (name and Discord)", max_length=100),
        _f("description", "Describe the gang", "paragraph", max_length=800),
        _f("members", "Roster you start with", required=False, max_length=100),
    ),
    "merge": (
        _f("current", "Current gang(s)", max_length=150),
        _f("requested", "New name or merge target", max_length=100),
        _f("reason", "Why are you making this change?", "paragraph", max_length=800),
        _f("members", "Who is affected?", "paragraph", False, 500),
    ),
    "economy": (
        _f("subject", "Subject", max_length=100),
        _f("gang", "Gang", max_length=100),
        _f("details", "Describe the request", "paragraph"),
        _f("evidence", "Evidence (links or screenshots)", "paragraph", False, 500),
    ),
    "location": (
        _f("gang", "Gang", max_length=100),
        _f("location", "Location (postal or name)", max_length=100),
        _f("request", "Add, remove or transfer?", max_length=100),
        _f("details", "Details", "paragraph", False, 800),
    ),
    "appeal": (
        _f("punishment", "What are you appealing?", max_length=150),
        _f("when", "When was it issued, and by whom?", max_length=150),
        _f("why", "Why should it be lifted?", "paragraph"),
        _f("evidence", "Evidence (links or screenshots)", "paragraph", False, 500),
    ),
    "cad": (
        _f("department", "Department", max_length=100),
        _f("subject", "What do you need?", max_length=100),
        _f("details", "Describe the CAD issue or request", "paragraph"),
    ),
    "hub_request": (
        _f("department", "Department", max_length=100),
        _f("request", "What are you requesting?", max_length=100),
        _f("details", "Details", "paragraph"),
    ),
}


@dataclass(frozen=True, slots=True)
class TicketType:
    key: str
    label: str
    description: str
    category_id: int
    staff_role_ids: tuple[int, ...] = ()
    ping_role_ids: tuple[int, ...] = ()
    transcript_channel_id: int = 0
    fields: tuple[TicketField, ...] = ()

    @property
    def prefix(self) -> str:
        return self.key.replace("_", "-")[:20]


@dataclass(frozen=True, slots=True)
class TicketSettings:
    types: tuple[TicketType, ...] = ()
    panel_channel_id: int = 0
    log_channel_id: int = 0
    max_open: int = 3
    cooldown_seconds: int = 60
    delete_closed_after_hours: int = 24
    admin_role_ids: tuple[int, ...] = ()
    blacklist_role_ids: tuple[int, ...] = ()
    panel_title: str = "Support Tickets"
    panel_description: str = "Choose the kind of ticket you need below. A private channel opens for you and our staff."

    def type(self, key: str) -> TicketType | None:
        return next((item for item in self.types if item.key == key), None)

    @property
    def enabled(self) -> bool:
        return bool(self.types)


def _ids(value: Any) -> tuple[int, ...]:
    return tuple(int(item) for item in (value or []) if int(item))


def _parse_fields(raw: Any) -> tuple[TicketField, ...]:
    fields = []
    for entry in raw or []:
        style = str(entry.get("style", "short")).lower()
        if style not in {"short", "paragraph"}:
            raise RuntimeError(f"Ticket field style must be short or paragraph, not {style!r}")
        fields.append(
            TicketField(
                id=str(entry["id"]),
                label=str(entry["label"])[:45],
                style=style,
                required=bool(entry.get("required", True)),
                max_length=max(1, min(int(entry.get("max", 1000)), 4000)),
                placeholder=str(entry.get("placeholder", ""))[:100],
            )
        )
    if len(fields) > 5:
        raise RuntimeError("A ticket form can have at most five fields")
    return tuple(fields)


def parse_tickets(raw: dict | None) -> TicketSettings:
    """Build settings from the ``[tickets]`` TOML table. An empty table disables tickets."""
    raw = raw or {}
    types: list[TicketType] = []
    seen: set[str] = set()
    for entry in raw.get("types", []):
        key = str(entry["key"]).strip().lower()
        if not re.fullmatch(r"[a-z0-9_]{1,40}", key):
            raise RuntimeError(f"Ticket type key {key!r} must be lowercase letters, digits and underscores")
        if key in seen:
            raise RuntimeError(f"Ticket type {key!r} is listed twice")
        seen.add(key)
        preset = str(entry.get("preset", key))
        fields = _parse_fields(entry.get("fields")) or FIELD_PRESETS.get(preset) or FIELD_PRESETS["support"]
        label = str(entry["label"]).strip()[:80]
        types.append(
            TicketType(
                key=key,
                label=label,
                description=str(entry.get("description", "")).strip()[:300],
                category_id=int(entry.get("category_id", 0) or 0),
                staff_role_ids=_ids(entry.get("staff_role_ids")),
                ping_role_ids=_ids(entry.get("ping_role_ids")),
                transcript_channel_id=int(entry.get("transcript_channel_id", 0) or 0),
                fields=fields,
            )
        )
    if len(types) > 25:
        raise RuntimeError("At most 25 ticket types are supported")
    defaults = TicketSettings()
    return TicketSettings(
        types=tuple(types),
        panel_channel_id=int(raw.get("panel_channel_id", 0) or 0),
        log_channel_id=int(raw.get("log_channel_id", 0) or 0),
        max_open=max(1, int(raw.get("max_open", defaults.max_open))),
        cooldown_seconds=max(0, int(raw.get("cooldown_seconds", defaults.cooldown_seconds))),
        delete_closed_after_hours=max(0, int(raw.get("delete_closed_after_hours", defaults.delete_closed_after_hours))),
        admin_role_ids=_ids(raw.get("admin_role_ids")),
        blacklist_role_ids=_ids(raw.get("blacklist_role_ids")),
        panel_title=str(raw.get("panel_title", defaults.panel_title))[:200],
        panel_description=str(raw.get("panel_description", defaults.panel_description))[:2000],
    )


# --- pure helpers ------------------------------------------------------------------


def _clip(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _duration(seconds: float) -> str:
    seconds = max(0, int(seconds))
    days, rest = divmod(seconds, 86_400)
    hours, rest = divmod(rest, 3_600)
    minutes = rest // 60
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m"
    return f"{seconds}s"


def _slug(value: str, limit: int = 12) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:limit] or "user"


def _stamp(unix: int | float | None) -> str:
    return f"<t:{int(unix)}:f>" if unix else "Unknown"


def _form(row) -> dict[str, str]:
    try:
        data = json.loads(row["form_data"] or "{}")
    except (TypeError, ValueError):
        return {}
    return {str(key): str(value) for key, value in data.items()} if isinstance(data, dict) else {}


def control_embed(row, ticket_type: TicketType | None) -> discord.Embed:
    """The message at the top of every ticket: status, owner, staff and the form answers."""
    status = row["status"] if row["status"] in STATUS_COLORS else "open"
    label = ticket_type.label if ticket_type else row["type"]
    owner = f"<@{row['author_id']}>"
    if status == "closed":
        description = f"This ticket was closed by <@{row['closed_by']}> {_stamp(row['closed_at'])}."
        if row["close_reason"]:
            description += f"\n> {_clip(row['close_reason'], 300)}"
    else:
        description = (
            f"Thanks for reaching out, {owner}. A member of staff will be with you shortly.\n"
            "Add any further details, screenshots or evidence below while you wait."
        )
    embed = discord.Embed(
        title=_clip(f"{label} #{row['id']}", 256),
        description=description,
        color=STATUS_COLORS[status],
        timestamp=datetime.fromtimestamp(row["created_at"], UTC),
    )
    embed.add_field(name="Status", value=status.capitalize())
    embed.add_field(name="Opened by", value=owner)
    embed.add_field(name="Claimed by", value=f"<@{row['claimed_by']}>" if row["claimed_by"] else "Unclaimed")
    labels = {item.id: item.label for item in (ticket_type.fields if ticket_type else ())}
    for key, value in list(_form(row).items())[:18]:
        if value.strip():
            quoted = "\n".join(f"> {line}" for line in _clip(value, 900).split("\n"))
            embed.add_field(name=_clip(labels.get(key, key.replace("_", " ").title()), 256), value=quoted, inline=False)
    embed.set_footer(text=f"{BRAND} Tickets")
    return embed


def snapshot_message(message: discord.Message) -> dict:
    """Reduce a Discord message to the plain data a transcript needs."""
    return {
        "id": message.id,
        "at": message.created_at,
        "author": getattr(message.author, "display_name", str(message.author)),
        "author_id": message.author.id,
        "bot": bool(message.author.bot),
        "content": message.clean_content or "",
        "embeds": [
            {
                "title": embed.title or "",
                "description": embed.description or "",
                "fields": [{"name": f.name, "value": f.value} for f in embed.fields],
            }
            for embed in message.embeds
        ],
        "attachments": [{"name": item.filename, "url": item.url} for item in message.attachments],
        "system": message.is_system(),
    }


_TRANSCRIPT_CSS = """
body{background:#1e1f22;color:#dcddde;font:14px/1.5 system-ui,Segoe UI,sans-serif;margin:0}
header{background:#2b2d31;padding:20px 28px;border-bottom:1px solid #111}
h1{margin:0 0 4px;font-size:20px;color:#fff}
header p{margin:2px 0;color:#9a9ca1}
main{padding:12px 28px 40px;max-width:960px}
.msg{padding:8px 0;border-bottom:1px solid #2b2d31}
.who{font-weight:600;color:#fff}
.bot{background:#5865f2;color:#fff;border-radius:3px;font-size:10px;padding:1px 4px;margin-left:6px}
.at{color:#80848e;font-size:12px;margin-left:8px}
.body{white-space:pre-wrap;word-wrap:break-word;margin-top:2px}
.embed{border-left:4px solid #4f545c;background:#2b2d31;border-radius:4px;padding:8px 12px;margin-top:6px}
.embed b{color:#fff}
.field{margin-top:4px}
.att a{color:#00a8fc}
.note{color:#80848e;font-style:italic;padding:6px 0}
"""


def render_transcript(guild_name: str, ticket, ticket_type_label: str, messages: list[dict]) -> str:
    """A standalone, escaped HTML page for one ticket."""
    esc = html.escape
    parts = [
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>",
        f"<title>Ticket #{int(ticket['id'])} transcript</title><style>{_TRANSCRIPT_CSS}</style></head><body>",
        f"<header><h1>{esc(ticket_type_label)} #{int(ticket['id'])}</h1>",
        f"<p>{esc(guild_name)} · opened {esc(datetime.fromtimestamp(ticket['created_at'], UTC).strftime('%Y-%m-%d %H:%M UTC'))}"
        f" by {esc(str(ticket['author_id']))} · {len(messages)} message(s)</p>",
    ]
    if ticket["closed_at"]:
        parts.append(
            f"<p>Closed {esc(datetime.fromtimestamp(ticket['closed_at'], UTC).strftime('%Y-%m-%d %H:%M UTC'))}"
            f" by {esc(str(ticket['closed_by']))}"
            + (f" · {esc(_clip(ticket['close_reason'], 300))}" if ticket["close_reason"] else "")
            + "</p>"
        )
    parts.append("</header><main>")
    for item in messages:
        if item.get("system"):
            continue
        when = item["at"].strftime("%Y-%m-%d %H:%M:%S UTC")
        badge = "<span class='bot'>BOT</span>" if item.get("bot") else ""
        parts.append(
            f"<div class='msg'><span class='who'>{esc(item['author'])}</span>{badge}"
            f"<span class='at'>{esc(when)}</span>"
        )
        if item["content"]:
            parts.append(f"<div class='body'>{esc(item['content'])}</div>")
        for embed in item["embeds"]:
            parts.append("<div class='embed'>")
            if embed["title"]:
                parts.append(f"<div><b>{esc(embed['title'])}</b></div>")
            if embed["description"]:
                parts.append(f"<div class='body'>{esc(embed['description'])}</div>")
            for entry in embed["fields"]:
                parts.append(f"<div class='field'><b>{esc(entry['name'])}</b><div class='body'>{esc(entry['value'])}</div></div>")
            parts.append("</div>")
        for attachment in item["attachments"]:
            parts.append(f"<div class='att'><a href='{esc(attachment['url'], quote=True)}'>{esc(attachment['name'])}</a></div>")
        parts.append("</div>")
    if not messages:
        parts.append("<div class='note'>No messages were recorded.</div>")
    parts.append("</main></body></html>")
    return "".join(parts)


# --- interface ---------------------------------------------------------------------


async def _tell(interaction: discord.Interaction, content: str | None = None, **kwargs) -> None:
    kwargs.setdefault("ephemeral", True)
    if interaction.response.is_done():
        await interaction.followup.send(content, **kwargs)
    else:
        await interaction.response.send_message(content, **kwargs)


async def _component_error(interaction: discord.Interaction, error: Exception) -> None:
    if isinstance(error, TicketError):
        message = str(error)
    elif isinstance(error, discord.Forbidden):
        message = "Discord refused that action. Check the bot's role position and permissions."
    else:
        log.error("Ticket interaction failed", exc_info=error)
        message = "Something went wrong with that ticket action. The error was logged."
    try:
        await _tell(interaction, message)
    except discord.HTTPException:
        pass


class PanelView(discord.ui.View):
    """The public panel: one button per ticket type, persistent across restarts."""

    def __init__(self, cog: "TicketsCog"):
        super().__init__(timeout=None)
        self.cog = cog
        for index, ticket_type in enumerate(cog.settings.types):
            button = discord.ui.Button(
                label=ticket_type.label,
                style=discord.ButtonStyle.primary if index % 2 == 0 else discord.ButtonStyle.secondary,
                custom_id=f"ticket:open:{ticket_type.key}",
                row=index // 5,
            )
            button.callback = self._opener(ticket_type.key)
            self.add_item(button)

    def _opener(self, key: str):
        async def callback(interaction: discord.Interaction) -> None:
            await self.cog.start_ticket(interaction, key)

        return callback

    async def on_error(self, interaction: discord.Interaction, error: Exception, item) -> None:
        await _component_error(interaction, error)


class TicketModal(discord.ui.Modal):
    def __init__(self, cog: "TicketsCog", ticket_type: TicketType):
        super().__init__(title=ticket_type.label[:45], custom_id=f"ticket:form:{ticket_type.key}")
        self.cog = cog
        self.ticket_type = ticket_type
        self.inputs: dict[str, discord.ui.TextInput] = {}
        for item in ticket_type.fields[:5]:
            entry = discord.ui.TextInput(
                label=item.label[:45],
                style=discord.TextStyle.paragraph if item.style == "paragraph" else discord.TextStyle.short,
                required=item.required,
                max_length=item.max_length,
                placeholder=item.placeholder or None,
            )
            self.inputs[item.id] = entry
            self.add_item(entry)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        await interaction.response.defer(ephemeral=True, thinking=True)
        answers = {key: entry.value.strip() for key, entry in self.inputs.items()}
        channel = await self.cog.create_ticket(interaction, self.ticket_type, answers)
        await interaction.followup.send(f"Your ticket is open: {channel.mention}", ephemeral=True)

    async def on_error(self, interaction: discord.Interaction, error: Exception) -> None:
        await _component_error(interaction, error)


class CloseModal(discord.ui.Modal, title="Close ticket"):
    reason = discord.ui.TextInput(
        label="Reason", style=discord.TextStyle.paragraph, required=False, max_length=300,
        placeholder="Optional: why is this ticket being closed?",
    )

    def __init__(self, cog: "TicketsCog"):
        super().__init__()
        self.cog = cog

    async def on_submit(self, interaction: discord.Interaction) -> None:
        await self.cog.close_ticket(interaction, self.reason.value)

    async def on_error(self, interaction: discord.Interaction, error: Exception) -> None:
        await _component_error(interaction, error)


class ControlView(discord.ui.View):
    """Buttons under the ticket's control message."""

    def __init__(self, cog: "TicketsCog", claimed: bool = False):
        super().__init__(timeout=None)
        self.cog = cog
        self.claim.label = "Unclaim" if claimed else "Claim"
        self.claim.style = discord.ButtonStyle.secondary if claimed else discord.ButtonStyle.success

    @discord.ui.button(label="Claim", style=discord.ButtonStyle.success, custom_id="ticket:claim", row=0)
    async def claim(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.cog.toggle_claim(interaction)

    @discord.ui.button(label="Close", style=discord.ButtonStyle.danger, custom_id="ticket:close", row=0)
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.cog.require_ticket(interaction, allow_author=True)
        await interaction.response.send_modal(CloseModal(self.cog))

    @discord.ui.button(label="Add member", style=discord.ButtonStyle.secondary, custom_id="ticket:add", row=1)
    async def add(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.cog.require_ticket(interaction, allow_author=True)
        await interaction.response.send_message(
            "Who should be added to this ticket?", view=AddMemberView(self.cog), ephemeral=True
        )

    @discord.ui.button(label="Remove member", style=discord.ButtonStyle.secondary, custom_id="ticket:remove", row=1)
    async def remove(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        row, _, _ = await self.cog.require_ticket(interaction, allow_author=True)
        options = await self.cog.removable_options(interaction.guild, row)
        if not options:
            raise TicketError("There is nobody besides the ticket owner and staff to remove.")
        await interaction.response.send_message(
            "Who should be removed from this ticket?", view=RemoveMemberView(self.cog, options), ephemeral=True
        )

    @discord.ui.button(label="Transcript", style=discord.ButtonStyle.secondary, custom_id="ticket:transcript", row=1)
    async def transcript(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.cog.send_transcript(interaction)

    async def on_error(self, interaction: discord.Interaction, error: Exception, item) -> None:
        await _component_error(interaction, error)


class ClosedView(discord.ui.View):
    def __init__(self, cog: "TicketsCog"):
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(label="Reopen", style=discord.ButtonStyle.success, custom_id="ticket:reopen")
    async def reopen(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.cog.reopen_ticket(interaction)

    @discord.ui.button(label="Transcript", style=discord.ButtonStyle.secondary, custom_id="ticket:closed-transcript")
    async def transcript(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.cog.send_transcript(interaction)

    @discord.ui.button(label="Delete channel", style=discord.ButtonStyle.danger, custom_id="ticket:delete")
    async def delete(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.cog.delete_ticket(interaction)

    async def on_error(self, interaction: discord.Interaction, error: Exception, item) -> None:
        await _component_error(interaction, error)


class AddMemberView(discord.ui.View):
    def __init__(self, cog: "TicketsCog"):
        super().__init__(timeout=120)
        self.cog = cog

    @discord.ui.select(cls=discord.ui.UserSelect, placeholder="Pick up to 5 members", min_values=1, max_values=5)
    async def pick(self, interaction: discord.Interaction, select: discord.ui.UserSelect) -> None:
        await self.cog.add_members(interaction, [user.id for user in select.values if not user.bot])
        self.stop()

    async def on_error(self, interaction: discord.Interaction, error: Exception, item) -> None:
        await _component_error(interaction, error)


class RemoveMemberView(discord.ui.View):
    def __init__(self, cog: "TicketsCog", options: list[discord.SelectOption]):
        super().__init__(timeout=120)
        self.cog = cog
        select = discord.ui.Select(placeholder="Pick a member to remove", options=options[:25])
        select.callback = self._picked
        self.select = select
        self.add_item(select)

    async def _picked(self, interaction: discord.Interaction) -> None:
        await self.cog.remove_member(interaction, int(self.select.values[0]))
        self.stop()

    async def on_error(self, interaction: discord.Interaction, error: Exception, item) -> None:
        await _component_error(interaction, error)


# --- the cog -----------------------------------------------------------------------


class TicketsCog(commands.Cog):
    ticket = app_commands.Group(name="ticket", description="Support tickets", guild_only=True)

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.db = bot.db  # type: ignore[attr-defined]
        self._create_lock = asyncio.Lock()
        self._panel_checked = False

    # configuration ---------------------------------------------------------------

    @property
    def settings(self) -> TicketSettings:
        return self.bot.config.tickets  # type: ignore[attr-defined]

    async def cog_load(self) -> None:
        self.bot.add_view(PanelView(self))
        self.bot.add_view(ControlView(self))
        self.bot.add_view(ClosedView(self))
        if self.settings.delete_closed_after_hours:
            self.cleanup_loop.start()

    async def cog_unload(self) -> None:
        self.cleanup_loop.cancel()

    # access ----------------------------------------------------------------------

    def is_ticket_admin(self, member: discord.Member) -> bool:
        config = self.bot.config  # type: ignore[attr-defined]
        return (
            member.id in config.owner_ids
            or member.guild_permissions.administrator
            or bool({role.id for role in member.roles} & set(self.settings.admin_role_ids))
        )

    def staff_role_ids(self, ticket_type: TicketType | None) -> set[int]:
        roles = set(self.settings.admin_role_ids)
        if ticket_type:
            roles.update(ticket_type.staff_role_ids)
        return roles

    def is_staff(self, member: discord.Member, ticket_type: TicketType | None) -> bool:
        if self.is_ticket_admin(member):
            return True
        return bool({role.id for role in member.roles} & self.staff_role_ids(ticket_type))

    def is_any_staff(self, member: discord.Member) -> bool:
        return any(self.is_staff(member, item) for item in self.settings.types) or self.is_ticket_admin(member)

    async def require_ticket(self, interaction: discord.Interaction, *, allow_author: bool = False):
        """The ticket for this channel plus its type, or a TicketError the user can read."""
        row = await self.db.fetch_one(
            "SELECT * FROM tickets WHERE channel_id=? AND status<>'deleted'", (interaction.channel_id,)
        )
        if row is None:
            raise TicketError("This is not a ticket channel.")
        member = interaction.user
        if not isinstance(member, discord.Member):
            raise TicketError("Use this inside the server.")
        ticket_type = self.settings.type(row["type"])
        staff = self.is_staff(member, ticket_type)
        if not staff and not (allow_author and member.id == row["author_id"]):
            raise TicketError("Only ticket staff can do that.")
        return row, ticket_type, staff

    # opening ---------------------------------------------------------------------

    async def start_ticket(self, interaction: discord.Interaction, key: str) -> None:
        ticket_type = self.settings.type(key)
        if ticket_type is None:
            raise TicketError("That ticket type is no longer available.")
        await self._check_can_open(interaction.user)
        await interaction.response.send_modal(TicketModal(self, ticket_type))

    async def _check_can_open(self, member: discord.abc.User) -> None:
        if isinstance(member, discord.Member) and {r.id for r in member.roles} & set(self.settings.blacklist_role_ids):
            raise TicketError("You are blacklisted from opening tickets.")
        guild_id = self.bot.config.guild_id  # type: ignore[attr-defined]
        row = await self.db.fetch_one(
            "SELECT COUNT(*) AS n FROM tickets WHERE author_id=? AND status IN ('open','claimed') AND guild_id=?",
            (member.id, getattr(getattr(member, "guild", None), "id", guild_id)),
        )
        if row and row["n"] >= self.settings.max_open:
            raise TicketError(f"You already have the maximum of {self.settings.max_open} open tickets.")
        latest = await self.db.fetch_one(
            "SELECT created_at FROM tickets WHERE author_id=? ORDER BY id DESC LIMIT 1", (member.id,)
        )
        wait = self.settings.cooldown_seconds - (time.time() - latest["created_at"]) if latest else 0
        if wait > 0:
            raise TicketError(f"Please wait {int(wait) + 1} more seconds before opening another ticket.")

    def _overwrites(
        self, guild: discord.Guild, ticket_type: TicketType, members: list[discord.Member], *, closed: bool = False
    ) -> dict[discord.abc.Snowflake, discord.PermissionOverwrite]:
        member_perms = discord.PermissionOverwrite(
            view_channel=True, send_messages=not closed, read_message_history=True, attach_files=True, embed_links=True
        )
        staff_perms = discord.PermissionOverwrite(
            view_channel=True, send_messages=True, read_message_history=True, attach_files=True, embed_links=True
        )
        overwrites: dict[discord.abc.Snowflake, discord.PermissionOverwrite] = {
            guild.default_role: discord.PermissionOverwrite(view_channel=False),
            guild.me: discord.PermissionOverwrite(
                view_channel=True, send_messages=True, read_message_history=True, attach_files=True,
                embed_links=True, manage_channels=True, manage_messages=True, manage_permissions=True,
            ),
        }
        for role_id in self.staff_role_ids(ticket_type):
            role = guild.get_role(role_id)
            if role is not None:
                overwrites[role] = staff_perms
        for member in members:
            overwrites[member] = member_perms
        return overwrites

    async def create_ticket(
        self, interaction: discord.Interaction, ticket_type: TicketType, answers: dict[str, str]
    ) -> discord.TextChannel:
        guild = interaction.guild
        user = interaction.user
        if guild is None or not isinstance(user, discord.Member):
            raise TicketError("Tickets can only be opened inside the server.")
        async with self._create_lock:
            await self._check_can_open(user)
            subject = _clip(
                answers.get("subject") or answers.get("name") or answers.get("who") or next(iter(answers.values()), ""),
                100,
            ) or ticket_type.label
            ticket_id = await self.db.execute(
                "INSERT INTO tickets(guild_id, author_id, type, subject, status, form_data, created_at)"
                " VALUES(?,?,?,?,'open',?,?)",
                (guild.id, user.id, ticket_type.key, subject, json.dumps(answers), int(time.time())),
            )
            category = guild.get_channel(ticket_type.category_id) if ticket_type.category_id else None
            try:
                channel = await guild.create_text_channel(
                    name=f"{ticket_type.prefix}-{ticket_id:04d}-{_slug(user.name)}"[:100],
                    category=category if isinstance(category, discord.CategoryChannel) else None,
                    overwrites=self._overwrites(guild, ticket_type, [user]),
                    topic=f"{ticket_type.label} #{ticket_id} | owner {user.id}",
                    reason=f"{ticket_type.label} opened by {user}",
                )
            except Exception:
                await self.db.execute("DELETE FROM tickets WHERE id=?", (ticket_id,))
                raise
            await self.db.execute("UPDATE tickets SET channel_id=? WHERE id=?", (channel.id, ticket_id))
        await self.db.execute(
            "INSERT OR IGNORE INTO ticket_participants(ticket_id,user_id,added_by,added_at) VALUES(?,?,?,?)",
            (ticket_id, user.id, user.id, int(time.time())),
        )
        row = await self.db.fetch_one("SELECT * FROM tickets WHERE id=?", (ticket_id,))
        pings = [guild.get_role(role_id) for role_id in ticket_type.ping_role_ids]
        pings = [role for role in pings if role is not None]
        content = " ".join([user.mention, *(role.mention for role in pings)])
        message = await channel.send(
            content=content,
            embed=control_embed(row, ticket_type),
            view=ControlView(self),
            allowed_mentions=discord.AllowedMentions(users=[user], roles=pings),
        )
        await self.db.execute("UPDATE tickets SET control_message_id=? WHERE id=?", (message.id, ticket_id))
        try:
            await message.pin()
        except discord.HTTPException:
            pass
        await self._log(
            guild, ticket_type, "Ticket opened", discord.Color.green(),
            [("Ticket", f"**#{ticket_id}** · {channel.mention}"), ("Type", ticket_type.label), ("Opened by", user.mention),
             ("Subject", subject)],
        )
        return channel

    # lifecycle -------------------------------------------------------------------

    async def refresh_control(self, guild: discord.Guild, row) -> None:
        channel = guild.get_channel(row["channel_id"]) if row["channel_id"] else None
        if channel is None or not row["control_message_id"]:
            return
        row = await self.db.fetch_one("SELECT * FROM tickets WHERE id=?", (row["id"],))
        ticket_type = self.settings.type(row["type"])
        try:
            await channel.get_partial_message(row["control_message_id"]).edit(
                embed=control_embed(row, ticket_type),
                view=None if row["status"] == "closed" else ControlView(self, claimed=row["status"] == "claimed"),
            )
        except discord.NotFound:
            pass

    async def toggle_claim(self, interaction: discord.Interaction) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction)
        if row["status"] == "closed":
            raise TicketError("This ticket is closed. Reopen it first.")
        user = interaction.user
        if row["claimed_by"] and row["claimed_by"] != user.id and not self.is_ticket_admin(user):
            raise TicketError(f"This ticket is already claimed by <@{row['claimed_by']}>.")
        claiming = row["claimed_by"] != user.id
        if claiming:
            await self.db.execute(
                "UPDATE tickets SET status='claimed', claimed_by=?, claimed_at=? WHERE id=?",
                (user.id, int(time.time()), row["id"]),
            )
        else:
            await self.db.execute(
                "UPDATE tickets SET status='open', claimed_by=NULL, claimed_at=NULL WHERE id=?", (row["id"],)
            )
        await interaction.response.send_message(
            f"{user.mention} has claimed this ticket and will be assisting you."
            if claiming else f"{user.mention} released this ticket back to the queue.",
            allowed_mentions=discord.AllowedMentions(users=False),
        )
        await self.refresh_control(interaction.guild, row)
        await self._log(
            interaction.guild, ticket_type, "Ticket claimed" if claiming else "Ticket released",
            discord.Color.purple() if claiming else discord.Color.orange(),
            [("Ticket", f"**#{row['id']}** · <#{row['channel_id']}>"), ("Staff", user.mention),
             ("Owner", f"<@{row['author_id']}>")],
        )

    async def close_ticket(self, interaction: discord.Interaction, reason: str | None) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction, allow_author=True)
        if row["status"] == "closed":
            raise TicketError("This ticket is already closed.")
        guild = interaction.guild
        channel = interaction.channel
        user = interaction.user
        reason = _clip(reason, 300) or "No reason given"
        if not interaction.response.is_done():
            await interaction.response.defer()
        closed_at = int(time.time())
        await self.db.execute(
            "UPDATE tickets SET status='closed', closed_at=?, closed_by=?, close_reason=? WHERE id=?",
            (closed_at, user.id, reason, row["id"]),
        )
        row = await self.db.fetch_one("SELECT * FROM tickets WHERE id=?", (row["id"],))
        participants = await self.db.fetch_all("SELECT user_id FROM ticket_participants WHERE ticket_id=?", (row["id"],))
        for entry in participants:
            member = guild.get_member(entry["user_id"])
            if member is not None and not self.is_staff(member, ticket_type):
                try:
                    await channel.set_permissions(member, send_messages=False, reason=f"Ticket #{row['id']} closed")
                except discord.HTTPException:
                    pass
        await self.refresh_control(guild, row)
        transcript = await self._transcript_file(guild, channel, row, ticket_type)
        summary = [
            ("Ticket", f"**#{row['id']}** · {ticket_type.label if ticket_type else row['type']}"),
            ("Opened by", f"<@{row['author_id']}>"),
            ("Closed by", user.mention),
            ("Handled by", f"<@{row['claimed_by']}>" if row["claimed_by"] else "Unclaimed"),
            ("Open for", _duration(closed_at - row["created_at"])),
            ("Reason", reason),
        ]
        await self._log(guild, ticket_type, "Ticket closed", discord.Color.orange(), summary, file=transcript[0])
        owner = guild.get_member(row["author_id"]) or self.bot.get_user(row["author_id"])
        if owner is not None and transcript[1] is not None:
            try:
                embed = discord.Embed(
                    title=f"Your ticket #{row['id']} was closed",
                    description=f"Your **{ticket_type.label if ticket_type else row['type']}** ticket in **{guild.name}** was closed.\n> {reason}",
                    color=discord.Color.orange(),
                )
                await owner.send(embed=embed, file=discord.File(io.BytesIO(transcript[1]), filename=f"ticket-{row['id']}.html"))
            except (discord.Forbidden, discord.HTTPException):
                pass
        closing = discord.Embed(
            title="Ticket closed",
            description=f"Closed by {user.mention}.\n> {reason}\n\nStaff can reopen this ticket or delete the channel below.",
            color=STATUS_COLORS["closed"],
        )
        await channel.send(embed=closing, view=ClosedView(self), allowed_mentions=discord.AllowedMentions.none())
        asyncio.create_task(self._rename(channel, f"closed-{row['id']:04d}"))

    async def reopen_ticket(self, interaction: discord.Interaction) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction)
        if row["status"] != "closed":
            raise TicketError("This ticket is not closed.")
        guild = interaction.guild
        channel = interaction.channel
        status = "claimed" if row["claimed_by"] else "open"
        await self.db.execute(
            "UPDATE tickets SET status=?, closed_at=NULL, closed_by=NULL, close_reason=NULL,"
            " reopen_count=reopen_count+1 WHERE id=?",
            (status, row["id"]),
        )
        participants = await self.db.fetch_all("SELECT user_id FROM ticket_participants WHERE ticket_id=?", (row["id"],))
        for entry in participants:
            member = guild.get_member(entry["user_id"])
            if member is not None:
                try:
                    await channel.set_permissions(
                        member, view_channel=True, send_messages=True, read_message_history=True, attach_files=True
                    )
                except discord.HTTPException:
                    pass
        await interaction.response.send_message(f"{interaction.user.mention} reopened this ticket.")
        try:
            await interaction.message.edit(view=None)
        except discord.HTTPException:
            pass
        await self.refresh_control(guild, row)
        asyncio.create_task(self._rename(channel, f"{ticket_type.prefix if ticket_type else row['type']}-{row['id']:04d}"))
        await self._log(
            guild, ticket_type, "Ticket reopened", discord.Color.green(),
            [("Ticket", f"**#{row['id']}** · {channel.mention}"), ("Reopened by", interaction.user.mention)],
        )

    async def delete_ticket(self, interaction: discord.Interaction) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction)
        if row["status"] != "closed":
            raise TicketError("Close the ticket before deleting its channel.")
        await interaction.response.send_message(
            f"Deleting this channel in {CLOSE_GRACE_SECONDS} seconds. The transcript was already archived."
        )
        await self.db.execute("UPDATE tickets SET status='deleted' WHERE id=?", (row["id"],))
        await asyncio.sleep(CLOSE_GRACE_SECONDS)
        await interaction.channel.delete(reason=f"Ticket #{row['id']} deleted by {interaction.user}")

    async def add_members(self, interaction: discord.Interaction, user_ids: list[int]) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction, allow_author=True)
        guild, channel = interaction.guild, interaction.channel
        added: list[int] = []
        for user_id in user_ids:
            member = guild.get_member(user_id)
            if member is None or user_id == row["author_id"]:
                continue
            await channel.set_permissions(
                member, view_channel=True, send_messages=row["status"] != "closed", read_message_history=True,
                attach_files=True, reason=f"Added to ticket #{row['id']} by {interaction.user}",
            )
            await self.db.execute(
                "INSERT OR IGNORE INTO ticket_participants(ticket_id,user_id,added_by,added_at) VALUES(?,?,?,?)",
                (row["id"], user_id, interaction.user.id, int(time.time())),
            )
            added.append(user_id)
        if not added:
            raise TicketError("Nobody new was added.")
        mentions = ", ".join(f"<@{item}>" for item in added)
        await interaction.response.edit_message(content=f"Added {mentions}.", view=None)
        await channel.send(
            f"{mentions} {'was' if len(added) == 1 else 'were'} added to this ticket by {interaction.user.mention}.",
            allowed_mentions=discord.AllowedMentions(users=[guild.get_member(item) for item in added]),
        )

    async def removable_options(self, guild: discord.Guild, row) -> list[discord.SelectOption]:
        ticket_type = self.settings.type(row["type"])
        entries = await self.db.fetch_all("SELECT user_id FROM ticket_participants WHERE ticket_id=?", (row["id"],))
        options = []
        for entry in entries:
            member = guild.get_member(entry["user_id"])
            if member is None or member.id == row["author_id"] or self.is_staff(member, ticket_type):
                continue
            options.append(discord.SelectOption(label=_clip(member.display_name, 100), value=str(member.id)))
        return options

    async def remove_member(self, interaction: discord.Interaction, user_id: int) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction, allow_author=True)
        if user_id == row["author_id"]:
            raise TicketError("You cannot remove the ticket owner.")
        member = interaction.guild.get_member(user_id)
        if member is not None and self.is_staff(member, ticket_type):
            raise TicketError("Staff cannot be removed from a ticket.")
        await self.db.execute("DELETE FROM ticket_participants WHERE ticket_id=? AND user_id=?", (row["id"], user_id))
        if member is not None:
            await interaction.channel.set_permissions(member, overwrite=None, reason=f"Removed from ticket #{row['id']}")
        await interaction.response.edit_message(content=f"Removed <@{user_id}>.", view=None)
        await interaction.channel.send(
            f"<@{user_id}> was removed from this ticket by {interaction.user.mention}.",
            allowed_mentions=discord.AllowedMentions.none(),
        )

    # transcripts -----------------------------------------------------------------

    async def _transcript_file(
        self, guild: discord.Guild, channel, row, ticket_type: TicketType | None
    ) -> tuple[discord.File | None, bytes | None]:
        try:
            messages = [snapshot_message(message) async for message in channel.history(limit=TRANSCRIPT_LIMIT, oldest_first=True)]
        except discord.HTTPException:
            log.exception("Could not read ticket #%s history", row["id"])
            return None, None
        page = render_transcript(guild.name, row, ticket_type.label if ticket_type else row["type"], messages)
        data = page.encode()
        return discord.File(io.BytesIO(data), filename=f"ticket-{row['id']}.html"), data

    async def send_transcript(self, interaction: discord.Interaction) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction)
        await interaction.response.defer(ephemeral=True, thinking=True)
        file, _ = await self._transcript_file(interaction.guild, interaction.channel, row, ticket_type)
        if file is None:
            raise TicketError("The transcript could not be generated.")
        await interaction.followup.send("Transcript generated.", file=file, ephemeral=True)

    # logging ---------------------------------------------------------------------

    async def _log(
        self,
        guild: discord.Guild,
        ticket_type: TicketType | None,
        title: str,
        color: discord.Color,
        fields: list[tuple[str, str]],
        *,
        file: discord.File | None = None,
    ) -> None:
        channel_id = self.settings.log_channel_id or (ticket_type.transcript_channel_id if ticket_type else 0)
        channel = guild.get_channel(channel_id) if channel_id else None
        if not isinstance(channel, discord.abc.Messageable):
            return
        embed = discord.Embed(title=title, color=color, timestamp=datetime.now(UTC))
        for name, value in fields:
            embed.add_field(name=name, value=_clip(value, 1024) or "None", inline=len(value) < 40)
        embed.set_footer(text=f"{BRAND} Tickets")
        try:
            await channel.send(embed=embed, file=file, allowed_mentions=discord.AllowedMentions.none())
        except discord.HTTPException:
            log.exception("Could not write to the ticket log")

    @staticmethod
    async def _rename(channel, name: str) -> None:
        try:
            await channel.edit(name=name)
        except discord.HTTPException:
            pass

    # panel -----------------------------------------------------------------------

    def panel_embed(self, guild: discord.Guild) -> discord.Embed:
        embed = discord.Embed(
            title=self.settings.panel_title,
            description=self.settings.panel_description,
            color=discord.Color.blurple(),
        )
        if guild.icon:
            embed.set_thumbnail(url=guild.icon.url)
        for item in self.settings.types:
            embed.add_field(name=item.label, value=item.description or "Open this kind of ticket.", inline=False)
        embed.set_footer(text=f"{BRAND} Tickets · max {self.settings.max_open} open per member")
        return embed

    async def publish_panel(self, guild: discord.Guild, channel: discord.abc.Messageable | None = None) -> discord.Message:
        """Post the panel, or edit the saved one in place when it is already in that channel."""
        if not self.settings.enabled:
            raise TicketError("No ticket types are configured in config.toml.")
        channel = channel or guild.get_channel(self.settings.panel_channel_id)
        if not isinstance(channel, discord.TextChannel):
            raise TicketError("Set panel_channel_id in the [tickets] section of config.toml, or pass a channel.")
        saved = await self.db.fetch_one("SELECT value FROM settings WHERE guild_id=? AND key='ticket_panel'", (guild.id,))
        embed, view = self.panel_embed(guild), PanelView(self)
        if saved:
            try:
                data = json.loads(saved["value"])
                if int(data["channel"]) == channel.id:
                    message = await channel.get_partial_message(int(data["message"])).edit(embed=embed, view=view)
                    return message
            except (ValueError, KeyError, TypeError, discord.NotFound):
                pass
        message = await channel.send(embed=embed, view=view)
        await self.db.execute(
            "INSERT INTO settings(guild_id,key,value) VALUES(?,?,?)"
            " ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value",
            (guild.id, "ticket_panel", json.dumps({"channel": channel.id, "message": message.id})),
        )
        return message

    @commands.Cog.listener()
    async def on_ready(self) -> None:
        if self._panel_checked or not self.settings.enabled or not self.settings.panel_channel_id:
            return
        self._panel_checked = True
        guild_id = self.bot.config.guild_id  # type: ignore[attr-defined]
        guild = self.bot.get_guild(guild_id) if guild_id else None
        if guild is None:
            return
        try:
            await self.publish_panel(guild)
        except (TicketError, discord.HTTPException):
            log.exception("Could not publish the ticket panel")

    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel: discord.abc.GuildChannel) -> None:
        # A ticket channel removed by hand must stop counting toward the open limit.
        await self.db.execute(
            "UPDATE tickets SET status='deleted' WHERE channel_id=? AND status<>'deleted'", (channel.id,)
        )

    @tasks.loop(minutes=10)
    async def cleanup_loop(self) -> None:
        cutoff = int(time.time()) - self.settings.delete_closed_after_hours * 3600
        rows = await self.db.fetch_all(
            "SELECT id, channel_id FROM tickets WHERE status='closed' AND closed_at IS NOT NULL AND closed_at<=?"
            " AND channel_id IS NOT NULL",
            (cutoff,),
        )
        for row in rows:
            channel = self.bot.get_channel(row["channel_id"])
            await self.db.execute("UPDATE tickets SET status='deleted' WHERE id=?", (row["id"],))
            if channel is not None:
                try:
                    await channel.delete(reason=f"Ticket #{row['id']} auto-deleted after closing")
                except discord.HTTPException:
                    log.exception("Could not delete closed ticket #%s", row["id"])

    @cleanup_loop.before_loop
    async def _before_cleanup(self) -> None:
        await self.bot.wait_until_ready()

    # commands --------------------------------------------------------------------

    @ticket.command(name="panel", description="Post or refresh the ticket panel")
    @app_commands.describe(channel="Channel for the panel (defaults to the configured one)")
    async def panel(self, interaction: discord.Interaction, channel: discord.TextChannel | None = None) -> None:
        if not isinstance(interaction.user, discord.Member) or not self.is_ticket_admin(interaction.user):
            raise TicketError("Only ticket administrators can manage the panel.")
        await interaction.response.defer(ephemeral=True)
        message = await self.publish_panel(interaction.guild, channel)
        await interaction.followup.send(f"Ticket panel is live: {message.jump_url}", ephemeral=True)

    @ticket.command(name="close", description="Close this ticket")
    @app_commands.describe(reason="Why the ticket is being closed")
    async def close_command(self, interaction: discord.Interaction, reason: str | None = None) -> None:
        await self.close_ticket(interaction, reason)
        await interaction.followup.send("Ticket closed.", ephemeral=True)

    @ticket.command(name="claim", description="Claim or release this ticket")
    async def claim_command(self, interaction: discord.Interaction) -> None:
        await self.toggle_claim(interaction)

    @ticket.command(name="add", description="Add a member to this ticket")
    @app_commands.describe(member="Member to add")
    async def add_command(self, interaction: discord.Interaction, member: discord.Member) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction, allow_author=True)
        if member.bot:
            raise TicketError("Bots cannot be added to tickets.")
        if member.id == row["author_id"]:
            raise TicketError("That member already owns this ticket.")
        await interaction.channel.set_permissions(
            member, view_channel=True, send_messages=row["status"] != "closed", read_message_history=True,
            attach_files=True, reason=f"Added to ticket #{row['id']} by {interaction.user}",
        )
        await self.db.execute(
            "INSERT OR IGNORE INTO ticket_participants(ticket_id,user_id,added_by,added_at) VALUES(?,?,?,?)",
            (row["id"], member.id, interaction.user.id, int(time.time())),
        )
        await interaction.response.send_message(
            f"{member.mention} was added to this ticket by {interaction.user.mention}.",
            allowed_mentions=discord.AllowedMentions(users=[member]),
        )

    @ticket.command(name="remove", description="Remove a member from this ticket")
    @app_commands.describe(member="Member to remove")
    async def remove_command(self, interaction: discord.Interaction, member: discord.Member) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction, allow_author=True)
        if member.id == row["author_id"]:
            raise TicketError("You cannot remove the ticket owner.")
        if self.is_staff(member, ticket_type):
            raise TicketError("Staff cannot be removed from a ticket.")
        await self.db.execute("DELETE FROM ticket_participants WHERE ticket_id=? AND user_id=?", (row["id"], member.id))
        await interaction.channel.set_permissions(member, overwrite=None, reason=f"Removed from ticket #{row['id']}")
        await interaction.response.send_message(
            f"{member.mention} was removed from this ticket by {interaction.user.mention}.",
            allowed_mentions=discord.AllowedMentions.none(),
        )

    @ticket.command(name="rename", description="Rename this ticket channel")
    @app_commands.describe(name="New channel name")
    async def rename_command(self, interaction: discord.Interaction, name: str) -> None:
        row, ticket_type, staff = await self.require_ticket(interaction)
        slug = _slug(name, 60)
        await interaction.response.send_message(f"Renaming this ticket to **{slug}**.", ephemeral=True)
        asyncio.create_task(self._rename(interaction.channel, slug))

    @ticket.command(name="transcript", description="Generate a transcript of this ticket")
    async def transcript_command(self, interaction: discord.Interaction) -> None:
        await self.send_transcript(interaction)

    @ticket.command(name="list", description="List open tickets")
    @app_commands.describe(mine="Only tickets you have claimed")
    async def list_command(self, interaction: discord.Interaction, mine: bool = False) -> None:
        user = interaction.user
        if not isinstance(user, discord.Member) or not self.is_any_staff(user):
            raise TicketError("Only ticket staff can list tickets.")
        sql = "SELECT * FROM tickets WHERE guild_id=? AND status IN ('open','claimed')"
        params: list[Any] = [interaction.guild_id]
        if mine:
            sql += " AND claimed_by=?"
            params.append(user.id)
        rows = await self.db.fetch_all(sql + " ORDER BY id LIMIT 200", params)
        visible = [row for row in rows if self.is_staff(user, self.settings.type(row["type"]))]
        if not visible:
            await interaction.response.send_message("No open tickets.", ephemeral=True)
            return
        lines = []
        for row in visible[:25]:
            ticket_type = self.settings.type(row["type"])
            claimed = f" · <@{row['claimed_by']}>" if row["claimed_by"] else ""
            lines.append(
                f"**#{row['id']}** <#{row['channel_id']}> · {ticket_type.label if ticket_type else row['type']}"
                f" · <@{row['author_id']}> · {_stamp(row['created_at'])}{claimed}"
            )
        embed = discord.Embed(title="Open tickets", description="\n".join(lines)[:4000], color=discord.Color.blurple())
        embed.set_footer(text=f"{len(visible)} open" + (" · showing 25" if len(visible) > 25 else ""))
        await interaction.response.send_message(embed=embed, ephemeral=True)
