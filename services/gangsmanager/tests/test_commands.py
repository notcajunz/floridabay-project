from pathlib import Path
import tomllib

import pytest

from gangbot.bot import GangManagerBot
from gangbot.cogs.core import CoreCog
from gangbot.cogs.economy import EconomyCog
from gangbot.cogs.gangs import GangsCog, coordinator_ranks_at_or_below
from gangbot.cogs.operations import OperationsCog
from gangbot.config import Config
from gangbot.common import require_gang_type
from gangbot.constants import (
    CATEGORY_COORDINATOR_RANKS,
    COORDINATOR_RANKS,
    GANG_CATEGORIES,
    GANG_MANAGER_PLUS_RANKS,
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
    bot = GangManagerBot(
        Config("unused", tmp_path / "commands.db", None, frozenset(), 0)
    )
    for cog in (CoreCog(bot), GangsCog(bot), EconomyCog(bot), OperationsCog(bot)):
        await bot.add_cog(cog)

    names = {name for command in bot.tree.get_commands() for name in walk(command)}
    expected = {
        "admin avatar", "admin gang rolecheck", "admin info", "admin nick",
        "admin refreshgangtiers", "admin reloadcog", "admin username",
        "bank adjust", "bank disperse", "bank fee", "bank give", "bank income",
        "bank info", "bank market", "bank rate", "bank remove",
        "coord activity", "coord add", "coord liaison", "coord remove", "coord update",
        "creation", "dm send", "embed edit", "embed get", "embed post",
        "gang add", "gang balance", "gang info", "gang remove", "gang report",
        "gang role", "gang update", "gang view", "help", "lineadd",
        "launder rate", "launder request", "launder self", "leaderboard",
        "location add", "location audit", "location refresh", "location remove", "location view",
        "log purchase", "log transfer", "market sell",
        "member deletepunishment", "member editpunishment", "member history", "member logpunishment",
        "permissions set", "permissions view", "quiz", "relations set",
        "reward give", "reward manage", "reward refresh", "reward remove", "reward slots",
        "role protection",
        "role add", "role remove", "rolewipe", "useradd", "userdel",
        "shop add", "shop modify", "shop remove", "shop sell",
        "tax force", "tax offer", "tax remove", "tax view",
        "temprole delete", "temprole extend", "temprole list",
        "trade give", "trade history", "trade offer",
        "turfwar action", "turfwar history", "turfwar invest", "turfwar stage",
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


def test_feature_specific_gang_types():
    require_gang_type({"gang_type": "Criminal Org"}, "Criminal Org", "Laundering")
    require_gang_type({"gang_type": "Street Gang"}, "Street Gang", "Turf wars")
    with pytest.raises(ValueError, match="only available to Criminal Org"):
        require_gang_type({"gang_type": "Cartel"}, "Criminal Org", "Laundering")
    with pytest.raises(ValueError, match="only available to Street Gang"):
        require_gang_type({"gang_type": "Militia"}, "Street Gang", "Turf wars")


def test_coordinator_rank_hierarchy_and_category_visibility():
    assert COORDINATOR_RANKS[:3] == (
        "Gang Director",
        "Assistant Gang Director",
        "Gang Manager",
    )
    assert "Gang Director" not in CATEGORY_COORDINATOR_RANKS
    assert "Assistant Gang Director" not in CATEGORY_COORDINATOR_RANKS
    assert CATEGORY_COORDINATOR_RANKS[0] == "Gang Manager"
    assert GANG_MANAGER_PLUS_RANKS == (
        "Gang Director",
        "Assistant Gang Director",
        "Gang Manager",
    )
    assert coordinator_ranks_at_or_below("Trial Gang Coordinator") == (
        "Trial Gang Coordinator",
    )
    assert coordinator_ranks_at_or_below("Lead Gang Coordinator") == (
        "Lead Gang Coordinator",
        "Senior Gang Coordinator",
        "Gang Coordinator",
        "Trial Gang Coordinator",
    )
    assert coordinator_ranks_at_or_below("Gang Director") == COORDINATOR_RANKS


def test_all_coordinator_channels_and_roles_are_id_configurable(tmp_path):
    config = Config("unused", tmp_path / "test.db", None, frozenset(), 1)
    assert config.gang_coord_team_role_id == 1559682517659943033
    assert config.gang_add_remove_role_id == 1559682499251146772
    assert set(config.coord_channel_ids) == set(GANG_CATEGORIES)
    assert set(config.category_coordinator_role_ids) == set(GANG_CATEGORIES)
    assert set(config.coordinator_role_ids) == set(COORDINATOR_RANKS)
