from pathlib import Path
from types import SimpleNamespace

from businessbot.bot import BusinessManagerBot
from businessbot.cogs import panels
from businessbot.cogs.panels import PanelsCog, paginate
from businessbot.config import Config


def test_paginate_keeps_entries_whole():
    pages = paginate(["a" * 60, "b" * 60, "c" * 60], limit=130)
    assert pages == ["a" * 60 + "\n" + "b" * 60, "c" * 60]
    assert paginate([]) == []


async def test_hours_panel_uses_linked_fbrp_org_ids(tmp_path: Path, monkeypatch):
    bot = BusinessManagerBot(
        Config("unused", tmp_path / "panels.db", None, frozenset(), 0)
    )
    await bot.db.connect()
    cog = PanelsCog(bot)
    business_id = await cog.service.create(
        42,
        "Coastal Transport",
        "Trucking & Contracting",
        tier=2,
        fbrp_org_id="coastal-transport",
    )
    assert business_id

    class Api:
        async def hours(self, org_id, start, end):
            assert org_id == "coastal-transport"
            return {
                "totalSeconds": 9_000,
                "members": [
                    {"discordId": "1", "seconds": 9_000, "shifts": 2, "onDuty": True}
                ],
            }

    monkeypatch.setattr(panels, "FbrpApi", Api)
    embeds = await cog._hours_embeds(SimpleNamespace(id=42))
    assert "Coastal Transport" in embeds[0].description
    assert "2h 30m" in embeds[0].description
    assert "1 on duty" in embeds[0].description
    await bot.db.close()
