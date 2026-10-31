"""Who may give which role in a department Discord server.

Department Management sets the rules with /roleperms: a user or role is allowed or denied one
specific role, or every role (the all-role permission, stored as role_id 0). The most specific
rule wins: a rule for the role beats the all-role rule, and within each a rule for the user beats
rules for their roles. Between role rules at the same level a deny beats an allow. No rule means
no access.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any

ALL_ROLES = 0


def grant_decision(
    rules: Iterable[Mapping[str, Any]], role_id: int, user_id: int, member_role_ids: Iterable[int]
) -> bool | None:
    """True or False from the most specific matching rule, None when no rule matches."""
    held = set(member_role_ids)
    applicable = list(rules)
    for scope in (role_id, ALL_ROLES):
        scoped = [rule for rule in applicable if int(rule["role_id"]) == scope]
        user = [rule for rule in scoped if rule["subject_type"] == "user" and int(rule["subject_id"]) == user_id]
        if user:
            return bool(user[0]["allowed"])
        roles = [rule for rule in scoped if rule["subject_type"] == "role" and int(rule["subject_id"]) in held]
        if roles:
            return all(bool(rule["allowed"]) for rule in roles)
    return None


def role_problem(role, bot_top_position: int) -> str | None:
    """Why the bot cannot hand out a role at all, or None when it can."""
    if role.is_default():
        return "@everyone cannot be given."
    if role.managed:
        return f"{role.mention} belongs to an integration or bot and cannot be given by hand."
    if role.position >= bot_top_position:
        return f"{role.mention} is above the bot's highest role. Move the bot's role higher first."
    return None


def describe_rule(rule: Mapping[str, Any]) -> str:
    who = f"<@{rule['subject_id']}>" if rule["subject_type"] == "user" else f"<@&{rule['subject_id']}>"
    what = "every role" if int(rule["role_id"]) == ALL_ROLES else f"<@&{rule['role_id']}>"
    return f"{'Allow' if rule['allowed'] else 'Deny'} · {who} → {what}"
