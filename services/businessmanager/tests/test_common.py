import discord
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from businessbot.common import (
    reply,
    require_business_add_remove,
    require_business_manager_plus,
    require_role_management_admin,
    without_embed_emojis,
)


class Recorder:
    def __init__(self, done: bool = False):
        self.done = done
        self.kwargs = None

    def is_done(self):
        return self.done

    async def send_message(self, **kwargs):
        self.kwargs = kwargs

    async def send(self, **kwargs):
        self.kwargs = kwargs


class InteractionStub:
    def __init__(self, done: bool = False):
        self.response = Recorder(done)
        self.followup = Recorder()


async def test_reply_omits_unused_optional_payload_fields():
    interaction = InteractionStub()
    await reply(interaction, "Coordinator added")
    assert interaction.response.kwargs == {
        "content": "Coordinator added",
        "ephemeral": True,
    }


async def test_reply_uses_followup_after_defer_without_null_view():
    interaction = InteractionStub(done=True)
    await reply(interaction, "Finished")
    assert interaction.followup.kwargs == {
        "content": "Finished",
        "ephemeral": True,
    }


def test_without_embed_emojis_cleans_every_text_section():
    embed = discord.Embed(title="🏆 Title", description="Hello 😀 world")
    embed.set_author(name="👑 Author")
    embed.add_field(name="💵 Cash", value="100 <:business:123456>")
    embed.set_footer(text="Updated 🔷")

    cleaned = without_embed_emojis(embed)

    assert cleaned.title == "Title"
    assert cleaned.description == "Hello world"
    assert cleaned.author.name == "Author"
    assert cleaned.fields[0].name == "Cash"
    assert cleaned.fields[0].value == "100"
    assert cleaned.footer.text == "Updated"


async def test_owner_bypasses_strict_role_only_command_checks():
    owner_id = 1090083387638812755
    interaction = SimpleNamespace(
        user=SimpleNamespace(id=owner_id),
        client=SimpleNamespace(config=SimpleNamespace(owner_ids=frozenset({owner_id}))),
    )

    assert await require_business_manager_plus(interaction)
    assert await require_role_management_admin(interaction)


@pytest.mark.parametrize("role_id", [101, 102, 1555764267905458316])
async def test_business_add_remove_allows_manager_plus_and_creation_role(role_id):
    config = SimpleNamespace(
        business_manager_plus_role_ids=(101, 102),
        business_add_remove_role_id=1555764267905458316,
    )
    member = MagicMock(spec=discord.Member)
    member.roles = [SimpleNamespace(id=role_id)]
    interaction = SimpleNamespace(
        client=SimpleNamespace(config=config),
        user=member,
    )

    assert await require_business_add_remove(interaction) is True
