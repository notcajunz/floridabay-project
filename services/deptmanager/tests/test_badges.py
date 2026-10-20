import base64
import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import discord
import pytest
from PIL import Image

from deptbot.badge_render import BadgeError, render_badge, to_data_url
from deptbot.bot import DepartmentManagerBot
from deptbot.cogs.badges import BadgesCog
from deptbot.config import Config
from deptbot.fbrp_api import FbrpApiError

BACKGROUND = (20, 30, 60, 255)


def text(y, size=0.08, enabled=True, **extra):
    return {"enabled": enabled, "x": 0.5, "y": y, "size": size, "color": "#ffffff", "align": "center",
            "weight": "bold", "maxWidth": 0.84, "uppercase": False, **extra}


FIELDS = {
    "name": text(0.55), "rank": text(0.70, 0.06), "callsign": text(0.85, 0.1),
    "department": text(0.1, enabled=False),
    "avatar": {"enabled": False, "x": 0.5, "y": 0.25, "size": 0.3, "shape": "circle"},
}


def template(width=400, height=300, color=BACKGROUND):
    out = io.BytesIO()
    Image.new("RGBA", (width, height), color).save(out, format="PNG")
    return out.getvalue()


def changed_rows(png: bytes) -> list[int]:
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    rows = []
    for y in range(image.height):
        if any(image.getpixel((x, y)) != BACKGROUND for x in range(0, image.width, 2)):
            rows.append(y)
    return rows


def test_text_is_drawn_where_the_layout_puts_it():
    png = render_badge(template(), FIELDS, {"name": "Jordan Reyes", "rank": "Sergeant", "callsign": "2A-14"})
    rows = changed_rows(png)
    assert rows
    # name (y .55), rank (.70) and callsign (.85) of a 300px tall badge; nothing near the top.
    assert min(rows) > 0.45 * 300 and max(rows) < 0.95 * 300
    assert any(abs(y - 0.85 * 300) < 6 for y in rows)
    assert not any(y < 0.3 * 300 for y in rows)


def test_disabled_and_empty_fields_are_skipped():
    png = render_badge(template(), FIELDS, {"name": "", "rank": "", "callsign": "", "department": "Hidden"})
    assert changed_rows(png) == []


def test_long_text_shrinks_to_its_width_limit():
    narrow = {**FIELDS, "callsign": text(0.5, 0.2, maxWidth=0.3)}
    png = render_badge(template(), narrow, {"callsign": "LONG CALLSIGN"})
    image = Image.open(io.BytesIO(png)).convert("RGBA")
    columns = [x for x in range(image.width) if any(image.getpixel((x, y)) != BACKGROUND for y in range(image.height))]
    assert max(columns) - min(columns) <= 0.3 * 400 + 4


def test_uppercase_and_alignment_move_the_text():
    left = {**FIELDS, "callsign": text(0.5, 0.1, align="left", x=0.1, uppercase=True)}
    image = Image.open(io.BytesIO(render_badge(template(), left, {"callsign": "ab"}))).convert("RGBA")
    columns = [x for x in range(image.width) if any(image.getpixel((x, y)) != BACKGROUND for y in range(image.height))]
    assert min(columns) >= 0.1 * 400 - 2 and max(columns) < 0.5 * 400


def test_avatar_is_cropped_to_a_circle():
    avatar = io.BytesIO()
    Image.new("RGBA", (64, 64), (255, 0, 0, 255)).save(avatar, format="PNG")
    fields = {**FIELDS, "avatar": {"enabled": True, "x": 0.5, "y": 0.4, "size": 0.4, "shape": "circle"}}
    image = Image.open(io.BytesIO(render_badge(template(), fields, {}, avatar.getvalue()))).convert("RGBA")
    side = round(0.4 * 400)
    left, top = 200 - side // 2, round(0.4 * 300) - side // 2
    assert image.getpixel((200, round(0.4 * 300))) == (255, 0, 0, 255)
    assert image.getpixel((left + 1, top + 1)) == BACKGROUND  # the square's corner is masked away


def test_unreadable_or_huge_templates_are_rejected():
    with pytest.raises(BadgeError, match="not a picture"):
        render_badge(b"<script>alert(1)</script>", FIELDS, {})
    with pytest.raises(BadgeError, match="not a picture"):
        to_data_url(b"nope")


def test_uploads_are_reencoded_and_shrunk_for_the_website():
    big = template(3000, 2000)
    url = to_data_url(big)
    assert url.startswith("data:image/png;base64,")
    image = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))
    assert max(image.size) == 1600


class FakeApi:
    def __init__(self, member=None, found=True, own_rank=False):
        self.member = member or {"onRoster": True, "rank": {"id": 4, "name": "Sergeant", "level": 40}, "callsign": "2A-14", "tier": "supervisor", "leader": False}
        self.found = found
        self.own_rank = own_rank
        self.calls = []

    async def badge_overview(self, org):
        return {"ranks": [{"id": 4, "name": "Sergeant", "level": 40}, {"id": 5, "name": "Chief", "level": 90}], "slots": []}

    async def badge_member(self, org, discord_id):
        self.calls.append(("member", org, discord_id))
        return self.member

    async def badge_template(self, org, tier, rank_id=None):
        self.calls.append(("template", org, tier, rank_id))
        if not self.found:
            raise FbrpApiError("This organization has not uploaded any badge templates.")
        used = f"r{rank_id}" if rank_id and self.own_rank else "member"
        return {"tier": used, "requested": tier, "fields": FIELDS, "image": base64.b64encode(template()).decode()}


async def make_cog(tmp_path, api, name="b.db"):
    bot = DepartmentManagerBot(Config("unused", tmp_path / name, None, frozenset()))
    await bot.db.connect()
    cog = BadgesCog(bot, api)
    await cog.service.create(1, "Los Santos PD", "Main LEO", initials="LSPD", base_role_id=5, command_role_id=6, fbrp_org_id="12")
    return bot, cog


def fake_member(roles=(5,)):
    member = MagicMock(spec=discord.Member)
    member.id = 77
    member.display_name = "Jordan Reyes"
    member.name = "jordan"
    member.roles = [SimpleNamespace(id=role) for role in roles]
    asset = MagicMock()
    asset.replace.return_value.read = AsyncMock(return_value=b"")
    member.display_avatar = asset
    return member


def fake_interaction(member):
    sent = []

    async def send(*args, **kwargs):
        sent.append((args, kwargs))

    response = SimpleNamespace(is_done=lambda: True, defer=AsyncMock())
    interaction = SimpleNamespace(
        guild=SimpleNamespace(id=1), guild_id=1, user=member, response=response,
        followup=SimpleNamespace(send=send),
    )
    return interaction, sent


async def test_get_fills_the_badge_for_the_member_with_their_roster_rank(tmp_path):
    api = FakeApi()
    bot, cog = await make_cog(tmp_path, api)
    member = fake_member()
    interaction, sent = fake_interaction(member)
    await cog.badge_get.callback(cog, interaction, "Los Santos PD", None, None, None, False)
    (args, kwargs), = sent
    assert ("template", "12", "supervisor", 4) in api.calls
    assert "Sergeant" in args[0] and "2A-14" in args[0]
    assert "no badge of its own yet" in args[0] and "default badge" in args[0]
    png = Image.open(io.BytesIO(kwargs["file"].fp.read()))
    assert png.size == (400, 300)
    await bot.db.close()


async def test_get_without_a_department_picks_the_only_one_the_member_is_in(tmp_path):
    bot, cog = await make_cog(tmp_path, FakeApi())
    interaction, sent = fake_interaction(fake_member())
    await cog.badge_get.callback(cog, interaction, None, None, None, None, False)
    assert len(sent) == 1
    await bot.db.close()


async def test_get_refuses_people_outside_the_department_and_off_the_roster(tmp_path):
    bot, cog = await make_cog(tmp_path, FakeApi())
    interaction, _ = fake_interaction(fake_member(roles=(99,)))
    with pytest.raises(ValueError, match="not in a registered department|does not hold"):
        await cog.badge_get.callback(cog, interaction, None, None, None, None, False)
    with pytest.raises(ValueError, match="does not hold"):
        await cog.badge_get.callback(cog, interaction, "Los Santos PD", None, None, None, False)
    off = FakeApi(member={"onRoster": False})
    bot2, cog2 = await make_cog(tmp_path, off, "off.db")
    interaction2, _ = fake_interaction(fake_member())
    with pytest.raises(ValueError, match="no callsign .*not on the roster"):
        await cog2.badge_get.callback(cog2, interaction2, "Los Santos PD", None, None, None, False)
    await bot.db.close()
    await bot2.db.close()


async def test_get_explains_when_no_template_exists_or_no_org_is_linked(tmp_path):
    bot, cog = await make_cog(tmp_path, FakeApi(found=False))
    interaction, _ = fake_interaction(fake_member())
    with pytest.raises(ValueError, match="no badge pictures yet"):
        await cog.badge_get.callback(cog, interaction, "Los Santos PD", None, None, None, False)
    await cog.service.create(1, "Fire Dept", "Other", initials="FD", base_role_id=8, command_role_id=9)
    with pytest.raises(ValueError, match="not linked to an FBRP organization"):
        await cog.badge_get.callback(cog, interaction, "Fire Dept", None, None, None, False)
    await bot.db.close()


def test_serif_and_bent_text_render_differently_from_flat_sans():
    flat = {**FIELDS, "rank": text(0.5, 0.1, maxWidth=0.9)}
    serif = {**FIELDS, "rank": text(0.5, 0.1, maxWidth=0.9, font="serif")}
    bent = {**FIELDS, "rank": text(0.5, 0.1, maxWidth=0.9, bendA=-2.0, bendB=0)}
    values = {"rank": "SERGEANT MAJOR"}
    base = render_badge(template(), flat, values)
    assert render_badge(template(), serif, values) != base
    assert len(changed_rows(render_badge(template(), bent, values))) > len(changed_rows(base)) + 6


def test_bend_is_ignored_for_left_aligned_text():
    left = {**FIELDS, "rank": text(0.5, 0.1, maxWidth=0.9, align="left", x=0.1, bendA=-2.0)}
    straight = {**FIELDS, "rank": text(0.5, 0.1, maxWidth=0.9, align="left", x=0.1)}
    assert render_badge(template(), left, {"rank": "SGT"}) == render_badge(template(), straight, {"rank": "SGT"})


def test_uploads_stay_png_and_shrink_before_falling_back_to_jpeg():
    import random

    noise = Image.new("RGB", (1600, 1600))
    random.seed(1)
    noise.putdata([(random.randrange(256), random.randrange(256), random.randrange(256)) for _ in range(1600 * 1600)])
    out = io.BytesIO()
    noise.save(out, format="PNG")
    url = to_data_url(out.getvalue())
    assert url.startswith("data:image/png;base64,")
    image = Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))
    assert max(image.size) < 1600  # shrunk, still a PNG


class UploadApi(FakeApi):
    def __init__(self, result=None, error=None):
        super().__init__()
        self.result, self.error = result, error
        self.saved = []

    async def badge_save(self, org, tier, **kwargs):
        self.saved.append((org, tier, kwargs))
        if self.error:
            raise self.error
        return self.result


def admin_member():
    member = fake_member()
    member.guild_permissions = SimpleNamespace(administrator=True)
    return member


async def upload(tmp_path, api, name="u.db", badge="Default badge"):
    bot, cog = await make_cog(tmp_path, api, name)
    member = admin_member()
    interaction, sent = fake_interaction(member)
    interaction.client = bot
    interaction.command = None
    picture = SimpleNamespace(size=5000, read=AsyncMock(return_value=template()))
    try:
        await cog.badge_upload.callback(cog, interaction, "Los Santos PD", badge, picture)
    finally:
        await bot.db.close()
    return sent


async def test_upload_sends_the_picture_once_and_reports_what_the_ai_found(tmp_path):
    api = UploadApi({"found": ["callsign"], "erased": True, "notes": []})
    sent = await upload(tmp_path, api)
    assert len(api.saved) == 1 and api.saved[0][1] == "member" and api.saved[0][2]["image"].startswith("data:image/png")
    assert "fields" not in api.saved[0][2]  # the AI decides where the callsign goes
    assert not any(call[0] == "analyze" for call in api.calls)  # no second AI run from the bot
    message = sent[0][0][0]
    assert "found the callsign space" in message and "removed the sample callsign" in message


async def test_upload_says_so_when_the_ai_found_nothing(tmp_path):
    api = UploadApi({"found": [], "erased": False, "notes": ["the AI could not place the callsign (no key), so the default position was kept"]})
    sent = await upload(tmp_path, api, "none.db")
    message = sent[0][0][0]
    assert message.startswith("Uploaded, but") and "default position was kept" in message


async def test_upload_failure_is_reported_as_an_error(tmp_path):
    with pytest.raises(ValueError, match="too big"):
        await upload(tmp_path, UploadApi(error=FbrpApiError("too big")), "err.db")


async def test_rank_text_is_never_drawn_only_the_callsign(tmp_path):
    api = FakeApi()
    api.member = {"onRoster": True, "rank": {"id": 4, "name": "Sergeant", "level": 40}, "callsign": "ab-123", "tier": "member", "leader": False}
    bot, cog = await make_cog(tmp_path, api, "only.db")
    seen = {}
    import deptbot.cogs.badges as badges_module

    original = badges_module.render_badge
    badges_module.render_badge = lambda image, fields, values, avatar=None: seen.update(values=dict(values)) or original(image, fields, values, avatar)
    try:
        interaction, sent = fake_interaction(fake_member())
        await cog.badge_get.callback(cog, interaction, "Los Santos PD", None, None, None, False)
    finally:
        badges_module.render_badge = original
        await bot.db.close()
    assert seen["values"] == {"callsign": "AB-123"}  # normalized, nothing else printed
    assert "AB-123" in sent[0][0][0]


async def test_odd_callsigns_still_render_with_a_warning(tmp_path):
    api = FakeApi()
    api.member = {"onRoster": True, "rank": None, "callsign": "Whiskey 9", "tier": "member", "leader": False}
    bot, cog = await make_cog(tmp_path, api, "odd.db")
    interaction, sent = fake_interaction(fake_member())
    await cog.badge_get.callback(cog, interaction, "Los Santos PD", None, None, None, False)
    await bot.db.close()
    message = sent[0][0][0]
    assert "WHISKEY 9" in message and "not a usual callsign shape" in message and "2A-14 or ABC-123" in message


async def test_each_rank_can_have_its_own_badge_and_the_default_covers_the_rest(tmp_path):
    api = UploadApi({"found": ["callsign"], "erased": True, "notes": []})
    await upload(tmp_path, api, "rank.db", badge="Sergeant")
    assert api.saved[0][1] == "r4"  # stored under the rank, not a tier
    with pytest.raises(ValueError, match="no rank called `Admiral`"):
        await upload(tmp_path, UploadApi({"found": []}), "bad.db", badge="Admiral")


async def test_a_rank_with_its_own_badge_gets_it_without_a_fallback_note(tmp_path):
    api = FakeApi(own_rank=True)
    bot, cog = await make_cog(tmp_path, api, "own.db")
    interaction, sent = fake_interaction(fake_member())
    await cog.badge_get.callback(cog, interaction, "Los Santos PD", None, None, None, False)
    await bot.db.close()
    assert "no badge of its own" not in sent[0][0][0]
