# Florida Bay Roleplay

Florida Bay Roleplay is a standalone, no-economy FiveM framework built around vMenu. It combines a custom roleplay resource, EasyAdmin, pma-voice, Discord automation, and MariaDB. It does not require QBCore or ESX.

## Included systems

- Police interactions: soft/hard cuffs, arrest state, uncuffing, searching visible weapons, checking ID, escorting, seating/unseating, blindfolds, `/911`, and officer `/panic`.
- Civilian interactions: zip ties, blindfolds, restraint removal, nearby `/me`, `/do`, and OOC chat.
- `fbrp_chat` is the active, fully custom chat UI with large readable text, proximity OOC, `/me` and `/do`, command completion, history, anti-spam, announcements, and compatibility events/exports used by the framework and EasyAdmin.
- Three-line overhead identity: role-gated headtag on top, server ID/name always visible, role-gated or on-duty organization tag on the bottom.
- F6 tag wardrobe with two independently selected slots. Players can only select tags granted by synchronized Discord roles or direct bot grants. Tags may also be locked to one organization's duty and replace its normal duty tag while worn.
- Staff `/clockin` and `/clockout`. Staff-only ACE principals - and therefore EasyAdmin/vMenu staff permissions - exist only during an open shift. Every shift has a MariaDB heartbeat and duration.
- Bot-created organizations for gangs, businesses, LEO, fire/rescue, government, and other groups. Every organization is gated by a required role in any registered network Discord. `/duty` opens a dropdown of every organization you can clock in as and applies its job, ACEs, and organization tag; the same menu clocks you out. Shift hours are reportable from Discord.
- F7 vehicle garage with server-side model validation and per-section ACE rules, plus engine, locks, seatbelt/ejection, cruise control, doors, and a K-key control panel.
- Vehicle fuel consumption, empty-tank engine cutoff, synchronized tank levels, and free refuelling at map-marked gas stations.
- Synchronized vehicle sound systems (`/carradio` or M > Vehicle > Car Audio): paste a YouTube link, then pause, seek, stop, or change volume. Occupants hear full volume and nearby players outside the vehicle hear distance-based falloff up to 45 metres.
- Original HUD for AOP, priority status, peacetime, road/zone, heading, voice/radio, selected tags, organization duty, staff duty, speed, gear, RPM, fuel, locks, belt, and cruise.
- Bolingbroke prison: sentences from the MDT, third eye or `/jail` (restrained suspects only; staff `fbrp.staff.jail` from anywhere), served in online time (30 s per month by default) and resumed on reconnect. Inmates get a jumpsuit, no weapons, a server-checked yard leash, `/prisonwork` jobs that shorten the sentence, and a hidden fence panel for breakouts (needs on-duty police, not in peacetime) that issues a warrant and alerts every officer. `/jailtime`, `/prison`, `/unjail`.
- Police MDT (`/mdt`): dispatch dashboard (calls with priorities and a recently-closed list, units, inmates, fugitives), citizen lookup by name, former name, nickname, citizen number, phone, birth date or plate, with citizen details, aliases, criminal history, warrants and registered vehicles, citations and sentencing against a Florida penal code, warrants, BOLOs (auto-close after 72h), plate lookups, report addenda, and license suspension/revocation controls. Also `/runplate` (vehicle ahead), `/impound`, `/spikes`, GSR swabs, `/bodycam`, and `/respond <call>` for GPS to any 911/311/EMS call.
- Vehicle registry: garage spawns register automatically; `/registervehicle`, `/myvehicles`, `/reportstolen`, `/recovered`.
- Medical: players go down instead of dying, can send an EMS distress signal (G), and after 3 minutes bleed out to a hospital respawn (or the prison infirmary). EMS revive, treat and diagnose through the third eye; staff `/revive`. `/911` now reaches police and EMS; `/311` is non-emergency.
- Character phone (sky_phone 1.1.7 with a Florida Bay bridge; Up arrow or `/phone`): calls over pma-voice, contacts, messages and group chats, mail, camera and photos, notes, social apps, the company directory (law enforcement on duty answers 911, fire/rescue answers 913) and per-device settings. Every character picked at spawn has its own phone: number, contacts, messages, accounts and settings switch with the character. The number is issued on selection and shown on the citizen record and ID card. See `sky_phone/FLORIDA_BAY.md`.
- ID cards (`/showid`, third eye "Show my ID"; police checks flag active warrants). Civilians use `/citizen` (or the interaction menu) to edit their character: name, birth date and gender (once every 7 days, former names stay visible to police), descriptors, address and phone, ID card design and what it shows, instantly issue, restrict or surrender licenses, and report their vehicles stolen.
- Emotes: F3 menu or `/e <name>` (55 emotes, some with props), X hands up / cancel, B point.
- Fishing (`/fish`): salt- and freshwater species around Florida Bay, a reel-in mini-game, personal bests, server records (`/fishlog`, `/fishtop`).
- Florida Bay Activities: four repeatable, mode-specific checkpoint challenges (street sprint, off-road scramble, trail run, and bicycle circuit) with server validation, persistent personal/server records, points, and an on-screen run timer.
- Daily geocache hunt: one rotating hidden cache per day, search-area clues, persistent finds, bonus points, and streak tracking.
- M interaction hub: fishing, prison work, community-service/sentence status, activities, passport, scenes, emotes, player interactions, ID, vehicles, radio, organizations, tags, police tools, and direct 911/311 forms in one discoverable menu.
- Coastal Passport (`F4` or `/passport`): ten server-validated landmarks, permanent discovery stamps, five explorer ranks, a rotating featured stop, route setting, and three daily field notes tied to exploration and fishing.
- Florida Bay Pastimes (`/pastimes`, M > Explore): everything feeds one **Bay Rep** ladder (Newcomer to Florida Icon).
  - Side jobs: rideshare (passenger ped, tips for smooth driving), courier runs, bike messenger and air charter. The server picks both legs, checks vehicle type and position, rejects legs that were faster than physically possible, and rewards speed plus a ten-minute shift streak.
  - Supply drops: a crate lands somewhere on the map every 25 to 45 minutes. Everyone sees a search circle, the exact spot is revealed to anyone who gets close, and the first player to finish holding E wins. Staff with `fbrp.announce` can call one with `/supplydrop`.
  - Street duels (`/duel`, `/duelaccept`, `/dueldecline`, `/forfeit`): race another driver to your map waypoint. The server watches both cars (teleports and abandoned cars forfeit), keeps an Elo duel rating, win streaks and a leaderboard.
  - Skydiving: four jumps (Maze Bank, Observatory, Chiliad, high altitude) scored by landing distance from the target, with personal bests and server records.
  - Achievements and titles (about 35, computed from fishing, passport, challenges and every pastime), a daily check-in streak, and weekly community goals that everyone on the server fills together.
- Original Florida Bay loading screen and generated Florida Bay Roleplay logo, with a configurable YouTube loading song and an on-screen link field. Set the server default in `fbrp_loading/web/config.js`.
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
- `/staff`: `add` puts a member in a staff rank's ACE group and DMs their assignment plus a one-use staff-server invite; `move` promotes or demotes existing staff (no welcome DM); `remove` takes access away (all three need `fbrp.staff.assign` and only work on ranks below your own). Callsigns are assigned only to Trial Head Administrator and higher. Assistant Community Manager and higher automatically receive the derived `mgmt_team` ACE group, which is removed on demotion below ACM or staff removal. Also individual hours, leaderboard, and forced clock-out.
- `/role assign|unassign`: Assistant Community Manager and above can change ordinary role membership in the main server; protected roles keep the stricter protected-role authorization policy.
- `/global`: Ascent-style network moderation (`warn`, `timeout`, `untimeout`, `kick`, `ban` with optional EasyAdmin game ban, `blacklist`, `unblacklist`, `unban`, `lookup`), plus ACM+ self-service network nicknames with `/global nick`; moderation actions are gated by `fbrp.global.<action>` and the rank hierarchy.
- `/protectrole`: protect sensitive roles and choose the users/roles allowed to manage them.
- `/botguard`: two-key bot admission, trusted adders, security exemptions, policy inspection, and sweeps.
- `/security exempt-add|exempt-remove|exempt-list`: owner-only automated-security bypasses. An exemption can apply across the network or only in the server where the command is run; it fully excludes the account from anti-nuke, raid/account-age, spam, and Bot Guard detection in that scope without granting permissions or bypassing manual moderation. Protected roles retain their separate authorization policy.
- `/ticket`: button/modal panel, private support-channel creation, claiming, queue listing, ticket-count tracking, and audited closure.
- `/roster`: categorized callsign ranges, rank/role/ACE-group mappings, automatic callsigns for Trial Head Administrator and higher (posted to the staff callsign channel as `@member --> 123`; the bot never changes nicknames), secondary jobs, weekly requirements, statuses, notes, history, warnings/strikes, discipline revocation, profiles, and role reconciliation. All configuration is available through subcommands.
- `/callsign sync`: Community Director and above can republish every current Trial Head Administrator+ callsign to the staff callsign channel, including callsigns that have not changed.
- `/coc`: a live, multi-card chain-of-command board for Assistant Community Manager and above, backed by the staff roster. Management can publish or relocate it, add/update/remove people, set positions and assistants, and reorder the chain; listed members can update their own positions and assistants. The board edits in place and refreshes after roster changes.
- `/userinfo`: linked game identities, ACE groups, organizations, hours, cases, and discipline in one investigation view.
- `/case lookup`: complete lookup for any `FB-...` moderation or `IA-...` Internal Affairs case, also available in the staff website workspace.
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
their linked punishments and stable random `FB-######` IDs, submit ban appeals, open
support tickets, and browse the staff roster. Staff accounts also receive the
shared ban/blacklist registry, appeal queue, staff profiles, organization
manager, and ticket operations workspace.

New members who have not verified are kept in an `FBRP | Unverified` waiting
role instead of being kicked. That role can only see the configured verification
channel; completing verification swaps it for the community-member role.

Organizations have their own website at `orgs.floridabay.net` (served by the
same process; until that host answers over HTTPS the app runs at
`floridabay.net/orgs` and every link points there). It has a public directory
of every gang, business and department and, after Discord sign-in, each
organization's wallet, transfers, shop, properties, ledger, roster, activity
and a customizable rank ladder. The owner recorded by `/gang add`,
`/business add` or `/dept add` (the department head) and every holder of the
organization's command role run it with full access: they create, edit, delete
and reorder ranks, choose each rank's colour, description and permissions
(spend with a daily limit, sell, manage the roster, edit lower ranks, message of
the day, ledger, armory, garage), bind up to six Discord roles to each rank and
appoint leaders. Role sync gives members their rank's roles and removes other
ranks' roles; auto-rank instead ranks members by the bound roles they hold in
Discord. Owners and command are read read-only from the manager bots' SQLite
registries (`FBRP_GANG_DB`, `FBRP_BUSINESS_DB`, `FBRP_DEPARTMENT_DBS`
override the default paths). The main portal links out to it.

The original live configuration plane remains available inside the portal and
is hard-restricted to Discord user `1090083387638812755`. It covers global role
syncs, ACE permissions, tickets, channels, headtags, organizations, staff ranks
and discipline, protected roles, Bot Guard, security exemptions, offices,
server state, and advanced bot configuration. Every successful save runs the
relevant Discord/FiveM reconciliation before returning.

The bot also enforces protected roles, removes unapproved bots, detects rapid destructive Discord actions, mirrors ACE groups into every registered network server, re-syncs game permissions after Discord changes, and forwards game/staff/organization audit events into purpose-bound logging channels.

## Delegated role-manager bot

A separate bot process registers only `/addrole`, `/removerole`, `/wiperole`,
`/useradd`, `/setowner`, `/userdel`, and `/mgrwipe`. Each Discord role has one
persisted owner and any number of managers. Owners and managers can change that
role's membership; only the owner can change its managers. Server owners,
`ROLE_MANAGER_SUPERUSER_IDS`, and (as a fallback) `FBRP_SUPERUSER_IDS` can
bootstrap or recover ownership.

Set the dedicated application's reset token as `ROLE_MANAGER_BOT_TOKEN` in
`services/fbrp-bot/.env`. Enable its **Server Members Intent**, invite it with
the `bot` and `applications.commands` scopes, grant **Manage Roles**, and place
its bot role above every role it should manage. Run it with:

```bash
npm --prefix services/fbrp-bot run role-manager
```

For production, install and enable `deploy/fbrp-role-manager.service` alongside
the central bot service.

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

4. In the Discord Developer Portal, enable **Server Members Intent** and add the deployed portal callback (for example `https://your-domain.example/fbrp/auth/callback.html`) as an OAuth2 redirect. Invite the central bot with `bot` and `applications.commands` scopes. Give it Manage Roles, Manage Channels, Create Instant Invite, Kick Members, Ban Members, Moderate Members, Manage Messages, and View Audit Log. Invite the dedicated role-manager application with the same scopes and give it Manage Roles. Each bot's role must sit above every role it manages.

5. Put the central bot token, the freshly reset role-manager token, application ID, comma-separated guild IDs and superuser IDs, service token, and database credentials in `services/fbrp-bot/.env`. Set the main guild ID in `server-data/secrets.cfg`.

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
| Up arrow | Phone (`/phone`) |
| M | Florida Bay interaction menu |
| F4 | Coastal Passport and daily field notes |
| Hold Left Alt | Third-eye player interactions (hover the eye over a nearby player) |
| Caps Lock | Radio push-to-talk |
| F6 | Headtag/gang-tag wardrobe |
| F7 | Custom vehicle garage |
| K | Vehicle control panel |
| G | Engine |
| B | Seatbelt |
| L | Vehicle locks |
| Y | Cruise control |
| F9 | Voice proximity |
| F11 | EasyAdmin menu (staff) |

Useful commands include `/clockin`, `/clockout`, `/staffhours`, `/duty`, `/carradio`, `/aop`, `/peacetime`, `/priority`, `/announce`, `/911`, `/panic`, `/me`, `/do`, and `/ooc`.

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
- Bot Guard requires both an approved bot ID and a trusted adder. Anti-nuke thresholds apply only to rapid/mass channel creation or deletion and role creation or deletion; other guards operate independently.

## Key paths

- `server-data/resources/[fbrp]/fbrp_core`: gameplay framework, HUD, menus, migrations.
- `services/fbrp-bot`: centralized Discord bot.
- `services/fbrp-bot/src/role-manager-bot.js`: dedicated delegated-role bot.
- `server-data/resources/[discord]`: Badger compatibility adapters.
- `server-data/resources/[standalone]/fbrp_chat`: Florida Bay's custom proximity roleplay chat resource.
- `server-data/resources/[standalone]/sky_phone`: the character phone; `server-data/config/phone.cfg` starts it.
- `services/fbrp-bot/web/orgs`, `src/orgs-site.js`, `src/org-authority.js`: the organization website.
- `server-data/resources/[fbrp]/fbrp_loading`: loading screen and primary logo.
- `server-data/config`: vMenu, voice, EasyAdmin, and static ACE configuration.
- `docker-compose.yml`: local MariaDB deployment.
