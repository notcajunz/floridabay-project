from __future__ import annotations

import re

# Callsigns normally take one of these shapes (X is a digit):
#   X(letter)-XX        for example 2A-14
#   (letter)(letter)(optional letter)-XXX   for example AB-123 or ABC-123
# The Department of Homefront Security is the exception: plain three-digit numbers, set by its roster
# slots (101, 201, 401...).
STANDARD_FORMATS = (re.compile(r"^\d[A-Z]-\d{2}$"), re.compile(r"^[A-Z]{2,3}-\d{3}$"))
DHS_FORMATS = (re.compile(r"^\d{3}$"),)
DHS_NAME = re.compile(r"homefront|homeland|^d?hs$|^dohs$", re.IGNORECASE)

STYLE_EXAMPLES = {"standard": "2A-14 or ABC-123", "dhs": "201"}
STYLE_SAMPLES = {"standard": "2A-14", "dhs": "201"}


def callsign_style(department) -> str:
    """Which callsign shape a department uses: "dhs" for Homefront Security, "standard" for everyone else."""
    values = (department["name"], department["initials"] or "")
    return "dhs" if any(DHS_NAME.search(str(value).strip()) for value in values) else "standard"


def normalize_callsign(value: str) -> str:
    """Upper case with no stray spaces (a roster entry like "2a - 14" becomes "2A-14")."""
    return re.sub(r"\s*-\s*", "-", re.sub(r"\s+", " ", value.strip().upper()))


def matches_style(style: str, callsign: str) -> bool:
    formats = DHS_FORMATS if style == "dhs" else STANDARD_FORMATS
    return any(pattern.match(callsign) for pattern in formats)
