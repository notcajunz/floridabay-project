from pathlib import Path
from types import SimpleNamespace

import discord
import pytest

from gangbot.bot import GangManagerBot
from gangbot.cogs.economy import EconomyCog, format_trade_asset
from gangbot.config import Config

OWNER = 7


class Channel(discord.abc.Messageable):
    def __init__(self, fail=False):
        self.sent, self.fail = [], fail

    async def _get_channel(self):
        return self

    async def send(self, content=None, **kwargs):
        if self.fail:
            raise discord.Forbidden(SimpleNamespace(status=403, reason="Forbidden"), "no")
        self.sent.append((content, kwargs))
        return SimpleNamespace(id=1, jump_url="https://discord.test/msg")


class Interaction:
    def __init__(self, guild, bot):
        self.guild, self.guild_id, self.client = guild, guild.id, bot
        self.user = SimpleNamespace(id=OWNER, mention="<@7>")
        self.command = None
        self.replies = []
        self.response = SimpleNamespace(
            is_done=lambda: False, send_message=self._send
        )

    async def _send(self, **kwargs):
        self.replies.append(kwargs)


async def setup(tmp_path: Path, channel: Channel):
    config = Config("unused", tmp_path / "t.db", None, frozenset({OWNER}), 0)
    bot = GangManagerBot(config)
    await bot.db.connect()
    cog = EconomyCog(bot)
    cog.service.api = SimpleNamespace(configured=False)
    cog.service.allow_local_cash = True
    guild = SimpleNamespace(id=1, get_channel=lambda cid: channel if cid == config.trade_channel_id else None)
    await cog.service.create(1, "Alpha", "Street Gang", command_role_id=555)
    await cog.service.create(1, "Bravo", "Street Gang", command_role_id=666)
    await cog.service.change_balance(1, "Alpha", "cash", 1000, "seed", OWNER)
    return bot, cog, guild


async def test_trade_offer_posts_buttons_to_trade_channel(tmp_path: Path):
    channel = Channel()
    bot, cog, guild = await setup(tmp_path, channel)
    interaction = Interaction(guild, bot)
    cash = SimpleNamespace(value="cash")
    await EconomyCog.trade_offer.callback(cog, interaction, "Alpha", "Bravo", cash, 100, cash, 50, "swap 🚀")

    content, kwargs = channel.sent[0]
    assert content == "<@&666>"
    embed = kwargs["embed"]
    assert embed.title == "Marketplace Trade Offer #1"
    assert embed.fields[0].name == "Alpha offers"
    assert embed.fields[0].value == "💵 **100** Cash"
    assert embed.fields[1].name == "Bravo provides"
    assert embed.fields[1].value == "💵 **50** Cash"
    assert embed.fields[3].value == "swap"
    assert "🚀" not in str(embed.to_dict())
    assert [c.custom_id for c in kwargs["view"].children] == [
        "gangbot:trade:accept:1", "gangbot:trade:decline:1",
    ]
    assert kwargs["allowed_mentions"].roles[0].id == 666
    assert interaction.replies[0]["ephemeral"] is True and "discord.test/msg" in interaction.replies[0]["content"]
    await bot.db.close()


async def test_trade_offer_cancelled_when_post_fails(tmp_path: Path):
    bot, cog, guild = await setup(tmp_path, Channel(fail=True))
    cash = SimpleNamespace(value="cash")
    with pytest.raises(ValueError, match="trade channel"):
        await EconomyCog.trade_offer.callback(cog, Interaction(guild, bot), "Alpha", "Bravo", cash, 100, cash, 50, "")
    row = await bot.db.fetch_one("SELECT status FROM trades WHERE id=1")
    assert row["status"] == "cancelled"
    await bot.db.close()


async def test_trade_give_is_logged_in_channel_and_missing_channel_blocks_it(tmp_path: Path):
    channel = Channel()
    bot, cog, guild = await setup(tmp_path, channel)
    cash = SimpleNamespace(value="cash")
    await EconomyCog.trade_give.callback(cog, Interaction(guild, bot), "Alpha", "Bravo", cash, 200, "thanks 🎁")
    content, kwargs = channel.sent[0]
    assert content is None
    embed = kwargs["embed"]
    assert embed.title == "Marketplace Transfer #1"
    assert embed.fields[0].value == "💵 **200** Cash"
    assert embed.fields[1].value == "💵 **200** Cash"
    assert embed.fields[2].value == "💵 **0** Cash"
    assert embed.fields[4].value == "thanks"
    assert "🎁" not in str(embed.to_dict())

    guild.get_channel = lambda cid: None
    with pytest.raises(ValueError, match="trade channel"):
        await EconomyCog.trade_give.callback(cog, Interaction(guild, bot), "Alpha", "Bravo", cash, 200, "")
    assert (await cog.service.gang(1, "Alpha"))["cash"] == 800  # nothing moved on the blocked call
    await bot.db.close()


def test_trade_assets_use_only_approved_marketplace_emojis():
    assert format_trade_asset("cash", 100) == "💵 **100** Cash"
    assert format_trade_asset("weapons", 25) == "🔫 **25** Guns"
    assert format_trade_asset("drugs", 50) == "🌿 **50** Drugs"
