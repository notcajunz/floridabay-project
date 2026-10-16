from __future__ import annotations

# Department categories. Each of the first four has its own transfer and
# resignation cooldown roles in the Department Hub. "Other" departments
# (civilian, government, justice) and "Handpicked" departments have no cooldowns
# and no one-per-category rule.
DEPARTMENT_CATEGORIES = (
    "Main LEO",
    "Main FED",
    "Pre-Main",
    "Armed Forces",
    "Other",
    "Handpicked",
)

NO_COOLDOWN_CATEGORIES = ("Other", "Handpicked")

COOLDOWN_KINDS = ("Transfer", "Resignation")

DEPARTMENT_STATUSES = (
    "In Development",
    "Launched",
    "Inactive",
    "Closed",
)

# Department Coordination ladder, highest first. Role IDs live in config.toml.
COORDINATOR_RANKS = (
    "Department Overseer",
    "Department Director",
    "Assistant Department Director",
    "Department Manager",
    "Assistant Department Manager",
    "Lead Department Coordinator",
    "Senior Department Coordinator",
    "Department Coordinator",
    "Probationary Department Coordinator",
)

# Minimum ladder rank for each permission level (overridable in config.toml).
DEFAULT_LEVEL_RANKS = {
    "coordinator": "Probationary Department Coordinator",
    "manager": "Assistant Department Manager",
    "director": "Assistant Department Director",
}
