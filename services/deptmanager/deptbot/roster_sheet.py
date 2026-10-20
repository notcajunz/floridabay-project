from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

log = logging.getLogger(__name__)

SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets"
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"
EASTERN = ZoneInfo("America/New_York")
# Roster rows start under the header row; the header row is found by its "Discord ID" cell.
ROSTER_COLUMNS = 10  # A:J of the Master Roster
ID_COL, NAME_COL, RANK_COL = 1, 2, 3
# Ranks whose Discord ID is typed (the sheet has no database lookup formulas on their row).
TYPED_ID_RANKS = {"head of departments"}


class RosterSheetError(ValueError):
    """A ValueError so the bot can show the message to the user as-is."""


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def sheet_serial(day: date) -> int:
    """Google Sheets date serial number (days since 1899-12-30)."""
    return (day - date(1899, 12, 30)).days


def today_serial() -> int:
    return sheet_serial(datetime.now(EASTERN).date())


def cell(row: list, index: int) -> str:
    return str(row[index]).strip() if index < len(row) and row[index] is not None else ""


def lookup_formula(row_number: int) -> str:
    """The Master Roster's own Discord ID formula, restored when a slot is vacated."""
    return f"=if($C{row_number}=\"\",\"\",vlookup($C{row_number},'Employee Database'!$D$6:$P,2,false))"


class ServiceAccount:
    """Google service account credentials from a key file, exchanged for short-lived access tokens."""

    def __init__(self, info: dict[str, Any]):
        self.email = info["client_email"]
        self.token_uri = info.get("token_uri", "https://oauth2.googleapis.com/token")
        self._private_key = info["private_key"]
        self._token = ""
        self._expires = 0.0

    @classmethod
    def from_file(cls, path: str | Path) -> "ServiceAccount":
        try:
            return cls(json.loads(Path(path).read_text()))
        except (OSError, ValueError, KeyError) as error:
            raise RosterSheetError(f"Could not read the Google service account key ({error.__class__.__name__}).") from None

    def assertion(self, now: float | None = None) -> str:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        issued = int(now if now is not None else time.time())
        header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
        claims = b64url(json.dumps({
            "iss": self.email, "scope": SHEETS_SCOPE, "aud": self.token_uri,
            "iat": issued, "exp": issued + 3600,
        }).encode())
        key = serialization.load_pem_private_key(self._private_key.encode(), password=None)
        signature = key.sign(f"{header}.{claims}".encode(), padding.PKCS1v15(), hashes.SHA256())
        return f"{header}.{claims}.{b64url(signature)}"

    def token(self) -> str:
        if self._token and time.time() < self._expires - 60:
            return self._token
        body = urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": self.assertion(),
        }).encode()
        try:
            with urllib.request.urlopen(urllib.request.Request(self.token_uri, data=body), timeout=30) as response:
                data = json.load(response)
        except urllib.error.HTTPError as error:
            raise RosterSheetError(f"Google refused the roster service account (HTTP {error.code}).") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise RosterSheetError("Could not reach Google to sign in the roster service account.") from None
        self._token = data["access_token"]
        self._expires = time.time() + int(data.get("expires_in", 3600))
        return self._token


class SheetsClient:
    """Minimal blocking Google Sheets v4 client (run it through asyncio.to_thread)."""

    def __init__(self, spreadsheet_id: str, account: ServiceAccount):
        self.spreadsheet_id = spreadsheet_id
        self.account = account
        self._sheet_ids: dict[str, int] = {}

    def _request(self, method: str, path: str, *, params: dict[str, str] | None = None, body: Any = None) -> dict[str, Any]:
        query = urllib.parse.urlencode(params or {})
        url = f"{SHEETS_API}/{self.spreadsheet_id}{path}{'?' + query if query else ''}"
        data = json.dumps(body).encode() if body is not None else None
        last: Exception | None = None
        for attempt in range(3):
            request = urllib.request.Request(url, data=data, method=method, headers={
                "Authorization": f"Bearer {self.account.token()}", "Content-Type": "application/json",
            })
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                if error.code in (429, 500, 502, 503) and attempt < 2:
                    time.sleep(2 ** attempt)
                    last = error
                    continue
                try:
                    detail = json.load(error).get("error", {}).get("message", "")
                except Exception:
                    detail = ""
                if error.code in (401, 403):
                    raise RosterSheetError(
                        "Google denied access to the coordinator roster. Share the sheet with the roster service account as an editor."
                    ) from None
                raise RosterSheetError(f"The coordinator roster returned HTTP {error.code}. {detail}".strip()) from None
            except (urllib.error.URLError, TimeoutError, OSError) as error:
                last = error
                if attempt < 2:
                    time.sleep(2 ** attempt)
        raise RosterSheetError("Could not reach the coordinator roster.") from last

    def sheet_ids(self) -> dict[str, int]:
        """Tab title to sheetId. Tab ids never change, so they are only fetched until all are known."""
        if not self._sheet_ids:
            data = self._request("GET", "", params={"fields": "sheets.properties(sheetId,title)"})
            self._sheet_ids = {
                item["properties"]["title"]: int(item["properties"]["sheetId"]) for item in data.get("sheets", [])
            }
        return self._sheet_ids

    def values(self, a1: str) -> list[list[Any]]:
        quoted = urllib.parse.quote(a1, safe="")
        data = self._request("GET", f"/values/{quoted}", params={"valueRenderOption": "FORMATTED_VALUE"})
        return data.get("values", [])

    def batch_update(self, requests: list[dict[str, Any]]) -> None:
        if requests:
            self._request("POST", ":batchUpdate", body={"requests": requests})


def string_cell(value: str) -> dict[str, Any]:
    return {"userEnteredValue": {"stringValue": value}} if value else {}


def update_cells(sheet_id: int, row: int, column: int, cells: list[dict[str, Any]]) -> dict[str, Any]:
    """Overwrite values only (never formatting, validation or notes) starting at a zero-based row/column."""
    return {"updateCells": {
        "range": {
            "sheetId": sheet_id, "startRowIndex": row, "endRowIndex": row + 1,
            "startColumnIndex": column, "endColumnIndex": column + len(cells),
        },
        "rows": [{"values": cells}],
        "fields": "userEnteredValue",
    }}


def apply_local(rows: list[list[Any]], requests: list[dict[str, Any]], sheet_id: int) -> None:
    """Mirror roster requests on an in-memory copy of the Master Roster so later plans see earlier ones."""
    for request in requests:
        if "updateCells" in request and request["updateCells"]["range"]["sheetId"] == sheet_id:
            spec = request["updateCells"]
            row = spec["range"]["startRowIndex"]
            while len(rows) <= row:
                rows.append([])
            line = rows[row]
            for offset, value in enumerate(spec["rows"][0]["values"]):
                column = spec["range"]["startColumnIndex"] + offset
                while len(line) <= column:
                    line.append("")
                entered = value.get("userEnteredValue", {})
                line[column] = entered.get("stringValue", "") if "stringValue" in entered else ""
        elif "insertDimension" in request and request["insertDimension"]["range"]["sheetId"] == sheet_id:
            rows.insert(request["insertDimension"]["range"]["startIndex"], [])
        elif "copyPaste" in request and request["copyPaste"]["source"]["sheetId"] == sheet_id:
            spec = request["copyPaste"]
            rows[spec["destination"]["startRowIndex"]] = list(rows[spec["source"]["startRowIndex"]])


@dataclass
class RosterResult:
    """What a roster sync did, for the line shown under the command reply."""

    changes: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def line(self) -> str:
        parts = self.changes + self.notes
        return "Roster sheet: " + ("; ".join(parts) if parts else "already up to date") + "."


class RosterSheet:
    """Keeps the Department Coordination spreadsheet in step with the bot's coordinator commands.

    `Master Roster` lists coordinators in blocks per rank (a header, then one row per slot with the
    rank written in column D). Hiring writes the person's name and Discord ID into the first free slot
    of their rank's block (adding a row to the block when it is full); promotions and demotions move
    them; removals empty the slot and put the sheet's own ID lookup formula back. `Employee Database`
    holds one row per employee: the bot stamps its Movement Date, Hired Date, Activity and the
    coordination job checkboxes when the person has a row there.
    """

    def __init__(
        self, client: SheetsClient, *, rank_labels: dict[str, str] | None = None,
        roster_tab: str = "Master Roster", employee_tab: str = "Employee Database",
    ):
        self.client = client
        self.rank_labels = rank_labels or {}
        self.roster_tab = roster_tab
        self.employee_tab = employee_tab
        self._lock = asyncio.Lock()

    @classmethod
    def from_config(cls, config) -> "RosterSheet | None":
        path = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
        if not (config.roster_spreadsheet_id and path):
            return None
        client = SheetsClient(config.roster_spreadsheet_id, ServiceAccount.from_file(path))
        return cls(
            client, rank_labels=config.roster_rank_labels,
            roster_tab=config.roster_tab, employee_tab=config.roster_employee_tab,
        )

    def label(self, rank: str) -> str:
        """The rank text used in the roster's Rank column."""
        return self.rank_labels.get(rank, rank)

    def known_labels(self) -> set[str]:
        return {value.lower() for value in self.rank_labels.values()}

    # reading ---------------------------------------------------------------------

    def _read_roster(self) -> tuple[int, list[list[Any]]]:
        sheet_id = self.client.sheet_ids().get(self.roster_tab)
        if sheet_id is None:
            raise RosterSheetError(f"The coordinator roster has no `{self.roster_tab}` tab.")
        return sheet_id, self.client.values(f"'{self.roster_tab}'!A1:J")

    def _read_employees(self) -> tuple[int, list[list[Any]]]:
        sheet_id = self.client.sheet_ids().get(self.employee_tab)
        if sheet_id is None:
            raise RosterSheetError(f"The coordinator roster has no `{self.employee_tab}` tab.")
        return sheet_id, self.client.values(f"'{self.employee_tab}'!A1:AF")

    # roster planning (pure) ----------------------------------------------------------

    def plan_place(
        self, sheet_id: int, rows: list[list[Any]], discord_id: str, name: str, label: str,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        """Requests and change notes that put a person in a rank's block and take them out of any other."""
        wanted = label.lower()
        known = self.known_labels() | {wanted}
        slots = [index for index, row in enumerate(rows) if index >= 6 and cell(row, RANK_COL).lower() == wanted]
        if not slots:
            raise RosterSheetError(f"The roster has no `{label}` rows.")
        mine = [
            index for index, row in enumerate(rows)
            if index >= 6 and cell(row, RANK_COL).lower() in known
            and (cell(row, ID_COL) == discord_id or (cell(row, NAME_COL) and cell(row, NAME_COL).lower() == name.lower()))
        ]
        requests: list[dict[str, Any]] = []
        notes: list[str] = []
        already = [index for index in mine if index in slots]
        for index in mine:
            if index in already[:1]:
                continue
            requests.extend(self.plan_vacate_row(sheet_id, rows, index))
            notes.append(f"cleared row {index + 1} ({cell(rows[index], RANK_COL)})")
        if already:
            index = already[0]
            if cell(rows[index], ID_COL) != discord_id:
                # Only the ID is filled in; names are curated by hand and never overwritten.
                requests.append(update_cells(sheet_id, index, ID_COL, [string_cell(discord_id)]))
                notes.append(f"filled in the Discord ID on row {index + 1}")
            return requests, notes
        free = next(
            (index for index in slots if not cell(rows[index], NAME_COL) and not cell(rows[index], ID_COL)
             and index not in mine),
            None,
        )
        if free is None:
            free = slots[-1] + 1
            requests.append({"insertDimension": {
                "range": {"sheetId": sheet_id, "dimension": "ROWS", "startIndex": free, "endIndex": free + 1},
                "inheritFromBefore": True,
            }})
            requests.append({"copyPaste": {
                "source": {
                    "sheetId": sheet_id, "startRowIndex": slots[-1], "endRowIndex": slots[-1] + 1,
                    "startColumnIndex": 0, "endColumnIndex": ROSTER_COLUMNS,
                },
                "destination": {
                    "sheetId": sheet_id, "startRowIndex": free, "endRowIndex": free + 1,
                    "startColumnIndex": 0, "endColumnIndex": ROSTER_COLUMNS,
                },
                "pasteType": "PASTE_NORMAL",
            }})
            notes.append(f"added a {label} row")
        requests.append(update_cells(sheet_id, free, ID_COL, [string_cell(discord_id), string_cell(name)]))
        notes.append(f"{name} placed in row {free + 1} as {label}")
        return requests, notes

    def plan_vacate_row(self, sheet_id: int, rows: list[list[Any]], index: int) -> list[dict[str, Any]]:
        """Empty one roster slot: no name, and the sheet's Discord ID lookup formula back in place."""
        typed = cell(rows[index], RANK_COL).lower() in TYPED_ID_RANKS
        id_cell = {} if typed else {"userEnteredValue": {"formulaValue": lookup_formula(index + 1)}}
        return [update_cells(sheet_id, index, ID_COL, [id_cell, {}])]

    # public operations ---------------------------------------------------------------

    async def place(self, discord_id: int | str, display_name: str, rank: str) -> RosterResult:
        """Hire, promote or demote: put the person in their rank's block on the Master Roster."""
        async with self._lock:
            return await asyncio.to_thread(self._place, str(discord_id), display_name, rank)

    def _place(self, discord_id: str, display_name: str, rank: str) -> RosterResult:
        label = self.label(rank)
        result = RosterResult()
        employee = self._employee(discord_id)
        name = employee["name"] if employee and employee["name"] else display_name
        sheet_id, rows = self._read_roster()
        requests, notes = self.plan_place(sheet_id, rows, discord_id, name, label)
        self.client.batch_update(requests)
        result.changes.extend(notes)
        previous = self._previous_rank(rows, discord_id)
        result.changes.extend(self._stamp_employee(employee, hire=previous is None, movement=previous != label.lower()))
        if employee is None:
            result.notes.append("not in the Employee Database, so dates and jobs were not tracked")
        return result

    async def vacate(self, discord_id: int | str, display_name: str, reason: str) -> RosterResult:
        """Remove a coordinator: empty their roster slot and mark them in the Employee Database."""
        async with self._lock:
            return await asyncio.to_thread(self._vacate, str(discord_id), display_name, reason)

    def _vacate(self, discord_id: str, display_name: str, reason: str) -> RosterResult:
        result = RosterResult()
        employee = self._employee(discord_id)
        name = employee["name"] if employee and employee["name"] else display_name
        sheet_id, rows = self._read_roster()
        known = self.known_labels()
        requests: list[dict[str, Any]] = []
        for index, row in enumerate(rows):
            if index < 6 or cell(row, RANK_COL).lower() not in known:
                continue
            if cell(row, ID_COL) == discord_id or (cell(row, NAME_COL) and cell(row, NAME_COL).lower() == name.lower()):
                requests.extend(self.plan_vacate_row(sheet_id, rows, index))
                result.changes.append(f"cleared row {index + 1} ({cell(row, RANK_COL)})")
        self.client.batch_update(requests)
        if not requests:
            result.notes.append("they were not on the roster")
        if employee is not None:
            activity = "Resigned" if reason.lower().startswith("resign") else "Terminated"
            result.changes.extend(self._stamp_employee(employee, activity=activity, clear_jobs=True))
        return result

    async def set_job(self, discord_id: int | str, job: str, on: bool) -> RosterResult:
        async with self._lock:
            return await asyncio.to_thread(self._set_job, str(discord_id), job, on)

    def _set_job(self, discord_id: str, job: str, on: bool) -> RosterResult:
        result = RosterResult()
        employee = self._employee(discord_id)
        if employee is None:
            result.notes.append("not in the Employee Database, so the job checkbox was not set")
            return result
        column = employee["columns"].get(job.lower())
        if column is None:
            result.notes.append(f"the Employee Database has no `{job}` column")
            return result
        self.client.batch_update([update_cells(
            employee["sheet_id"], employee["row"], column, [{"userEnteredValue": {"boolValue": on}}],
        )])
        result.changes.append(f"{job} {'checked' if on else 'unchecked'}")
        return result

    # full reconcile ------------------------------------------------------------------

    async def sync(
        self, holders: dict[str, tuple[str, str]], jobs: dict[str, set[str]],
        *, remove_missing: bool = True, max_removals: int | None = None, job_names: list[str] | None = None,
    ) -> RosterResult:
        """Make the sheet match Discord: holders maps Discord ID to (display name, ladder rank), jobs maps a
        job name to the IDs holding it. Sheet rows of people who hold no rank are emptied (unless
        remove_missing is off or there are more than max_removals of them, which looks like a bad read)."""
        async with self._lock:
            return await asyncio.to_thread(self._sync, holders, jobs, remove_missing, max_removals, job_names or [])

    def _sync(
        self, holders: dict[str, tuple[str, str]], jobs: dict[str, set[str]], remove_missing: bool,
        max_removals: int | None, job_names: list[str],
    ) -> RosterResult:
        if not holders:
            raise RosterSheetError("Nobody holds a coordinator rank in Discord, so nothing was synced.")
        result = RosterResult()
        roster_id, rows = self._read_roster()
        table = self._employee_table()
        by_name = {}
        name_col = table["columns"].get("in game name")
        id_col = table["columns"]["discord id"]
        for row in table["rows"][table["header"] + 1:]:
            if name_col is not None and cell(row, name_col) and cell(row, id_col):
                by_name[cell(row, name_col).lower()] = cell(row, id_col)
        known = self.known_labels()
        previous: dict[str, str] = {}
        stale: list[tuple[int, str]] = []
        unknown: list[str] = []
        for index, row in enumerate(rows):
            if index < 6 or cell(row, RANK_COL).lower() not in known or not (cell(row, ID_COL) or cell(row, NAME_COL)):
                continue
            ident = cell(row, ID_COL) if cell(row, ID_COL).isdigit() else by_name.get(cell(row, NAME_COL).lower())
            if ident is None:
                unknown.append(cell(row, NAME_COL) or "?")
            elif ident in holders:
                previous.setdefault(ident, cell(row, RANK_COL).lower())
            else:
                stale.append((index, ident))
        requests: list[dict[str, Any]] = []
        local = [list(row) for row in rows]
        if stale and remove_missing:
            if max_removals is not None and len(stale) > max_removals:
                result.notes.append(
                    f"{len(stale)} sheet rows belong to people without a coordinator rank in Discord; left alone (over the safety limit, run /coord sync to clear them)"
                )
            else:
                for index, ident in stale:
                    vacate = self.plan_vacate_row(roster_id, local, index)
                    requests.extend(vacate)
                    apply_local(local, vacate, roster_id)
                    stamp, _ = self._stamp_requests(self._employee_row(table, ident), clear_jobs=True)
                    requests.extend(stamp)
                result.changes.append(f"{len(stale)} removed (no coordinator rank in Discord)")
        elif stale:
            result.notes.append(f"{len(stale)} sheet row(s) have no coordinator rank in Discord and were kept")
        placed = moved = 0
        for ident, (display, rank) in holders.items():
            employee = self._employee_row(table, ident)
            name = employee["name"] if employee and employee["name"] else display
            label = self.label(rank)
            new_requests, notes = self.plan_place(roster_id, local, ident, name, label)
            if not new_requests:
                continue
            requests.extend(new_requests)
            apply_local(local, new_requests, roster_id)
            first = previous.get(ident)
            if first is None:
                placed += 1
            elif first != label.lower():
                moved += 1
            stamp, _ = self._stamp_requests(employee, hire=first is None, movement=first != label.lower())
            requests.extend(stamp)
        if placed:
            result.changes.append(f"{placed} added")
        if moved:
            result.changes.append(f"{moved} moved to a new rank")
        for name in unknown[:5]:
            result.notes.append(f"`{name}` is on the sheet without a Discord ID and was left alone")
        # Job checkboxes: tick the jobs people hold. Ticks the sheet has that Discord does not are left alone
        # (leadership rows tick every job on purpose); /coord job remove and removals untick.
        wanted = {title.lower() for title in job_names}
        ticked = 0
        columns = table["columns"]
        job_columns = {title: position for title, position in columns.items() if title in wanted and title in self.job_titles(columns)}
        if job_columns:
            for index in range(table["header"] + 1, len(table["rows"])):
                row = table["rows"][index]
                ident = cell(row, id_col)
                if not ident.isdigit():
                    continue
                for title, position in job_columns.items():
                    held = ident in jobs.get(title, set()) and ident in holders
                    if held and cell(row, position).upper() != "TRUE":
                        requests.append(update_cells(table["sheet_id"], index, position, [{"userEnteredValue": {"boolValue": True}}]))
                        ticked += 1
        if ticked:
            result.changes.append(f"{ticked} job checkbox(es) ticked")
        for start in range(0, len(requests), 150):
            self.client.batch_update(requests[start:start + 150])
        return result

    # employee database ---------------------------------------------------------------

    def _employee_table(self) -> dict[str, Any]:
        """The Employee Database as rows plus the column positions this sheet uses."""
        sheet_id, rows = self._read_employees()
        header_index = next(
            (i for i, row in enumerate(rows[:15]) if "discord id" in [cell(row, c).lower() for c in range(len(row))]), None
        )
        if header_index is None:
            raise RosterSheetError(f"The `{self.employee_tab}` tab has no Discord ID column.")
        header = [cell(rows[header_index], c).lower() for c in range(len(rows[header_index]))]
        columns = {title: position for position, title in enumerate(header) if title}
        return {"sheet_id": sheet_id, "rows": rows, "header": header_index, "columns": columns}

    @staticmethod
    def _employee_row(table: dict[str, Any], discord_id: str) -> dict[str, Any] | None:
        columns, rows = table["columns"], table["rows"]
        id_col = columns["discord id"]
        name_col = columns.get("in game name")
        for index in range(table["header"] + 1, len(rows)):
            if cell(rows[index], id_col) == discord_id:
                return {
                    "sheet_id": table["sheet_id"], "row": index, "columns": columns, "values": rows[index],
                    "name": cell(rows[index], name_col) if name_col is not None else "",
                }
        return None

    def _employee(self, discord_id: str) -> dict[str, Any] | None:
        """The person's Employee Database row with the column positions this sheet uses, or None."""
        return self._employee_row(self._employee_table(), discord_id)

    def _stamp_employee(self, employee: dict[str, Any] | None, **kwargs: Any) -> list[str]:
        requests, changes = self._stamp_requests(employee, **kwargs)
        self.client.batch_update(requests)
        return changes

    def _stamp_requests(
        self, employee: dict[str, Any] | None, *, hire: bool = False, movement: bool = False,
        activity: str | None = None, clear_jobs: bool = False,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        if employee is None:
            return [], []
        columns, values, row = employee["columns"], employee["values"], employee["row"]
        sheet_id = employee["sheet_id"]
        today = {"userEnteredValue": {"numberValue": today_serial()}}
        requests: list[dict[str, Any]] = []
        changes: list[str] = []

        def put(title: str, value: dict[str, Any]) -> None:
            column = next((columns[t] for t in (title, *ALIASES.get(title, ())) if t in columns), None)
            if column is not None:
                requests.append(update_cells(sheet_id, row, column, [value]))

        def blank(title: str) -> bool:
            column = next((columns[t] for t in (title, *ALIASES.get(title, ())) if t in columns), None)
            return column is not None and not cell(values, column)

        if hire and blank("hired date"):
            put("hired date", today)
            changes.append("hired date set")
        if movement or hire or activity:
            put("movement date", today)
            changes.append("movement date set")
        if hire and blank("activity"):
            put("activity", {"userEnteredValue": {"stringValue": "Active"}})
            changes.append("activity Active")
        if activity:
            put("activity", {"userEnteredValue": {"stringValue": activity}})
            changes.append(f"activity {activity}")
        if clear_jobs:
            jobs = [position for title, position in columns.items() if title in self.job_titles(columns)]
            for position in jobs:
                requests.append(update_cells(sheet_id, row, position, [{"userEnteredValue": {"boolValue": False}}]))
            if jobs:
                changes.append("job checkboxes cleared")
        return requests, changes

    @staticmethod
    def job_titles(columns: dict[str, int]) -> set[str]:
        """Coordination job checkboxes sit after the Strike columns, one column per job."""
        start = columns.get("strike 2")
        if start is None:
            return set()
        return {title for title, position in columns.items() if position > start and title}

    @staticmethod
    def _previous_rank(rows: list[list[Any]], discord_id: str) -> str | None:
        for index, row in enumerate(rows):
            if index >= 6 and cell(row, ID_COL) == discord_id and cell(row, RANK_COL):
                return cell(row, RANK_COL).lower()
        return None


# Titles the Employee Database has used for a column (the sheet spells Activity "Activty").
ALIASES: dict[str, tuple[str, ...]] = {"activity": ("activty",)}
