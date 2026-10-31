import pytest

from deptbot.email_archive import EmailArchiveSheet


class Client:
    def __init__(self, titles):
        self._sheet_ids = {}
        self.titles = dict(titles)
        self.requests = []

    def sheet_ids(self):
        return dict(self.titles)

    def batch_update(self, requests):
        self.requests.extend(requests)


@pytest.mark.asyncio
async def test_moves_existing_archive_to_next_available_suffix():
    client = Client({"Archived BCSO 2026-10-22": 7, "Archived BCSO 2026-10-22 (2)": 8})
    sheet = EmailArchiveSheet(client)
    replacement = await sheet.make_available("Archived BCSO 2026-10-22")
    assert replacement == "Archived BCSO 2026-10-22 (3)"
    assert client.requests == [{
        "updateSheetProperties": {
            "properties": {"sheetId": 7, "title": "Archived BCSO 2026-10-22 (3)"},
            "fields": "title",
        }
    }]
