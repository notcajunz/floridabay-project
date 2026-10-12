# Florida Bay bot command reference

This file documents every command registered by the Discord bot: **31 top-level slash commands**, **156 slash-command forms**, and the **`!f8` message command**. It is based on the command builders and the actual permission checks in `services/fbrp-bot/src` as of 2026-10-12.

## How permissions work

- The **Permission required** column describes the caller's access check. Slash commands do not declare Discord default-member permissions; access is enforced inside the bot.
- ACE permissions are hierarchical: an allowed parent such as `fbrp.global` or `fbrp.*` covers child objects unless a matching deny exists. Members listed in `FBRP_SUPERUSER_IDS` bypass ACE checks and rank comparisons, but they do **not** bypass functions explicitly locked to the single hard-coded owner.
- “Hard-coded owner” means Discord ID `1090083387638812755`, as defined in `src/access-control.js`. `/welcome` and `/verification` also accept configured superusers; `/invite`, `/github`, `/backup`, ACE mutations, vMenu mutations, and security-exemption mutations use the stricter hard-coded-owner check.
- Configured ticket support/manager roles are an alternative permission path only where explicitly shown.
- Discord-side prerequisites still apply: the bot's role must be high enough and the bot must have the relevant Discord permissions (for example Manage Roles, Ban Members, Kick Members, Moderate Members, Manage Messages, Manage Channels, or Create Invite). These are operational requirements for the bot, not extra caller permissions.
- Syntax uses `<required>` and `[optional]`. Discord's UI supplies the options; the angle/square brackets are documentation only.

## Command index

[`/exam`](#exam) · [`/orgbank`](#orgbank) · [`/welcome`](#welcome) · [`/github`](#github) · [`/verification`](#verification) · [`/backup`](#backup) · [`/ace`](#ace) · [`/headtag`](#headtag) · [`/organization`](#organization) · [`/radio`](#radio) · [`/network`](#network) · [`/globalsync`](#globalsync) · [`/mod`](#mod) · [`/server`](#server) · [`/staff`](#staff) · [`/protectrole`](#protectrole) · [`/botguard`](#botguard) · [`/security`](#security) · [`/ticket`](#ticket) · [`/support`](#support) · [`/vmenu`](#vmenu) · [`/help`](#help) · [`/roster`](#roster) · [`/global`](#global) · [`/blacklist`](#blacklist) · [`/blacklistedserver`](#blacklistedserver) · [`/acelist`](#acelist) · [`/userinfo`](#userinfo) · [`/office`](#office) · [`/join`](#join) · [`/invite`](#invite)

## /exam

Give out staff promotion exams (Head of Management and above)

| Command | What it does | Permission required |
|---|---|---|
| `/exam give <member> <exam>` | Open an exam for a member for 60 minutes<br><small>Arguments: `member` (required user) — Staff member sitting the exam. `exam` (required text) — Which exam. Choices: `Head Administrator exam`, `Management exam`.</small> | Head of Management rank or higher; configured bot superusers also qualify |
| `/exam revoke <member> <exam>` | Close a member's exam access early<br><small>Arguments: `member` (required user) — Staff member. `exam` (required text) — Which exam. Choices: `Head Administrator exam`, `Management exam`.</small> | Head of Management rank or higher; configured bot superusers also qualify |
| `/exam active` | List exam access that is open right now | Head of Management rank or higher; configured bot superusers also qualify |

Important behavior:

- `give` creates a one-hour portal grant and only works when the member's current direct staff rank is eligible for that exam; it cannot be given to yourself.
- `revoke` only closes an active, unused grant. `active` lists unexpired grants.

## /orgbank

Organization wallets: balances, ledger and management

| Command | What it does | Permission required |
|---|---|---|
| `/orgbank balance [organization]` | Show an organization's wallet<br><small>Arguments: `organization` (optional text) — Organization slug (defaults to yours).</small> | Membership in the selected organization, or `fbrp.organizations.manage` |
| `/orgbank ledger [organization]` | Recent wallet transactions<br><small>Arguments: `organization` (optional text) — Organization slug (defaults to yours).</small> | Membership in the selected organization, or `fbrp.organizations.manage` |
| `/orgbank adjust <organization> <amount> <reason>` | Add or remove money from a wallet<br><small>Arguments: `organization` (required text) — Organization slug. `amount` (required integer) — Positive to add, negative to remove. `reason` (required text) — Reason recorded in the ledger.</small> | `fbrp.organizations.manage` |
| `/orgbank leader <organization> <member> <leader>` | Grant or remove spending (leader) access<br><small>Arguments: `organization` (required text) — Organization slug. `member` (required user) — Discord member. `leader` (required true/false) — true to grant, false to remove.</small> | `fbrp.organizations.manage` |
| `/orgbank transfer <to> <amount> <memo> [organization]` | Send money from your organization's wallet to another organization<br><small>Arguments: `to` (required text) — Receiving organization slug. `amount` (required integer) — Amount in dollars. `memo` (required text) — What the money is for (shown in both ledgers). `organization` (optional text) — Sending organization slug (defaults to yours).</small> | Leader of the sending organization, a rank with spending access (within its daily limit), or `fbrp.organizations.manage` |
| `/orgbank roster [organization]` | Members, ranks and duty hours this week<br><small>Arguments: `organization` (optional text) — Organization slug (defaults to yours).</small> | Membership in the selected organization, or `fbrp.organizations.manage` |

Important behavior:

- Balance and ledger access is limited to the selected organization's members unless the caller has organization-management access.
- An adjustment cannot reduce a wallet below zero. Leaders, and ranks with spending access, can buy from the portal and send transfers. A leader must hold the organization's access role.
- Leaders build a rank ladder on the portal (level 1-99 with spending, roster, armory and garage access and an optional daily spend limit). Ranks with roster access can promote and demote members ranked below them.

## /welcome

Owner-only: create or refresh the welcome channel with the verification guide

| Command | What it does | Permission required |
|---|---|---|
| `/welcome [category]` | Owner-only: create or refresh the welcome channel with the verification guide<br><small>Arguments: `category` (optional channel) — Category to put the welcome channel in (default: the configured one).</small> | Hard-coded owner or a configured bot superuser |

Important behavior:

- Creates `#welcome` under the selected/configured category if absent; otherwise refreshes the bot's existing guide message.

## /github

Owner-only: save the whole project to the private GitHub repository

| Command | What it does | Permission required |
|---|---|---|
| `/github sync` | Save the code, website, game server and database to GitHub now | Hard-coded Florida Bay owner account only |
| `/github status` | Show the last GitHub sync | Hard-coded Florida Bay owner account only |

Important behavior:

- `sync` invokes the repository backup workflow; `status` is read-only but is still restricted to the single hard-coded owner.

## /verification

Owner-only: website verification status and overrides

| Command | What it does | Permission required |
|---|---|---|
| `/verification status [user]` | Show verification totals, or one member's status<br><small>Arguments: `user` (optional user) — Member to inspect.</small> | Hard-coded owner or a configured bot superuser |
| `/verification grant <user>` | Verify a member by hand and give the verified role<br><small>Arguments: `user` (required user) — Member.</small> | Hard-coded owner or a configured bot superuser |
| `/verification revoke <user>` | Remove a member's verification and role<br><small>Arguments: `user` (required user) — Member.</small> | Hard-coded owner or a configured bot superuser |

Important behavior:

- `grant` writes a manual verification record and grants the verified role; `revoke` removes the record and verified role across the network.

## /backup

Owner-only: back up and restore every Florida Bay Discord server

| Command | What it does | Permission required |
|---|---|---|
| `/backup save [label]` | Save a backup of EVERY network server (roles, channels, permissions, member roles)<br><small>Arguments: `label` (optional text) — Optional note for this backup.</small> | Hard-coded Florida Bay owner account only |
| `/backup list` | List saved backups | Hard-coded Florida Bay owner account only |
| `/backup restore [backup_id] [confirm] [members]` | Restore EVERY network server from a backup (additive; preview unless confirm is true)<br><small>Arguments: `backup_id` (optional integer) — Backup ID (default: newest). `confirm` (optional true/false) — true = apply the restore; otherwise only preview. `members` (optional true/false) — Also re-give lost roles to members (default: yes).</small> | Hard-coded Florida Bay owner account only |

Important behavior:

- `restore` is additive. Without `confirm:true` it is a preview. Member-role restoration defaults to enabled.

## /ace

Manage MariaDB-backed ACE groups

| Command | What it does | Permission required |
|---|---|---|
| `/ace group-create <name> <label> [rank] [staff_only]` | Create an ACE group<br><small>Arguments: `name` (required text) — Machine name. `label` (required text) — Display label. `rank` (optional integer) — Higher groups sort first. `staff_only` (optional true/false) — Only apply in game while /clockin is active.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/ace group-delete <name>` | Delete an ACE group and its mappings<br><small>Arguments: `name` (required text) — Group name.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/ace permission <group> <object> <mode>` | Allow or deny an ACE object for a group<br><small>Arguments: `group` (required text) — Group name. `object` (required text) — ACE object or prefix.*. `mode` (required text) — Permission mode. Choices: `Allow`, `Deny`, `Remove`.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/ace bundle <group> <bundle> <mode>` | Grant or remove a curated permission bundle<br><small>Arguments: `group` (required text) — Group name. `bundle` (required text) — Bundle name from /ace catalog. `mode` (required text) — Grant or remove the bundle. Choices: `Grant`, `Remove`.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/ace member-add <group> <member>` | Add a direct group member<br><small>Arguments: `group` (required text) — Group name. `member` (required user) — Discord member.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/ace member-remove <group> <member>` | Remove direct group membership<br><small>Arguments: `group` (required text) — Group name. `member` (required user) — Discord member.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/ace bind-role <group> <role>` | Gate a Discord role behind direct ACE membership<br><small>Arguments: `group` (required text) — Group name. `role` (required role) — Role to bind.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/ace unbind-role <role> [group]` | Stop gating a Discord role behind an ACE group<br><small>Arguments: `role` (required role) — Bound role. `group` (optional text) — Only remove this group's binding (default: every binding of the role). Autocomplete is provided.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/ace list` | List groups, ACE entries, and role bindings | `fbrp.perms.manage` |
| `/ace catalog` | Show permission objects and bundles | `fbrp.perms.manage` |

Important behavior:

- All mutations are deliberately double-gated: the caller must pass the ACE check and must be the single hard-coded owner. `list` and `catalog` only need the ACE permission.
- Staff-rank membership additions also include lower staff-rank ACE groups. Role bindings are enforced by the synchronization system.

## /headtag

Create and manage overhead tags

| Command | What it does | Permission required |
|---|---|---|
| `/headtag create <kind> <label> <color> [role] [priority]` | Create a Discord-gated headtag or gang tag<br><small>Arguments: `kind` (required text) — Tag slot. Choices: `Headtag (top)`, `Gang tag (bottom)`. `label` (required text) — Text shown in game. `color` (required text) — Hex color, e.g. #43E8D8. `role` (optional role) — Existing role; leave blank to create one. `priority` (optional integer) — Wardrobe order.</small> | `fbrp.headtags.manage` |
| `/headtag delete <id> [delete_role]` | Delete a tag definition<br><small>Arguments: `id` (required integer) — Tag ID. `delete_role` (optional true/false) — Also delete the bot-created role.</small> | `fbrp.headtags.manage` |
| `/headtag grant <id> <member>` | Grant a tag directly<br><small>Arguments: `id` (required integer) — Tag ID. `member` (required user) — Discord member.</small> | `fbrp.headtags.manage` |
| `/headtag revoke <id> <member>` | Revoke direct tag access<br><small>Arguments: `id` (required integer) — Tag ID. `member` (required user) — Discord member.</small> | `fbrp.headtags.manage` |
| `/headtag list` | List all headtags and gang tags | `fbrp.headtags.manage` |

Important behavior:

- If `create` is run without a role, the bot creates one. `delete_role` controls whether deleting a tag also deletes its Discord role.

## /organization

Manage gangs, businesses, and departments

| Command | What it does | Permission required |
|---|---|---|
| `/organization create <slug> <name> <type> <color> [tag] [access_role] [network_role_id] [network_guild_id]` | Create an organization, its in-game tag, and ACE group<br><small>Arguments: `slug` (required text) — Short command name. `name` (required text) — Display name. `type` (required text) — Organization type. Choices: `Gang`, `Business`, `Law enforcement`, `Fire & rescue`, `Government`, `Other`. `color` (required text) — Hex color. `tag` (optional text) — Text of the in-game tag (defaults to the display name). `access_role` (optional role) — Role in this server required to clock in. `network_role_id` (optional text) — Required role ID from another network server. `network_guild_id` (optional text) — Server ID that owns network_role_id.</small> | `fbrp.organizations.manage` |
| `/organization delete <slug>` | Deactivate an organization<br><small>Arguments: `slug` (required text) — Organization slug.</small> | `fbrp.organizations.manage` |
| `/organization hours <slug> [member]` | Show organization duty hours<br><small>Arguments: `slug` (required text) — Organization slug. `member` (optional user) — Optional member filter.</small> | `fbrp.organizations.manage` |
| `/organization list` | List organizations | `fbrp.organizations.manage` |

Important behavior:

- Creating an organization also creates its ACE group and in-game tag and binds eligibility to an existing role in a registered network server.

## /radio

Configure in-game radio channels

| Command | What it does | Permission required |
|---|---|---|
| `/radio create <channel> <name> [organization] [description] [color]` | Create or update a managed frequency<br><small>Arguments: `channel` (required integer) — Frequency number. `name` (required text) — Channel display name. `organization` (optional text) — Organization slug; omit for a public channel. `description` (optional text) — Short channel description. `color` (optional text) — Six-digit hex color.</small> | `fbrp.radio.manage` |
| `/radio delete <channel>` | Delete a managed frequency<br><small>Arguments: `channel` (required integer) — Frequency number.</small> | `fbrp.radio.manage` |
| `/radio list` | List managed radio frequencies | `fbrp.radio.manage` |

## /network

Manage the Florida Bay Discord network (global roles live in /globalsync)

| Command | What it does | Permission required |
|---|---|---|
| `/network add <kind>` | Add this Discord server to the network<br><small>Arguments: `kind` (required text) — Server type. Choices: `Main`, `Staff`, `Gang`, `Department`, `Community`, `Business`, `Partner`, `Other`.</small> | `fbrp.network.manage` |
| `/network remove` | Remove this Discord server from the network | `fbrp.network.manage` |
| `/network list` | List network servers and synced roles | `fbrp.network.manage` |

## /globalsync

Sync an ACE group's Discord role across every Florida Bay server

| Command | What it does | Permission required |
|---|---|---|
| `/globalsync add <group> [name] [scope] [permissions] [all_channels] [color] [hoist] [mentionable] [existing_role] [existing_roles]` | Create a synced role: group members get it in every matching server<br><small>Arguments: `group` (required text) — ACE group whose members wear the role. Autocomplete is provided. `name` (optional text) — Role name (defaults to the group name). `scope` (optional text) — Which servers get the role: a server type, or pick individual servers. Choices: `All servers`, `Every server except main`, `Main server`, `Staff servers`, `Gang servers`, `Department servers`, `Community servers`, `Business servers`, `Partner servers`, `Other servers`, `Pick individual servers`. `permissions` (optional text) — Discord permissions integer; 0 grants no base permissions. `all_channels` (optional true/false) — See/chat in every text channel and see/join every voice channel. `color` (optional text) — Hex color, e.g. #43E8D8. `hoist` (optional true/false) — Show separately in the member list. `mentionable` (optional true/false) — Allow members to mention the role. `existing_role` (optional role) — Optional: use this existing role in this server instead of creating one. `existing_roles` (optional text) — Optional: existing role IDs to use in other servers (comma separated).</small> | `fbrp.network.manage`; configured bot owner/superuser additionally required for the `owner` group, dangerous permission bits, or an existing role with dangerous permissions |
| `/globalsync edit <group> [name] [scope] [permissions] [all_channels] [color] [hoist] [mentionable] [existing_role] [existing_roles]` | Edit an existing global role sync and apply the changes everywhere<br><small>Arguments: `group` (required text) — Synced group to edit. Autocomplete is provided. `name` (optional text) — New role name. `scope` (optional text) — Which servers get the role: a server type, or pick individual servers. Choices: `All servers`, `Every server except main`, `Main server`, `Staff servers`, `Gang servers`, `Department servers`, `Community servers`, `Business servers`, `Partner servers`, `Other servers`, `Pick individual servers`. `permissions` (optional text) — Discord permissions integer; 0 grants no base permissions. `all_channels` (optional true/false) — See/chat in every text channel and see/join every voice channel. `color` (optional text) — Hex color, e.g. #43E8D8. `hoist` (optional true/false) — Show separately in the member list. `mentionable` (optional true/false) — Allow members to mention the role. `existing_role` (optional role) — Optional: use this existing role in this server instead of creating one. `existing_roles` (optional text) — Optional: existing role IDs to use in other servers (comma separated).</small> | `fbrp.network.manage`; configured bot owner/superuser additionally required for the `owner` group, dangerous permission bits, or an existing role with dangerous permissions |
| `/globalsync remove <group> [delete_roles]` | Stop syncing a group's role<br><small>Arguments: `group` (required text) — Synced group. Autocomplete is provided. `delete_roles` (optional true/false) — Delete roles created by the bot (default: yes).</small> | `fbrp.network.manage` |
| `/globalsync list` | List every synced role and where it lives | `fbrp.network.manage` |
| `/globalsync push` | Re-create missing synced roles everywhere and re-sync every member | `fbrp.network.manage` |
| `/globalsync servers <group>` | Pick exactly which network servers a synced role lives in<br><small>Arguments: `group` (required text) — Synced group. Autocomplete is provided.</small> | `fbrp.network.manage` |
| `/globalsync order [groups]` | Show or set which synced roles sit above others in every server<br><small>Arguments: `groups` (optional text) — Comma-separated ACE groups from top to bottom.</small> | `fbrp.network.manage` |
| `/globalsync move <group> <position>` | Move one synced role to a spot in the network order (1 = top)<br><small>Arguments: `group` (required text) — Synced group. Autocomplete is provided. `position` (required integer) — 1 is highest.</small> | `fbrp.network.manage` |
| `/globalsync bind <group> <role>` | Bind an ACE group to an existing role here (creates the global sync if needed)<br><small>Arguments: `group` (required text) — ACE group whose members wear the role. Autocomplete is provided. `role` (required role) — Existing role in this server.</small> | `fbrp.network.manage`; configured bot owner/superuser additionally required for the `owner` group or a role with dangerous permissions |

Important behavior:

- These commands manage roles derived from direct ACE membership across registered Discord servers. The bot strips the synced role from unauthorized members.
- `servers` opens an interactive picker. `order` with no groups is read-only; with groups it updates the network-wide role order.
- Dangerous permissions are Administrator, Manage Server, Manage Roles, Ban Members, Manage Channels, and Manage Webhooks.

## /mod

Discord moderation with MariaDB case logging

| Command | What it does | Permission required |
|---|---|---|
| `/mod ban <member> <reason> [delete_days]` | Ban a member<br><small>Arguments: `member` (required user) — Discord member. `reason` (required text) — Reason recorded in the audit log. `delete_days` (optional integer) — Delete recent messages.</small> | `fbrp.discord.mod.ban` and the target must rank below you |
| `/mod unban <user_id> <reason>` | Unban a Discord user ID<br><small>Arguments: `user_id` (required text) — Discord user ID. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.discord.mod` |
| `/mod kick <member> <reason>` | Kick a member<br><small>Arguments: `member` (required user) — Discord member. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.discord.mod.kick` and the target must rank below you |
| `/mod timeout <member> <minutes> <reason>` | Timeout a member<br><small>Arguments: `member` (required user) — Discord member. `minutes` (required integer) — 0 removes timeout. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.discord.mod` and the target must rank below you |
| `/mod warn <member> <reason>` | Warn a member and record a case<br><small>Arguments: `member` (required user) — Discord member. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.discord.mod` and the target must rank below you |
| `/mod purge <count> <reason>` | Delete recent messages<br><small>Arguments: `count` (required integer) — Messages to delete. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.discord.mod` |

Important behavior:

- The permission column is the caller check. Discord role hierarchy and the bot's Ban/Kick/Moderate/Manage Messages capabilities must also allow the requested action.
- `timeout` with `minutes:0` removes a timeout. Ban and kick are subject to a persistent command cooldown.

## /server

Control live Florida Bay state

| Command | What it does | Permission required |
|---|---|---|
| `/server status` | Show bot, database, and FiveM health | Everyone |
| `/server aop <value>` | Set the area of play<br><small>Arguments: `value` (required text) — AOP label.</small> | `fbrp.ops` |
| `/server peacetime <enabled>` | Set peacetime<br><small>Arguments: `enabled` (required true/false) — Peacetime state.</small> | `fbrp.ops` |
| `/server announce <message>` | Send an in-game announcement<br><small>Arguments: `message` (required text) — Announcement.</small> | `fbrp.ops` |

## /staff

Staff ranks and duty tracking

| Command | What it does | Permission required |
|---|---|---|
| `/staff add <member> <rank> [callsign]` | Put a member in a staff rank's ACE group and give them a callsign<br><small>Arguments: `member` (required user) — Discord member. `rank` (required text) — Staff rank (only ranks below your own are allowed). Autocomplete is provided. `callsign` (optional integer) — Specific callsign; blank keeps theirs or picks the next free one.</small> | `fbrp.staff.assign`; target and assigned rank must be below your highest ACE rank |
| `/staff move <member> <rank> [callsign] [reason]` | Move an existing staff member to another rank (promote or demote)<br><small>Arguments: `member` (required user) — Discord member. `rank` (required text) — New staff rank (only ranks below your own are allowed). Autocomplete is provided. `callsign` (optional integer) — Specific callsign; blank keeps theirs if it fits the new rank. `reason` (optional text) — Reason for the move.</small> | `fbrp.staff.assign`; target and assigned rank must be below your highest ACE rank |
| `/staff remove <member> <reason>` | Remove a member's staff rank, ACE group, and callsign<br><small>Arguments: `member` (required user) — Discord member. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.staff.assign`; target must be below your highest ACE rank |
| `/staff hours <member>` | Show a member’s staff hours<br><small>Arguments: `member` (required user) — Discord member.</small> | `fbrp.staff.manage` |
| `/staff leaderboard [days]` | Show staff hours leaderboard<br><small>Arguments: `days` (optional integer) — Window in days.</small> | `fbrp.staff.manage` |
| `/staff forceout <member> <reason>` | Close a member’s active staff shift<br><small>Arguments: `member` (required user) — Discord member. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.staff.manage` |

Important behavior:

- `add`, `move`, and `remove` enforce strict rank hierarchy. `forceout` closes an active game/staff shift but does not remove the member's staff rank.

## /protectrole

Guard sensitive Discord roles

| Command | What it does | Permission required |
|---|---|---|
| `/protectrole add <role>` | Protect a role<br><small>Arguments: `role` (required role) — Protected role.</small> | Discord IDs `1090083387638812755` or `1099651002208104488` only |
| `/protectrole remove <role>` | Stop protecting a role<br><small>Arguments: `role` (required role) — Protected role.</small> | Discord IDs `1090083387638812755` or `1099651002208104488` only |
| `/protectrole list` | List protected roles | Discord IDs `1090083387638812755` or `1099651002208104488` only |

Only those two accounts (plus the bot itself for automated enforcement) can grant or remove a protected role. Security exemptions, Discord server ownership, ACE permissions, and other Discord roles do not bypass this policy.

## /botguard

Network bot admission and anti-nuke controls

| Command | What it does | Permission required |
|---|---|---|
| `/botguard allow-bot <bot_id> [label]` | Allow a bot application network-wide<br><small>Arguments: `bot_id` (required text) — Bot user ID. `label` (optional text) — Friendly name.</small> | `fbrp.security.manage` |
| `/botguard deny-bot <bot_id>` | Remove an allowed bot<br><small>Arguments: `bot_id` (required text) — Bot user ID.</small> | `fbrp.security.manage` |
| `/botguard trust-user <member>` | Allow a user to add approved bots<br><small>Arguments: `member` (required user) — Discord member.</small> | `fbrp.security.manage` |
| `/botguard trust-role <role>` | Allow a role to add approved bots<br><small>Arguments: `role` (required role) — Trusted role.</small> | `fbrp.security.manage` |
| `/botguard untrust-user <member>` | Remove a trusted bot adder<br><small>Arguments: `member` (required user) — Discord member.</small> | `fbrp.security.manage` |
| `/botguard untrust-role <role>` | Remove a trusted bot-adder role<br><small>Arguments: `role` (required role) — Trusted role.</small> | `fbrp.security.manage` |
| `/botguard exempt-add <member> <reason>` | Exempt an account from automated security<br><small>Arguments: `member` (required user) — Discord member. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.security.manage` and the hard-coded owner account |
| `/botguard exempt-remove <member>` | Remove a security exemption<br><small>Arguments: `member` (required user) — Discord member.</small> | `fbrp.security.manage` and the hard-coded owner account |
| `/botguard sweep` | Remove unapproved bots from this server | `fbrp.security.manage` |
| `/botguard list` | Show Bot Guard policy | `fbrp.security.manage` |

Important behavior:

- Security exemptions bypass automated enforcement only; they do not grant command permissions and do not block manual moderation.

## /security

Anti-nuke, anti-raid, anti-spam and lockdown controls

| Command | What it does | Permission required |
|---|---|---|
| `/security status` | Show protections, lockdowns and the last 24 hours of events | `fbrp.security.manage` |
| `/security exempt-add <member> <scope> <reason>` | Owner-only: bypass automated security globally or in this server<br><small>Arguments: `member` (required user) — Trusted account. `scope` (required text) — Where the bypass applies. Choices: `Every network server`, `This server only`. `reason` (required text) — Why this account is trusted.</small> | `fbrp.security.manage` and the hard-coded owner account |
| `/security exempt-remove <member> <scope>` | Owner-only: remove an automated-security bypass<br><small>Arguments: `member` (required user) — Account to remove. `scope` (required text) — Bypass to remove. Choices: `Every network server`, `This server only`.</small> | `fbrp.security.manage` and the hard-coded owner account |
| `/security exempt-list` | Owner-only: list global and server-specific bypasses | `fbrp.security.manage` and the hard-coded owner account |
| `/security config <setting> [value]` | Change a network-wide security setting<br><small>Arguments: `setting` (required text) — Setting to change. Autocomplete is provided. `value` (optional text) — on/off, a number, or an option; leave blank to see the current value.</small> | `fbrp.security.manage` |
| `/security lockdown <reason> [minutes] [network]` | Lock this server (or the whole network) down<br><small>Arguments: `reason` (required text) — Reason recorded in the audit log. `minutes` (optional integer) — Auto-unlock after this many minutes (0 = manual). `network` (optional true/false) — Lock every network server down.</small> | `fbrp.security.manage` |
| `/security unlock [reason] [network]` | Lift a lockdown<br><small>Arguments: `reason` (optional text) — Reason recorded in the audit log. `network` (optional true/false) — Unlock every network server.</small> | `fbrp.security.manage` |
| `/security events [all_servers]` | Recent security events<br><small>Arguments: `all_servers` (optional true/false) — Include every network server.</small> | `fbrp.security.manage` |

Important behavior:

- Exemptions bypass anti-nuke, raid/account-age, spam, Bot Guard, and protected-role automation. Lockdown can target the current server or every network server.

## /ticket

Open and manage support tickets

| Command | What it does | Permission required |
|---|---|---|
| `/ticket open <type>` | Open a private support channel<br><small>Arguments: `type` (required text) — Ticket category. Autocomplete is provided.</small> | Everyone |
| `/ticket mine` | List your tickets | Everyone |
| `/ticket claim [claimed]` | Claim or release the ticket in this channel<br><small>Arguments: `claimed` (optional true/false) — True claims; false releases.</small> | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket close <reason>` | Close the ticket in this channel<br><small>Arguments: `reason` (required text) — Reason recorded in the audit log.</small> | Ticket owner, or `fbrp.tickets.support`/a configured support role for that ticket type |
| `/ticket request-close <reason>` | Ask staff to close this ticket<br><small>Arguments: `reason` (required text) — Reason recorded in the audit log.</small> | Ticket owner, or `fbrp.tickets.support`/a configured support role for that ticket type |
| `/ticket transfer <member>` | Transfer the ticket to another staff member<br><small>Arguments: `member` (required user) — Discord member.</small> | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket add <member>` | Add a participant to this ticket<br><small>Arguments: `member` (required user) — Discord member.</small> | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket remove <member>` | Remove a participant from this ticket<br><small>Arguments: `member` (required user) — Discord member.</small> | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket priority <level> <reason>` | Change ticket priority<br><small>Arguments: `level` (required text) — Priority. Autocomplete is provided. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket move <type>` | Move the ticket to another category<br><small>Arguments: `type` (required text) — Ticket category. Autocomplete is provided.</small> | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket rename <name>` | Rename this ticket channel<br><small>Arguments: `name` (required text) — New channel name.</small> | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket note <text>` | Add a private staff note<br><small>Arguments: `text` (required text) — Note text.</small> | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket notes` | View private staff notes | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket reopen <id>` | Reopen a closed ticket<br><small>Arguments: `id` (required integer) — Ticket number.</small> | `fbrp.tickets.support`, or a configured support role for that ticket type |
| `/ticket transcript [id]` | Open the hosted ticket transcript<br><small>Arguments: `id` (optional integer) — Ticket number; current channel if blank.</small> | Ticket owner, or `fbrp.tickets.support`/a configured support role for that ticket type |
| `/ticket list` | List open support tickets | `fbrp.tickets`, or a configured all-ticket support role |

Important behavior:

- Most management actions operate on the ticket in the current channel. `reopen` and optional transcript IDs can target stored tickets by number.
- Despite the transcript error text mentioning participants, the implemented slash-command check permits the ticket owner or support staff.

## /support

Configure the ticket system

| Command | What it does | Permission required |
|---|---|---|
| `/support panel <channel>` | Post or move the ticket panel<br><small>Arguments: `channel` (required channel) — Panel channel.</small> | `fbrp.tickets.manage`, or a configured manager-level all-ticket support role |
| `/support config` | Show ticket configuration | `fbrp.tickets.manage`, or a configured manager-level all-ticket support role |
| `/support category <type> <category>` | Set a Discord category for a ticket type<br><small>Arguments: `type` (required text) — Ticket type or all. Autocomplete is provided. `category` (required channel) — Discord category.</small> | `fbrp.tickets.manage`, or a configured manager-level all-ticket support role |
| `/support role <type> <role> <level> <mode>` | Add or remove a support role<br><small>Arguments: `type` (required text) — Ticket type or all. Autocomplete is provided. `role` (required role) — Support role. `level` (required text) — Access level. Choices: `Support`, `Manager`. `mode` (required text) — Add or remove. Choices: `Add`, `Remove`.</small> | `fbrp.tickets.manage`, or a configured manager-level all-ticket support role |
| `/support limit <max_open> <cooldown_seconds>` | Set ticket limits<br><small>Arguments: `max_open` (required integer) — Maximum open tickets per user. `cooldown_seconds` (required integer) — Seconds between new tickets.</small> | `fbrp.tickets.manage`, or a configured manager-level all-ticket support role |

Important behavior:

- Configured support roles can authorize ticket work without ACE. `/support` itself requires an ACE manager or a manager-level role configured for `all` ticket types.

## /vmenu

Manage vMenu permissions for ACE groups

| Command | What it does | Permission required |
|---|---|---|
| `/vmenu permission <group> <permission> <mode>` | Grant, deny, or remove a vMenu permission<br><small>Arguments: `group` (required text) — ACE group. `permission` (required text) — vMenu permission object. `mode` (required text) — Permission mode. Choices: `Allow`, `Deny`, `Remove`.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/vmenu bundle <group> <bundle> <mode>` | Apply or remove a vMenu bundle<br><small>Arguments: `group` (required text) — ACE group. `bundle` (required text) — player, staff, or full. Choices: `Player`, `Staff`, `Full`. `mode` (required text) — Grant or remove. Choices: `Grant`, `Remove`.</small> | `fbrp.perms.manage` and the hard-coded owner account |
| `/vmenu show <group>` | Show a group's vMenu permissions<br><small>Arguments: `group` (required text) — ACE group.</small> | `fbrp.perms.manage` |
| `/vmenu catalog` | List vMenu permissions and bundles | `fbrp.perms.manage` |

Important behavior:

- `show` and `catalog` are read-only. Changing a permission or bundle also requires the single hard-coded owner.

## /help

Show all commands, descriptions, and required permissions

| Command | What it does | Permission required |
|---|---|---|
| `/help [command]` | Show all commands, descriptions, and required permissions<br><small>Arguments: `command` (optional text) — Optional command name to filter.</small> | Everyone |

## /roster

Manage the staff roster and discipline

| Command | What it does | Permission required |
|---|---|---|
| `/roster add <member> <rank> [callsign]` | Add or update a roster member<br><small>Arguments: `member` (required user) — Discord member. `rank` (required integer) — Rank ID from /roster list. `callsign` (optional integer) — Unique staff callsign.</small> | `fbrp.roster.manage` |
| `/roster remove <member> <reason>` | Remove a roster member<br><small>Arguments: `member` (required user) — Discord member. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.roster.manage` |
| `/roster status <member> <status>` | Change roster status<br><small>Arguments: `member` (required user) — Discord member. `status` (required text) — Roster status. Choices: `Active`, `Inactive`, `LOA`.</small> | `fbrp.roster.manage` |
| `/roster discipline <member> <kind> <reason>` | Issue a warning or strike<br><small>Arguments: `member` (required user) — Discord member. `kind` (required text) — Discipline type. Choices: `Warning`, `Strike`. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.roster.discipline` |
| `/roster profile <member>` | Show one member's complete roster record<br><small>Arguments: `member` (required user) — Discord member.</small> | `fbrp.roster.view` |
| `/roster callsign <member> [callsign]` | Set or automatically allocate a callsign<br><small>Arguments: `member` (required user) — Discord member. `callsign` (optional integer) — Leave blank for next available.</small> | `fbrp.roster.manage` |
| `/roster note <member> <note>` | Set a private roster activity note<br><small>Arguments: `member` (required user) — Discord member. `note` (required text) — Activity note.</small> | `fbrp.roster.manage` |
| `/roster discipline-revoke <id> <reason>` | Revoke a warning or strike<br><small>Arguments: `id` (required integer) — Discipline record ID. `reason` (required text) — Reason recorded in the audit log.</small> | `fbrp.roster.discipline` |
| `/roster category-upsert <name> <start> <end> [id] [order]` | Create or update a callsign category<br><small>Arguments: `name` (required text) — Category name. `start` (required integer) — First callsign. `end` (required integer) — Last callsign. `id` (optional integer) — Existing category ID; blank creates. `order` (optional integer) — Display order.</small> | `fbrp.roster.config` |
| `/roster category-delete <id>` | Delete an unused roster category<br><small>Arguments: `id` (required integer) — Category ID.</small> | `fbrp.roster.config` |
| `/roster rank-upsert <category> <name> [id] [role] [ace_group] [weekly_hours] [minimum_days] [order]` | Create or update a staff rank and role mapping<br><small>Arguments: `category` (required integer) — Category ID. `name` (required text) — Rank name. `id` (optional integer) — Existing rank ID; blank creates. `role` (optional role) — Rank role in this server. `ace_group` (optional text) — ACE group /staff add puts this rank in. Autocomplete is provided. `weekly_hours` (optional integer) — Weekly activity requirement. `minimum_days` (optional integer) — Minimum days before promotion. `order` (optional integer) — Display order.</small> | `fbrp.roster.config` |
| `/roster rank-delete <id>` | Delete an unused staff rank<br><small>Arguments: `id` (required integer) — Rank ID.</small> | `fbrp.roster.config` |
| `/roster job-upsert <name> [id] [description] [role] [order]` | Create or update a staff secondary job<br><small>Arguments: `name` (required text) — Job name. `id` (optional integer) — Existing job ID; blank creates. `description` (optional text) — Job description. `role` (optional role) — Job role in this server. `order` (optional integer) — Display order.</small> | `fbrp.roster.config` |
| `/roster job-delete <id>` | Delete a staff secondary job<br><small>Arguments: `id` (required integer) — Job ID.</small> | `fbrp.roster.config` |
| `/roster job-assign <member> <job>` | Assign a secondary job to a roster member<br><small>Arguments: `member` (required user) — Discord member. `job` (required integer) — Job ID.</small> | `fbrp.roster.manage` |
| `/roster job-remove <member> <job>` | Remove a secondary job from a roster member<br><small>Arguments: `member` (required user) — Discord member. `job` (required integer) — Job ID.</small> | `fbrp.roster.manage` |
| `/roster sync` | Sync roster ranks from Discord roles | `fbrp.roster.config` |
| `/roster list` | List the staff roster | `fbrp.roster.view` |

Important behavior:

- Roster configuration commands define callsign ranges, rank/role/ACE mappings, weekly requirements, and secondary jobs. `sync` imports assignments from mapped Discord roles.

## /global

Manage a member across every Florida Bay Discord server

| Command | What it does | Permission required |
|---|---|---|
| `/global warn <user> <reason>` | Warn a member on a network-wide record<br><small>Arguments: `user` (required user) — Member. `reason` (required text) — Reason.</small> | `fbrp.global.warn`; target must rank below you |
| `/global timeout <user> <duration> <reason>` | Time a member out in every Florida Bay server<br><small>Arguments: `user` (required user) — Member. `duration` (required text) — e.g. 10m, 2h, 7d (max 28d). `reason` (required text) — Reason.</small> | `fbrp.global.timeout`; target must rank below you |
| `/global untimeout <user> [reason]` | Lift a member's timeout in every Florida Bay server<br><small>Arguments: `user` (required user) — Member. `reason` (optional text) — Reason.</small> | `fbrp.global.timeout`; target must rank below you |
| `/global kick <user> <reason>` | Kick a member from every Florida Bay server<br><small>Arguments: `user` (required user) — Member. `reason` (required text) — Reason.</small> | `fbrp.global.kick`; target must rank below you |
| `/global ban <user> <reason> [duration] [delete_days] [game] [alts]` | Ban a member from every Florida Bay server (and servers added later)<br><small>Arguments: `user` (required user) — Member. `reason` (required text) — Reason. `duration` (optional text) — e.g. 7d; empty = permanent. `delete_days` (optional integer) — Delete message history (days). `game` (optional true/false) — Also ban the linked game account through EasyAdmin. `alts` (optional true/false) — Also ban alt accounts linked by game identifiers/IP (default: yes).</small> | `fbrp.global.ban`; target must rank below you; if `game:true`, also `easyadmin.player.ban.temporary` or `easyadmin.player.ban.permanent` according to duration |
| `/global blacklist <user> <reason>` | Ban from every other server and restrict to support in the main server<br><small>Arguments: `user` (required user) — Member. `reason` (required text) — Reason.</small> | `fbrp.global.blacklist`; target must rank below you |
| `/global unblacklist <user_id> [reason]` | Lift a global blacklist (other servers are unbanned, main roles are not restored)<br><small>Arguments: `user_id` (required text) — User ID. `reason` (optional text) — Reason.</small> | `fbrp.global.blacklist` |
| `/global unban <user_id> [reason] [game]` | Lift a network-wide ban<br><small>Arguments: `user_id` (required text) — User ID. `reason` (optional text) — Reason. `game` (optional true/false) — Also lift the linked game ban.</small> | `fbrp.global.unban`; if `game:true`, also `easyadmin.player.ban.remove` |
| `/global invite <user>` | Invite a member to every Florida Bay network server<br><small>Arguments: `user` (required user) — Member.</small> | `fbrp.global.invite` |
| `/global restore <user_id>` | Invite a former member back and restore their roles in each server<br><small>Arguments: `user_id` (required text) — Former member's Discord user ID.</small> | `fbrp.global.restore`; target must rank below you |
| `/global lookup <user>` | See which Florida Bay servers a member is in and their network record<br><small>Arguments: `user` (required user) — Member.</small> | `fbrp.global.lookup` |

Important behavior:

- `warn`, `timeout`, `untimeout`, `kick`, `ban`, `blacklist`, and `restore` enforce rank hierarchy. `invite`, `lookup`, `unban`, and `unblacklist` do not call the rank comparison.
- Global bans affect current network servers and are inherited by servers added later. By default, `ban` also scans linked accounts; `alts:false` disables that scan.
- A blacklist removes main-server roles, assigns the censored role there, and bans the member elsewhere. `unblacklist` does not restore roles; use `restore` afterward.

## /blacklist

Globally blacklist a member across the Florida Bay network

| Command | What it does | Permission required |
|---|---|---|
| `/blacklist <user> <reason>` | Globally blacklist a member across the Florida Bay network<br><small>Arguments: `user` (required user) — Member. `reason` (required text) — Reason.</small> | `fbrp.global.blacklist`; target must rank below you |

Important behavior:

- This is a direct shortcut to `/global blacklist` and uses the same cooldown, hierarchy check, role snapshot, isolation, bans, case record, and notification behavior.

## /blacklistedserver

Manage Discord servers that should be flagged during member investigations

| Command | What it does | Permission required |
|---|---|---|
| `/blacklistedserver add <server_id> <name> <reason>` | Add a Discord server to the investigation blacklist | Co-Owner rank or higher; `fbrp.blacklistedservers.manage` also grants access |
| `/blacklistedserver edit <server_id> [name] [reason]` | Change a blacklisted server's display name or reason | Co-Owner rank or higher; `fbrp.blacklistedservers.manage` also grants access |
| `/blacklistedserver remove <server_id>` | Remove a Discord server from the investigation blacklist | Co-Owner rank or higher; `fbrp.blacklistedservers.manage` also grants access |
| `/blacklistedserver list` | List all blacklisted Discord servers | Co-Owner rank or higher; `fbrp.blacklistedservers.manage` also grants access |

Important behavior:

- `/userinfo` displays a red warning when the member's latest website sign-in reported one of these servers. If the bot also shares that server with the member, the match is checked live.
- Discord server IDs are numeric. Add and edit actions are audited with the staff member, name, and reason.
- Co-Owner eligibility follows the live `co_owner` ACE group's rank order, so every higher direct staff rank qualifies too.

## /acelist

List every possible ACE permission: vMenu, EasyAdmin, and Florida Bay

| Command | What it does | Permission required |
|---|---|---|
| `/acelist [source] [search]` | List every possible ACE permission: vMenu, EasyAdmin, and Florida Bay<br><small>Arguments: `source` (optional text) — Which permissions to list (default: all). Choices: `Everything`, `vMenu`, `EasyAdmin`, `Florida Bay`. `search` (optional text) — Filter by name, object, or description.</small> | `fbrp.perms.manage` |

## /userinfo

Investigate a member: game and Discord records, servers and roles, and linked alt accounts

| Command | What it does | Permission required |
|---|---|---|
| `/userinfo <member>` | Investigate a member: game and Discord records, servers and roles, blacklisted-server matches, and linked alt accounts<br><small>Arguments: `member` (required user) — Discord member. Also lists every server the bot shares with them and their roles there, the other servers from their last website sign-in, and linked alt accounts (the alt section needs `fbrp.global.alts`).</small> | `fbrp.investigate`; linked alt accounts also need `fbrp.global.alts` |

## /office

Assign organization or staff office voice channels

| Command | What it does | Permission required |
|---|---|---|
| `/office set <channel> <member>` | Assign an office owner<br><small>Arguments: `channel` (required channel) — Office voice channel. `member` (required user) — Office owner.</small> | `fbrp.office.manage` |
| `/office clear <channel>` | Remove an office assignment<br><small>Arguments: `channel` (required channel) — Office voice channel.</small> | `fbrp.office.manage` |
| `/office list` | List office assignments | `fbrp.office.manage` |

## /join

Join any Florida Bay network server

| Command | What it does | Permission required |
|---|---|---|
| `/join <server> [user]` | Join any Florida Bay network server<br><small>Arguments: `server` (required text) — Network server to join. Autocomplete is provided. `user` (optional user) — Send the invite to this member instead (needs fbrp.network.join.others).</small> | `fbrp.network.join` for yourself; `fbrp.network.join.others` when `user` is supplied |

Important behavior:

- Creates a single-use invite that expires after 10 minutes. Supplying another user DMs the invite to that user when possible.

## /invite

Get the link to add this bot to a server with Administrator

| Command | What it does | Permission required |
|---|---|---|
| `/invite` | Get the link to add this bot to a server with Administrator | Hard-coded Florida Bay owner account only |

Important behavior:

- Returns an OAuth2 bot invite with Administrator and `applications.commands`; this command is locked to the hard-coded owner ID.

## Message command

| Command | What it does | Permission required |
|---|---|---|
| `!f8` | In any registered network server, replies with the current FiveM F8 `connect` command and a reminder to keep the Discord desktop app open. The match is case-insensitive and ignores surrounding spaces. | Everyone in a registered network server |

## Not included

This reference covers commands handled by the Discord bot. FiveM chat/resource commands such as `/clockin`, `/duty`, `/aop`, `/me`, and `/ooc` are registered and permission-checked by the game resources rather than the Discord bot, so they are outside this file's scope.
