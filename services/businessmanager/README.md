# FBRP Business Manager

Discord bot for the **FBRP | Businesses** server. It is based on the proven
Gang Manager architecture but keeps only business-relevant workflows.

## Features

- Create or register businesses with tier, category, owner, base role, command
  role, optional voice room, locations, specialty, and external Discord ID.
- Link each business to its FBRP organization ID. Its cash is then the live
  organization wallet shared with FiveM and the member portal; no second bot
  balance is used. `/business hours` reads member shifts from the same API, and
  the weekly hours panel refreshes every minute.
- Maintain the business tier directory, four category coordinator panels, and
  the global Business Coordination chain of command.
- Enforce one business per category, category resignation cooldowns, blacklist
  roles, command-role restrictions, category-member roles, and protected roles.
- Manage coordinators, liaisons, punishments, suspensions, delegated Discord
  roles, rewards, locations, embeds, DMs, and audit logs.
- Keep copied gang-only features such as laundering, contraband, and turf wars
  out of the registered command surface.

## Local setup

```bash
python3 -m venv .venv
.venv/bin/pip install -e .
cp .env.example .env
.venv/bin/python -m businessbot
```

Required `.env` values:

```dotenv
DISCORD_TOKEN=your_bot_token
CONFIG_PATH=config.toml
DISCORD_GUILD_ID=1559682840411635813
DATABASE_PATH=business_manager.db
BOT_OWNER_IDS=1090083387638812755,1099651002208104488
FBRP_API_URL=http://127.0.0.1:8080
FBRP_API_TOKEN=shared_portal_api_token
```

The bot requires Server Members and Message Content gateway intents, plus role,
channel, nickname, message, and audit-log permissions. Its Discord role must be
above every business role it manages.

Run tests with `.venv/bin/pytest -q`.
