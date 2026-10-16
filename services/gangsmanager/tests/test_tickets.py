import sqlite3
import tomllib
from datetime import UTC, datetime
from pathlib import Path

import pytest

from gangbot.bot import GangManagerBot
from gangbot.config import Config
from gangbot.tickets import (
    FIELD_PRESETS,
    TicketError,
    TicketsCog,
    control_embed,
    parse_tickets,
    render_transcript,
)

ROOT = Path(__file__).resolve().parents[1]
RAW = tomllib.loads((ROOT / "config.toml").read_text(encoding="utf-8"))


def test_config_defines_every_ticket_type():
    settings = parse_tickets(RAW["tickets"])
    assert settings.enabled
    assert settings.panel_channel_id
    keys = [item.key for item in settings.types]
    assert len(keys) == len(set(keys))
    # Buttons carry the key in a custom id, which Discord caps at 100 characters.
    assert all(len(f"ticket:open:{key}") <= 100 for key in keys)
    for item in settings.types:
        assert item.category_id, item.key
        assert 1 <= len(item.fields) <= 5, item.key
        assert all(len(field.label) <= 45 for field in item.fields), item.key
        assert len(item.label) <= 80


def test_presets_fit_a_discord_modal():
    for name, fields in FIELD_PRESETS.items():
        assert 1 <= len(fields) <= 5, name
        assert all(len(field.label) <= 45 for field in fields), name


def test_parse_rejects_bad_configuration():
    with pytest.raises(RuntimeError, match="twice"):
        parse_tickets({"types": [{"key": "a", "label": "A"}, {"key": "a", "label": "B"}]})
    with pytest.raises(RuntimeError, match="lowercase"):
        parse_tickets({"types": [{"key": "Bad Key", "label": "A"}]})
    assert not parse_tickets({}).enabled


def test_parse_uses_preset_then_override():
    settings = parse_tickets({"types": [
        {"key": "report", "label": "Reports"},
        {"key": "x", "label": "X", "preset": "appeal"},
        {"key": "y", "label": "Y", "fields": [{"id": "a", "label": "A", "style": "paragraph", "required": False, "max": 50}]},
    ]})
    assert settings.type("report").fields == FIELD_PRESETS["report"]
    assert settings.type("x").fields == FIELD_PRESETS["appeal"]
    assert settings.type("y").fields[0].max_length == 50
    assert settings.type("missing") is None


def _row(**values):
    base = {
        "id": 7, "channel_id": 11, "author_id": 5, "type": "report", "subject": "s", "status": "open",
        "claimed_by": None, "claimed_at": None, "form_data": '{"what": "<b>bad</b>"}',
        "created_at": 1_700_000_000, "closed_at": None, "closed_by": None, "close_reason": None,
    }
    base.update(values)
    return base


def test_transcript_escapes_user_content():
    messages = [{
        "id": 1, "at": datetime(2026, 10, 15, tzinfo=UTC), "author": "<script>x</script>", "author_id": 1,
        "bot": False, "content": "<img src=x onerror=alert(1)>", "system": False,
        "embeds": [{"title": "T<", "description": "D&", "fields": [{"name": "n", "value": "v<"}]}],
        "attachments": [{"name": "a.png", "url": "https://example.test/a.png?x=1&y='2"}],
    }]
    page = render_transcript("Guild <x>", _row(), "Report Tickets", messages)
    assert "<script>" not in page and "<img" not in page
    assert "&lt;script&gt;" in page and "&lt;img src=x" in page
    assert "Guild &lt;x&gt;" in page
    assert "Ticket #7 transcript" in page
    assert "No messages were recorded" in render_transcript("G", _row(), "R", [])


def test_control_embed_shows_status_and_answers():
    settings = parse_tickets(RAW["tickets"])
    ticket_type = settings.types[0]
    key = ticket_type.fields[0].id
    row = _row(type=ticket_type.key, form_data=f'{{"{key}": "Hello there"}}')
    embed = control_embed(row, ticket_type)
    assert "#7" in embed.title
    assert any("Hello there" in field.value for field in embed.fields)
    closed = control_embed(_row(status="closed", closed_by=9, closed_at=1_700_000_100, close_reason="done"), ticket_type)
    assert "<@9>" in closed.description and "done" in closed.description


async def test_ticket_lifecycle_storage(tmp_path: Path):
    bot = GangManagerBot(Config("unused", tmp_path / "t.db", None, frozenset(), 0))
    await bot.db.connect()
    try:
        await bot.db.execute(
            "INSERT INTO tickets(guild_id,author_id,type,subject,status,created_at) VALUES(1,5,'report','s','open',1)"
        )
        await bot.db.execute(
            "INSERT INTO ticket_participants(ticket_id,user_id,added_at) VALUES(1,6,1)"
        )
        row = await bot.db.fetch_one("SELECT COUNT(*) AS n FROM tickets WHERE author_id=5 AND status IN ('open','claimed')")
        assert row["n"] == 1
        # Deleting the ticket cascades to its participants.
        await bot.db.execute("PRAGMA foreign_keys=ON")
        await bot.db.execute("DELETE FROM tickets WHERE id=1")
        left = await bot.db.fetch_one("SELECT COUNT(*) AS n FROM ticket_participants")
        assert left["n"] == 0
    finally:
        await bot.close()


def test_blacklist_and_staff_rules():
    settings = parse_tickets({
        "admin_role_ids": [1], "blacklist_role_ids": [9],
        "types": [{"key": "a", "label": "A", "staff_role_ids": [2]}, {"key": "b", "label": "B", "staff_role_ids": [3]}],
    })

    class Role:
        def __init__(self, id):
            self.id = id

    class Member:
        def __init__(self, id, roles, admin=False):
            self.id = id
            self.roles = [Role(r) for r in roles]
            self.guild_permissions = type("P", (), {"administrator": admin})()

    class Bot:
        db = None
        config = type("C", (), {"owner_ids": frozenset({99}), "tickets": settings})()

    cog = TicketsCog(Bot())
    a, b = settings.types
    assert cog.is_staff(Member(10, [2]), a) and not cog.is_staff(Member(10, [2]), b)
    assert cog.is_staff(Member(10, [1]), b)             # admin role sees everything
    assert cog.is_staff(Member(99, []), a)              # bot owner
    assert cog.is_staff(Member(10, [], admin=True), b)  # Discord administrator
    assert not cog.is_staff(Member(10, [5]), a)
    assert cog.is_any_staff(Member(10, [3]))
    assert not cog.is_any_staff(Member(10, []))
