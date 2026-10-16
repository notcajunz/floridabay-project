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

## Tickets

Each type in `[[tickets.types]]` of `config.toml` is a button on the ticket panel and opens a private
channel in its own Discord category. Staff for a ticket are the type's `staff_role_ids` plus the
`[tickets] admin_role_ids`; the opener, anyone staff adds, and the bot are the only other viewers.

- Panel: posted to `panel_channel_id` on startup (edited in place afterwards); `/ticket panel` re-posts it.
- In a ticket: Claim, Close (with reason), Add/Remove member and Transcript buttons, plus
  `/ticket close|claim|add|remove|rename|transcript|list`.
- Closing locks the opener out of sending, writes an HTML transcript to the type's
  `transcript_channel_id` (and DMs it to the opener), and offers Reopen / Delete.
  Closed channels are removed after `delete_closed_after_hours`.
- Limits: `max_open` per member, `cooldown_seconds` between tickets, `blacklist_role_ids` cannot open.
- Tables `tickets` and `ticket_participants` live in the bot's own SQLite database.
