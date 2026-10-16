# FBRP | DOHS Assistant

Discord bot for the **FBRP | Department of Homefront Security** server. It is the DHS
Roster Bot (slash commands that edit the DHS Google Sheet) plus in-game duty-hours
tracking from the FBRP organization system (DOHS is org `3`).

## Roster commands

| Command | Who | What it does |
|---|---|---|
| `/roster add member name rank [timezone] [dc_rank]` | Staff | Writes them into Employee Database (or re-hires), first open slot of the rank, nickname + rank role, DM |
| `/roster move member to` | Low Command+ | `to` = Up, Down or any rank; old rank closes its gap |
| `/roster remove member reason` | Staff | Clears the slot, sets status, resets nickname, removes DHS roles |
| `/roster dc member Up/Down` | Staff | DC rank one step |
| `/roster strike add\|remove` | Staff | Strike 1, Strike 2; red alert at 2 |
| `/roster loa start\|end` | Staff | LOA with automatic return (`until`: `01.11.2026`, `2026-11-01`, `14d`, `2w`; max one year) |
| `/roster update rank\|name\|details` | Staff | Close gaps, rename, edit status/time zone/notes/assignment |
| `/roster view`, `/roster lookup` | Everyone | Who holds a rank or callsign |
| `/roster info` | Staff | Full record, only visible to you |
| `/roster coc setup\|refresh` | Staff | Self-updating Chain of Command message |

You can only act on people below your own roster rank, never on yourself, and only
`owner_ids` (and anyone holding a `bypass_role_ids` role) skip every role and rank check, and no roster entry is needed.
add/move people into ranks below yours.

## Hours commands

Hours are the in-game `/duty` shifts of the linked FBRP org (`fbrp_org_id` in `config.json`),
read through the portal's `/api/gangs/org/<id>/hours`. An open shift counts only up to its
last heartbeat.

| Command | Who | What it does |
|---|---|---|
| `/hours me [days]` | DOHS members | Your hours, shifts and quota status (only you see it) |
| `/hours member member [days]` | Staff | Someone else's hours |
| `/hours leaderboard [days]` | DOHS members | Top members |
| `/hours report [days] [only_under_quota]` | Staff | Every roster member with hours; flags those under quota. Skips `LOA`, `Exempt`, `Reserve` |
| `/hours setup [channel]` | Staff | Posts the live leaderboard (default `#duty-hours`), refreshed every 5 minutes |
| `/hours org` | Staff | Shows the linked FBRP organization |

`hours_required` in `config.json` is the quota in hours per `hours_days` (default 7 days). `0` means no quota.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env     # DISCORD_TOKEN, FBRP_API_URL, FBRP_API_TOKEN
.venv/bin/python -m dohsbot
```

Roster commands need a Google service account key saved as `service_account.json` next to
`pyproject.toml` (git-ignored). Share the DHS sheet with the key's `...iam.gserviceaccount.com`
address as **Editor**. Without the key the bot still runs and the hours commands work; roster
commands answer that the sheet isn't connected, and the bot retries every 10 minutes.

The bot's role must sit above the DHS rank roles (it does). It uses only the default intents.
State (`loa.json`, `coc.json`, `hours.json`) lives in `data/` (git-ignored). Runs as the user
unit `dohs-bot.service`.

## Security notes

- The token and the service account key are only read from `.env` and `service_account.json`.
- The only network calls are Discord, Google Sheets and the portal API at `FBRP_API_URL`.
- Commands answer only inside the configured guild; user text is stripped of control
  characters and length-capped before it reaches the sheet, and the sheet is written in RAW
  mode so `=formulas` stay text.
