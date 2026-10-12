# Florida Bay Roleplay

Florida Bay Roleplay is a standalone, no-economy FiveM framework built around vMenu. It combines a custom roleplay resource, EasyAdmin, pma-voice, a single Discord control bot, and MariaDB. It does not require QBCore or ESX.

## Included systems

- Police interactions: soft/hard cuffs, arrest state, uncuffing, searching visible weapons, checking ID, escorting, seating/unseating, blindfolds, `/911`, and officer `/panic`.
- Civilian interactions: zip ties, blindfolds, restraint removal, nearby `/me`, `/do`, and OOC chat.
- `s4_chat` is installed as the active chat UI, including branded automated messages and compatibility exports used by the framework.
- Three-line overhead identity: role-gated headtag on top, server ID/name always visible, role-gated or on-duty organization tag on the bottom.
- F6 tag wardrobe with two independently selected slots. Players can only select tags granted by synchronized Discord roles or direct bot grants.
- Staff `/clockin` and `/clockout`. Staff-only ACE principals - and therefore EasyAdmin/vMenu staff permissions - exist only during an open shift. Every shift has a MariaDB heartbeat and duration.
- Bot-created organizations for gangs, businesses, LEO, fire/rescue, government, and other groups. Every organization is gated by a required role in any registered network Discord. `/duty <slug>` applies its job, ACEs, and organization tag; `/offduty` removes them. Shift hours are reportable from Discord.
- F7 vehicle garage with server-side model validation and per-section ACE rules, plus engine, locks, seatbelt/ejection, cruise control, doors, and a K-key control panel.
- Vehicle fuel consumption, empty-tank engine cutoff, synchronized tank levels, and free refuelling at map-marked gas stations.
- Original HUD for AOP, priority status, peacetime, road/zone, heading, voice/radio, selected tags, organization duty, staff duty, speed, gear, RPM, fuel, locks, belt, and cruise.
- Bolingbroke prison: sentences from the MDT, third eye or `/jail` (restrained suspects only; staff `fbrp.staff.jail` from anywhere), served in online time (30 s per month by default) and resumed on reconnect. Inmates get a jumpsuit, no weapons, a server-checked yard leash, `/prisonwork` jobs that shorten the sentence, and a hidden fence panel for breakouts (needs on-duty police, not in peacetime) that issues a warrant and alerts every officer. `/jailtime`, `/prison`, `/unjail`.
- Police MDT (`/mdt`): dispatch dashboard (calls, units, inmates, fugitives), citizen lookup with criminal history, warrants and registered vehicles, citations and sentencing against a Florida penal code, warrants, BOLOs and plate lookups. Also `/runplate` (vehicle ahead), `/impound`, `/spikes`, GSR swabs, `/bodycam`, and `/respond <call>` for GPS to any 911/311/EMS call.
- Vehicle registry: garage spawns register automatically; `/registervehicle`, `/myvehicles`, `/reportstolen`, `/recovered`.
- Medical: players go down instead of dying, can send an EMS distress signal (G), and after 3 minutes bleed out to a hospital respawn (or the prison infirmary). EMS revive, treat and diagnose through the third eye; staff `/revive`. `/911` now reaches police and EMS; `/311` is non-emergency.
- ID cards (`/showid`, third eye "Show my ID"; police checks flag active warrants).
- Emotes: F3 menu or `/e <name>` (55 emotes, some with props), X hands up / cancel, B point.
- Fishing (`/fish`): salt- and freshwater species around Florida Bay, a reel-in mini-game, personal bests, server records (`/fishlog`, `/fishtop`).
- Florida Bay Activities: four repeatable, mode-specific checkpoint challenges (street sprint, off-road scramble, trail run, and bicycle circuit) with server validation, persistent personal/server records, points, and an on-screen run timer.
- Daily geocache hunt: one rotating hidden cache per day, search-area clues, persistent finds, bonus points, and streak tracking.
- M interaction hub: fishing, prison work, community-service/sentence status, activities, passport, scenes, emotes, player interactions, ID, vehicles, radio, organizations, tags, police tools, and direct 911/311 forms in one discoverable menu.
- Coastal Passport (`F4` or `/passport`): ten server-validated landmarks, permanent discovery stamps, five explorer ranks, a rotating featured stop, route setting, and three daily field notes tied to exploration and fishing.
- Original Florida Bay loading screen and generated Florida Bay Roleplay logo.
- AOP, peacetime, priority, announcements, dispatch calls, audit records, moderation cases, security incidents, tag selection, rosters, and all shift data in MariaDB.
- Badger-compatible `GetDiscordRoles`, identity, role-list exports plus `DiscordAcePerms`-style role-to-ACE syncing, backed by the centralized bot cache. The Discord bot token is not exposed to FXServer.

## Central Discord bot

One bot owns the Discord-facing control plane:

- `/ace`: create/delete groups, add/remove members, grant individual permission objects or curated EasyAdmin/bot bundles, bind and unbind Discord roles (`bind-role`/`unbind-role`), and inspect current mappings. Bound Law Enforcement, Fire & Rescue, and Verified Civilian roles grant their ACE groups automatically; other bound roles remain protected outputs of ACE membership.
- `/acelist`: page through every vMenu, EasyAdmin and Florida Bay ACE permission with descriptions, filtered by source or search.
- `/headtag`: create/delete/list headtags and gang tags, create or bind roles, grant/revoke access.
- `/organization`: create organizations and their role/tag/ACE group, manage rosters, deactivate organizations, inspect duty hours.
- `/network`: register and remove network servers (global roles live in `/globalsync`).
- `/mod`: ban, unban, kick, timeout, warn, and purge with case/audit records.
- `/server`: live status, AOP, peacetime, and in-game announcements.
- `/staff`: `add` puts a member in a staff rank's ACE group, assigns their callsign, and DMs their assignment plus a one-use staff-server invite; `move` promotes or demotes existing staff to another rank (keeping their callsign when it fits, no welcome DM); `remove` takes access away (all three need `fbrp.staff.assign` and only work on ranks below your own). Also individual hours, leaderboard, and forced clock-out.
- `/global`: Ascent-style network moderation (`warn`, `timeout`, `untimeout`, `kick`, `ban` with optional EasyAdmin game ban, `blacklist`, `unblacklist`, `unban`, `lookup`), gated by `fbrp.global.<action>` and the rank hierarchy.
- `/protectrole`: protect sensitive roles and choose the users/roles allowed to manage them.
- `/botguard`: two-key bot admission, trusted adders, security exemptions, policy inspection, and sweeps.
- `/security exempt-add|exempt-remove|exempt-list`: owner-only automated-security bypasses. An exemption can apply across the network or only in the server where the command is run; it bypasses anti-nuke, raid/account-age, spam, Bot Guard, and protected-role automation without granting permissions or bypassing manual moderation.
- `/ticket`: button/modal panel, private support-channel creation, claiming, queue listing, ticket-count tracking, and audited closure.
- `/roster`: categorized callsign ranges, rank/role/ACE-group mappings, automatic callsigns (posted to the staff callsign channel as `@member --> 123`; the bot never changes nicknames), secondary jobs, weekly requirements, statuses, notes, history, warnings/strikes, discipline revocation, profiles, and role reconciliation. All configuration is available through subcommands.
- `/userinfo`: linked game identities, ACE groups, organizations, hours, cases, and discipline in one investigation view.
- `/office`: assign and clear managed staff/organization voice offices.
- `/globalsync`: Ascent's ACE-backed global roles: add/edit/remove/list/push,
  per-server scopes, Discord permission integers, all-channel access, an
  interactive server picker, network role order (`order`/`move`), and `bind`,
  which binds an ACE group to an existing role (creating the sync if needed).
  Anyone who gets a synced role without being a direct member of its group is
  stripped and reported in the security log, live and on a 10-minute sweep.

The bot also serves the Florida Bay website and authenticated member portal on
`127.0.0.1:8080` by default. The public landing page includes live server
status. Discord OAuth or a one-time bot DM verifies portal members, who can see
their linked punishments and stable `FB-########` IDs, submit ban appeals, open
support tickets, and browse the staff roster. Staff accounts also receive the
shared ban/blacklist registry, appeal queue, staff profiles, organization
manager, and ticket operations workspace.

New members who have not verified are kept in an `FBRP | Unverified` waiting
role instead of being kicked. That role can only see the configured verification
channel; completing verification swaps it for the community-member role.

The original live configuration plane remains available inside the portal and
is hard-restricted to Discord user `1090083387638812755`. It covers global role
syncs, ACE permissions, tickets, channels, headtags, organizations, staff ranks
and discipline, protected roles, Bot Guard, security exemptions, offices,
server state, and advanced bot configuration. Every successful save runs the
relevant Discord/FiveM reconciliation before returning.

The bot also enforces protected roles, removes unapproved bots, detects rapid destructive Discord actions, mirrors ACE groups into every registered network server, re-syncs game permissions after Discord changes, and forwards game/staff/organization audit events into purpose-bound logging channels.

## First-time setup

Requirements: Linux, Node.js 22+, Docker with Compose (or an existing MariaDB 11.x server), and a Discord application with the Server Members intent enabled.

1. Create local secrets:

   ```bash
   cp .env.example .env
   cp services/fbrp-bot/.env.example services/fbrp-bot/.env
   cp server-data/secrets.cfg.example server-data/secrets.cfg
   ```

2. Use the same MariaDB password in `.env`, `services/fbrp-bot/.env`, and the `mysql_connection_string` in `server-data/secrets.cfg`. Use the same long service token in the bot environment and `fbrp_serviceToken`.

3. Start MariaDB and install the already-declared bot dependencies:

   ```bash
   docker compose up -d mariadb
   npm --prefix services/fbrp-bot install
   npm --prefix services/fbrp-bot run migrate
   ```

   `fbrp_core` also applies restart-safe migrations when FiveM starts, so either process can initialize an empty database.

4. In the Discord Developer Portal, enable **Server Members Intent** and add the deployed portal callback (for example `https://your-domain.example/fbrp/auth/callback.html`) as an OAuth2 redirect. Invite the bot with `bot` and `applications.commands` scopes. Give it Manage Roles, Manage Channels, Create Instant Invite, Kick Members, Ban Members, Moderate Members, Manage Messages, and View Audit Log. Its role must sit above every role it manages.

5. Put the bot token, application ID, comma-separated guild IDs and superuser IDs, service token, and database credentials in `services/fbrp-bot/.env`. Set the main guild ID in `server-data/secrets.cfg`.

6. Replace `CHANGE_ME` for `sv_licenseKey` in `server-data/server.cfg`, then run:

   ```bash
   ./start.sh
   ./start-bot.sh
   ```

   For production, copy `deploy/fbrp-bot.service` into `/etc/systemd/system/`, run `systemctl daemon-reload`, and enable it.

7. Every ID in `FBRP_SUPERUSER_IDS` is bootstrapped into the `owner` ACE group and bypasses bot-command checks. Everyone else starts with no managed administrative permissions. Use `/ace permission`, `/ace bundle`, and `/ace bind-role` to build the intended access model; use `/globalsync add` for roles that should exist across the whole network and `/globalsync bind` when a server should reuse an existing role.

8. Open `http://127.0.0.1:8080` on the host, or set `FBRP_PUBLIC_URL` and place
   it behind an HTTPS reverse proxy, to use the site and portal. The service
   intentionally binds only to localhost unless you change `FBRP_PANEL_HOST`.

## Default game controls and commands

| Control | Action |
|---|---|
| F1 | vMenu |
| M | Florida Bay interaction menu |
| F4 | Coastal Passport and daily field notes |
| F5 | Third-eye player interactions (look at a nearby player) |
| F6 | Headtag/gang-tag wardrobe |
| F7 | Custom vehicle garage |
| K | Vehicle control panel |
| G | Engine |
| B | Seatbelt |
| L | Vehicle locks |
| Y | Cruise control |
| F9 | Voice proximity |
| F11 | EasyAdmin menu (staff) |

Useful commands include `/clockin`, `/clockout`, `/staffhours`, `/duty [organization]`, `/offduty`, `/aop`, `/peacetime`, `/priority`, `/announce`, `/911`, `/panic`, `/me`, `/do`, and `/ooc`.

## Permission design

Static player permissions live in `server-data/config/permissions.cfg`. Discord-managed definitions live in `ace_groups`, `ace_entries`, `ace_memberships`, and `discord_role_bindings`.

Staff groups are marked `staff_only`. Holding the Discord role is not sufficient for in-game staff powers: `fbrp_core` attaches those principals only during `/clockin`. The bound Law Enforcement, Fire & Rescue, and Verified Civilian roles create persistent role-sourced ACE memberships automatically (and manual `/ace member-add` memberships still work). Organization ACE groups are applied only while that organization is on duty.

The stock vMenu vehicle spawner is not granted. Players use the F7 garage; edit `FBRP.VehicleCatalog` in `fbrp_core/config.lua` to add sections, models, and ACE requirements.

## Security notes

- Keep `server-data/secrets.cfg` and `services/fbrp-bot/.env` private; both are ignored.
- MariaDB binds to `127.0.0.1` in the included Compose file.
- The FiveM bot API requires a bearer token and only exposes health, refresh, announcement, state, and forced-clock-out operations.
- Gameplay actions are checked server-side for permission, target validity, and distance.
- Vehicle models and categories are checked server-side before the client receives spawn approval.
- Protected role enforcement uses Discord audit logs to identify the actor and revert unauthorized changes.
- Bot Guard requires both an approved bot ID and a trusted adder. Rapid destructive actions are recorded and trigger anti-nuke enforcement.

## Key paths

- `server-data/resources/[fbrp]/fbrp_core`: gameplay framework, HUD, menus, migrations.
- `services/fbrp-bot`: centralized Discord bot.
- `server-data/resources/[discord]`: Badger compatibility adapters.
- `server-data/resources/[standalone]/s4_chat`: installed custom chat resource.
- `server-data/resources/[fbrp]/fbrp_loading`: loading screen and primary logo.
- `server-data/config`: vMenu, voice, EasyAdmin, and static ACE configuration.
- `docker-compose.yml`: local MariaDB deployment.
