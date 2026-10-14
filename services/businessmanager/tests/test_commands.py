from pathlib import Path
from types import SimpleNamespace
import tomllib
from unittest.mock import MagicMock

import discord

from businessbot.bot import BusinessManagerBot
from businessbot.cogs.core import CoreCog
from businessbot.cogs.businesses import BusinessesCog, coordinator_ranks_at_or_below
from businessbot.config import Config
from businessbot.constants import (
    CATEGORY_COORDINATOR_RANKS,
    COORDINATOR_RANKS,
    BUSINESS_CATEGORIES,
    BUSINESS_MANAGER_PLUS_RANKS,
)


def walk(command, prefix=""):
    name = f"{prefix} {command.name}".strip()
    children = getattr(command, "commands", None)
    if children:
        for child in children:
            yield from walk(child, name)
    else:
        yield name


async def test_all_requested_commands_are_registered(tmp_path: Path):
    bot = BusinessManagerBot(
        Config("unused", tmp_path / "commands.db", None, frozenset(), 0)
    )
    for cog in (CoreCog(bot), BusinessesCog(bot)):
        await bot.add_cog(cog)

    names = {name for command in bot.tree.get_commands() for name in walk(command)}
    expected = {
        "admin avatar", "admin business rolecheck", "admin info", "admin nick",
        "admin refreshbusinesstiers", "admin reloadcog", "admin username",
        "coord activity", "coord add", "coord liaison", "coord remove", "coord update",
        "creation", "dm send", "embed edit", "embed get", "embed post",
        "business add", "business balance", "business hours", "business info", "business remove", "business report",
        "business role", "business update", "business view", "help", "lineadd",
        "leaderboard",
        "location add", "location audit", "location refresh", "location remove", "location view",
        "member deletepunishment", "member editpunishment", "member history", "member logpunishment",
        "permissions set", "permissions view", "quiz",
        "reward give", "reward manage", "reward refresh", "reward remove", "reward slots",
        "role protection",
        "role add", "role remove", "rolewipe", "useradd", "userdel",
    }
    assert names == expected

    config_path = Path(__file__).parents[1] / "config.toml"
    raw = tomllib.loads(config_path.read_text(encoding="utf-8"))
    categorized = [
        name
        for category in raw["access"]["categories"].values()
        for name in category["commands"]
    ]
    assert len(categorized) == len(set(categorized))
    assert set(categorized) == names
    assert len(bot.tree.get_commands()) <= 100
    # Building Discord payloads catches invalid nesting, option types, and required ordering.
    for command in bot.tree.get_commands():
        command.to_dict(bot.tree)
    await bot.close()


def test_coordinator_rank_hierarchy_and_category_visibility():
    assert COORDINATOR_RANKS[:4] == (
        "Head of Businesses",
        "Business Director",
        "Assistant Business Director",
        "Business Manager",
    )
    assert "Head of Businesses" not in CATEGORY_COORDINATOR_RANKS
    assert "Business Director" not in CATEGORY_COORDINATOR_RANKS
    assert "Assistant Business Director" not in CATEGORY_COORDINATOR_RANKS
    assert CATEGORY_COORDINATOR_RANKS[0] == "Business Manager"
    assert BUSINESS_MANAGER_PLUS_RANKS == (
        "Head of Businesses",
        "Business Director",
        "Assistant Business Director",
        "Business Manager",
    )
    assert coordinator_ranks_at_or_below("Trial Business Coordinator") == (
        "Trial Business Coordinator",
    )
    assert coordinator_ranks_at_or_below("Lead Business Coordinator") == (
        "Lead Business Coordinator",
        "Senior Business Coordinator",
        "Business Coordinator",
        "Trial Business Coordinator",
    )
    assert coordinator_ranks_at_or_below("Head of Businesses") == COORDINATOR_RANKS


def test_all_coordinator_channels_and_roles_are_id_configurable(tmp_path):
    config = Config("unused", tmp_path / "test.db", None, frozenset(), 1)
    assert config.business_coord_team_role_id == 1559701166261141534
    assert config.business_add_remove_role_id == 1559701149475536947
    assert set(config.coord_channel_ids) == set(BUSINESS_CATEGORIES)
    assert set(config.category_coordinator_role_ids) == set(BUSINESS_CATEGORIES)
    assert set(config.coordinator_role_ids) == set(COORDINATOR_RANKS)


def test_business_coordination_team_manages_all_business_voice_channels(tmp_path):
    config = Config("unused", tmp_path / "voice.db", None, frozenset(), 1)
    configured_roles = {
        role_id: MagicMock(spec=discord.Role)
        for role_id in (*config.voice_management_role_ids, config.business_coord_team_role_id)
    }
    default_role = MagicMock(spec=discord.Role)
    guild = SimpleNamespace(
        default_role=default_role,
        get_role=configured_roles.get,
    )
    cog = BusinessesCog(SimpleNamespace(config=config, db=MagicMock()))

    overwrites = cog._voice_overwrites(guild)

    coordination_permissions = overwrites[configured_roles[config.business_coord_team_role_id]]
    assert coordination_permissions.view_channel is True
    assert coordination_permissions.connect is True
    assert coordination_permissions.speak is True
    assert coordination_permissions.move_members is True
    assert coordination_permissions.mute_members is True
    assert coordination_permissions.deafen_members is True
