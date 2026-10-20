import json

import pytest

from deptbot.roster_sheet import (
    RosterSheet, RosterSheetError, ServiceAccount, SheetsClient, cell, lookup_formula, sheet_serial,
)
from datetime import date

from deptbot.constants import COORDINATOR_RANKS

LABELS = {
    **{rank: rank for rank in COORDINATOR_RANKS},
    "Department Overseer": "Head of Departments",
    "Department Manager": "Department Management",
    "Assistant Department Manager": "Assistant Department Management",
}


def roster_rows():
    """A trimmed copy of the real Master Roster: header at row 6, ranks in column D."""
    rows = [[] for _ in range(9)]
    rows[5] = ["", "Discord ID", "Name", "Rank", "Notes"]
    rows.append(["", "1099651002208104488", "Tucker", "Head of Departments", "Oversee Departments"])
    rows.append(["", "792013141290516490", "Lucas Skywalker", "Department Director"])
    rows += [["", "", "", "Department Management"], ["", "", "", "Department Management"]]
    rows += [["", "504074089342959622", "Frank J.", "Assistant Department Management"]]
    rows += [["", "", "", "Lead Department Coordinator"]]
    return rows


def employee_rows():
    rows = [[] for _ in range(5)]
    rows.append(["", "Badge Nr", "Callsign", "In Game Name", "Discord ID", "Discord Name", "Current Rank", "Activty",
                 "Time Zone", "Time in Service", "Hired Date", "Movement Date", "Time in Rank", "NOTES",
                 "Strike 1", "Strike 2", "", "CAD Administrator", "Transfer Coordinator"])
    rows.append([])
    rows.append(["", "0001", "110", "Lucas Skywalker", "792013141290516490", "lucas", "", "Exempt", "CET", "", "10/15/2026", "10/15/2026"])
    rows.append(["", "0003", "316", "Frank J.", "504074089342959622", "zuced", "", "Active", "CST", "", "10/17/2026", "10/17/2026"])
    rows.append(["", "0005", "311", "Caden B.", "1460053011253432457", "hipapoop", "", "", "EST"])
    return rows


class FakeClient:
    """Applies the few batchUpdate requests the roster uses to in-memory grids."""

    def __init__(self):
        self.grids = {"Master Roster": roster_rows(), "Employee Database": employee_rows()}
        self.ids = {"Master Roster": 0, "Employee Database": 7}
        self.writes = []

    def sheet_ids(self):
        return self.ids

    def values(self, a1):
        title = a1.split("!")[0].strip("'")
        return [list(row) for row in self.grids[title]]

    def grid_for(self, sheet_id):
        title = next(name for name, value in self.ids.items() if value == sheet_id)
        return self.grids[title]

    def batch_update(self, requests):
        self.writes.append(requests)
        for request in requests:
            if "updateCells" in request:
                spec = request["updateCells"]
                grid = self.grid_for(spec["range"]["sheetId"])
                row = spec["range"]["startRowIndex"]
                while len(grid) <= row:
                    grid.append([])
                line = grid[row]
                for offset, value in enumerate(spec["rows"][0]["values"]):
                    column = spec["range"]["startColumnIndex"] + offset
                    while len(line) <= column:
                        line.append("")
                    entered = value.get("userEnteredValue", {})
                    if "formulaValue" in entered:
                        line[column] = ""  # the sheet evaluates a vacant slot's lookup to blank
                    elif "stringValue" in entered:
                        line[column] = entered["stringValue"]
                    elif "numberValue" in entered:
                        line[column] = str(entered["numberValue"])
                    elif "boolValue" in entered:
                        line[column] = "TRUE" if entered["boolValue"] else "FALSE"
                    else:
                        line[column] = ""
            elif "insertDimension" in request:
                spec = request["insertDimension"]["range"]
                self.grid_for(spec["sheetId"]).insert(spec["startIndex"], [])
            elif "copyPaste" in request:
                spec = request["copyPaste"]
                grid = self.grid_for(spec["source"]["sheetId"])
                grid[spec["destination"]["startRowIndex"]] = list(grid[spec["source"]["startRowIndex"]])


@pytest.fixture
def sheet():
    client = FakeClient()
    return RosterSheet(client, rank_labels=LABELS), client


def column(client, title, index):
    return [cell(row, index) for row in client.grids[title]]


async def test_hire_fills_first_free_slot_with_id_and_in_game_name(sheet):
    roster, client = sheet
    result = await roster.place(504074089342959622, "zuced", "Department Manager")
    rows = client.grids["Master Roster"]
    assert [cell(rows[11], i) for i in (1, 2, 3)] == ["504074089342959622", "Frank J.", "Department Management"]
    # Frank moved up: his old Assistant slot is emptied, not duplicated.
    assert cell(rows[13], 1) == "" and cell(rows[13], 2) == "" and cell(rows[13], 3) == "Assistant Department Management"
    assert any("placed in row 12" in text for text in result.changes)


async def test_unknown_employee_uses_discord_name_and_reports_it(sheet):
    roster, client = sheet
    result = await roster.place(555, "NewPerson", "Lead Department Coordinator")
    assert cell(client.grids["Master Roster"][14], 2) == "NewPerson"
    assert any("not in the Employee Database" in note for note in result.notes)


async def test_full_block_gets_a_new_row_copied_from_the_last_slot(sheet):
    roster, client = sheet
    await roster.place(1, "A", "Department Manager")
    await roster.place(2, "B", "Department Manager")
    result = await roster.place(3, "C", "Department Manager")
    rows = client.grids["Master Roster"]
    managers = [cell(row, 2) for row in rows if cell(row, 3) == "Department Management"]
    assert managers == ["A", "B", "C"]
    assert any("added a Department Management row" in text for text in result.changes)
    assert len(rows) == 16


async def test_confirming_the_same_rank_changes_nothing(sheet):
    roster, client = sheet
    await roster.place(792013141290516490, "lucas", "Department Director")
    first_pass = len(client.writes)
    result = await roster.place(792013141290516490, "lucas", "Department Director")
    assert result.changes == []  # no roster change; stamping a movement date only happens on a rank change
    assert cell(client.grids["Master Roster"][10], 2) == "Lucas Skywalker"
    assert first_pass >= 0


async def test_head_of_departments_uses_the_typed_id_row(sheet):
    roster, client = sheet
    await roster.vacate(1099651002208104488, "Tucker", "Resigned")
    rows = client.grids["Master Roster"]
    assert cell(rows[9], 1) == "" and cell(rows[9], 2) == ""
    # A typed-ID row gets no lookup formula back.
    assert all("formulaValue" not in str(request) for batch in client.writes for request in batch)


async def test_vacating_restores_the_lookup_formula_and_marks_the_employee(sheet):
    roster, client = sheet
    result = await roster.vacate(504074089342959622, "zuced", "Removed")
    formula = lookup_formula(14)
    assert any(json.dumps(formula)[1:-1] in json.dumps(batch) for batch in client.writes)
    employees = client.grids["Employee Database"]
    assert cell(employees[8], 7) == "Terminated"
    assert cell(employees[8], 11) == str(sheet_serial(date.today())) or cell(employees[8], 11).isdigit()
    assert "activity Terminated" in result.changes


async def test_resigned_marks_resigned_and_unchecks_jobs(sheet):
    roster, client = sheet
    await roster.set_job(504074089342959622, "CAD Administrator", True)
    assert cell(client.grids["Employee Database"][8], 17) == "TRUE"
    result = await roster.vacate(504074089342959622, "zuced", "Resigned")
    assert cell(client.grids["Employee Database"][8], 7) == "Resigned"
    assert cell(client.grids["Employee Database"][8], 17) == "FALSE"
    assert "job checkboxes cleared" in result.changes


async def test_hire_stamps_dates_only_when_blank_and_activates(sheet):
    roster, client = sheet
    result = await roster.place(1460053011253432457, "hipapoop", "Lead Department Coordinator")
    row = client.grids["Employee Database"][9]
    assert cell(row, 7) == "Active"
    assert cell(row, 10).isdigit() and cell(row, 11).isdigit()
    assert "hired date set" in result.changes
    # Frank already has a hired date: a promotion never overwrites it.
    await roster.place(504074089342959622, "zuced", "Department Manager")
    assert cell(client.grids["Employee Database"][8], 10) == "10/17/2026"


async def test_job_without_a_matching_column_is_reported(sheet):
    roster, client = sheet
    result = await roster.set_job(504074089342959622, "FAA Coordinator", True)
    assert result.notes == ["the Employee Database has no `FAA Coordinator` column"]


async def test_missing_rank_block_is_an_error(sheet):
    roster, _ = sheet
    with pytest.raises(RosterSheetError, match="no `Probationary Department Coordinator` rows"):
        await roster.place(9, "X", "Probationary Department Coordinator")


def test_service_account_signs_a_verifiable_rs256_assertion():
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    import base64

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    account = ServiceAccount({"client_email": "bot@example.iam.gserviceaccount.com", "private_key": pem})
    header, claims, signature = account.assertion(now=1000).split(".")
    pad = lambda value: value + "=" * (-len(value) % 4)
    payload = json.loads(base64.urlsafe_b64decode(pad(claims)))
    assert payload["iss"] == "bot@example.iam.gserviceaccount.com"
    assert payload["exp"] - payload["iat"] == 3600
    assert "spreadsheets" in payload["scope"]
    key.public_key().verify(
        base64.urlsafe_b64decode(pad(signature)), f"{header}.{claims}".encode(), padding.PKCS1v15(), hashes.SHA256()
    )


def test_sheets_client_caches_tab_ids(monkeypatch):
    client = SheetsClient("sheet", object())
    calls = []
    monkeypatch.setattr(client, "_request", lambda *a, **k: calls.append(1) or {"sheets": [{"properties": {"sheetId": 4, "title": "Master Roster"}}]})
    assert client.sheet_ids() == {"Master Roster": 4}
    client.sheet_ids()
    assert len(calls) == 1


HOLDERS = {
    "792013141290516490": ("lucas", "Department Director"),
    "504074089342959622": ("zuced", "Department Manager"),
    "1460053011253432457": ("hipapoop", "Lead Department Coordinator"),
}
JOB_NAMES = ["CAD Administrator", "Transfer Coordinator"]


async def test_sync_adds_moves_and_clears_to_match_discord(sheet):
    roster, client = sheet
    result = await roster.sync(HOLDERS, {"cad administrator": {"504074089342959622"}}, job_names=JOB_NAMES)
    rows = client.grids["Master Roster"]
    people = {cell(r, 1): cell(r, 3) for i, r in enumerate(rows) if i >= 6 and cell(r, 1)}
    assert people == {
        "792013141290516490": "Department Director",
        "504074089342959622": "Department Management",
        "1460053011253432457": "Lead Department Coordinator",
    }
    assert "1 removed" in result.changes[0] and "1 added" in result.changes and "1 moved to a new rank" in result.changes
    employees = client.grids["Employee Database"]
    assert cell(employees[9], 7) == "Active" and cell(employees[9], 10).isdigit()  # Caden hired
    assert cell(employees[8], 17) == "TRUE"  # Frank got the CAD Administrator job
    assert any("job checkbox" in change for change in result.changes)


async def test_sync_is_a_no_op_once_the_sheet_matches(sheet):
    roster, client = sheet
    await roster.sync(HOLDERS, {}, job_names=JOB_NAMES)
    client.writes.clear()
    result = await roster.sync(HOLDERS, {}, job_names=JOB_NAMES)
    assert result.changes == [] and client.writes == []


async def test_sync_safety_limit_keeps_rows_and_says_so(sheet):
    roster, client = sheet
    result = await roster.sync(HOLDERS, {}, max_removals=0, job_names=JOB_NAMES)
    assert any("left alone" in note for note in result.notes)
    assert "1099651002208104488" in [cell(r, 1) for r in client.grids["Master Roster"]]


async def test_sync_can_keep_stale_rows_and_never_touches_unmatched_names(sheet):
    roster, client = sheet
    client.grids["Master Roster"].append(["", "", "Mystery Person", "Lead Department Coordinator"])
    result = await roster.sync(HOLDERS, {}, remove_missing=False, job_names=JOB_NAMES)
    assert any("kept" in note for note in result.notes)
    assert any("Mystery Person" in note for note in result.notes)
    assert "Mystery Person" in [cell(r, 2) for r in client.grids["Master Roster"]]


async def test_sync_refuses_to_run_with_nobody_holding_a_rank(sheet):
    roster, _ = sheet
    with pytest.raises(RosterSheetError, match="Nobody holds"):
        await roster.sync({}, {})
