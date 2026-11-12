from pathlib import Path
import tomllib

from deptbot.bot import DepartmentManagerBot
from deptbot.cogs.badges import BadgesCog
from deptbot.cogs.coordination import CoordinationCog
from deptbot.cogs.core import CoreCog
from deptbot.cogs.departments import DepartmentsCog
from deptbot.cogs.email import EmailCog
from deptbot.cogs.members import MembersCog
from deptbot.cogs.positions import PositionsCog
from deptbot.cogs.stickies import StickiesCog
from deptbot.config import Config
from deptbot.constants import COORDINATOR_RANKS, DEPARTMENT_CATEGORIES
from deptbot.tickets import TicketsCog

ROOT = Path(__file__).resolve().parents[1]


def walk(command, prefix=""):
    name = f"{prefix} {command.name}".strip()
    children = getattr(command, "commands", None)
    if children:
        for child in children:
            yield from walk(child, name)
    else:
        yield name


async def registered(tmp_path: Path) -> set[str]:
    bot = DepartmentManagerBot(Config("unused", tmp_path / "commands.db", None, frozenset()))
    for cog in (CoreCog(bot), BadgesCog(bot), DepartmentsCog(bot), CoordinationCog(bot), MembersCog(bot), PositionsCog(bot), EmailCog(bot), StickiesCog(bot), TicketsCog(bot)):
        await bot.add_cog(cog)
    return {name for command in bot.tree.get_commands() for name in walk(command)}


async def test_department_commands_are_registered(tmp_path: Path):
    names = await registered(tmp_path)
    assert {
        "dept create", "dept add", "dept update", "dept status", "dept hours",
        "coord add", "coord remove", "coord job", "coord sync", "coord update",
        "sticky set", "sticky remove", "sticky list", "embed post", "embed edit",
        "badge get", "badge upload", "badge layout", "badge preview", "badge remove", "badge list",
        "role add", "role remove", "transfer member", "transfer blacklist",
        "cooldown apply", "cooldown clear", "cooldown view",
    } <= names
    # Gang-only features stay out of the department bot.
    assert not any(name.split()[0] in {"bank", "trade", "launder", "turfwar", "lineadd", "gang", "creation"} for name in names)


async def test_config_lists_every_command_once(tmp_path: Path):
    names = await registered(tmp_path)
    raw = tomllib.loads((ROOT / "config.toml").read_text())
    listed = [command for category in raw["access"]["categories"].values() for command in category["commands"]]
    assert len(listed) == len(set(listed))
    assert set(listed) == names


def test_config_toml_loads_every_rank_and_category():
    raw = tomllib.loads((ROOT / "config.toml").read_text())
    config = Config.from_mapping(raw, token="unused")
    assert set(config.coordinator_role_ids) == set(COORDINATOR_RANKS)
    cooldown_categories = set(DEPARTMENT_CATEGORIES) - {"Other", "Handpicked"}
    assert set(config.transfer_cooldown_role_ids) == cooldown_categories
    assert set(config.resignation_cooldown_role_ids) == cooldown_categories
    assert config.chain_of_command_channel_id == 1570223582271905802
    assert config.movement_channel_id == 1570223595848867840
    assert config.hours_channel_id == 1570223580346589204
    # Main LEO and Main FED share the Main Department divider.
    assert config.category_member_role_ids["Main LEO"] == config.category_member_role_ids["Main FED"]


def test_rank_index_uses_highest_rank():
    config = Config.from_mapping(tomllib.loads((ROOT / "config.toml").read_text()), token="unused")
    roles = {config.coordinator_role_ids["Department Coordinator"], config.coordinator_role_ids["Department Manager"]}
    assert config.rank_index(roles) == COORDINATOR_RANKS.index("Department Manager")
    assert config.rank_index(set()) is None


def test_armed_forces_config_loads():
    raw = tomllib.loads((ROOT / "config.armedforces.toml").read_text())
    config = Config.from_mapping(raw, token="x")
    assert list(config.positions)[0] == "Commander in Chief"
    assert config.level_roles["manager"] == tuple(list(config.positions.values())[:5])
    assert config.coord_team_role_id in config.coordinator_role_set()


def test_armed_forces_limits_department_role_changes():
    raw = tomllib.loads((ROOT / "config.armedforces.toml").read_text())
    assert Config.from_mapping(raw, token="x").strict_department_roles
