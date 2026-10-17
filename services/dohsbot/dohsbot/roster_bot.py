"""
DOHS Assistant — roster half. Discord slash commands that manage the
"FBRP | Department of Homeland Security" Google Sheet.

Commands
  /roster add             member name rank [timezone] [dc_rank]
  /roster move            member to:(Up | Down | <rank>)          <- move roles only
  /roster remove          member reason
  /roster dc              member direction:(Up | Down)
  /roster strike add      member reason
  /roster strike remove   member
  /roster loa start       member until [reason]
  /roster loa end         member
  /roster update rank     rank        (moves everyone up to fill the top of that rank)
  /roster update name     member name
  /roster update details  member field value
  /roster view            rank
  /roster lookup          callsign
  /roster info            member

Rules
  * You can only act on people below your own roster rank, and only add/move people
    into ranks below your own (admins can bypass if "admins_bypass" is on in config.json).
  * Add and move always use the first open slot of a rank, looking from the top.
  * When someone leaves a rank, everyone below them in that rank moves up to close the gap.
  * Callsign changes update the Discord nickname ("401 | Bob Smith") and rank roles.

How the sheet is treated
  * "Master Roster" is made of slots. Each slot row has a fixed callsign (col B)
    and rank (col E). Only the Name cell (col D) is typed in; every other column
    is a VLOOKUP into "Employee Database".
  * "Employee Database" holds one row per person (keyed by Discord ID, col E).
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import logging
import os
import re
import time
from dataclasses import dataclass

import discord
import gspread
from discord import app_commands
from discord.ext import tasks
from dotenv import load_dotenv

from .fbrp_api import FbrpApi, FbrpApiError
from .main_roles import expected_main_roles, plan_main_roles
from gspread.utils import ValueInputOption

load_dotenv()
log = logging.getLogger("dohs.roster")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # services/dohsbot
DATA_DIR = os.getenv("DOHS_DATA_DIR", os.path.join(HERE, "data"))
os.makedirs(DATA_DIR, exist_ok=True)

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "1BuHpA24zyQFGjbPkGsdClDiCvy_CBRKqG1fIYDCH_Tw")  # an ID, not a secret; access needs the service account
SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", os.path.join(HERE, "service_account.json"))
CONFIG_FILE = os.getenv("CONFIG_FILE", os.path.join(HERE, "config.json"))
LOA_FILE = os.getenv("LOA_FILE", os.path.join(DATA_DIR, "loa.json"))

LOW_COMMAND_ROLE = "1558238884092190762"
DEFAULT_CONFIG = {
    "guild_id": "",
    "fbrp_org_id": "3",
    "hours_channel_id": "",
    "hours_days": 7,
    "hours_required": 0,
    "hours_exempt_statuses": ["LOA", "Exempt", "Reserve"],
    "main_server_roles": {},
    "supervisor_min_rank": "Assistant Special Agent in Charge",
    "high_command_min_rank": "Chief of Staff",
    "main_sync_max_removals": 15,
    "keep_role_ids": [],
    "owner_ids": [],
    "bypass_role_ids": [],
    "move_role_ids": [LOW_COMMAND_ROLE],
    "staff_role_ids": [LOW_COMMAND_ROLE],
    "admins_bypass": False,
    "log_channel_id": "",
    "nickname_format": "{callsign} | {name}",
    "member_role_id": "",
    "rank_roles": {},
    "ladder_top_rank": "Section Chief",
    "ladder_exclude": ["Reserve Agent"],
    "coc_lowest_rank": "Chief of Staff",
    "coc_title": "DHS · Chain of Command",
    "coc_description": "The Department of Homeland Security hierarchy, from highest authority down.",
    "coc_thumbnail_url": "",
    "coc_colour": "#F1C40F",
    "movement_channel_id": "",
    "movement_ping": True,
    "movement_show_remove_reason": True,
    "callsign_channel_id": "",
}


def load_config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, encoding="utf-8") as f:
            cfg.update({k: v for k, v in json.load(f).items() if not k.startswith("_")})
    return cfg


def _id(value) -> int:
    return int(value) if str(value).strip().isdigit() else 0


def _id_set(values) -> set[int]:
    return {_id(v) for v in values if _id(v)}


CFG = load_config()
GUILD_ID = _id(CFG["guild_id"]) or _id(os.getenv("DISCORD_GUILD_ID", ""))
MOVE_ROLE_IDS = _id_set(CFG["move_role_ids"])
STAFF_ROLE_IDS = _id_set(CFG["staff_role_ids"]) | MOVE_ROLE_IDS
ADMINS_BYPASS = bool(CFG["admins_bypass"])
MAIN_ROLES = {k: str(_id(v)) for k, v in CFG["main_server_roles"].items() if _id(v)}
MAIN_SYNC_MAX_REMOVALS = int(CFG["main_sync_max_removals"])
KEEP_ROLE_IDS = _id_set(CFG["keep_role_ids"])  # network roles that survive a wipe
OWNER_IDS = _id_set(CFG["owner_ids"])              # these users pass every role and rank check
BYPASS_ROLE_IDS = _id_set(CFG["bypass_role_ids"])  # so do members holding any of these roles
LOG_CHANNEL_ID = _id(CFG["log_channel_id"])
NICKNAME_FORMAT = CFG["nickname_format"]
MEMBER_ROLE_ID = _id(CFG["member_role_id"])
RANK_ROLES = {k.strip().lower(): _id(v) for k, v in CFG["rank_roles"].items() if _id(v)}
LADDER_TOP_RANK = CFG["ladder_top_rank"]
LADDER_EXCLUDE = set(CFG["ladder_exclude"])
COC_LOWEST_RANK = CFG["coc_lowest_rank"]
COC_FILE = os.getenv("COC_FILE", os.path.join(DATA_DIR, "coc.json"))
MOVEMENT_CHANNEL_ID = _id(CFG["movement_channel_id"])
MOVEMENT_SHOW_REASON = bool(CFG["movement_show_remove_reason"])
CALLSIGN_CHANNEL_ID = _id(CFG["callsign_channel_id"])

ROSTER_SHEET = "Master Roster"
DB_SHEET = "Employee Database"
ROSTER_FIRST_ROW = 10  # first slot row on Master Roster
DB_FIRST_ROW = 8       # first person row on Employee Database

# DC ranks, highest first (matches the dropdown in Employee Database col S).
DC_RANKS = [
    "Department Director",
    "Assistant Department Director",
    "Department Manager",
    "Assistant Department Manager",
    "Lead Department Coordinator",
    "Senior Department Coordinator",
    "Department Coordinator",
    "Junior Department Coordinator",
]
STATUSES = ["Active", "Semi-Active", "Inactive", "Exempt", "LOA", "Reserve",
            "Suspended", "Terminated", "Resigned", "Vacant", "Management"]
TIMEZONES = ["GMT", "CET", "EST", "CST", "PST"]
ASSIGNMENTS = ["Needs Training", "Patrol", "Supervision", "Head of Training Unit",
               "Head of Training", "Head of Recruitment", "Head of Subdivision",
               "Department Head", "Head of Internal Affairs", "Department Overseer"]

# Column positions (0-based, A = 0)
R_CALLSIGN, R_DISCORD, R_NAME, R_RANK = 1, 2, 3, 4
D_BADGE, D_CALLSIGN, D_NAME, D_DISCORD, D_DNAME, D_RANK, D_RETIRED, D_STATUS, D_TZ = 1, 2, 3, 4, 5, 6, 7, 8, 9
D_SERVICE, D_HIRED, D_MOVED, D_TIR, D_NOTES, D_STRIKE1, D_STRIKE2, D_ASSIGN, D_DC = 10, 11, 12, 13, 14, 15, 16, 17, 18


def write_json(path: str, data) -> None:
    """Write via a temp file so a crash never leaves a half-written state file."""
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, path)


def clip(text, limit: int = 1000) -> str:
    """Discord rejects embed fields over 1024 characters; user text is cut before it gets there."""
    text = str(text)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def col(idx: int) -> str:
    return chr(ord("A") + idx)


def cell(row: list, idx: int) -> str:
    return str(row[idx]).strip() if idx < len(row) else ""


def truthy(value: str) -> bool:
    return str(value).strip().upper() == "TRUE"


def sheet_date(day: dt.date | None = None) -> int:
    """Google Sheets date serial (what the Hired/Movement Date cells already hold)."""
    return ((day or dt.date.today()) - dt.date(1899, 12, 30)).days


def parse_until(text: str) -> dt.date:
    """Accepts 2026-11-01, 01.11.2026, 01/11/2026, 14d, 2w."""
    t = text.strip().lower()
    today = dt.date.today()
    m = re.fullmatch(r"(\d+)\s*(d|day|days|w|week|weeks)", t)
    if m:
        n = int(m[1]) * (7 if m[2].startswith("w") else 1)
        if n > 366:
            raise RosterError("LOA can't be longer than a year.")
        return today + dt.timedelta(days=n)
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%y", "%d/%m/%y"):
        try:
            day = dt.datetime.strptime(t, fmt).date()
        except ValueError:
            continue
        if day < today:
            raise RosterError("That date is in the past.")
        if day > today + dt.timedelta(days=366):
            raise RosterError("LOA can't be longer than a year.")
        return day
    raise RosterError("Couldn't read that date. Use e.g. `2026-11-01`, `01.11.2026`, `14d` or `2w`.")


def db_row_formulas(r: int) -> dict[str, str]:
    """Formulas used on every Employee Database row (copied from the existing rows)."""
    return {
        f"C{r}": f"=IF($E{r}=\"\", \"N/A\", IFERROR(INDEX( 'Master Roster'!$B:$B, MATCH($E{r}, 'Master Roster'!$C:$C, 0)), \"\"))",
        f"G{r}": f"=IF($E{r}=\"\", \"N/A\", IFERROR(INDEX( 'Master Roster'!$E:$E, MATCH($E{r}, 'Master Roster'!$C:$C, 0)), \"\"))",
        f"K{r}": f"=IF($L{r}=\"\",\"\", IF($L{r}=\"N/A\",\"\", IF($I{r}=\"Terminated\",\"Terminated\", DAYS(TODAY(), $L{r}) & \" Days\")))",
        f"N{r}": f"=IF($I{r}=\"Terminated\",\"Terminated\",IF($M{r}=\"\",\"\", IF($M{r}=\"Terminated\", \"N/A\", IF($M{r}=\"Retired\", \"N/A\", IF($M{r}=\"N/A\",\"\", DAYS(TODAY(), $M{r}) & \" Days\")))))",
        f"T{r}": f"=IF($C{r}=\"N/A\", \"N/ADHS\" & RIGHT(TEXT($B{r},\"000\"),3), TEXT(LEFT($C{r},1)*10,\"00\") & \"DHS\" & RIGHT(TEXT($B{r},\"000\"),3))",
    }


# --------------------------------------------------------------------------- #
# Sheet logic
# --------------------------------------------------------------------------- #
class RosterError(Exception):
    """Shown to the Discord user as-is."""


def clean_text(value: str, limit: int) -> str:
    """Single-line text without control characters, capped for the sheet."""
    return re.sub(r"[\x00-\x1f\x7f]+", " ", str(value)).strip()[:limit]


@dataclass
class Actor:
    """The person running the command."""
    discord_id: int
    bypass: bool = False


@dataclass
class Slot:
    row: int
    callsign: str
    rank: str
    name: str

    @property
    def vacant(self) -> bool:
        return not self.name


@dataclass
class Person:
    row: int
    values: list

    def get(self, idx: int) -> str:
        return cell(self.values, idx)

    @property
    def name(self) -> str:
        return self.get(D_NAME)

    @property
    def discord_id(self) -> str:
        return self.get(D_DISCORD)


class Roster:
    def __init__(self, roster_ws, db_ws):
        self.roster_ws = roster_ws
        self.db_ws = db_ws
        self.slots: list[Slot] = []
        self.ranks: list[str] = []
        self.db: list[list] = []

    # ---------- reading ----------
    def load(self) -> None:
        roster_values = self.roster_ws.get_all_values()
        self.db = self.db_ws.get_all_values()
        self.slots = []
        last_rank = None
        for r, row in enumerate(roster_values[ROSTER_FIRST_ROW - 1:], start=ROSTER_FIRST_ROW):
            rank = cell(row, R_RANK)
            if not rank:
                last_rank = None
                continue
            if rank.startswith("#"):  # broken formula (e.g. #REF!) -> same rank as slot above
                if not last_rank:
                    continue
                rank = last_rank
            last_rank = rank
            self.slots.append(Slot(r, cell(row, R_CALLSIGN), rank, cell(row, R_NAME)))
        self.ranks = list(dict.fromkeys(s.rank for s in self.slots))

    @property
    def ladder(self) -> list[str]:
        """Ranks reachable with Up/Down: from ladder_top_rank down, minus excluded ranks."""
        ranks = [r for r in self.ranks if r not in LADDER_EXCLUDE]
        if LADDER_TOP_RANK in ranks:
            ranks = ranks[ranks.index(LADDER_TOP_RANK):]
        return ranks

    def person_by_id(self, discord_id: int | str) -> Person | None:
        did = str(discord_id)
        for r, row in enumerate(self.db[DB_FIRST_ROW - 1:], start=DB_FIRST_ROW):
            if cell(row, D_DISCORD) == did:
                return Person(r, row)
        return None

    def person_by_name(self, name: str) -> Person | None:
        for r, row in enumerate(self.db[DB_FIRST_ROW - 1:], start=DB_FIRST_ROW):
            if cell(row, D_NAME).lower() == name.lower():
                return Person(r, row)
        return None

    def slot_of(self, person: Person | None) -> Slot | None:
        if not person or not person.name:
            return None
        return next((s for s in self.slots if s.name.lower() == person.name.lower()), None)

    def match_rank(self, text: str) -> str:
        for r in self.ranks:
            if r.lower() == text.strip().lower():
                return r
        raise RosterError(f"Unknown rank **{text}**. Pick one from the list.")

    def first_vacant(self, rank: str) -> Slot:
        slot = next((s for s in self.slots if s.rank == rank and s.vacant), None)
        if not slot:
            raise RosterError(f"There are no open **{rank}** slots. Add more slots to the sheet first.")
        return slot

    def need_person(self, discord_id: int) -> Person:
        person = self.person_by_id(discord_id)
        if not person:
            raise RosterError("That member isn't in the Employee Database.")
        return person

    def require_on_roster(self, discord_id: int) -> tuple[Person, Slot]:
        person = self.need_person(discord_id)
        slot = self.slot_of(person)
        if not slot:
            raise RosterError(f"**{person.name}** isn't on the Master Roster.")
        return person, slot

    # ---------- permission: rank cap ----------
    def check_cap(self, actor: Actor, person: Person | None = None, target_rank: str | None = None) -> None:
        """Actor may only act on people below their own rank and only use ranks below their own."""
        if actor.bypass:
            return
        me = self.slot_of(self.person_by_id(actor.discord_id))
        if not me:
            raise RosterError("You aren't on the Master Roster, so your rank can't be checked.")
        mine = self.ranks.index(me.rank)
        if person is not None:
            if str(person.discord_id) == str(actor.discord_id):
                raise RosterError("You can't use this on yourself.")
            theirs = self.slot_of(person)
            if theirs and self.ranks.index(theirs.rank) <= mine:
                raise RosterError(f"You can only manage people below your own rank (**{me.rank}**).")
        if target_rank is not None and self.ranks.index(target_rank) <= mine:
            raise RosterError(f"You can only put people into ranks below your own (**{me.rank}**).")

    # ---------- writing ----------
    @staticmethod
    def _write(ws, cells: dict, mode=ValueInputOption.raw) -> None:
        if cells:
            ws.batch_update([{"range": a1, "values": [[v]]} for a1, v in cells.items()],
                            value_input_option=mode)

    def _next_badge(self) -> str:
        nums = [int(cell(r, D_BADGE)) for r in self.db[DB_FIRST_ROW - 1:] if cell(r, D_BADGE).isdigit()]
        return str(max(nums, default=0) + 1).zfill(4)

    def _free_db_row(self) -> int:
        for r, row in enumerate(self.db[DB_FIRST_ROW - 1:], start=DB_FIRST_ROW):
            if not cell(row, D_NAME) and not cell(row, D_DISCORD):
                return r
        r = max(len(self.db) + 1, DB_FIRST_ROW)
        if r > self.db_ws.row_count:
            self.db_ws.add_rows(50)
        return r

    def _compact(self, rank: str) -> list[dict]:
        """Move everyone in a rank up so filled slots are at the top (order kept). Data must be loaded."""
        slots = [s for s in self.slots if s.rank == rank]
        names = [s.name for s in slots if s.name]
        cells, changes = {}, []
        for i, slot in enumerate(slots):
            new_name = names[i] if i < len(names) else ""
            if slot.name != new_name:
                cells[f"D{slot.row}"] = new_name
            if new_name:
                old_slot = next(s for s in slots if s.name == new_name)
                if old_slot.row != slot.row:
                    p = self.person_by_name(new_name)
                    changes.append({"name": new_name, "discord_id": p.discord_id if p else "", "rank": rank,
                                    "old_callsign": old_slot.callsign, "new_callsign": slot.callsign})
        self._write(self.roster_ws, cells)
        return changes

    # ---------- commands ----------
    def add(self, actor: Actor, discord_id: int, discord_name: str, name: str, rank: str,
            timezone: str | None, dc_rank: str | None) -> dict:
        """1) write the person into Employee Database, 2) put their name in the first open slot."""
        self.load()
        rank = self.match_rank(rank)
        self.check_cap(actor, target_rank=rank)
        name = clean_text(name, 60)
        if not name:
            raise RosterError("Name can't be empty.")
        person = self.person_by_id(discord_id)
        if person and self.slot_of(person):
            s = self.slot_of(person)
            raise RosterError(f"**{person.name}** is already on the roster as {s.rank} ({s.callsign}).")
        same_name = self.person_by_name(name)
        if same_name and (not person or same_name.row != person.row):
            raise RosterError(f"Someone else in the Employee Database is already named **{name}**.")
        slot = self.first_vacant(rank)

        today = sheet_date()
        if person:  # re-hire: reuse their existing row
            r = person.row
            row_cells = {}
            if person.get(D_STATUS) in ("Terminated", "Resigned", "Vacant", "") or not person.get(D_HIRED):
                row_cells[f"{col(D_HIRED)}{r}"] = today
            badge = person.get(D_BADGE)
        else:
            r = self._free_db_row()
            existing = self.db[r - 1] if r - 1 < len(self.db) else []
            badge = cell(existing, D_BADGE)
            row_cells = {f"{col(D_HIRED)}{r}": today}
            if not badge:  # brand-new row with no template -> add the formulas
                badge = self._next_badge()
                row_cells[f"{col(D_BADGE)}{r}"] = badge
                self._write(self.db_ws, db_row_formulas(r), ValueInputOption.user_entered)
            row_cells[f"{col(D_STRIKE1)}{r}"] = False
            row_cells[f"{col(D_STRIKE2)}{r}"] = False
            row_cells[f"{col(D_ASSIGN)}{r}"] = "Needs Training"

        row_cells.update({
            f"{col(D_NAME)}{r}": name,
            f"{col(D_DISCORD)}{r}": str(discord_id),
            f"{col(D_DNAME)}{r}": discord_name,
            f"{col(D_RETIRED)}{r}": "",
            f"{col(D_STATUS)}{r}": "Active",
            f"{col(D_MOVED)}{r}": today,
        })
        if timezone:
            row_cells[f"{col(D_TZ)}{r}"] = timezone
        if dc_rank:
            row_cells[f"{col(D_DC)}{r}"] = dc_rank
        self._write(self.db_ws, row_cells)
        self._write(self.roster_ws, {f"D{slot.row}": name})
        return {"name": name, "rank": rank, "callsign": slot.callsign, "badge": badge,
                "rehire": person is not None}

    def move(self, actor: Actor, discord_id: int, target: str) -> dict:
        """target = 'up', 'down', or a rank name. Old rank closes its gap afterwards."""
        self.load()
        person, old = self.require_on_roster(discord_id)
        t = target.strip().lower()
        if t in ("up", "down"):
            ladder = self.ladder
            if old.rank not in ladder:
                raise RosterError(f"**{old.rank}** isn't on the Up/Down ladder — pick the rank directly.")
            i = ladder.index(old.rank) + (-1 if t == "up" else 1)
            if i < 0:
                raise RosterError(f"**{person.name}** is at the top of the Up/Down ladder "
                                  f"({LADDER_TOP_RANK}). Pick a higher rank directly.")
            if i >= len(ladder):
                raise RosterError(f"**{person.name}** is already at the lowest rank.")
            rank = ladder[i]
        else:
            rank = self.match_rank(target)
        if rank == old.rank:
            raise RosterError(f"**{person.name}** is already a **{rank}**.")
        self.check_cap(actor, person, rank)
        new = self.first_vacant(rank)

        # Write the new slot before clearing the old one so the name is never lost.
        self._write(self.roster_ws, {f"D{new.row}": person.name})
        self._write(self.roster_ws, {f"D{old.row}": ""})
        self._write(self.db_ws, {f"{col(D_MOVED)}{person.row}": sheet_date()})
        self.load()
        shifted = self._compact(old.rank)

        a, b = self.ranks.index(old.rank), self.ranks.index(new.rank)
        return {"name": person.name, "discord_id": person.discord_id,
                "kind": "promote" if b < a else "demote",
                "old_rank": old.rank, "old_callsign": old.callsign,
                "new_rank": new.rank, "new_callsign": new.callsign, "shifted": shifted}

    def remove(self, actor: Actor, discord_id: int, reason: str) -> dict:
        self.load()
        person, slot = self.require_on_roster(discord_id)
        self.check_cap(actor, person)
        self._write(self.roster_ws, {f"D{slot.row}": ""})
        self._write(self.db_ws, {
            f"{col(D_STATUS)}{person.row}": reason,
            f"{col(D_RETIRED)}{person.row}": slot.rank,
            f"{col(D_MOVED)}{person.row}": sheet_date(),
        })
        self.load()
        shifted = self._compact(slot.rank)
        return {"name": person.name, "rank": slot.rank, "callsign": slot.callsign, "shifted": shifted}

    def compact(self, actor: Actor, rank: str) -> list[dict]:
        self.load()
        rank = self.match_rank(rank)
        self.check_cap(actor, target_rank=rank)
        return self._compact(rank)

    def rename(self, actor: Actor, discord_id: int, name: str) -> dict:
        self.load()
        person = self.need_person(discord_id)
        self.check_cap(actor, person)
        name = clean_text(name, 60)
        if not name:
            raise RosterError("Name can't be empty.")
        other = self.person_by_name(name)
        if other and other.row != person.row:
            raise RosterError(f"Someone else is already named **{name}**.")
        slot = self.slot_of(person)
        self._write(self.db_ws, {f"{col(D_NAME)}{person.row}": name})
        if slot:  # the roster looks people up by name, so the slot has to be renamed too
            self._write(self.roster_ws, {f"D{slot.row}": name})
        return {"old": person.name, "new": name, "callsign": slot.callsign if slot else "",
                "rank": slot.rank if slot else ""}

    def dc(self, actor: Actor, discord_id: int, direction: int) -> dict:
        """direction -1 = up (towards Department Director), +1 = down."""
        self.load()
        person = self.need_person(discord_id)
        self.check_cap(actor, person)
        current = person.get(D_DC)
        if current not in DC_RANKS:
            if direction > 0:
                raise RosterError(f"**{person.name}** has no DC rank to lower.")
            new = DC_RANKS[-1]  # first DC promotion starts at the bottom
        else:
            i = DC_RANKS.index(current) + direction
            if i < 0:
                raise RosterError(f"**{person.name}** is already at the top DC rank.")
            if i >= len(DC_RANKS):
                raise RosterError(f"**{person.name}** is already at the lowest DC rank. "
                                  "Use `/roster update details field:DC Rank value:none` to clear it.")
            new = DC_RANKS[i]
        self._write(self.db_ws, {f"{col(D_DC)}{person.row}": new})
        return {"name": person.name, "old": current or "None", "new": new}

    def strike(self, actor: Actor, discord_id: int, add: bool) -> dict:
        self.load()
        person = self.need_person(discord_id)
        self.check_cap(actor, person)
        s1, s2 = truthy(person.get(D_STRIKE1)), truthy(person.get(D_STRIKE2))
        if add:
            if s1 and s2:
                raise RosterError(f"**{person.name}** already has 2 strikes.")
            idx = D_STRIKE2 if s1 else D_STRIKE1
            value = True
        else:
            if not s1 and not s2:
                raise RosterError(f"**{person.name}** has no strikes to remove.")
            idx = D_STRIKE2 if s2 else D_STRIKE1
            value = False
        self._write(self.db_ws, {f"{col(idx)}{person.row}": value})
        count = int(s1) + int(s2) + (1 if add else -1)
        return {"name": person.name, "count": count}

    def loa_start(self, actor: Actor, discord_id: int) -> dict:
        self.load()
        person = self.need_person(discord_id)
        self.check_cap(actor, person)
        old = person.get(D_STATUS) or "Active"
        if old == "LOA":
            raise RosterError(f"**{person.name}** is already on LOA.")
        self._write(self.db_ws, {f"{col(D_STATUS)}{person.row}": "LOA"})
        return {"name": person.name, "previous": old}

    def loa_end(self, discord_id: int, previous: str) -> str | None:
        """Sets status back to `previous` if it's still LOA. Returns their name, or None if nothing changed."""
        self.load()
        person = self.person_by_id(discord_id)
        if not person or person.get(D_STATUS) != "LOA":
            return None
        self._write(self.db_ws, {f"{col(D_STATUS)}{person.row}": previous or "Active"})
        return person.name

    DETAIL_FIELDS = {
        "status": ("Status", D_STATUS),
        "timezone": ("Time Zone", D_TZ),
        "notes": ("Notes", D_NOTES),
        "assignment": ("Assignment", D_ASSIGN),
        "dc_rank": ("DC Rank", D_DC),
        "discord_name": ("Discord Name", D_DNAME),
    }
    DETAIL_CHOICES = {"status": STATUSES, "timezone": TIMEZONES,
                      "assignment": ASSIGNMENTS, "dc_rank": DC_RANKS}

    def update_detail(self, actor: Actor, discord_id: int, field: str, value: str) -> dict:
        self.load()
        person = self.need_person(discord_id)
        self.check_cap(actor, person)
        label, idx = self.DETAIL_FIELDS[field]
        value = clean_text(value, 500)
        old = person.get(idx)
        new: object = value
        if field == "dc_rank" and value.lower() in ("none", "clear", "-", ""):
            new = ""
        elif field in self.DETAIL_CHOICES:
            match = next((c for c in self.DETAIL_CHOICES[field] if c.lower() == value.lower()), None)
            if not match:
                raise RosterError(f"**{value}** isn't a valid {label}. Options: "
                                  + ", ".join(self.DETAIL_CHOICES[field]))
            new = match
        self._write(self.db_ws, {f"{col(idx)}{person.row}": new})
        return {"name": person.name, "field": label, "old": old or "—", "new": str(new) or "—"}

    # ---------- read-only ----------
    def coc(self) -> list[dict]:
        """High Command+: every rank from the top down to coc_lowest_rank, with each slot's holder."""
        self.load()
        ranks = self.ranks
        if COC_LOWEST_RANK in ranks:
            ranks = ranks[:ranks.index(COC_LOWEST_RANK) + 1]
        out = []
        for rank in ranks:
            holders = []
            for s in self.slots:
                if s.rank != rank:
                    continue
                p = self.person_by_name(s.name) if s.name else None
                holders.append({"callsign": s.callsign, "name": s.name,
                                "discord_id": p.discord_id if p else ""})
            out.append({"rank": rank, "holders": holders})
        return out

    def members(self) -> list[dict]:
        """Everyone on a roster slot, with the facts the hours report needs."""
        self.load()
        out = []
        for s in self.slots:
            if not s.name:
                continue
            p = self.person_by_name(s.name)
            out.append({"name": s.name, "rank": s.rank, "callsign": s.callsign,
                        "discord_id": p.discord_id if p else "", "status": p.get(D_STATUS) if p else ""})
        return out

    def view(self, rank: str) -> dict:
        self.load()
        rank = self.match_rank(rank)
        slots = [s for s in self.slots if s.rank == rank]
        filled = []
        for s in slots:
            if s.name:
                p = self.person_by_name(s.name)
                filled.append({"callsign": s.callsign, "name": s.name,
                               "discord_id": p.discord_id if p else "",
                               "status": p.get(D_STATUS) if p else ""})
        vacant = [s.callsign for s in slots if s.vacant]
        return {"rank": rank, "filled": filled, "vacant": vacant, "total": len(slots)}

    def lookup(self, callsign: str) -> dict:
        self.load()
        slot = next((s for s in self.slots if s.callsign == callsign.strip()), None)
        if not slot:
            raise RosterError(f"Callsign **{callsign}** doesn't exist on the roster.")
        if slot.vacant:
            return {"callsign": slot.callsign, "rank": slot.rank, "name": "", "discord_id": "", "status": "Vacant"}
        p = self.person_by_name(slot.name)
        return {"callsign": slot.callsign, "rank": slot.rank, "name": slot.name,
                "discord_id": p.discord_id if p else "", "status": p.get(D_STATUS) if p else ""}

    def info(self, discord_id: int) -> dict:
        self.load()
        person = self.need_person(discord_id)
        slot = self.slot_of(person)
        g = person.get
        strikes = int(truthy(g(D_STRIKE1))) + int(truthy(g(D_STRIKE2)))
        return {
            "Name": person.name, "Badge": g(D_BADGE) or "—",
            "Callsign": slot.callsign if slot else "—", "Rank": slot.rank if slot else "Not on roster",
            "DC Rank": g(D_DC) or "—", "Status": g(D_STATUS) or "—", "Time Zone": g(D_TZ) or "—",
            "Assignment": g(D_ASSIGN) or "—", "Time in Service": g(D_SERVICE) or "—",
            "Time in Rank": g(D_TIR) or "—", "Strikes": f"{strikes}/2", "Notes": g(D_NOTES) or "—",
        }


# --------------------------------------------------------------------------- #
# LOA storage (so LOAs can end automatically)
# --------------------------------------------------------------------------- #
class CocStore:
    """Remembers where the Chain of Command message lives so it can be edited."""
    def __init__(self, path: str):
        self.path = path
        self.channel_id = 0
        self.message_id = 0
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                d = json.load(f)
            self.channel_id, self.message_id = int(d.get("channel_id", 0)), int(d.get("message_id", 0))

    def set(self, channel_id: int, message_id: int) -> None:
        self.channel_id, self.message_id = channel_id, message_id
        write_json(self.path, {"channel_id": str(channel_id), "message_id": str(message_id)})


def coc_embed(data: list[dict]) -> discord.Embed:
    try:
        colour = discord.Colour.from_str(CFG["coc_colour"])
    except (ValueError, TypeError):
        colour = discord.Colour.gold()
    e = discord.Embed(title=CFG["coc_title"], description=CFG["coc_description"], colour=colour)
    if CFG["coc_thumbnail_url"]:
        e.set_thumbnail(url=CFG["coc_thumbnail_url"])
    members = 0
    for i, entry in enumerate(data, start=1):
        rank = entry["rank"]
        role = RANK_ROLES.get(rank.lower())
        lines = [f"<@&{role}>"] if role else []
        for h in entry["holders"] or [{"name": "", "discord_id": "", "callsign": ""}]:
            if h["name"]:
                members += 1
                who = f"<@{h['discord_id']}>" if h["discord_id"] else ""
                label = f"{h['callsign']} | {h['name']}" if h["callsign"] else h["name"]
                lines.append(f"└ {who} `{label}`" if who else f"└ {label}")
            else:
                lines.append("└ *Vacant*")
        e.add_field(name=f"{i:02d} {rank}", value="\n".join(lines)[:1024], inline=False)
    e.set_footer(text=f"{members} member(s) · Updates automatically")
    e.timestamp = discord.utils.utcnow()
    return e


class LoaStore:
    def __init__(self, path: str):
        self.path = path
        self.data: dict[str, dict] = {}
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                self.data = json.load(f)

    def save(self) -> None:
        write_json(self.path, self.data)

    def set(self, discord_id: int, until: dt.date, previous: str, reason: str) -> None:
        self.data[str(discord_id)] = {"until": until.isoformat(), "previous": previous, "reason": reason}
        self.save()

    def pop(self, discord_id: int | str) -> dict | None:
        entry = self.data.pop(str(discord_id), None)
        self.save()
        return entry

    def due(self) -> list[tuple[str, dict]]:
        today = dt.date.today()
        return [(k, v) for k, v in self.data.items() if dt.date.fromisoformat(v["until"]) < today]


# --------------------------------------------------------------------------- #
# Discord bot
# --------------------------------------------------------------------------- #
class GuildTree(app_commands.CommandTree):
    """Only answers inside the configured DOHS server, never in DMs or other servers."""

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if GUILD_ID and interaction.guild_id != GUILD_ID:
            raise app_commands.CheckFailure("This bot only works in the DOHS server.")
        if interaction.guild_id is None:
            raise app_commands.CheckFailure("Use this in the server, not in DMs.")
        return True


class RosterBot(discord.Client):
    def __init__(self):
        super().__init__(intents=discord.Intents.default())
        self.tree = GuildTree(self)
        self.extra_groups: list = []
        self.api = FbrpApi()
        self._sheet_warned = False
        self._recent_adds: dict[str, float] = {}
        self.tree.on_error = self.on_app_command_error
        self.lock = asyncio.Lock()
        self.roster: Roster | None = None
        self.loa = LoaStore(LOA_FILE)
        self.coc = CocStore(COC_FILE)
        self._coc_last: list | None = None

    def connect_sheet(self) -> None:
        """Open the roster sheet. Raises if the service account key is missing or has no access."""
        gc = gspread.service_account(filename=SERVICE_ACCOUNT_FILE)
        book = gc.open_by_key(SPREADSHEET_ID)
        roster = Roster(book.worksheet(ROSTER_SHEET), book.worksheet(DB_SHEET))
        roster.load()
        unknown = [r for r in CFG["rank_roles"] if _id(CFG["rank_roles"][r]) and r not in roster.ranks]
        if unknown:
            log.warning("config.json rank_roles has ranks not on the sheet: %s", ", ".join(unknown))
        self.roster = roster
        log.info("Roster sheet connected: %d slots across %d ranks", len(roster.slots), len(roster.ranks))

    async def try_connect_sheet(self) -> bool:
        if self.roster is not None:
            return True
        try:
            await asyncio.to_thread(self.connect_sheet)
        except Exception as error:  # missing key, no share, quota: keep the rest of the bot running
            if not self._sheet_warned:
                log.warning("Roster sheet not connected (%s: %s). Roster commands are off; hours still work.",
                            type(error).__name__, error)
                self._sheet_warned = True
            return False
        return True

    async def setup_hook(self):
        await self.try_connect_sheet()
        self.tree.add_command(RosterGroup(self))
        for extra in self.extra_groups:
            self.tree.add_command(extra(self))
        if GUILD_ID:
            guild = discord.Object(id=GUILD_ID)
            self.tree.copy_global_to(guild=guild)
            self.tree.clear_commands(guild=None)
            await self.tree.sync(guild=guild)
            await self.tree.sync()  # global set is now empty: removes commands from any other server
        else:
            await self.tree.sync()
        self.loa_loop.start()

    async def run_sheet(self, fn, *args):
        if self.roster is None:
            raise RosterError("The roster sheet isn't connected yet. Staff: add the Google service account key.")
        async with self.lock:  # one sheet edit at a time
            return await asyncio.to_thread(fn, *args)

    # ---------- background: end LOAs and refresh autocomplete ----------
    # ---------- Chain of Command message ----------
    async def refresh_coc(self, force: bool = False) -> None:
        """Re-read the roster and edit the Chain of Command message if anything changed."""
        if not self.coc.message_id or self.roster is None:
            return
        data = await self.run_sheet(self.roster.coc)
        if data == self._coc_last and not force:
            return
        channel = self.get_channel(self.coc.channel_id)
        try:
            if channel is None:
                channel = await self.fetch_channel(self.coc.channel_id)
            msg = channel.get_partial_message(self.coc.message_id)
            await msg.edit(embed=coc_embed(data), allowed_mentions=discord.AllowedMentions.none())
            self._coc_last = data
        except discord.NotFound:
            log.warning("Chain of Command message was deleted; run /roster coc setup again.")
            self.coc.set(0, 0)
        except discord.HTTPException:
            log.exception("Couldn't update the Chain of Command message")

    @tasks.loop(minutes=10)
    async def loa_loop(self):
        try:
            if self.roster is None and not await self.try_connect_sheet():
                return
            for did, entry in self.loa.due():
                name = await self.run_sheet(self.roster.loa_end, did, entry.get("previous", "Active"))
                self.loa.pop(did)
                if name:
                    await self.post_log(discord.Embed(
                        title="🟢 LOA ended", colour=discord.Colour.green(),
                        description=f"<@{did}> ({name}) is back to **{entry.get('previous') or 'Active'}**.",
                        timestamp=discord.utils.utcnow()))
            await self.run_sheet(self.roster.load)
            await self.refresh_coc()  # also picks up edits made by hand in the sheet
            try:
                await self.sync_main_roles()
            except (FbrpApiError, RosterError):
                log.warning("Main-server role sync failed", exc_info=True)
        except Exception:
            log.exception("LOA check failed")

    @loa_loop.before_loop
    async def before_loa_loop(self):
        await self.wait_until_ready()

    # ---------- errors ----------
    async def on_app_command_error(self, interaction: discord.Interaction, error: app_commands.AppCommandError):
        original = getattr(error, "original", error)
        if isinstance(original, RosterError):
            msg = f"❌ {original}"
        elif isinstance(error, app_commands.CheckFailure):
            msg = f"❌ {error}" if str(error) else "❌ You don't have permission to do that."
        else:
            log.exception("Command failed", exc_info=original)
            msg = "❌ Something went wrong talking to the sheet. Check the bot console."
        if interaction.response.is_done():
            await interaction.followup.send(msg, ephemeral=True)
        else:
            await interaction.response.send_message(msg, ephemeral=True)

    # ---------- Discord side effects ----------
    async def post_log(self, e: discord.Embed, skip_channel_id: int | None = None) -> None:
        if not LOG_CHANNEL_ID or LOG_CHANNEL_ID == skip_channel_id:
            return
        channel = self.get_channel(LOG_CHANNEL_ID)
        if channel:
            try:
                await channel.send(embed=e)
            except discord.HTTPException:
                log.warning("Couldn't post to log channel %s", LOG_CHANNEL_ID)

    async def get_member(self, guild: discord.Guild, discord_id) -> discord.Member | None:
        if not discord_id or not str(discord_id).isdigit():
            return None
        try:
            return guild.get_member(int(discord_id)) or await guild.fetch_member(int(discord_id))
        except discord.NotFound:
            return None

    async def set_nickname(self, guild, discord_id, callsign: str | None, name: str | None) -> str | None:
        """callsign+name -> '401 | Bob Smith'; both None -> reset nickname. Returns a warning or None."""
        member = await self.get_member(guild, discord_id)
        if not member:
            return f"<@{discord_id}> isn't in this server." if discord_id else None
        if name is None:
            nick = None
        else:
            nick = (NICKNAME_FORMAT.replace("{callsign}", callsign).replace("{name}", name) if callsign else name)[:32]
        try:
            if member.nick != nick:
                await member.edit(nick=nick, reason="Roster update")
        except discord.Forbidden:
            return (f"Couldn't change {member.mention}'s nickname — the bot needs **Manage Nicknames** "
                    "and its role must be above theirs (server owners can't be renamed).")
        return None

    async def sync_roles(self, guild, discord_id, rank: str | None) -> str | None:
        """Give the role for `rank` (+ member role) and remove other rank roles. rank=None removes all."""
        if not RANK_ROLES and not MEMBER_ROLE_ID:
            return None
        member = await self.get_member(guild, discord_id)
        if not member:
            return None
        managed = set(RANK_ROLES.values()) | ({MEMBER_ROLE_ID} if MEMBER_ROLE_ID else set())
        want = set()
        if rank:
            if RANK_ROLES.get(rank.lower()):
                want.add(RANK_ROLES[rank.lower()])
            if MEMBER_ROLE_ID:
                want.add(MEMBER_ROLE_ID)
        have = {r.id for r in member.roles}
        remove = [guild.get_role(i) for i in (have & managed) - want]
        add = [guild.get_role(i) for i in want - have]
        remove, add = [r for r in remove if r], [r for r in add if r]
        try:
            if remove:
                await member.remove_roles(*remove, reason="Roster update")
            if add:
                await member.add_roles(*add, reason="Roster update")
        except discord.Forbidden:
            return (f"Couldn't change {member.mention}'s roles — the bot needs **Manage Roles** "
                    "and its role must be above the rank roles.")
        return None

    async def dm(self, discord_id, guild: discord.Guild, title: str, text: str,
                 colour: discord.Colour = discord.Colour.blurple()) -> None:
        member = await self.get_member(guild, discord_id)
        if not member:
            return
        e = discord.Embed(title=title, description=text, colour=colour, timestamp=discord.utils.utcnow())
        e.set_author(name=guild.name, icon_url=guild.icon.url if guild.icon else None)
        try:
            await member.send(embed=e)
        except discord.HTTPException:
            log.info("Couldn't DM %s (DMs closed)", member)

    # ---------- Movement / Callsign channels ----------
    async def post_channel(self, channel_id: int, e: discord.Embed, content: str | None = None,
                           ping_user: int | str | None = None) -> None:
        if not channel_id:
            return
        try:
            channel = self.get_channel(channel_id) or await self.fetch_channel(channel_id)
            mentions = (discord.AllowedMentions(users=[discord.Object(int(ping_user))], roles=False, everyone=False)
                        if ping_user else discord.AllowedMentions.none())
            await channel.send(content=content, embed=e, allowed_mentions=mentions)
        except (discord.HTTPException, ValueError):
            log.warning("Couldn't post to channel %s", channel_id)

    async def announce_movement(self, discord_id, label: str, actor_id) -> None:
        """Same line as the staff and IAA bots: `@member --> Rank | @actor | date`, no pings."""
        if not MOVEMENT_CHANNEL_ID:
            return
        line = f"<@{discord_id}> --> {label} | <@{actor_id}> | <t:{int(time.time())}:D>"
        await self.post_plain(MOVEMENT_CHANNEL_ID, line)

    async def announce_callsigns(self, entries: list[tuple]) -> None:
        """One `@member --> 123` line per new or changed callsign, like the staff and IAA feeds."""
        lines = [f"<@{who}> --> {cs}" for who, cs in entries if who and cs]
        if lines and CALLSIGN_CHANNEL_ID:
            await self.post_plain(CALLSIGN_CHANNEL_ID, "\n".join(lines)[:2000])

    async def post_plain(self, channel_id: int, content: str) -> None:
        try:
            channel = self.get_channel(channel_id) or await self.fetch_channel(channel_id)
            await channel.send(content=content, allowed_mentions=discord.AllowedMentions.none())
        except discord.HTTPException:
            log.warning("Couldn't post to channel %s", channel_id)

    # ---------- main-server DHS roles (applied by the main bot) ----------
    async def sync_main_roles(self, force: bool = False) -> dict:
        """Make the main server's DHS / Supervisor / High Command roles match the roster.

        The main bot owns that server, so this only computes the difference and queues it through the
        portal API. A pass that would remove more than `main_sync_max_removals` roles is refused unless
        `force`, so a bad sheet read can't strip everyone.
        """
        if not MAIN_ROLES.get("base") or self.roster is None or not self.api.configured:
            return {"skipped": True}
        people = await self.run_sheet(self.roster.members)
        if not people:
            return {"skipped": True, "reason": "the roster has nobody on it"}
        expected = expected_main_roles(people, self.roster.ranks, MAIN_ROLES,
                                       CFG["supervisor_min_rank"], CFG["high_command_min_rank"])
        holders = (await self.api.service_role_holders("dohs"))["holders"]
        # The bot owners keep whatever DHS roles they hold; they are not on the roster by design.
        changes, removals = plan_main_roles(expected, holders, list(MAIN_ROLES.values()),
                                            exempt={str(i) for i in OWNER_IDS})
        blocked = removals > MAIN_SYNC_MAX_REMOVALS and not force
        now = time.monotonic()
        self._recent_adds = {k: t for k, t in self._recent_adds.items() if now - t < 6 * 3600}
        # An add the main bot can't finish (member left the main server) must not be re-queued every pass.
        fresh = [c for c in changes
                 if c["action"] == "remove" or f"{c['discord_id']}:{c['role_id']}" not in self._recent_adds]
        apply = [c for c in fresh if c["action"] == "add"] if blocked else fresh
        for c in apply:
            if c["action"] == "add":
                self._recent_adds[f"{c['discord_id']}:{c['role_id']}"] = now
        for c in apply:
            c["reason"] = "DOHS roster-bound role"
        queued = await self.api.queue_service_roles(apply) if apply else 0
        if blocked:
            await self.post_log(discord.Embed(
                title="⚠️ Main-server role sync held back", colour=discord.Colour.orange(),
                description=(f"It wants to remove **{removals}** DHS roles in the main server, above the safety "
                             f"limit of {MAIN_SYNC_MAX_REMOVALS}. Adds were queued, removals were not. "
                             "Check the roster, then run `/roster sync-main force:True`."),
                timestamp=discord.utils.utcnow()))
        elif queued:
            adds = sum(1 for c in apply if c["action"] == "add")
            await self.post_log(discord.Embed(
                title="🔗 Main-server DHS roles synced", colour=discord.Colour.dark_teal(),
                description=f"Queued **{adds}** role grants and **{removals}** removals for the main bot.",
                timestamp=discord.utils.utcnow()))
        return {"queued": queued, "removals": removals, "blocked": blocked}

    async def strip_main_roles(self, discord_id) -> None:
        """Immediately ask the main bot to take every DHS role from one person."""
        if not MAIN_ROLES or not self.api.configured or not str(discord_id).isdigit():
            return
        await self.api.queue_service_roles([
            {"discord_id": str(discord_id), "role_id": rid, "action": "remove", "reason": "Left the DOHS roster"}
            for rid in MAIN_ROLES.values()])

    async def wipe_roles(self, guild: discord.Guild, discord_id) -> str | None:
        """Take every role the bot can edit, except network roles in keep_role_ids."""
        member = await self.get_member(guild, discord_id)
        if not member:
            return None
        me = guild.me
        drop = [r for r in member.roles
                if r != guild.default_role and not r.managed and r.id not in KEEP_ROLE_IDS
                and me is not None and r < me.top_role]
        try:
            if drop:
                await member.remove_roles(*drop, reason="DOHS roster removal")
        except discord.Forbidden:
            return f"Couldn't wipe {member.mention}'s roles — the bot's role must be above them."
        return None

    async def kick_member(self, guild: discord.Guild, discord_id, reason: str) -> str | None:
        member = await self.get_member(guild, discord_id)
        if not member:
            return None
        try:
            await member.kick(reason=reason[:400])
        except discord.Forbidden:
            return f"Couldn't kick {member.mention} — the bot needs **Kick Members** and a role above theirs."
        return None

    async def apply_shifted(self, guild, shifted: list[dict]) -> list[str]:
        """Nicknames for people who moved up to close a gap."""
        return [await self.set_nickname(guild, c["discord_id"], c["new_callsign"], c["name"]) for c in shifted]


def is_bypass(user) -> bool:
    if user.id in OWNER_IDS:
        return True
    if not isinstance(user, discord.Member):
        return False
    if BYPASS_ROLE_IDS and any(r.id in BYPASS_ROLE_IDS for r in user.roles):
        return True
    return ADMINS_BYPASS and user.guild_permissions.administrator


def has_any_role(user, role_ids: set[int]) -> bool:
    if not isinstance(user, discord.Member):
        return False
    return is_bypass(user) or any(r.id in role_ids for r in user.roles)


def roster_staff():
    def predicate(interaction: discord.Interaction) -> bool:
        if has_any_role(interaction.user, STAFF_ROLE_IDS):
            return True
        raise app_commands.CheckFailure("You don't have permission to edit the roster.")
    return app_commands.check(predicate)


def move_roles():
    def predicate(interaction: discord.Interaction) -> bool:
        if has_any_role(interaction.user, MOVE_ROLE_IDS):
            return True
        raise app_commands.CheckFailure("Only **Low Command** and above can move people on the roster.")
    return app_commands.check(predicate)


def actor(interaction: discord.Interaction) -> Actor:
    return Actor(interaction.user.id, is_bypass(interaction.user))


def embed(title: str, colour: discord.Colour, lines: dict, by: discord.abc.User,
          warnings: list[str | None] | None = None, shifted: list[dict] | None = None) -> discord.Embed:
    e = discord.Embed(title=title, colour=colour, timestamp=discord.utils.utcnow())
    for k, v in lines.items():
        e.add_field(name=k, value=clip(v) or "—", inline=True)
    if shifted:
        text = "\n".join(f"{c['name']}: {c['old_callsign']} → **{c['new_callsign']}**" for c in shifted)
        e.add_field(name="Moved up to fill the gap", value=text[:1024], inline=False)
    warnings = [w for w in (warnings or []) if w]
    if warnings:
        e.add_field(name="⚠️ Discord", value="\n".join(warnings)[:1024], inline=False)
    e.set_footer(text=f"By {by.display_name}")
    return e


def shifted_entries(shifted: list[dict]) -> list[tuple]:
    return [(c["discord_id"], c["new_callsign"]) for c in shifted]


async def send(bot: RosterBot, interaction: discord.Interaction, e: discord.Embed):
    await interaction.followup.send(embed=e)
    await bot.post_log(e, skip_channel_id=interaction.channel_id)
    await bot.refresh_coc()
    try:
        await bot.sync_main_roles()
    except (FbrpApiError, RosterError):
        log.warning("Main-server role sync failed", exc_info=True)


# ---------- autocomplete ----------
def _bot(interaction: discord.Interaction) -> RosterBot:
    return interaction.client  # type: ignore[return-value]


async def rank_autocomplete(interaction: discord.Interaction, current: str):
    roster = _bot(interaction).roster
    ranks = roster.ranks if roster else []
    return [app_commands.Choice(name=r, value=r) for r in ranks if current.lower() in r.lower()][:25]


async def move_target_autocomplete(interaction: discord.Interaction, current: str):
    options = [("⬆️ Up one rank", "up"), ("⬇️ Down one rank", "down")]
    roster = _bot(interaction).roster
    options += [(r, r) for r in (roster.ranks if roster else [])]
    return [app_commands.Choice(name=n, value=v) for n, v in options if current.lower() in n.lower()][:25]


async def filled_callsign_autocomplete(interaction: discord.Interaction, current: str):
    roster = _bot(interaction).roster
    slots = roster.slots if roster else []
    out = [s for s in slots if s.callsign and (current in s.callsign or current.lower() in s.name.lower())]
    out.sort(key=lambda s: s.vacant)
    return [app_commands.Choice(name=f"{s.callsign} — {s.name or 'vacant'} ({s.rank})"[:100], value=s.callsign)
            for s in out][:25]


async def detail_value_autocomplete(interaction: discord.Interaction, current: str):
    field = interaction.namespace.field or ""
    options = list(Roster.DETAIL_CHOICES.get(field, []))
    if field == "dc_rank":
        options.append("none")
    return [app_commands.Choice(name=o, value=o) for o in options if current.lower() in o.lower()][:25]


# ---------- /roster update ... ----------
class UpdateGroup(app_commands.Group):
    def __init__(self, bot: RosterBot):
        super().__init__(name="update", description="Update a rank or a member")
        self.bot = bot

    @app_commands.command(name="rank", description="Move everyone in a rank up to fill the top slots")
    @app_commands.describe(rank="Rank to tidy up")
    @app_commands.autocomplete(rank=rank_autocomplete)
    @roster_staff()
    async def cmd_rank(self, interaction: discord.Interaction, rank: str):
        await interaction.response.defer()
        changes = await self.bot.run_sheet(self.bot.roster.compact, actor(interaction), rank)
        if not changes:
            await interaction.followup.send(f"✅ **{rank}** has no gaps — nothing to move.")
            return
        warnings = await self.bot.apply_shifted(interaction.guild, changes)
        await send(self.bot, interaction, embed(f"🔼 {rank} updated", discord.Colour.blurple(), {},
                                                interaction.user, warnings, changes))
        await self.bot.announce_callsigns(shifted_entries(changes))

    @app_commands.command(name="name", description="Change a member's in-game name")
    @app_commands.describe(member="Discord member", name="New in-game name")
    @roster_staff()
    async def cmd_name(self, interaction: discord.Interaction, member: discord.Member, name: str):
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.rename, actor(interaction), member.id, name)
        warn = await self.bot.set_nickname(interaction.guild, member.id, r["callsign"], r["new"])
        await send(self.bot, interaction, embed("✏️ Name updated", discord.Colour.blurple(), {
            "Member": member.mention, "From": r["old"], "To": r["new"]}, interaction.user, [warn]))

    @app_commands.command(name="details", description="Update status, time zone, notes, assignment and more")
    @app_commands.choices(field=[app_commands.Choice(name=label, value=key)
                                 for key, (label, _) in Roster.DETAIL_FIELDS.items()])
    @app_commands.autocomplete(value=detail_value_autocomplete)
    @roster_staff()
    async def cmd_details(self, interaction: discord.Interaction, member: discord.Member,
                          field: app_commands.Choice[str], value: str):
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.update_detail, actor(interaction), member.id, field.value, value)
        await send(self.bot, interaction, embed("✏️ Member updated", discord.Colour.blurple(), {
            "Member": member.mention, "Field": r["field"], "From": r["old"], "To": r["new"]}, interaction.user))


# ---------- /roster strike ... ----------
class StrikeGroup(app_commands.Group):
    def __init__(self, bot: RosterBot):
        super().__init__(name="strike", description="Give or remove strikes")
        self.bot = bot

    @app_commands.command(name="add", description="Give a member a strike")
    @app_commands.describe(member="Discord member", reason="Why they're getting a strike")
    @roster_staff()
    async def cmd_add(self, interaction: discord.Interaction, member: discord.Member, reason: str):
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.strike, actor(interaction), member.id, True)
        e = embed("⚠️ Strike given", discord.Colour.orange(), {
            "Member": member.mention, "Name": r["name"], "Strikes": f"{r['count']}/2", "Reason": reason},
            interaction.user)
        if r["count"] >= 2:
            e.colour = discord.Colour.red()
            e.add_field(name="🚨 2 strikes", value=f"**{r['name']}** has reached 2 strikes.", inline=False)
        await send(self.bot, interaction, e)

    @app_commands.command(name="remove", description="Remove a member's latest strike")
    @roster_staff()
    async def cmd_remove(self, interaction: discord.Interaction, member: discord.Member):
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.strike, actor(interaction), member.id, False)
        await send(self.bot, interaction, embed("✅ Strike removed", discord.Colour.green(), {
            "Member": member.mention, "Name": r["name"], "Strikes": f"{r['count']}/2"}, interaction.user))


# ---------- /roster loa ... ----------
class LoaGroup(app_commands.Group):
    def __init__(self, bot: RosterBot):
        super().__init__(name="loa", description="Leave of absence")
        self.bot = bot

    @app_commands.command(name="start", description="Put a member on LOA until a date")
    @app_commands.describe(member="Discord member",
                           until="Last day of LOA, e.g. 01.11.2026, 2026-11-01, 14d or 2w",
                           reason="Optional reason")
    @roster_staff()
    async def cmd_start(self, interaction: discord.Interaction, member: discord.Member, until: str,
                        reason: str | None = None):
        day = parse_until(until)
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.loa_start, actor(interaction), member.id)
        self.bot.loa.set(member.id, day, r["previous"], reason or "")
        await send(self.bot, interaction, embed("🌴 LOA started", discord.Colour.teal(), {
            "Member": member.mention, "Name": r["name"], "Until": day.strftime("%d.%m.%Y"),
            "Back to": r["previous"], "Reason": reason or "—"}, interaction.user))

    @app_commands.command(name="end", description="End a member's LOA now")
    @roster_staff()
    async def cmd_end(self, interaction: discord.Interaction, member: discord.Member):
        await interaction.response.defer()
        entry = self.bot.loa.pop(member.id) or {}
        previous = entry.get("previous") or "Active"
        name = await self.bot.run_sheet(self.bot.roster.loa_end, member.id, previous)
        if not name:
            raise RosterError(f"{member.mention} isn't on LOA.")
        await send(self.bot, interaction, embed("🟢 LOA ended", discord.Colour.green(), {
            "Member": member.mention, "Name": name, "Status": previous}, interaction.user))


# ---------- /roster coc ... ----------
class CocGroup(app_commands.Group):
    def __init__(self, bot: RosterBot):
        super().__init__(name="coc", description="Chain of Command message (High Command and above)")
        self.bot = bot

    @app_commands.command(name="setup", description="Post the Chain of Command here; it updates automatically")
    @app_commands.describe(channel="Channel to post in (default: this channel)")
    @roster_staff()
    async def cmd_setup(self, interaction: discord.Interaction, channel: discord.TextChannel | None = None):
        await interaction.response.defer(ephemeral=True)
        channel = channel or interaction.channel
        data = await self.bot.run_sheet(self.bot.roster.coc)
        try:
            msg = await channel.send(embed=coc_embed(data), allowed_mentions=discord.AllowedMentions.none())
        except discord.Forbidden:
            raise RosterError(f"I can't send messages in {channel.mention}.")
        old_channel, old_message = self.bot.coc.channel_id, self.bot.coc.message_id
        self.bot.coc.set(channel.id, msg.id)
        self.bot._coc_last = data
        if old_message:  # remove the previous one so there's only one live copy
            try:
                old = self.bot.get_channel(old_channel) or await self.bot.fetch_channel(old_channel)
                await old.get_partial_message(old_message).delete()
            except discord.HTTPException:
                pass
        await interaction.followup.send(f"✅ Chain of Command posted in {channel.mention}. "
                                        "It updates whenever the roster changes.", ephemeral=True)

    @app_commands.command(name="refresh", description="Update the Chain of Command message now")
    @roster_staff()
    async def cmd_refresh(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        if not self.bot.coc.message_id:
            raise RosterError("There's no Chain of Command message yet. Run `/roster coc setup` first.")
        await self.bot.refresh_coc(force=True)
        await interaction.followup.send("✅ Chain of Command updated.", ephemeral=True)


# ---------- /roster ... ----------
class RosterGroup(app_commands.Group):
    def __init__(self, bot: RosterBot):
        super().__init__(name="roster", description="Manage the DHS roster")
        self.bot = bot
        self.add_command(UpdateGroup(bot))
        self.add_command(StrikeGroup(bot))
        self.add_command(LoaGroup(bot))
        self.add_command(CocGroup(bot))

    @app_commands.command(name="add", description="Add a member to the Employee Database and the roster")
    @app_commands.describe(member="Discord member", name="In-game name", rank="Starting rank",
                           timezone="Time zone", dc_rank="DC rank (optional)")
    @app_commands.autocomplete(rank=rank_autocomplete)
    @app_commands.choices(
        timezone=[app_commands.Choice(name=t, value=t) for t in TIMEZONES],
        dc_rank=[app_commands.Choice(name=d, value=d) for d in DC_RANKS],
    )
    @roster_staff()
    async def cmd_add(self, interaction: discord.Interaction, member: discord.Member, name: str, rank: str,
                      timezone: app_commands.Choice[str] | None = None,
                      dc_rank: app_commands.Choice[str] | None = None):
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.add, actor(interaction), member.id, member.name, name, rank,
                                     timezone.value if timezone else None, dc_rank.value if dc_rank else None)
        g = interaction.guild
        warns = [await self.bot.set_nickname(g, member.id, r["callsign"], r["name"]),
                 await self.bot.sync_roles(g, member.id, r["rank"])]
        await send(self.bot, interaction, embed(
            "✅ Member re-hired" if r["rehire"] else "✅ Member added", discord.Colour.green(),
            {"Member": member.mention, "Name": r["name"], "Rank": r["rank"],
             "Callsign": r["callsign"] or "—", "Badge": r["badge"]}, interaction.user, warns))
        await self.bot.dm(member.id, g, "Welcome to DHS",
                          f"You've been added to the roster as **{r['rank']}** with callsign "
                          f"**{r['callsign'] or '—'}**.", discord.Colour.green())
        await self.bot.announce_movement(member.id, r["rank"], interaction.user.id)
        await self.bot.announce_callsigns([(member.id, r["callsign"])])

    @app_commands.command(name="move", description="Promote, demote or move a member to a rank")
    @app_commands.describe(member="Discord member", to="Up, Down, or a specific rank")
    @app_commands.autocomplete(to=move_target_autocomplete)
    @move_roles()
    async def cmd_move(self, interaction: discord.Interaction, member: discord.Member, to: str):
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.move, actor(interaction), member.id, to)
        g = interaction.guild
        warns = [await self.bot.set_nickname(g, member.id, r["new_callsign"], r["name"]),
                 await self.bot.sync_roles(g, member.id, r["new_rank"])]
        warns += await self.bot.apply_shifted(g, r["shifted"])
        up = r["kind"] == "promote"
        title = "⬆️ Member promoted" if up else "⬇️ Member demoted"
        colour = discord.Colour.green() if up else discord.Colour.orange()
        await send(self.bot, interaction, embed(title, colour, {
            "Member": member.mention, "Name": r["name"],
            "From": f"{r['old_rank']} ({r['old_callsign'] or '—'})",
            "To": f"{r['new_rank']} ({r['new_callsign'] or '—'})",
        }, interaction.user, warns, r["shifted"]))
        await self.bot.dm(member.id, g, "You've been promoted" if up else "You've been demoted",
                          f"Your new rank is **{r['new_rank']}** with callsign **{r['new_callsign'] or '—'}**.",
                          colour)
        await self.bot.announce_movement(member.id, r["new_rank"], interaction.user.id)
        await self.bot.announce_callsigns([(member.id, r["new_callsign"])] + shifted_entries(r["shifted"]))

    @app_commands.command(name="remove", description="Remove a member from the roster")
    @app_commands.choices(reason=[app_commands.Choice(name=s, value=s)
                                  for s in ("Terminated", "Resigned", "Inactive", "Suspended")])
    @roster_staff()
    async def cmd_remove(self, interaction: discord.Interaction, member: discord.Member,
                         reason: app_commands.Choice[str]):
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.remove, actor(interaction), member.id, reason.value)
        self.bot.loa.pop(member.id)
        g = interaction.guild
        # DM first so they still share the server context when it arrives
        await self.bot.dm(member.id, g, "Removed from DHS",
                          f"You've been removed from the roster.\n**Reason:** {reason.value}",
                          discord.Colour.red())
        warns = [await self.bot.set_nickname(g, member.id, None, None),
                 await self.bot.sync_roles(g, member.id, None)]
        warns += await self.bot.apply_shifted(g, r["shifted"])
        terminated, resigned = reason.value == "Terminated", reason.value == "Resigned"
        outcome = "Roster slot cleared, DHS roles removed"
        try:
            await self.bot.strip_main_roles(member.id)  # main-server DHS roles go through the main bot
        except FbrpApiError as error:
            warns.append(f"Couldn't queue the main-server role removal ({error}). The 10-minute sync will retry.")
        if terminated or resigned:
            warns.append(await self.bot.wipe_roles(g, member.id))
            outcome = "Roster slot cleared, all roles wiped"
        if terminated:
            warns.append(await self.bot.kick_member(g, member.id, f"Terminated by {interaction.user} ({interaction.user.id})"))
            outcome += ", kicked from this server"
        await send(self.bot, interaction, embed("🗑️ Member removed", discord.Colour.red(), {
            "Member": member.mention, "Name": r["name"], "Was": f"{r['rank']} ({r['callsign'] or '—'})",
            "Reason": reason.value, "Result": outcome}, interaction.user, warns, r["shifted"]))
        await self.bot.announce_movement(member.id, reason.value if MOVEMENT_SHOW_REASON else "Removed",
                                         interaction.user.id)
        await self.bot.announce_callsigns(shifted_entries(r["shifted"]))

    @app_commands.command(name="sync-main", description="Match the main server's DHS roles to the roster now")
    @app_commands.describe(force="Apply a large number of removals (bypass users only)")
    @roster_staff()
    async def cmd_sync_main(self, interaction: discord.Interaction, force: bool = False):
        await interaction.response.defer(ephemeral=True)
        if force and not is_bypass(interaction.user):
            raise RosterError("Only the bot owners can force a large removal.")
        try:
            r = await self.bot.sync_main_roles(force=force)
        except FbrpApiError as error:
            raise RosterError(f"Couldn't reach the main bot: {error}") from None
        if r.get("skipped"):
            why = r.get("reason") or "main-server roles are not configured"
            raise RosterError(f"Nothing to sync ({why}).")
        text = (f"Queued **{r['queued']}** changes ({r['removals']} removals). The main bot applies them within seconds."
                if not r["blocked"] else
                f"Held back **{r['removals']}** removals (over the safety limit). Re-run with `force:True` after checking the roster.")
        await interaction.followup.send("🔗 " + text, ephemeral=True)

    @app_commands.command(name="dc", description="Move a member's DC rank up or down")
    @app_commands.choices(direction=[app_commands.Choice(name="Up", value="up"),
                                     app_commands.Choice(name="Down", value="down")])
    @roster_staff()
    async def cmd_dc(self, interaction: discord.Interaction, member: discord.Member,
                     direction: app_commands.Choice[str]):
        await interaction.response.defer()
        up = direction.value == "up"
        r = await self.bot.run_sheet(self.bot.roster.dc, actor(interaction), member.id, -1 if up else +1)
        colour = discord.Colour.green() if up else discord.Colour.orange()
        await send(self.bot, interaction, embed(
            "⬆️ DC rank raised" if up else "⬇️ DC rank lowered", colour,
            {"Member": member.mention, "Name": r["name"], "From": r["old"], "To": r["new"]}, interaction.user))
        await self.bot.dm(member.id, interaction.guild, "DC rank raised" if up else "DC rank lowered",
                          f"Your DC rank is now **{r['new']}**.", colour)

    @app_commands.command(name="view", description="See who holds each callsign in a rank")
    @app_commands.autocomplete(rank=rank_autocomplete)
    async def cmd_view(self, interaction: discord.Interaction, rank: str):
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.view, rank)
        lines = [f"`{p['callsign'] or '—':>3}` {p['name']}"
                 + (f" <@{p['discord_id']}>" if p["discord_id"] else "")
                 + (f" · *{p['status']}*" if p["status"] and p["status"] not in ("Active", "Exempt") else "")
                 for p in r["filled"]]
        text = "\n".join(lines) or "*Nobody holds this rank yet.*"
        if len(text) > 3900:
            text = text[:3900].rsplit("\n", 1)[0] + "\n…"
        e = discord.Embed(title=f"📋 {r['rank']} — {len(r['filled'])}/{r['total']}",
                          description=text, colour=discord.Colour.dark_teal())
        if r["vacant"]:
            e.set_footer(text=f"{len(r['vacant'])} open · next open slot: {r['vacant'][0] or '—'}")
        await interaction.followup.send(embed=e, allowed_mentions=discord.AllowedMentions.none())

    @app_commands.command(name="lookup", description="Find who holds a callsign")
    @app_commands.autocomplete(callsign=filled_callsign_autocomplete)
    async def cmd_lookup(self, interaction: discord.Interaction, callsign: str):
        await interaction.response.defer()
        r = await self.bot.run_sheet(self.bot.roster.lookup, callsign)
        e = discord.Embed(title=f"🔎 Callsign {r['callsign']}", colour=discord.Colour.dark_teal())
        e.add_field(name="Rank", value=r["rank"])
        e.add_field(name="Name", value=r["name"] or "*Vacant*")
        if r["discord_id"]:
            e.add_field(name="Member", value=f"<@{r['discord_id']}>")
        e.add_field(name="Status", value=r["status"] or "—")
        await interaction.followup.send(embed=e, allowed_mentions=discord.AllowedMentions.none())

    @app_commands.command(name="info", description="Show a member's roster record")
    @roster_staff()
    async def cmd_info(self, interaction: discord.Interaction, member: discord.Member):
        await interaction.response.defer(ephemeral=True)
        r = await self.bot.run_sheet(self.bot.roster.info, member.id)
        loa = self.bot.loa.data.get(str(member.id))
        if loa:
            r["LOA until"] = dt.date.fromisoformat(loa["until"]).strftime("%d.%m.%Y")
        await interaction.followup.send(embed=embed(f"📋 {r['Name']}", discord.Colour.dark_teal(), r,
                                                    interaction.user), ephemeral=True)
