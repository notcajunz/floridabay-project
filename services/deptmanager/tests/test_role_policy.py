from types import SimpleNamespace
from unittest.mock import AsyncMock

import discord

from deptbot.cogs.panels import build_chain_embed, chunk_lines
from deptbot.config import Config
from deptbot.role_policy import (
    assign_cooldown,
    category_conflict,
    department_movement_embed,
    sync_category_member_roles,
)

LEO_DIVIDER, PRE_DIVIDER = 900, 901
LEO_TRANSFER, LEO_RESIGN = 910, 911


def role(role_id, name="role", members=()):
    return SimpleNamespace(id=role_id, name=name, mention=f"<@&{role_id}>", members=list(members))


def make_config(**extra):
    values = dict(
        category_member_role_ids={"Main LEO": LEO_DIVIDER, "Main FED": LEO_DIVIDER, "Pre-Main": PRE_DIVIDER},
        transfer_cooldown_role_ids={"Main LEO": LEO_TRANSFER},
        resignation_cooldown_role_ids={"Main LEO": LEO_RESIGN},
        hours_channel_id=1,
    )
    values.update(extra)
    return Config("t", None, None, frozenset(), **values)


class Db:
    def __init__(self, departments):
        self.departments = departments
        self.executed = []

    async def fetch_all(self, sql, params):
        rows = self.departments
        if "category=?" in sql:
            rows = [row for row in rows if row["category"] == params[1] and row["id"] != params[2]]
        return rows

    async def execute(self, sql, params):
        self.executed.append((sql, params))


def guild_with(*roles):
    by_id = {r.id: r for r in roles}
    return SimpleNamespace(id=1, name="Hub", get_role=lambda role_id: by_id.get(role_id))


def member_with(guild, *roles):
    member = SimpleNamespace(id=50, guild=guild, roles=list(roles), mention="<@50>")
    member.add_roles = AsyncMock()
    member.remove_roles = AsyncMock()
    member.send = AsyncMock()
    return member


LSPD = {"id": 1, "name": "LSPD", "category": "Main LEO", "base_role_id": 101}
BCSO = {"id": 2, "name": "BCSO", "category": "Main LEO", "base_role_id": 102}
FIB = {"id": 3, "name": "FIB", "category": "Main FED", "base_role_id": 103}
DOJ = {"id": 4, "name": "DOJ", "category": "Other", "base_role_id": 104}


async def test_one_department_per_category():
    guild = guild_with(role(LEO_TRANSFER), role(LEO_RESIGN))
    bot = SimpleNamespace(config=make_config(), db=Db([LSPD, BCSO, FIB, DOJ]))
    member = member_with(guild, role(101))
    assert await category_conflict(bot, member, BCSO) == "Already in LSPD (Main LEO)"
    assert await category_conflict(bot, member, FIB) is None
    assert await category_conflict(bot, member, DOJ) is None


async def test_cooldown_blocks_joining_the_category():
    cooldown = role(LEO_RESIGN, "Main LEO Resignation Cooldown")
    guild = guild_with(role(LEO_TRANSFER), cooldown)
    bot = SimpleNamespace(config=make_config(), db=Db([LSPD, BCSO]))
    member = member_with(guild, cooldown)
    assert await category_conflict(bot, member, BCSO) == "On Main LEO Resignation Cooldown"


async def test_shared_divider_stays_while_any_category_needs_it():
    divider = role(LEO_DIVIDER)
    guild = guild_with(divider, role(PRE_DIVIDER))
    bot = SimpleNamespace(config=make_config(), db=Db([LSPD, FIB]))
    # Left LSPD but still in FIB: the shared Main Department divider stays.
    member = member_with(guild, divider, role(103))
    await sync_category_member_roles(bot, member)
    member.add_roles.assert_not_awaited()
    member.remove_roles.assert_not_awaited()
    # Left both: the divider goes.
    member = member_with(guild, divider)
    await sync_category_member_roles(bot, member)
    member.remove_roles.assert_awaited_once()


async def test_assign_cooldown_records_expiry_and_dms():
    cooldown = role(LEO_RESIGN, "Main LEO Resignation Cooldown")
    guild = guild_with(cooldown)
    db = Db([])
    bot = SimpleNamespace(config=make_config(resignation_cooldown_days=3), db=db)
    member = member_with(guild)
    assert await assign_cooldown(bot, member, "Main LEO", "Resignation", department="LSPD") is cooldown
    member.add_roles.assert_awaited_once()
    assert db.executed and db.executed[0][1][2] == LEO_RESIGN
    assert "LSPD" in member.send.await_args.kwargs["embed"].description
    # No cooldown roles for "Other".
    assert await assign_cooldown(bot, member_with(guild), "Other", "Resignation") is None


def test_movement_embed_includes_org_and_hours():
    bot = SimpleNamespace(config=make_config())
    actor = SimpleNamespace(mention="<@7>")
    department = {**LSPD, "initials": "LSPD", "command_role_id": 201, "head_id": 5, "status": "In Development",
                  "fbrp_org_id": "3", "role_color": 0x206694}
    embed = department_movement_embed(bot, SimpleNamespace(name="Hub"), department, "Created", actor, {"name": "LSPD Org", "type": "leo"})
    fields = {field.name: field.value for field in embed.fields}
    assert fields["FBRP Org ID"].startswith("`3`")
    assert "Linked" in fields["Hours Integration"]
    unlinked = department_movement_embed(bot, SimpleNamespace(name="Hub"), {**department, "fbrp_org_id": None}, "Created", actor)
    assert "Off" in {f.name: f.value for f in unlinked.fields}["Hours Integration"]


def test_chain_lists_each_member_under_highest_rank():
    alice = SimpleNamespace(id=1, bot=False, display_name="Alice", mention="<@1>")
    bob = SimpleNamespace(id=2, bot=False, display_name="Bob", mention="<@2>")
    manager = role(20, members=[alice])
    coordinator = role(30, members=[alice, bob])
    job = role(40, members=[bob])
    guild = SimpleNamespace(icon=None, get_role={20: manager, 30: coordinator, 40: job}.get)
    config = make_config(
        coordinator_role_ids={"Department Manager": 20, "Department Coordinator": 30},
        coordinator_job_role_ids={"Transfer Coordinator": 40},
    )
    embed = build_chain_embed(guild, config)
    fields = {field.name: field.value for field in embed.fields}
    assert "<@1>" in fields["04  Department Manager"]
    assert "<@1>" not in fields["08  Department Coordinator"]
    assert "<@2>" in fields["08  Department Coordinator"]
    assert "<@2>" in fields["Coordination Positions"]
    assert isinstance(embed, discord.Embed)


def test_chunk_lines_respects_field_limit():
    chunks = chunk_lines(["x" * 600, "y" * 600, "z"])
    assert len(chunks) == 2 and all(len(chunk) <= 1024 for chunk in chunks)
