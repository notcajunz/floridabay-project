import json
from pathlib import Path

import pytest

from deptbot.bot import DepartmentManagerBot
from deptbot.cogs.departments import sheet_code
from deptbot.cogs.email import EmailCog, sheet_refs
from deptbot.config import Config
from deptbot.sheet_api import SheetApi, SheetApiError


class FakeSheet:
    configured = True

    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = []

    async def call(self, action, **args):
        self.calls.append((action, args))
        return self.answers.pop(0)


def make_cog(tmp_path: Path, sheet) -> EmailCog:
    bot = DepartmentManagerBot(Config("unused", tmp_path / "email.db", None, frozenset()))
    return EmailCog(bot, sheet)


def test_sheet_code_prefers_initials_then_name():
    assert sheet_code("lspd", "Los Santos Police Department") == "LSPD"
    assert sheet_code(None, "Florida Highway Patrol") == "FHP"
    assert sheet_code("A", "Air Support Unit") == "ASU"
    assert sheet_code("Very-Long-Code-Here", "x") == "VERYLONGCO"


def test_sheet_refs_try_initials_then_name():
    assert sheet_refs({"initials": "LSPD", "name": "Los Santos PD"}) == ["LSPD", "Los Santos PD"]
    assert sheet_refs({"initials": None, "name": "Fire Rescue"}) == ["Fire Rescue"]


async def test_dept_call_falls_back_to_name_when_code_unknown(tmp_path):
    sheet = FakeSheet([{"ok": False, "error": "Unknown department"}, {"ok": True}])
    cog = make_cog(tmp_path, sheet)
    data = await cog.dept_call({"initials": "XX", "name": "Fire Rescue"}, "list", filter="all")
    assert data["ok"]
    assert [call[1]["dept"] for call in sheet.calls] == ["XX", "Fire Rescue"]


async def test_dept_call_stops_on_other_errors(tmp_path):
    sheet = FakeSheet([{"ok": False, "error": "Bad thing"}])
    cog = make_cog(tmp_path, sheet)
    data = await cog.dept_call({"initials": "XX", "name": "Fire Rescue"}, "wipe", memberId="1")
    assert not data["ok"] and len(sheet.calls) == 1


def test_api_posts_secret_and_args(monkeypatch):
    seen = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def read(self, *args):
            return b'{"ok": true}'

    def fake_urlopen(request, timeout):
        seen["body"] = json.loads(request.data)
        seen["method"] = request.get_method()
        return Response()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    result = SheetApi("https://example.test/exec", "s3cret")._post("list", {"dept": "LSPD"})
    assert result == {"ok": True}
    assert seen == {"body": {"secret": "s3cret", "action": "list", "args": {"dept": "LSPD"}}, "method": "POST"}


def test_api_requires_configuration_and_explains_401(monkeypatch):
    with pytest.raises(SheetApiError, match="not set"):
        SheetApi("", "")._post("list", {})
    import urllib.error

    def refuse(request, timeout):
        raise urllib.error.HTTPError("u", 401, "no", {}, None)

    monkeypatch.setattr("urllib.request.urlopen", refuse)
    with pytest.raises(SheetApiError, match="Anyone"):
        SheetApi("https://example.test/exec", "s")._post("list", {})


async def test_email_autocomplete_includes_launched_departments(tmp_path):
    class Db:
        async def fetch_all(self, sql, params):
            assert "status" not in sql
            return [{"name": "Launched Dept"}]

    class Client:
        db = Db()

    class Interaction:
        guild_id = 1
        client = Client()

    from deptbot.cogs.email import email_department_autocomplete

    choices = await email_department_autocomplete(Interaction(), "")
    assert [choice.value for choice in choices] == ["Launched Dept"]
