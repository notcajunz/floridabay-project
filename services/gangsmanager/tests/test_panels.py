from pathlib import Path
from types import SimpleNamespace

import discord

from gangbot.bot import GangManagerBot
from gangbot.cogs.panels import PanelsCog, paginate
from gangbot.config import Config


class FakeMessage:
    def __init__(self, channel, message_id, embed=None):
        self.channel, self.id, self.embed = channel, message_id, embed

    async def edit(self, *, embed):
        if self.id not in self.channel.messages:
            raise discord.NotFound(SimpleNamespace(status=404, reason="Not Found"), "gone")
        self.channel.messages[self.id] = embed
        self.channel.edits += 1

    async def delete(self):
        if self.channel.messages.pop(self.id, None) is None:
            raise discord.NotFound(SimpleNamespace(status=404, reason="Not Found"), "gone")


class FakeChannel(discord.abc.Messageable):
    def __init__(self):
        self.messages, self.next_id, self.edits = {}, 1000, 0

    async def _get_channel(self):
        return self

    def get_partial_message(self, message_id):
        return FakeMessage(self, message_id)

    async def send(self, *, embed):
        self.next_id += 1
        self.messages[self.next_id] = embed
        return FakeMessage(self, self.next_id, embed)


class FakeGuild:
    id = 42

    def __init__(self, channels):
        self.channels = channels

    def get_channel(self, channel_id):
        return self.channels.get(channel_id)


async def make_cog(tmp_path: Path):
    bot = GangManagerBot(Config("unused", tmp_path / "panels.db", None, frozenset(), 0))
    await bot.db.connect()
    cog = PanelsCog(bot)
    channels = {
        bot.config.shop_channel_id: FakeChannel(),
        bot.config.leaderboard_channel_id: FakeChannel(),
        bot.config.location_channel_id: FakeChannel(),
    }
    return bot, cog, channels, FakeGuild(channels)


def test_paginate_keeps_entries_whole():
    pages = paginate(["a" * 60, "b" * 60, "c" * 60], limit=130)
    assert pages == ["a" * 60 + "\n" + "b" * 60, "c" * 60]
    assert paginate([]) == []


async def test_panels_render_edit_and_recover(tmp_path: Path):
    bot, cog, channels, guild = await make_cog(tmp_path)
    for name, cash in (("Alpha", 500), ("Bravo", 900)):
        await cog.service.create(guild.id, name, "Street Gang", tier=2)
        await bot.db.execute("UPDATE gangs SET cash=? WHERE name=?", (cash, name))
    await bot.db.execute(
        "INSERT INTO shop_items(guild_id,name,price,quantity,description,unit) VALUES(?,?,?,?,?,?)",
        (guild.id, "Crowbar", 250, 0, "Opens doors", "each"),
    )
    gang = await cog.service.gang(guild.id, "Alpha")
    await bot.db.execute(
        "INSERT INTO locations(guild_id,gang_id,postal,location_type) VALUES(?,?,?,?)",
        (guild.id, gang["id"], "7021", "Stash"),
    )

    await cog.refresh(guild)
    shop = next(iter(channels[bot.config.shop_channel_id].messages.values()))
    board = next(iter(channels[bot.config.leaderboard_channel_id].messages.values()))
    places = next(iter(channels[bot.config.location_channel_id].messages.values()))
    assert "Crowbar" in shop.description and "$250" in shop.description and "Out of stock" in shop.description
    assert board.description.index("Bravo") < board.description.index("Alpha")
    assert "`7021` — Stash" in places.description and "Bravo" not in places.description

    # Unchanged panels are skipped; changed ones edit the same message in place.
    shop_channel = channels[bot.config.shop_channel_id]
    await cog.refresh(guild)
    assert shop_channel.edits == 0
    await bot.db.execute("UPDATE shop_items SET quantity=3")
    await cog.refresh(guild, "shop")
    assert shop_channel.edits == 1 and len(shop_channel.messages) == 1
    assert "3 in stock" in next(iter(shop_channel.messages.values())).description

    # A deleted panel message is re-posted rather than crashing.
    shop_channel.messages.clear()
    await bot.db.execute("UPDATE shop_items SET quantity=4")
    await cog.refresh(guild, "shop")
    assert len(shop_channel.messages) == 1
    await bot.db.close()
