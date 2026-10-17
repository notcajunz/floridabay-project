import pytest

from deptbot.bot import DepartmentManagerBot
from deptbot.config import Config


def make(guild_id):
    return DepartmentManagerBot(Config.from_mapping({"bot": {"guild_id": guild_id}}, token="x"))


async def test_events_of_other_guilds_are_dropped():
    parsers = make(10)._connection.parsers
    # The real parser would fail on this empty payload, so None means it was skipped.
    assert parsers["MESSAGE_CREATE"]({"guild_id": "99"}) is None
    assert parsers["INTERACTION_CREATE"]({"guild_id": "99"}) is None
    assert parsers["GUILD_CREATE"]({"id": "99"}) is None
    with pytest.raises(Exception):
        parsers["MESSAGE_CREATE"]({"guild_id": "10"})
