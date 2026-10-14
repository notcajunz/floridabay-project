BUSINESS_CATEGORIES = (
    "Car Clubs & Automotive",
    "Security & Protection",
    "Trucking & Contracting",
    "Miscellaneous",
)

COORDINATOR_RANKS = (
    "Head of Businesses",
    "Business Director",
    "Assistant Business Director",
    "Business Manager",
    "Assistant Business Manager",
    "Lead Business Coordinator",
    "Senior Business Coordinator",
    "Business Coordinator",
    "Trial Business Coordinator",
)

# Executive ranks belong in the global chain of command, not category rosters.
CATEGORY_COORDINATOR_RANKS = COORDINATOR_RANKS[3:]
BUSINESS_MANAGER_PLUS_RANKS = COORDINATOR_RANKS[:4]
