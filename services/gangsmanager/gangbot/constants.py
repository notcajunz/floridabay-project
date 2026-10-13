GANG_CATEGORIES = (
    "Cartel",
    "Militia",
    "Criminal Org",
    "Street Gang",
    "Motorcycle Club",
)

CRIMINAL_ORG_SUBTYPES = (
    "Syndicate",
    "Crime Family",
    "Illegal Business",
)

COORDINATOR_RANKS = (
    "Gang Director",
    "Assistant Gang Director",
    "Gang Manager",
    "Lead Gang Coordinator",
    "Senior Gang Coordinator",
    "Gang Coordinator",
    "Trial Gang Coordinator",
)

# Director ranks belong in the global chain of command, not category rosters.
CATEGORY_COORDINATOR_RANKS = COORDINATOR_RANKS[2:]
GANG_MANAGER_PLUS_RANKS = COORDINATOR_RANKS[:3]
