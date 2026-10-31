from __future__ import annotations

import asyncio
import os

from .roster_sheet import RosterSheetError, ServiceAccount, SheetsClient


class EmailArchiveError(ValueError):
    """The email database could not make room for a new archive tab."""


class EmailArchiveSheet:
    """Resolves Apps Script archive-title collisions without deleting old archives."""

    def __init__(self, client: SheetsClient):
        self.client = client
        self._lock = asyncio.Lock()

    @classmethod
    def from_config(cls, config) -> "EmailArchiveSheet | None":
        path = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
        if not (config.email_spreadsheet_id and path):
            return None
        return cls(SheetsClient(config.email_spreadsheet_id, ServiceAccount.from_file(path)))

    def _move_existing(self, title: str) -> str:
        try:
            # Fetch fresh names on every collision. The Apps Script creates and renames tabs outside
            # this client, so the normal SheetsClient cache cannot be authoritative here.
            self.client._sheet_ids = {}
            sheets = self.client.sheet_ids()
            sheet_id = sheets.get(title)
            if sheet_id is None:
                raise EmailArchiveError(f"Google reported a duplicate `{title}` tab, but it could not be found.")
            number = 2
            while f"{title} ({number})" in sheets:
                number += 1
            replacement = f"{title} ({number})"
            self.client.batch_update([{
                "updateSheetProperties": {
                    "properties": {"sheetId": sheet_id, "title": replacement},
                    "fields": "title",
                }
            }])
        except RosterSheetError as error:
            raise EmailArchiveError(str(error).replace("coordinator roster", "email database")) from None
        self.client._sheet_ids = {}
        return replacement

    async def make_available(self, title: str) -> str:
        async with self._lock:
            return await asyncio.to_thread(self._move_existing, title)
