# FiveM Gang Manager Discord Bot

A persistent slash-command bot for managing FiveM gangs, assets,
locations, discipline, rewards, trades, taxes, temporary roles, and turf wars.
All 84 currently requested commands are registered. Data is isolated per Discord server
and stored in SQLite.

## Set up Discord

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications), add a bot, and copy its token.
2. In **Bot → Privileged Gateway Intents**, enable **Server Members Intent** and
   **Message Content Intent**.
3. In **OAuth2 → URL Generator**, select `bot` and `applications.commands`.
4. Give the bot these permissions: Manage Roles, Manage Nicknames, Send Messages,
   Embed Links, Read Message History, View Audit Log, and View Channels.
5. Invite it and move its Discord role above every gang or temporary role it must manage.

## Run locally

```bash
python3 -m venv .venv
.venv/bin/pip install -e .
cp .env.example .env
```

Keep the token in `.env`:

```dotenv
DISCORD_TOKEN=your-bot-token
CONFIG_PATH=config.toml
```

Set the development server ID, owner IDs, database location, administrator role,
and command access rules in [config.toml](config.toml). Environment variables
from `.env.example` may still override the matching bot settings.

Then start it:

```bash
.venv/bin/python -m gangbot
```

With `DISCORD_GUILD_ID` set, slash commands sync immediately to that server.
Leave it blank for global commands; Discord may take time to propagate global
command changes.

To use Docker instead:

```bash
docker compose up -d --build
```

## Access model

Administrative commands require one of:

- Discord Administrator;
- the role configured by `admin_role_id`;
- a user ID in `BOT_OWNER_IDS`; or
- an explicit `manager` override from `/permissions set`.

Gang-initiated economy commands additionally accept the gang owner or a member
with that gang's command role. Gang names autocomplete from the current server.

### Per-command configuration

`config.toml` lists every registered command under a named permission category.
Changing a category's mode, users, or roles applies it to every command in that
category. Exact command entries under `access.commands` can override a category.
Root wildcards (`"bank *"`) and the global wildcard (`"*"`) are also supported.
Exact rules take priority. Each rule supports:

- `inherit`: preserve the built-in command checks;
- `allowlist`: grant only listed user/role IDs, plus configured bypasses;
- `denylist`: grant everyone except listed user/role IDs.

An allowlisted user or role also satisfies the built-in manager check for that
specific command. Set `administrators_bypass` or `owners_bypass` to `false` if
those users should also be subject to the rules.

### Delegated role management

`/useradd manager role` delegates one role to either a member or another Discord
role. Delegated managers may use `/role add`, `/role remove`, and `/rolewipe` only
for roles assigned to them. Only the configured role-management administrator
role may use `/useradd`, `/userdel`, or `/role protection`. `/userdel` revokes the delegation. A protected role
cannot be removed or wiped until `/role protection action:Unprotect` is used.
Roles listed in `restricted_role_ids` have an additional hard restriction: only
members holding a role in `restricted_role_manager_role_ids` may add or remove
them. This applies to role and temporary-role commands as well as native Discord
member-role edits; unauthorized edits are reverted and logged in the configured
member-log channel. The bot needs View Audit Log and must sit above the protected
roles for native edits to be enforced.

Gang-role removals apply the category role configured under
`bot.parole_role_ids` for three days. Members are limited to one gang per
category unless they have a role configured in `multi_gang_bypass_role_ids`.
Category membership roles are configured under `bot.category_member_role_ids`.
The bot adds the matching membership role when a registered base gang role is
assigned and removes it once the member no longer holds any registered gang role
in that category. New server members receive `gang_member_role_id` automatically.
Members holding `gang_role_blocker_role_id` cannot receive any registered base
gang role. Members holding `gang_command_role_blocker_role_id` cannot receive
any registered gang command role. Adding either blocker also removes prohibited
roles the member already holds; blocked assignments are sent to the conflict log.

### Coordination and logging

Set `server_log_channel_id`, `voice_log_channel_id`,
`message_log_channel_id`, `join_leave_log_channel_id`, and
`member_log_channel_id`. The bot records server changes, voice moves,
edited/deleted messages, joins/leaves, nickname changes, and role changes. Leave
logs include the member's cached roles.

Coordinator rank roles are configured under `bot.coordinator_role_ids`, category
roles under `bot.category_coordinator_role_ids`, and roster channels under
`bot.coord_channel_ids`; Discord names no longer affect resolution. `/coord add`
assigns the selected rank and every rank below it, plus the shared role configured
by `gang_coord_team_role_id`. `/coord remove` removes that full coordinator role
set.
`/coord update` maintains one roster/liaison embed in every category channel and
the global chain-of-command embed in the configured channel. Director ranks only
appear in the global chain of command.

The gang tier directory is maintained in the configured tier channel whenever
the bot starts, a gang is created, added, updated, or removed, and when
`/coord update` runs. It groups every gang from Tier 4 (highest) to Tier 1
(lowest).

### Channel routing and live panels

Channel IDs live in [config.toml](config.toml) (`trade_channel_id`, `shop_channel_id`,
`leaderboard_channel_id`, `market_log_channel_id`, `location_channel_id`).

- `/trade offer` posts the offer with its Accept/Decline buttons in the trade channel,
  pinging the target gang's command role; `/trade give` is logged there too. The
  command itself replies privately with a link. If the channel is unavailable the
  command fails (and an offer is cancelled) instead of posting elsewhere.
- `/market sell` and `/bank market` are logged to the market log channel.
- The shop, economy leaderboard, and gang locations embeds are posted once, then edited
  in place. Shop and location commands refresh them immediately; a one-minute loop
  catches everything else (balances change from many commands) and re-posts a panel if
  its message is deleted. Long lists continue on additional embed messages.

## Important behavior choices

- Assets are `cash`, `dirty_money`, `drugs`, and `weapons`. For a gang linked
  to an FBRP organization, `cash` is its live organization wallet shared with
  FiveM and the member portal; only the three non-cash assets stay in SQLite.
- `dirty_money` is a separate balance that cannot be traded, invested, or used
  for shop purchases. Laundering debits it and credits spendable `cash`.
- `/bank disperse bonus` gives the flat cash bonus to every registered gang.
- `/market sell` sells `drugs` using the retail price configured by `/bank market`.
- A requested laundering job credits the processing gang with the fee; a self
  laundering fee leaves the economy. All laundering commands are restricted to
  Criminal Orgs, and the source gang's command role can submit requests.
- `/admin refreshgangtiers` names base roles `T<tier> | <gang name>`.
- `/gang add` creates an everyone-visible gang voice channel in the selected
  Discord category. The gang roles and configured voice-management roles can
  connect; the command role and voice-management roles can move, mute, and
  deafen members. `/lineadd` creates a staff-controlled `━━━━━━━` voice divider.
- `/gang add` and `/gang remove` allow Gang Manager+ roles and the configured
  `gang_add_remove_role_id`, in addition to normal manager/owner/admin access.
- Gang deletion removes the database record but deliberately leaves Discord roles
  in place to avoid destructive surprises.
- `/shop modify`, `/shop remove`, and `/shop sell` include practical options even
  though none were specified in the original command list.
- Trade and tax offers are posted with persistent Accept/Decline buttons. Only a
  member holding the target gang's configured command role may respond. Accepted
  trades move both sides atomically; `/trade give` remains an immediate one-way transfer.
- Laundering requests use the same command-role approval flow. The processing gang
  receives the laundering fee in cash.
- Cash income and market-sale proceeds automatically distribute active taxes to
  the gang that imposed each tax. All `/business` commands are removed.
- Relations, tax, and trade commands require access to the selected source gang;
  its command role can use them. Turf-war commands are restricted to Street Gangs,
  and investments require access to the selected `my_gang`.
- Gang type and tier inputs are constrained to the configured five types, three
  Criminal Org subtypes, and tiers 1–4.
- Setting `movement` from false to true posts the launch line in the configured
  launch channel, using the America/New_York date.
- `/reward give gang user amount` records the recipient and deposits the net cash
  reward into the gang bank.
- The configured bank fee is deducted from every received cash or asset amount;
  the fee leaves the economy and is recorded in ledger reasons.
- Supplying `outcome:auto` to `/turfwar stage` resolves the war from recorded
  investments. Cash is worth 1; drugs and weapons use their configured retail prices.
- `/role remove` requires Resigned or Terminated, logs the departure, and applies
  category parole. Conflicting category roles and parole violations are removed
  and sent to the configured alert channel.
- `/log transfer` is restricted to Gang Manager, Assistant Gang Director, and
  Gang Director. It moves the member between registered base gang roles without
  applying the normal three-day parole.
- Tier-3 command-role holders generate Staff Bypass Decision cards. Only the
  configured reviewer role can approve the configured bypass role.
- `/member logpunishment` supports Warning, Strike, and timed Suspension, posts
  to both punishment channels, and sends suspension records to the suspension log.

These rules are intentionally concentrated in the command/service layer so they
can be changed once your server's exact economy and workflow rules are known.

## Tests

```bash
.venv/bin/pytest -q
```

The tests verify database transactions, overdraft protection, command coverage,
Discord command nesting, and option serialization.
