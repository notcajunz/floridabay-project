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
- `/coord add|remove|job` also keep the **Department Coordination spreadsheet** up to date (see below).
- `/badge` makes department ID badges, one picture per rank (see below).
- `/sticky` keeps an embed as the newest message of a channel; `/embed post|edit` open a pop-up form
  (edit comes pre-filled with the embed's current title, text, colour, footer and image).
- Changing a department's status does not remove its email database tab or disable `/email`.
  The tab is archived only when the department itself is removed.
- Member punishments, delegated role management, protected roles, temporary
  roles, permission overrides, DMs, and member/server/channel logs.

## Department Discords

`/dept add` needs `guild_id`, the server ID of the department's own Discord. Leave `base_role` and
`command_role` empty and give `color` and `initials`, and the bot creates the Hub roles
(`FBRP | LSPD`, `LSPD High Command`) in that colour under the category divider. If the bot is not in
the department Discord yet, the reply has an invite link that adds it to exactly that server; the
commands below switch on there as soon as it joins. `/dept update guild_id:` or `unlink_guild:`
changes the link and `/dept info` shows it.

In a linked department Discord (and only there):

- `/role add|remove member role` give and take roles, `/role view role` lists who holds a role, who may
  give it and the pending requests, `/role create name color` makes a coloured role (Department
  Management, the Launch Group and server admins).
- `/request role role [reason]` posts the request with Approve/Deny buttons in the request channel.
- `/roleperms` is Department Management only (Hub manager level, owners, network management):
  `set role who Allow|Deny` for one role, `all who Allow|Deny` for every role (the all-role
  permission), `clear`, `list`, and `requests channel` for where requests go.

Department Management and server admins can give any role. Everyone else needs a rule: a rule for the
role beats the all-role rule, a rule for the member beats rules for their roles, and between role rules
a deny wins. Nobody (except management and admins) can give a role above their own highest role, a
role with Administrator, or change their own roles. The website reads `external_guild_id` from this
database: accepted department applicants on the orgs website are added to the linked Discord.

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

## Coordinator roster spreadsheet

`/coord add`, `/coord remove` and `/coord job` fill in the **FBRP | Department Coordination** sheet
(`roster_spreadsheet_id` in `config.toml`). The bot signs in with a Google service account
(`GOOGLE_SERVICE_ACCOUNT_FILE` in `.env`); share the sheet with that account's email as an **Editor**.

- **Master Roster**: a hire writes the Discord ID and the person's in-game name (from the Employee
  Database, else their server name) into the first free slot of their rank's block. A full block gets a
  new row. A promotion or demotion moves them. A removal empties the slot and puts the sheet's own
  Discord ID lookup formula back. `[bot.roster_rank_labels]` maps ladder ranks whose sheet wording differs.
- **Employee Database** (when the person has a row there): Movement Date on every rank change, Hired
  Date and Activity `Active` on a hire when blank, Activity `Resigned` or `Terminated` on a removal, and
  the job checkboxes for `/coord job`.
- **Always in step with Discord:** every 30 minutes (and on `/coord sync`) the bot compares the sheet with
  who holds each coordinator rank role and job role. It adds missing people, moves anyone in the wrong rank
  block, and empties rows of people with no rank (more than 3 such rows in an automatic run is treated as a
  bad read and left alone; `/coord sync` clears them). Names already on the sheet are never overwritten, rows
  with a name but no resolvable Discord ID are left alone, and job checkboxes are only ticked, never
  unticked (leadership rows tick every job on purpose).

A sheet problem never fails the command: the reply ends with a "Roster sheet: ..." line saying what
changed or why it could not.

## Badges

Badges are stored with the department's FBRP organization (so the department must be linked with
`/dept update org_id:`) and managed with the commands below or in the **Badges** tab of the orgs website.

- **Only the callsign changes.** Names and ranks are printed on the template picture and never replaced.
  Each rank has **its own badge picture** (with a sample callsign printed where the callsign goes: `5XX`,
  `2A-14`, ...), plus one **Default badge** used by every rank that has no picture of its own. Pick the rank
  in `/badge upload` (autocomplete), or on the website's Badges tab. Badges uploaded earlier by tier
  (Supervisor, Low Command, High Command) keep working as a fallback until they are removed.
- **Callsign shapes.** Normally `2A-14` (digit, letter, dash, two digits) or `AB-123` / `ABC-123` (two or three
  letters, dash, three digits). The Department of Homefront Security is the exception: plain three-digit
  numbers (`101`, `201`, `401`, set by its roster slots). Callsigns are tidied to upper case; an unusual shape
  still renders but carries a warning. The text is sized so the longest normal callsign fits the space.
- **The AI runs once, at upload.** `/badge upload` (or saving a new picture on the website) asks the lightest
  ChatGPT vision model (`BADGE_AI_MODEL`, default `gpt-5.4-nano`, using the website bot's `OPENAI_API_KEY`) which
  piece of text on the picture is the callsign. Small models cannot place boxes precisely, so the pixels do
  that part: text lines are found locally and the model only says what each close-up is. The sample callsign is
  then measured, curve-fitted for banners and erased from the stored picture (the untouched upload is kept).
  Nothing runs the AI again; fine-tune the spot with `/badge layout` or by dragging it on the website.
  Templates must be PNG (uploads are converted automatically).
- `/badge get` renders your rank's badge with your callsign from the roster. High command can pass `member`,
  `callsign` and `rank`.
- High command (department head, high command role, coordinators): `/badge upload`, `layout`, `preview`,
  `remove`, `list`; each takes the rank (or the default badge) as `badge`.
- Rendering uses the bundled DejaVu Sans and Serif fonts (`deptbot/assets/fonts`) so the website preview matches.
