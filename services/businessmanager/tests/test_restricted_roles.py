from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

from businessbot.cogs.events import EventsCog


def role(role_id, name):
    return SimpleNamespace(id=role_id, name=name, mention=f"<@&{role_id}>")


def make_cog(guild, actor):
    bot = SimpleNamespace(
        db=SimpleNamespace(),
        user=SimpleNamespace(id=999),
        config=SimpleNamespace(
            owner_ids=frozenset(),
            restricted_role_ids=(10,),
            restricted_role_manager_role_ids=(31,),
            member_log_channel_id=100,
        ),
    )
    cog = EventsCog(bot)
    cog._role_change_actor = AsyncMock(return_value=actor)
    return cog


async def test_native_restricted_role_add_is_reverted_for_non_director():
    dj = role(10, "DJ")
    actor = SimpleNamespace(id=20, mention="<@20>")
    actor_member = SimpleNamespace(id=actor.id, roles=[role(30, "Business Manager")])
    guild = SimpleNamespace(
        text_channels=[],
        get_member=lambda member_id: actor_member if member_id == actor.id else None,
        get_channel=lambda channel_id: None,
    )
    member = SimpleNamespace(
        id=40,
        mention="<@40>",
        guild=guild,
        add_roles=AsyncMock(),
        remove_roles=AsyncMock(),
    )
    cog = make_cog(guild, actor)

    added, removed = await cog._enforce_restricted_role_changes(member, [dj], [])

    member.remove_roles.assert_awaited_once_with(
        dj, reason="Reverted unauthorized restricted-role assignment"
    )
    member.add_roles.assert_not_awaited()
    assert added == [] and removed == []


async def test_native_restricted_role_remove_is_allowed_for_assistant_director():
    bypass = role(10, "Business Bypass")
    actor = SimpleNamespace(id=20, mention="<@20>")
    actor_member = SimpleNamespace(
        id=actor.id,
        roles=[role(31, "Assistant Business Director")]
    )
    guild = SimpleNamespace(
        text_channels=[],
        get_member=lambda member_id: actor_member if member_id == actor.id else None,
        get_channel=lambda channel_id: None,
    )
    member = SimpleNamespace(
        id=40,
        mention="<@40>",
        guild=guild,
        add_roles=AsyncMock(),
        remove_roles=AsyncMock(),
    )
    cog = make_cog(guild, actor)

    added, removed = await cog._enforce_restricted_role_changes(
        member, [], [bypass]
    )

    member.remove_roles.assert_not_awaited()
    member.add_roles.assert_not_awaited()
    assert added == [] and removed == [bypass]


async def test_audit_actor_must_match_the_changed_restricted_role():
    dj = role(10, "DJ")
    other = role(11, "Other")
    wrong_actor = SimpleNamespace(id=20)
    right_actor = SimpleNamespace(id=21)
    entries = [
        SimpleNamespace(
            target=SimpleNamespace(id=40),
            created_at=datetime.now(UTC),
            before=SimpleNamespace(roles=[]),
            after=SimpleNamespace(roles=[other]),
            user=wrong_actor,
        ),
        SimpleNamespace(
            target=SimpleNamespace(id=40),
            created_at=datetime.now(UTC),
            before=SimpleNamespace(roles=[]),
            after=SimpleNamespace(roles=[dj]),
            user=right_actor,
        ),
    ]

    async def audit_logs(**kwargs):
        for entry in entries:
            yield entry

    guild = SimpleNamespace(audit_logs=audit_logs)
    member = SimpleNamespace(id=40, guild=guild)
    cog = EventsCog(SimpleNamespace(db=SimpleNamespace()))

    actor = await cog._role_change_actor(member, added_role_ids={dj.id})

    assert actor is right_actor
