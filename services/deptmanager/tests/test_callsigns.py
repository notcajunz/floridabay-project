import pytest

from deptbot.callsigns import callsign_style, matches_style, normalize_callsign


@pytest.mark.parametrize("value", ["2A-14", "1B-07", "AB-123", "ABC-123", "XY-001"])
def test_standard_callsign_shapes(value):
    assert matches_style("standard", value)


@pytest.mark.parametrize("value", ["A-14", "2AB-14", "2A-1", "2A-144", "ABCD-123", "AB-12", "AB123", "201", "2A14", ""])
def test_things_that_are_not_standard_callsigns(value):
    assert not matches_style("standard", value)


def test_homefront_security_uses_three_digit_numbers():
    for value in ("101", "201", "401"):
        assert matches_style("dhs", value)
    for value in ("2A-14", "20", "2011", "ABC"):
        assert not matches_style("dhs", value)


def test_dhs_is_recognised_by_name_or_initials():
    assert callsign_style({"name": "Department of Homefront Security", "initials": "DHS"}) == "dhs"
    assert callsign_style({"name": "Department of Homeland Security", "initials": None}) == "dhs"
    assert callsign_style({"name": "Somebody", "initials": "DOHS"}) == "dhs"
    assert callsign_style({"name": "Los Santos Police Department", "initials": "LSPD"}) == "standard"
    assert callsign_style({"name": "Blaine County Sheriff Office", "initials": "BCSO"}) == "standard"


def test_callsigns_are_tidied_before_use():
    assert normalize_callsign(" 2a - 14 ") == "2A-14"
    assert normalize_callsign("abc-123") == "ABC-123"
    assert normalize_callsign("  ") == ""
