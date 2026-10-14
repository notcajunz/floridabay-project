from types import SimpleNamespace
from unittest.mock import AsyncMock

import discord
import pytest

from businessbot.role_policy import (
    assign_parole,
    can_manage_restricted_roles,
    category_conflict,
    is_restricted_role,
    sync_category_member_role,
)


class DatabaseStub:
    def __init__(self, base_role_ids):
        self.base_role_ids = base_role_ids

    async def fetch_all(self, query, params):
        assert "business_type=?" in query
        return [{"base_role_id": role_id} for role_id in self.base_role_ids]


def role(role_id, name):
    return SimpleNamespace(
        id=role_id,
        name=name,
        mention=f"<@&{role_id}>",
        color=discord.Color.blurple(),
    )


def member_with_roles(guild, roles):
    member = SimpleNamespace(id=50, guild=guild, roles=roles)
    member.add_roles = AsyncMock()
    member.remove_roles = AsyncMock()
    member.send = AsyncMock()
    return member


async def test_sync_category_member_role_adds_matching_member_role():
    business_role = role(10, "Example Business")
    category_role = role(20, "Car Clubs & Automotive Member")
    guild = SimpleNamespace(
        id=1,
        name="Test Server",
        roles=[business_role, category_role],
        get_role=lambda role_id: category_role if role_id == category_role.id else None,
    )
    member = member_with_roles(guild, [business_role])
    bot = SimpleNamespace(
        db=DatabaseStub([business_role.id]),
        config=SimpleNamespace(category_member_role_ids={"Car Clubs & Automotive": category_role.id}),
    )

    await sync_category_member_role(bot, member, "Car Clubs & Automotive")

    member.add_roles.assert_awaited_once_with(
        category_role, reason="Holds a registered Car Clubs & Automotive business role"
    )
    member.remove_roles.assert_not_awaited()
    member.send.assert_awaited_once()
    welcome = member.send.await_args.kwargs["embed"]
    assert welcome.title == "Welcome to Car Clubs & Automotive"
    assert category_role.mention in welcome.fields[0].value


async def test_sync_category_member_role_removes_orphaned_member_role():
    category_role = role(20, "Security & Protection Member")
    guild = SimpleNamespace(
        id=1,
        name="Test Server",
        roles=[category_role],
        get_role=lambda role_id: category_role if role_id == category_role.id else None,
    )
    member = member_with_roles(guild, [category_role])
    bot = SimpleNamespace(
        db=DatabaseStub([10]),
        config=SimpleNamespace(category_member_role_ids={"Security & Protection": category_role.id}),
    )

    await sync_category_member_role(bot, member, "Security & Protection")

    member.remove_roles.assert_awaited_once_with(
        category_role, reason="No longer holds a registered Security & Protection business role"
    )
    member.add_roles.assert_not_awaited()
    member.send.assert_not_awaited()


async def test_sync_category_member_role_keeps_role_for_another_business_in_category():
    other_business_role = role(11, "Another Miscellaneous Business")
    category_role = role(20, "Miscellaneous Member")
    guild = SimpleNamespace(
        id=1,
        name="Test Server",
        roles=[other_business_role, category_role],
        get_role=lambda role_id: category_role if role_id == category_role.id else None,
    )
    member = member_with_roles(guild, [other_business_role, category_role])
    bot = SimpleNamespace(
        db=DatabaseStub([10, other_business_role.id]),
        config=SimpleNamespace(
            category_member_role_ids={"Miscellaneous": category_role.id}
        ),
    )

    await sync_category_member_role(bot, member, "Miscellaneous")

    member.add_roles.assert_not_awaited()
    member.remove_roles.assert_not_awaited()
    member.send.assert_not_awaited()


async def test_assign_parole_dms_exact_expiration_timestamp():
    parole_role = role(30, "Misc. Resignation Cooldown")
    guild = SimpleNamespace(
        id=1,
        name="Test Server",
        get_role=lambda role_id: parole_role if role_id == parole_role.id else None,
    )
    member = member_with_roles(guild, [])
    db = SimpleNamespace(execute=AsyncMock())
    bot = SimpleNamespace(
        db=db,
        config=SimpleNamespace(
            parole_days=3,
            parole_role_ids={"Miscellaneous": parole_role.id},
        ),
    )

    assigned = await assign_parole(
        bot, member, {"name": "Example Business", "business_type": "Miscellaneous"}
    )

    assert assigned is parole_role
    member.add_roles.assert_awaited_once_with(
        parole_role, reason="Miscellaneous business parole"
    )
    member.send.assert_awaited_once()
    notice = member.send.await_args.kwargs["embed"]
    assert notice.title == "Miscellaneous Parole Notice"
    assert "Example Business" in notice.description
    assert ":F>" in notice.fields[1].value
    assert ":R>" in notice.fields[1].value


@pytest.mark.parametrize(
    "bypass_role_id",
    [1555764104034132088, 1555764242551148565, 1555764251165982760],
)
async def test_each_configured_role_bypasses_same_category_conflict(bypass_role_id):
    bypass_role = role(bypass_role_id, "Bypass")
    guild = SimpleNamespace(
        id=1, roles=[bypass_role], get_role=lambda role_id: None
    )
    member = member_with_roles(guild, [bypass_role])
    db = SimpleNamespace(fetch_all=AsyncMock())
    bot = SimpleNamespace(
        db=db,
        config=SimpleNamespace(
            multi_business_bypass_role_ids=(
                1555764104034132088,
                1555764242551148565,
                1555764251165982760,
            ),
            parole_role_ids={"Car Clubs & Automotive": 99},
        ),
    )

    conflict = await category_conflict(
        bot, member, {"id": 1, "business_type": "Car Clubs & Automotive"}
    )

    assert conflict is None
    db.fetch_all.assert_not_awaited()


def test_restricted_roles_are_matched_by_configured_id():
    config = SimpleNamespace(restricted_role_ids=(10, 11))
    assert is_restricted_role(role(10, "Renamed role"), config)
    assert not is_restricted_role(role(12, "Business Bypass"), config)


@pytest.mark.parametrize(
    ("role_id", "allowed"),
    [
        (10, True),
        (11, True),
        (12, False),
        (13, False),
    ],
)
def test_only_configured_director_roles_can_manage_restricted_roles(role_id, allowed):
    config = SimpleNamespace(
        owner_ids=frozenset(), restricted_role_manager_role_ids=(10, 11)
    )
    member = SimpleNamespace(id=50, roles=[role(role_id, "Any name")])
    assert can_manage_restricted_roles(member, config) is allowed


def test_configured_owner_can_manage_restricted_roles_without_director_role():
    owner_id = 1090083387638812755
    config = SimpleNamespace(
        owner_ids=frozenset({owner_id}), restricted_role_manager_role_ids=(10, 11)
    )
    member = SimpleNamespace(id=owner_id, roles=[])

    assert can_manage_restricted_roles(member, config)
