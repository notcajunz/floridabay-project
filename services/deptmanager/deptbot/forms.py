from __future__ import annotations

import logging
import re
from collections.abc import Awaitable, Callable

import discord

from .common import clean_text, without_embed_emojis
from .services import parse_color

log = logging.getLogger(__name__)

DEFAULT_COLOR = 0x5865F2
_LINK = re.compile(r"discord(?:app)?\.com/channels/(?:\d+|@me)/(\d+)/(\d+)")


def parse_message_ref(value: str) -> tuple[int | None, int]:
    """A message ID, or a message link (which also names its channel): (channel_id or None, message_id)."""
    value = value.strip().rstrip("/")
    link = _LINK.search(value)
    if link:
        return int(link.group(1)), int(link.group(2))
    final = value.rsplit("/", 1)[-1]
    if not final.isdigit():
        raise ValueError("Message must be a Discord message ID or message link.")
    return None, int(final)


def clean_image_url(value: str | None) -> str | None:
    value = (value or "").strip()
    if not value:
        return None
    if not re.match(r"^https?://\S+$", value):
        raise ValueError("The image must be a direct http(s) link to a picture.")
    return value


def build_embed(
    title: str | None, description: str, color: str | None = None,
    footer: str | None = None, image: str | None = None,
) -> discord.Embed:
    """Validate the form fields and make the embed. Raises ValueError with a user-facing message."""
    embed = discord.Embed(
        title=clean_text(title, 256) if title and title.strip() else None,
        description=clean_text(description, 4000),
        color=parse_color(color) if color and color.strip() else DEFAULT_COLOR,
    )
    if footer and footer.strip():
        embed.set_footer(text=clean_text(footer, 256))
    url = clean_image_url(image)
    if url:
        embed.set_image(url=url)
    return without_embed_emojis(embed)


def embed_defaults(embed: discord.Embed | None) -> dict[str, str]:
    """Form values for an existing embed, so editing shows what is already there."""
    if embed is None:
        return {}
    return {
        "title": embed.title or "",
        "description": embed.description or "",
        "color": f"#{embed.color.value:06X}" if embed.color else f"#{DEFAULT_COLOR:06X}",
        "footer": embed.footer.text if embed.footer and embed.footer.text else "",
        "image": embed.image.url if embed.image and embed.image.url else "",
    }


class EmbedForm(discord.ui.Modal):
    """The pop-up form for writing or editing an embed. Existing values come pre-filled."""

    def __init__(
        self, heading: str, submit: Callable[[discord.Interaction, discord.Embed], Awaitable[None]],
        defaults: dict[str, str] | None = None,
    ):
        super().__init__(title=heading[:45], timeout=900)
        defaults = defaults or {}
        if len(defaults.get("description", "")) > 4000:
            raise ValueError("That embed's description is too long to edit in a form (4000 characters at most).")
        self._submit = submit
        self.title_input = discord.ui.TextInput(
            label="Title", required=False, max_length=256, default=defaults.get("title") or None,
            placeholder="Optional headline",
        )
        self.description_input = discord.ui.TextInput(
            label="Description", style=discord.TextStyle.paragraph, required=True, max_length=4000,
            default=defaults.get("description") or None,
        )
        self.color_input = discord.ui.TextInput(
            label="Color (hex)", required=False, max_length=7, default=defaults.get("color") or "#5865F2",
        )
        self.footer_input = discord.ui.TextInput(
            label="Footer", required=False, max_length=256, default=defaults.get("footer") or None,
        )
        self.image_input = discord.ui.TextInput(
            label="Image link", required=False, max_length=500, default=defaults.get("image") or None,
            placeholder="https://… (optional)",
        )
        for item in (self.title_input, self.description_input, self.color_input, self.footer_input, self.image_input):
            self.add_item(item)

    async def on_submit(self, interaction: discord.Interaction) -> None:
        embed = build_embed(
            self.title_input.value, self.description_input.value, self.color_input.value,
            self.footer_input.value, self.image_input.value,
        )
        await self._submit(interaction, embed)

    async def on_error(self, interaction: discord.Interaction, error: Exception) -> None:
        if isinstance(error, (ValueError, KeyError)):
            message = str(error).strip("'")
        elif isinstance(error, discord.Forbidden):
            message = "Discord refused that action. Check the bot's permissions in that channel."
        else:
            log.exception("Embed form failed", exc_info=error)
            message = "Something went wrong while saving that. The error was logged."
        if interaction.response.is_done():
            await interaction.followup.send(message, ephemeral=True)
        else:
            await interaction.response.send_message(message, ephemeral=True)
