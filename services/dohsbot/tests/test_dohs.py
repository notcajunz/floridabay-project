import datetime as dt

import pytest
from gspread.exceptions import APIError

from dohsbot import hours
from dohsbot.roster_bot import (Actor, Roster, RosterError, clean_text, clip, parse_until, _id)


class FakeSheet:
    def __init__(self, rows):
        self.rows = rows
        self.row_count = 500

    def get_all_values(self):
        return [list(r) for r in self.rows]

    def batch_update(self, updates, value_input_option=None):
        for u in updates:
            a1 = u["range"]
            c, r = ord(a1[0]) - 65, int(a1[1:])
            while len(self.rows) < r:
                self.rows.append([])
            row = self.rows[r - 1]
            row.extend([""] * (c + 1 - len(row)))
            row[c] = u["values"][0][0]

    def add_rows(self, n):
        pass


def make_roster():
    roster_rows = [[] for _ in range(9)]
    for cs, rank in [("101", "Director"), ("201", "Special Agent"), ("202", "Special Agent"), ("203", "Special Agent")]:
        roster_rows.append(["", cs, "", "", rank])
    db_rows = [[] for _ in range(7)]
    r = Roster(FakeSheet(roster_rows), FakeSheet(db_rows))
    r.load()
    return r


def put_director(r):
    r.roster_ws.rows[9][3] = "Boss"
    r.db_ws.rows.append(["", "0001", "", "Boss", "1", "boss", "", "", "Active"])
    r.load()


def test_add_move_remove_compacts():
    r = make_roster()
    put_director(r)
    boss = Actor(1)
    a = r.add(boss, 10, "ann", "Ann", "Special Agent", None, None)
    b = r.add(boss, 11, "bob", "Bob", "Special Agent", None, None)
    assert (a["callsign"], b["callsign"]) == ("201", "202")
    removed = r.remove(boss, 10, "Resigned")
    assert removed["shifted"][0]["name"] == "Bob" and removed["shifted"][0]["new_callsign"] == "201"


def test_rank_cap_blocks_self_and_peers():
    r = make_roster()
    put_director(r)
    r.add(Actor(1), 10, "ann", "Ann", "Special Agent", None, None)
    with pytest.raises(RosterError):
        r.remove(Actor(10), 10, "Resigned")  # self
    with pytest.raises(RosterError):
        r.add(Actor(10), 12, "cy", "Cy", "Director", None, None)  # above own rank


def test_sheet_text_is_sanitized():
    r = make_roster()
    put_director(r)
    res = r.add(Actor(1), 10, "ann", "=IMPORTXML(1)\n\nx" + "a" * 200, "Special Agent", None, None)
    assert "\n" not in res["name"] and len(res["name"]) <= 60


def test_google_permission_error_is_actionable():
    class Response:
        status_code = 403
        text = "forbidden"

        @staticmethod
        def json():
            return {"error": {"code": 403, "message": "The caller does not have permission", "status": "PERMISSION_DENIED"}}

    class DeniedSheet:
        @staticmethod
        def batch_update(*args, **kwargs):
            raise APIError(Response())

    with pytest.raises(RosterError, match="protected row"):
        Roster._write(DeniedSheet(), {"D17": "Agent"})


def test_parse_until_limits():
    assert parse_until("14d") == dt.date.today() + dt.timedelta(days=14)
    with pytest.raises(RosterError):
        parse_until("9999d")
    with pytest.raises(RosterError):
        parse_until("2001-01-01")


def test_helpers():
    assert clip("x" * 2000, 1000).endswith("…") and len(clip("x" * 2000, 1000)) == 1000
    assert clean_text("a\x00b\nc", 10) == "a b c"
    assert _id("123") == 123 and _id("abc") == 0


def test_hours_format_and_board():
    assert hours.fmt_duration(3661) == "1h 01m"
    members = [{"discordId": "1", "seconds": 7200, "shifts": 2, "onDuty": True}]
    lines = hours.board_lines(members, required=3600 * 5)
    assert "<@1>" in lines[0] and "2h 00m" in lines[0] and "🟢" in lines[0] and "⚠️" in lines[0]
    data = {"members": members, "totalSeconds": 7200}
    assert "1 on duty" in hours.board_embed(data, 7).footer.text


async def test_movement_and_callsign_lines_match_staff_format(monkeypatch):
    from dohsbot import roster_bot as rb

    sent = []

    class Bot:
        async def post_plain(self, channel_id, content):
            sent.append((channel_id, content))

    monkeypatch.setattr(rb, "MOVEMENT_CHANNEL_ID", 5)
    monkeypatch.setattr(rb, "CALLSIGN_CHANNEL_ID", 6)
    bot = Bot()
    await rb.RosterBot.announce_movement(bot, 10, "Special Agent", 99)
    await rb.RosterBot.announce_callsigns(bot, [(10, "201"), (11, ""), ("", "5")])
    assert sent[0][0] == 5 and sent[0][1].startswith("<@10> --> Special Agent | <@99> | <t:") and sent[0][1].endswith(":D>")
    assert sent[1] == (6, "<@10> --> 201")


def test_owner_ids_bypass_every_check(monkeypatch):
    from types import SimpleNamespace
    from dohsbot import roster_bot as rb

    monkeypatch.setattr(rb, "OWNER_IDS", {42})
    assert rb.is_bypass(SimpleNamespace(id=42))
    assert not rb.is_bypass(SimpleNamespace(id=43))


def test_main_role_plan_matches_roster():
    from dohsbot.main_roles import expected_main_roles, plan_main_roles

    ranks = ["Director", "Chief of Staff", "Assistant Special Agent in Charge", "Agent"]
    roles = {"base": "B", "supervisor": "S", "high_command": "H"}
    members = [{"discord_id": "1", "rank": "Chief of Staff"}, {"discord_id": "2", "rank": "Agent"},
               {"discord_id": "3", "rank": "Assistant Special Agent in Charge"}, {"discord_id": "", "rank": "Agent"}]
    exp = expected_main_roles(members, ranks, roles, "Assistant Special Agent in Charge", "Chief of Staff")
    assert exp == {"1": {"B", "S", "H"}, "2": {"B"}, "3": {"B", "S"}}
    holders = {"B": ["2", "9"], "S": ["9", "3"], "H": ["9"]}
    changes, removals = plan_main_roles(exp, holders, ["B", "S", "H"])
    assert removals == 3 and all(c["discord_id"] == "9" for c in changes if c["action"] == "remove")
    assert {(c["discord_id"], c["role_id"]) for c in changes if c["action"] == "add"} == {
        ("1", "B"), ("3", "B"), ("1", "S"), ("1", "H")}


def test_exempt_owner_is_not_requeued_or_removed():
    from dohsbot.main_roles import plan_main_roles

    holders = {"B": ["7"], "S": ["7"]}
    assert plan_main_roles({"7": {"B", "S"}}, holders, ["B", "S"], exempt={"7"}) == ([], 0)
    assert plan_main_roles({}, holders, ["B", "S"], exempt={"7"}) == ([], 0)
