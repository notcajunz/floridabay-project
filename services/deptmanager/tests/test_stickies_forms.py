import asyncio
import json
from types import SimpleNamespace

import discord
import pytest

from deptbot.bot import DepartmentManagerBot
from deptbot.cogs.stickies import StickiesCog
from deptbot.config import Config
from deptbot.forms import EmbedForm, build_embed, embed_defaults, parse_message_ref


def test_message_ref_reads_ids_and_links():
    assert parse_message_ref("123456") == (None, 123456)
    assert parse_message_ref("https://discord.com/channels/1/222/333") == (222, 333)
    with pytest.raises(ValueError):
        parse_message_ref("nope")


def test_build_embed_validates_and_defaults():
    embed = build_embed("Rules", "Be kind", "#206694", "Staff", "https://example.com/a.png")
    assert embed.color.value == 0x206694 and embed.footer.text == "Staff" and embed.image.url == "https://example.com/a.png"
    assert build_embed(None, "Only text").color.value == 0x5865F2
    with pytest.raises(ValueError):
        build_embed("x", "   ")
    with pytest.raises(ValueError):
        build_embed("x", "ok", "#nothex")
    with pytest.raises(ValueError):
        build_embed("x", "ok", None, None, "javascript:alert(1)")


def test_edit_form_is_filled_with_the_old_embed():
    old = discord.Embed(title="Old", description="Body text", color=0xFF0000)
    old.set_footer(text="Foot")
    old.set_image(url="https://example.com/i.png")
    defaults = embed_defaults(old)
    assert defaults == {"title": "Old", "description": "Body text", "color": "#FF0000", "footer": "Foot", "image": "https://example.com/i.png"}

    async def submit(interaction, embed):
        pass

    async def build():
        return EmbedForm("Edit embed", submit, defaults)

    form = asyncio.run(build())
    assert [item.default for item in form.children] == ["Old", "Body text", "#FF0000", "Foot", "https://example.com/i.png"]
    assert [item.required for item in form.children] == [False, True, False, False, False]


def test_edit_form_rejects_text_too_long_for_a_form():
    with pytest.raises(ValueError, match="too long"):
        asyncio.run(_long_form())


async def _long_form():
    return EmbedForm("Edit embed", None, {"description": "x" * 4001})


class FakeChannel:
    def __init__(self, channel_id=10):
        self.id = channel_id
        self.guild = SimpleNamespace(id=1)
        self.sent = []
        self.deleted = []

    def get_partial_message(self, message_id):
        channel = self

        class Partial:
            async def delete(self):
                channel.deleted.append(message_id)

        return Partial()

    async def send(self, **kwargs):
        self.sent.append(kwargs)
        return SimpleNamespace(id=1000 + len(self.sent))


async def make_cog(tmp_path):
    bot = DepartmentManagerBot(Config("unused", tmp_path / "s.db", None, frozenset()))
    await bot.db.connect()
    return bot, StickiesCog(bot, delay=0.01)


async def test_restick_deletes_the_old_message_and_posts_the_new_one(tmp_path):
    bot, cog = await make_cog(tmp_path)
    channel = FakeChannel()
    embed = build_embed("Read me", "Rules here")
    await bot.db.execute(
        "INSERT INTO stickies(guild_id,channel_id,embed,message_id) VALUES(1,10,?,555)", (json.dumps(embed.to_dict()),)
    )
    await cog.restick(channel)
    assert channel.deleted == [555]
    assert channel.sent[0]["embed"].title == "Read me"
    row = await bot.db.fetch_one("SELECT message_id FROM stickies WHERE channel_id=10")
    assert row["message_id"] == 1001
    await cog.restick(channel)
    assert channel.deleted == [555, 1001]
    await bot.db.close()

async def test_new_messages_trigger_one_debounced_repost_and_ignore_the_bot(tmp_path):
    bot, cog = await make_cog(tmp_path)
    channel = FakeChannel()
    await bot.db.execute(
        "INSERT INTO stickies(guild_id,channel_id,embed) VALUES(1,10,?)", (json.dumps(build_embed(None, "Stay").to_dict()),)
    )
    other = SimpleNamespace(guild=channel.guild, channel=channel, author=SimpleNamespace(id=7))
    mine = SimpleNamespace(guild=channel.guild, channel=channel, author=SimpleNamespace(id=bot.user.id if bot.user else 99))
    bot._connection.user = SimpleNamespace(id=99)
    mine.author.id = 99
    await cog.on_message(mine)
    assert not cog._pending
    for _ in range(5):
        await cog.on_message(other)
    assert len(cog._pending) == 1
    await asyncio.sleep(0.1)
    assert len(channel.sent) == 1 and not cog._pending
    await bot.db.close()


async def test_channel_without_a_sticky_is_left_alone(tmp_path):
    bot, cog = await make_cog(tmp_path)
    channel = FakeChannel(20)
    await cog.on_message(SimpleNamespace(guild=channel.guild, channel=channel, author=SimpleNamespace(id=7)))
    assert not cog._pending
    await bot.db.close()


class FakeResponse:
    def __init__(self):
        self.deferred = False

    def is_done(self):
        return self.deferred

    async def defer(self, **kwargs):
        self.deferred = True


async def test_launching_a_department_keeps_its_email_tab(tmp_path):
    from deptbot.cogs.departments import DepartmentsCog

    class Sheet:
        configured = True

        def __init__(self):
            self.calls = []

        async def call(self, action, **args):
            self.calls.append((action, args))
            return {"ok": True, "members": 3}

    bot = DepartmentManagerBot(Config("unused", tmp_path / "d.db", None, frozenset()))
    await bot.db.connect()
    sheet = Sheet()
    cog = DepartmentsCog(bot, sheet)
    await cog.service.create(1, "Los Santos PD", "Main LEO", initials="LSPD", base_role_id=5, command_role_id=6)
    sent = []

    class Followup:
        async def send(self, **kwargs):
            sent.append(kwargs)

    interaction = SimpleNamespace(
        guild=SimpleNamespace(id=1, get_channel=lambda _id: None), guild_id=1,
        user=SimpleNamespace(id=9, mention="<@9>", __str__=lambda self: "boss"),
        response=FakeResponse(), followup=Followup(),
    )
    await cog.dept_status.callback(cog, interaction, "Los Santos PD", SimpleNamespace(value="Launched"), None)
    assert sheet.calls == []
    assert sent[0]["content"] == "**Los Santos PD** is now `Launched`."
    await cog.dept_status.callback(cog, interaction, "Los Santos PD", SimpleNamespace(value="Inactive"), None)
    assert sheet.calls == []
    await bot.db.close()


async def test_remove_archive_retries_by_name_when_code_archive_already_exists(tmp_path):
    from deptbot.cogs.departments import DepartmentsCog

    class Sheet:
        configured = True

        def __init__(self):
            self.calls = []

        async def call(self, action, **args):
            self.calls.append((action, args))
            if len(self.calls) == 1:
                return {
                    "ok": False,
                    "error": "A sheet with the name ‘Archived BCSO 2026-10-22’ already exists. Please enter another name.",
                }
            return {"ok": True, "members": 4}

    bot = DepartmentManagerBot(Config("unused", tmp_path / "retry.db", None, frozenset()))
    await bot.db.connect()
    sheet = Sheet()
    cog = DepartmentsCog(bot, sheet)
    interaction = SimpleNamespace(
        guild=SimpleNamespace(id=1, get_channel=lambda _id: None), guild_id=1,
        user=SimpleNamespace(id=9, mention="<@9>", __str__=lambda self: "boss"),
    )
    row = {"initials": "BCSO", "name": "Blaine County Sheriff's Office"}
    line = await cog._sheet_remove(interaction, row)
    assert [call[1]["code"] for call in sheet.calls] == ["BCSO", "Blaine County Sheriff's Office"]
    assert "tab archived" in line and "4 member" in line
    await bot.db.close()


async def test_remove_archive_moves_same_day_archive_then_retries_same_code(tmp_path):
    from deptbot.cogs.departments import DepartmentsCog

    class Sheet:
        configured = True

        def __init__(self):
            self.calls = []

        async def call(self, action, **args):
            self.calls.append((action, args))
            if len(self.calls) == 1:
                return {
                    "ok": False,
                    "error": "A sheet with the name ‘Archived BCSO 2026-10-22’ already exists. Please enter another name.",
                }
            return {"ok": True, "members": 2}

    class ArchiveSheet:
        def __init__(self):
            self.titles = []

        async def make_available(self, title):
            self.titles.append(title)
            return title + " (2)"

    bot = DepartmentManagerBot(Config("unused", tmp_path / "collision.db", None, frozenset()))
    await bot.db.connect()
    sheet = Sheet()
    archive = ArchiveSheet()
    cog = DepartmentsCog(bot, sheet, archive)
    interaction = SimpleNamespace(
        guild=SimpleNamespace(id=1, get_channel=lambda _id: None), guild_id=1,
        user=SimpleNamespace(id=9, mention="<@9>", __str__=lambda self: "boss"),
    )
    row = {"initials": "BCSO", "name": "Blaine County Sheriff's Office"}
    line = await cog._sheet_remove(interaction, row)
    assert archive.titles == ["Archived BCSO 2026-10-22"]
    assert [call[1]["code"] for call in sheet.calls] == ["BCSO", "BCSO"]
    assert "tab archived" in line and "2 member" in line
    await bot.db.close()
