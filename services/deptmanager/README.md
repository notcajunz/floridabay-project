# FBRP Department Manager

Discord bot for the **FBRP | Department Hub**. It follows the Gang Manager and
Business Manager architecture, reworked for departments: no economy, no voice
channels, and cooldowns instead of parole.

## Features

- `/dept create` makes the department role (`FBRP | LSPD`) and high command role
  (`LSPD High Command`) under the category divider. `/dept add` registers
  existing roles. Both post a movement to Department Coord / admin-movements
  with the category, head, **FBRP Org ID** and the hours-integration state.
- Each department links to its FBRP organization (`org_id`, a leo, fire,
  government or other org). Linked departments get weekly in-game duty hours on
  #dept-leaderboard: a department ranking plus each department's top members,
  refreshed every 5 minutes. `/dept hours` shows any range up to 90 days.
- `/dept status` (In Development, Launched, Inactive, Closed) posts to
  #dept-status-change.
- Categories: Main LEO, Main FED, Pre-Main, Armed Forces and Other. A member can
  hold one department per category (Other is exempt) and gets that category's
  divider role while they do.
- Cooldowns: resigning or being removed applies the category's **Resignation
  Cooldown** (3 days); `/transfer member` applies the **Transfer Cooldown**
  (7 days). Either cooldown blocks joining another department in the category.
  Hand edits in Discord follow the same rules. Transfer-blacklisted members
  cannot transfer.
- The chain of command in #chain-of-command is built from the rank roles
  themselves (each person under their highest rank) plus the DC job roles. It
  updates whenever a coordination role changes. There are no per-category
  coordinator sections.
- `/coord add|remove|job` hire, promote, demote and assign positions, logged to
  Admin Section / admin-movements.
- Member punishments, delegated role management, protected roles, temporary
  roles, permission overrides, embeds, DMs, and member/server/channel logs.

## Access

| Level | Minimum rank | Examples |
| --- | --- | --- |
| coordinator | Probationary Department Coordinator | `/dept info`, `/member logpunishment`, `/cooldown apply`, `/coord update` |
| manager | Assistant Department Manager | `/dept create`, `/coord add`, `/transfer blacklist`, `/cooldown clear` |
| director | Assistant Department Director | `/permissions`, `/useradd`, `/role protection`, `/admin avatar` |

Owners, Discord administrators and the `bypass_role_ids` (network management)
pass every check. Department heads and high command can add and remove their
own department role and read their own hours. Transfer Coordinators can run
`/transfer member`. The minimum ranks live in `[bot.level_ranks]`, and
`[access]` can allowlist or denylist any command.

## Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env   # DISCORD_TOKEN, FBRP_API_URL, FBRP_API_TOKEN
.venv/bin/python -m deptbot
```

The bot needs the **Server Members** and **Message Content** privileged
intents (Developer Portal → Bot). It runs as the user unit
`departments-bot.service`:

```bash
systemctl --user restart departments-bot
```

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

## Email database

`/email registrar|adduser|removeuser|wipe|list` talk to the Department Email Database, a Google
Apps Script web app (`SHEET_API_URL`, `SHEET_API_SECRET` in `.env`; the web app must be deployed
with access set to Anyone). `/email adduser` and `/email removeuser` post an Approve/Deny request in
`email_channel_id` that pings Senior Department Coordinator and above (`email_approver_rank`).
`/dept add` also creates the department's tab and `/dept remove` archives it (the Launch Group role,
`launch_group_role_id`, may run both). The bot reports registered members' hub roles to the sheet
every 15 minutes so access follows roles.
