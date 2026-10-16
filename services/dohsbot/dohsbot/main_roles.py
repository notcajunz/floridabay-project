"""Main-server DHS roles bound to the DOHS roster. The main bot applies the changes."""
from __future__ import annotations


def expected_main_roles(members: list[dict], ranks: list[str], roles: dict[str, str],
                        supervisor_min_rank: str, high_command_min_rank: str) -> dict[str, set[str]]:
    """discord id -> main-server role ids that person should hold.

    `ranks` is the sheet order, highest rank first. Everyone on the roster gets the base role; the
    supervisor and high command roles stack on for people at or above their minimum rank.
    """
    def cutoff(name: str) -> int:
        return ranks.index(name) if name in ranks else -1

    sup, hc = cutoff(supervisor_min_rank), cutoff(high_command_min_rank)
    out: dict[str, set[str]] = {}
    for m in members:
        did = str(m.get("discord_id") or "")
        if not did.isdigit() or m["rank"] not in ranks:
            continue
        i = ranks.index(m["rank"])
        want = {roles["base"]}
        if sup >= 0 and i <= sup and roles.get("supervisor"):
            want.add(roles["supervisor"])
        if hc >= 0 and i <= hc and roles.get("high_command"):
            want.add(roles["high_command"])
        out[did] = want
    return out


def plan_main_roles(expected: dict[str, set[str]], holders: dict[str, list[str]],
                    role_ids: list[str]) -> tuple[list[dict], int]:
    """(changes, removal count). Holders without a roster entry lose every role; the rest are topped up."""
    changes: list[dict] = []
    removals = 0
    for role_id in role_ids:
        has = {str(i) for i in holders.get(role_id, [])}
        for did in sorted(has):
            if role_id not in expected.get(did, set()):
                changes.append({"discord_id": did, "role_id": role_id, "action": "remove"})
                removals += 1
        for did, want in sorted(expected.items()):
            if role_id in want and did not in has:
                changes.append({"discord_id": did, "role_id": role_id, "action": "add"})
    return changes, removals
