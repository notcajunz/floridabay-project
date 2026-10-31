import asyncio
import inspect
import sqlite3
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import discord
import pytest

from deptbot.bot import DepartmentManagerBot, event_guild_id
from deptbot.cogs.departments import DepartmentsCog, unique_org_error
from deptbot.cogs.dept_guilds import DeptGuildsCog, RoleRequestButton, bot_invite_url
from deptbot.config import Config
from deptbot.database import Database
from deptbot.dept_roles import ALL_ROLES, grant_decision
from deptbot.services import DepartmentService, parse_guild_id

HUB = 1558235113295315004
DEPT = 1558238773958017024


def rule(role_id, kind, subject, allowed):
    return {"role_id": role_id, "subject_type": kind, "subject_id": subject, "allowed": int(allowed)}


def test_specific_role_rule_beats_the_all_role_rule():
    rules = [rule(ALL_ROLES, "role", 5, True), rule(100, "role", 5, False)]
    assert grant_decision(rules, 100, 1, [5]) is False
    assert grant_decision(rules, 200, 1, [5]) is True


def test_user_rule_beats_role_rules_and_deny_wins_between_roles():
    rules = [rule(100, "role", 5, True), rule(100, "role", 6, False), rule(100, "user", 1, True)]
    assert grant_decision(rules, 100, 1, [5, 6]) is True
    assert grant_decision(rules, 100, 2, [5, 6]) is False
    assert grant_decision(rules, 100, 2, [5]) is True


def test_no_rule_means_no_access():
    assert grant_decision([rule(100, "role", 5, True)], 100, 1, [9]) is None
    assert grant_decision([], 100, 1, [5]) is None


def test_all_role_user_deny_overrides_all_role_role_allow():
    rules = [rule(ALL_ROLES, "role", 5, True), rule(ALL_ROLES, "user", 1, False)]
    assert grant_decision(rules, 300, 1, [5]) is False


def test_guild_id_must_be_a_server_id():
    assert parse_guild_id(f" {DEPT} ") == DEPT
    for bad in ("", "abc", "123", "https://discord.gg/x"):
        with pytest.raises(ValueError):
            parse_guild_id(bad)


def test_invite_link_adds_the_bot_to_that_server_only():
    query = parse_qs(urlparse(bot_invite_url(42, DEPT)).query)
    assert query["client_id"] == ["42"]
    assert query["guild_id"] == [str(DEPT)]
    assert query["disable_guild_select"] == ["true"]
    assert set(query["scope"][0].split()) == {"bot", "applications.commands"}
    assert int(query["permissions"][0]) & discord.Permissions(manage_roles=True).value


def make_bot(tmp_path: Path) -> DepartmentManagerBot:
    return DepartmentManagerBot(Config.from_mapping({"bot": {"guild_id": HUB, "database_path": str(tmp_path / "d.db")}}, token="x"))


def test_linked_department_servers_pass_the_guild_guard(tmp_path: Path):
    bot = make_bot(tmp_path)
    parsers = bot._connection.parsers
    assert parsers["INTERACTION_CREATE"]({"guild_id": str(DEPT)}) is None
    bot.linked_guild_ids.add(DEPT)
    # Not dropped any more: the real parser now runs and fails on the empty payload.
    with pytest.raises(Exception):
        parsers["INTERACTION_CREATE"]({"guild_id": str(DEPT)})
    assert parsers["INTERACTION_CREATE"]({"guild_id": "99"}) is None


async def test_hub_listeners_never_see_department_server_events(tmp_path: Path):
    bot = make_bot(tmp_path)
    await bot._async_setup_hook()  # gives the client its event loop without logging in
    bot.linked_guild_ids.add(DEPT)
    seen = []

    async def member_join(payload):
        seen.append(("member_join", payload.guild_id))

    async def guild_join(payload):
        seen.append(("guild_join", payload.guild_id))

    bot.add_listener(member_join, "on_member_join")
    bot.add_listener(guild_join, "on_guild_join")
    assert event_guild_id((SimpleNamespace(guild_id=DEPT),)) == DEPT
    bot.dispatch("member_join", SimpleNamespace(guild_id=DEPT))
    bot.dispatch("member_join", SimpleNamespace(guild_id=HUB))
    bot.dispatch("guild_join", SimpleNamespace(guild_id=DEPT))
    await asyncio.sleep(0.01)
    assert sorted(seen) == [("guild_join", DEPT), ("member_join", HUB)]
    assert bot.is_foreign(DEPT) and not bot.is_foreign(HUB)


async def test_departments_get_an_external_guild_column_on_old_databases(tmp_path: Path):
    path = tmp_path / "old.db"
    old = sqlite3.connect(path)
    old.execute("CREATE TABLE departments (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id INTEGER NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'x', role_color INTEGER NOT NULL DEFAULT 0, base_role_id INTEGER, command_role_id INTEGER, head_id INTEGER, fbrp_org_id TEXT, invite TEXT, hide_leaderboard INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(guild_id, name))")
    old.commit()
    old.close()
    db = Database(path)
    await db.connect()
    service = DepartmentService(db)
    await service.create(HUB, "Department of Homefront Security", "Main FED", external_guild_id=str(DEPT))
    assert await service.linked_guild_ids(HUB) == {DEPT}
    assert (await service.department_for_guild(DEPT))["name"] == "Department of Homefront Security"
    with pytest.raises(sqlite3.IntegrityError) as caught:
        await service.create(HUB, "Other", "Other", external_guild_id=str(DEPT))
    assert "already linked to another department" in str(unique_org_error(caught.value))
    await db.close()


def test_dept_add_requires_the_department_server_and_can_create_roles():
    command = DepartmentsCog.dept_add
    params = {param.display_name: param for param in command.parameters}
    assert params["guild_id"].required
    assert not params["base_role"].required and not params["command_role"].required
    assert "color" in params and "initials" in params
    update = {param.display_name for param in DepartmentsCog.dept_update.parameters}
    assert {"guild_id", "unlink_guild"} <= update


async def test_department_servers_get_role_commands_only_there(tmp_path: Path):
    bot = make_bot(tmp_path)
    cog = DeptGuildsCog(bot)
    await bot.add_cog(cog)
    assert not bot.tree.get_commands()  # nothing global, so the Hub never gets them
    cog.register(DEPT)
    names = set()
    for group in bot.tree.get_commands(guild=discord.Object(id=DEPT)):
        names.update(f"{group.name} {child.name}" for child in group.commands)
    assert {
        "role add", "role remove", "role view", "role create", "request role",
        "roleperms set", "roleperms all", "roleperms clear", "roleperms list", "roleperms requests",
    } <= names
    await cog.unlink(DEPT)
    assert not bot.tree.get_commands(guild=discord.Object(id=DEPT))


def test_request_buttons_survive_restarts():
    button = RoleRequestButton("approve", 17)
    assert button.item.custom_id == "deptreq:approve:17"
    assert RoleRequestButton.__discord_ui_compiled_template__.fullmatch("deptreq:deny:9")
    assert "self_target" in inspect.signature(DeptGuildsCog.require_can_give).parameters
