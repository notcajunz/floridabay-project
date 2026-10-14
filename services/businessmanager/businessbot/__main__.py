from __future__ import annotations

import logging

from .bot import BusinessManagerBot
from .config import Config


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    config = Config.from_env()
    BusinessManagerBot(config).run(config.token, log_handler=None)


if __name__ == "__main__":
    main()

