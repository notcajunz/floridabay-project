from __future__ import annotations

import io
from functools import lru_cache
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont, ImageOps

FONT_DIR = Path(__file__).parent / "assets" / "fonts"
TEXT_FIELDS = ("name", "rank", "callsign", "department")
MIN_FONT = 8
MAX_TEMPLATE_PIXELS = 4000 * 4000


class BadgeError(ValueError):
    """A ValueError so the bot shows the message to the user as-is."""


@lru_cache(maxsize=64)
def font_for(size: int, bold: bool, serif: bool = False) -> ImageFont.FreeTypeFont:
    family = "DejaVuSerif" if serif else "DejaVuSans"
    return ImageFont.truetype(str(FONT_DIR / f"{family}{'-Bold' if bold else ''}.ttf"), size)


def open_image(data: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:
        raise BadgeError("That file is not a picture I can read. Use a PNG, JPEG or WebP image.") from None
    if image.width * image.height > MAX_TEMPLATE_PIXELS:
        raise BadgeError("That picture is too large. Keep badges under 4000 by 4000 pixels.")
    return ImageOps.exif_transpose(image).convert("RGBA")


def fit_text(text: str, size: int, bold: bool, max_width: float, serif: bool = False) -> ImageFont.FreeTypeFont:
    """The largest font up to `size` whose text fits in `max_width` pixels."""
    font = font_for(size, bold, serif)
    while size > MIN_FONT and font.getlength(text) > max_width:
        size = max(MIN_FONT, int(size * 0.95))
        font = font_for(size, bold, serif)
    return font


def draw_bent_text(
    image: Image.Image, text: str, font: ImageFont.FreeTypeFont, fill: str, x: float, y: float,
    bend_a: float, bend_b: float,
) -> None:
    """Centre text on (x, y) and bend it along a banner: each column shifts by (a*u*u + b*u) of the picture
    height, u being its horizontal distance from x as a fraction of the picture width."""
    width, height = image.size
    left, top, right, bottom = font.getbbox(text, anchor="ls")
    pad = 4
    layer = Image.new("RGBA", (int(right - left) + 2 * pad, int(bottom - top) + 2 * pad), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((pad - left, pad - top), text, font=font, fill=fill, anchor="ls")
    baseline_row = pad - top
    cap = -font.getbbox("H", anchor="ls")[1]
    origin_x = x - layer.width / 2
    for column in range(layer.width):
        u = (origin_x + column - x) / width
        shift = (bend_a * u * u + bend_b * u) * height
        strip = layer.crop((column, 0, column + 1, layer.height))
        image.paste(strip, (round(origin_x + column), round(y + cap / 2 + shift - baseline_row)), strip)


def draw_text_fields(image: Image.Image, fields: dict[str, Any], values: dict[str, str]) -> None:
    width, height = image.size
    draw = ImageDraw.Draw(image)
    anchors = {"left": "lm", "center": "mm", "right": "rm"}
    for key in TEXT_FIELDS:
        field = fields.get(key) or {}
        text = (values.get(key) or "").strip()
        if not field.get("enabled") or not text:
            continue
        if field.get("uppercase"):
            text = text.upper()
        size = max(MIN_FONT, round(float(field["size"]) * height))
        font = fit_text(text, size, field.get("weight") == "bold", float(field["maxWidth"]) * width, field.get("font") == "serif")
        x, y = float(field["x"]) * width, float(field["y"]) * height
        bend_a, bend_b = float(field.get("bendA") or 0), float(field.get("bendB") or 0)
        if (bend_a or bend_b) and field.get("align", "center") == "center":
            draw_bent_text(image, text, font, field.get("color", "#ffffff"), x, y, bend_a, bend_b)
            continue
        draw.text((x, y), text, font=font, fill=field.get("color", "#ffffff"), anchor=anchors.get(field.get("align"), "mm"))


def draw_avatar(image: Image.Image, field: dict[str, Any], avatar: bytes | None) -> None:
    if not field.get("enabled") or not avatar:
        return
    width, height = image.size
    side = max(8, round(float(field["size"]) * width))
    picture = open_image(avatar)
    picture = ImageOps.fit(picture, (side, side), method=Image.Resampling.LANCZOS)
    mask = Image.new("L", (side, side), 0)
    drawer = ImageDraw.Draw(mask)
    if field.get("shape") == "circle":
        drawer.ellipse((0, 0, side - 1, side - 1), fill=255)
    else:
        drawer.rounded_rectangle((0, 0, side - 1, side - 1), radius=max(2, side // 16), fill=255)
    left = round(float(field["x"]) * width - side / 2)
    top = round(float(field["y"]) * height - side / 2)
    image.paste(picture, (left, top), mask)


def render_badge(template: bytes, fields: dict[str, Any], values: dict[str, str], avatar: bytes | None = None) -> bytes:
    """Fill a badge template with a member's text and profile picture. Returns PNG bytes."""
    image = open_image(template)
    draw_avatar(image, fields.get("avatar") or {}, avatar)
    draw_text_fields(image, fields, values)
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


def to_data_url(data: bytes) -> str:
    """Re-encode an uploaded template for the website API. PNG is preferred (the AI reads PNG only), shrinking
    the picture step by step before giving up and using a JPEG."""
    import base64

    image = open_image(data)
    longest = max(image.size)
    for side in (1600, 1200, 900):
        if longest > side:
            work = image.copy()
            work.thumbnail((side, side), Image.Resampling.LANCZOS)
        else:
            work = image
        out = io.BytesIO()
        work.save(out, format="PNG", optimize=True)
        if out.tell() <= 2_800_000:
            return f"data:image/png;base64,{base64.b64encode(out.getvalue()).decode()}"
    work = image.copy()
    work.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    for quality in (90, 75):
        out = io.BytesIO()
        work.convert("RGB").save(out, format="JPEG", quality=quality)
        if out.tell() <= 2_800_000:
            return f"data:image/jpeg;base64,{base64.b64encode(out.getvalue()).decode()}"
    raise BadgeError("That picture is still too large after shrinking it. Try a simpler picture.")
