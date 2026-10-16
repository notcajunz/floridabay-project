from __future__ import annotations

import logging
import os

from .hours import HoursGroup
from .roster_bot import RosterBot


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    token = os.getenv("DISCORD_TOKEN", "").strip()
    if not token:
        raise SystemExit("Set DISCORD_TOKEN in .env")
    bot = RosterBot()
    bot.extra_groups.append(HoursGroup)
    bot.run(token, log_handler=None)


if __name__ == "__main__":
    main()
