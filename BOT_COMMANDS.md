# Florida Bay bot command reference

This file documents every command registered by the Florida Bay Discord bots: **42 top-level slash commands**, **172 slash-command forms**, and the **`!f8` message command**. It is based on the command builders and the actual permission checks in `services/fbrp-bot/src` as of 2026-10-15.

## How permissions work

- The **Permission required** column describes the caller's access check. Slash commands do not declare Discord default-member permissions; access is enforced inside the bot.
- ACE permissions are hierarchical: an allowed parent such as `fbrp.global` or `fbrp.*` covers child objects unless a matching deny exists. Members listed in `FBRP_SUPERUSER_IDS` bypass ACE checks and rank comparisons, but they do **not** bypass functions explicitly locked to the single hard-coded owner.
- “Hard-coded owner” means Discord ID `1090083387638812755`, as defined in `src/access-control.js`. `/welcome` and `/verification` also accept configured superusers; `/invite`, `/github`, `/backup`, ACE mutations, vMenu mutations, and security-exemption mutations use the stricter hard-coded-owner check.
- Configured ticket support/manager roles are an alternative permission path only where explicitly shown.
- Discord-side prerequisites still apply: the bot's role must be high enough and the bot must have the relevant Discord permissions (for example Manage Roles, Ban Members, Kick Members, Moderate Members, Manage Messages, Manage Channels, or Create Invite). These are operational requirements for the bot, not extra caller permissions.
- The dedicated role-manager bot stores one owner and zero or more managers per Discord role. The owner and managers can change role membership; only the owner can change the manager list. Server owners and configured role-manager superusers can administer these mappings.
- Syntax uses `<required>` and `[optional]`. Discord's UI supplies the options; the angle/square brackets are documentation only.

## Command index

[`/addrole`](#role-manager) · [`/removerole`](#role-manager) · [`/wiperole`](#role-manager) · [`/useradd`](#role-manager) · [`/setowner`](#role-manager) · [`/userdel`](#role-manager) · [`/mgrwipe`](#role-manager) · [`/role`](#role) · [`/orgbank`](#orgbank) · [`/welcome`](#welcome) · [`/github`](#github) · [`/verification`](#verification) · [`/backup`](#backup) · [`/ace`](#ace) · [`/headtag`](#headtag) · [`/personal`](#personal) · [`/coc`](#coc) · [`/organization`](#organization) · [`/radio`](#radio) · [`/network`](#network) · [`/globalsync`](#globalsync) · [`/mod`](#mod) · [`/server`](#server) · [`/protectrole`](#protectrole) · [`/botguard`](#botguard) · [`/security`](#security) · [`/ticket`](#ticket) · [`/support`](#support) · [`/vmenu`](#vmenu) · [`/help`](#help) · [`/global`](#global) · [`/blacklist`](#blacklist) · [`/blacklistedserver`](#blacklistedserver) · [`/acelist`](#acelist) · [`/userinfo`](#userinfo) · [`/case`](#case) · [`/office`](#office) · [`/join`](#join) · [`/invite`](#invite)

## Role manager

Delegated role membership management, provided by the dedicated role-manager bot.

| Command | What it does | Permission required |
|---|---|---|
| `/addrole <member> <role>` | Give a member a managed role | Owner or manager of the selected role; the server owner and configured role-manager superusers also qualify |
| `/removerole <member> <role>` | Remove a managed role from a member | Owner or manager of the selected role; the server owner and configured role-manager superusers also qualify |
| `/wiperole <role>` | Remove a managed role from every member | Owner or manager of the selected role; the server owner and configured role-manager superusers also qualify |
| `/useradd <member> <role>` | Add a manager to a role | Owner of the selected role; the server owner and configured role-manager superusers also qualify |
| `/setowner <member> <role>` | Set or transfer a role's owner | Current role owner; the first owner may be assigned by the server owner or a configured role-manager superuser |
| `/userdel <member> <role>` | Remove a manager from a role | Owner of the selected role; the server owner and configured role-manager superusers also qualify |
| `/mgrwipe <role>` | Remove every manager while keeping the owner | Owner of the selected role; the server owner and configured role-manager superusers also qualify |

Important behavior:

- The bot refuses `@everyone`, integration-managed roles, and roles at or above its highest role.
- `/wiperole` fetches the complete server member list before removing the role and reports any failed removals.
- Ownership and manager assignments are stored in MariaDB and are deleted automatically when the Discord role is deleted.
- The role-manager application needs the **Server Members Intent** and the bot needs **Manage Roles**. Its bot role must be above every role it will manage.

## /role

Assign or unassign Discord roles in the main server.

| Command | What it does | Permission required |
|---|---|---|
| `/role assign <member> <role>` | Assign a role to a main-server member<br><small>Arguments: `member` (required user) — Member receiving the role. `role` (required role) — Role to assign.</small> | Assistant Community Manager rank or higher |
| `/role unassign <member> <role>` | Remove a role from a main-server member<br><small>Arguments: `member` (required user) — Member losing the role. `role` (required role) — Role to remove.</small> | Assistant Community Manager rank or higher |
| `/roleall <role>` | Give a role to every human in the main server (bots skipped), after a confirmation. Refused for staff, ACE, synced, managed and dangerous roles<br><small>Arguments: `role` (required role) — Role to give everyone.</small> | Executive Management rank or higher, main server only |
| `/unroleall <role>` | Remove a role from every human in the main server who holds it, after a confirmation. Same role restrictions as `/roleall`<br><small>Arguments: `role` (required role) — Role to take from everyone.</small> | Executive Management rank or higher, main server only |

These commands only work in the server registered as `main`. Protected roles retain the stricter protected-role policy: the caller must also be Co-Owner rank or higher and one of the authorized protected-role accounts. The bot also refuses `@everyone`, Discord-managed roles, and roles at or above its highest role.

## /orgbank

Organization wallets: balances, ledger and management

| Command | What it does | Permission required |
|---|---|---|
| `/orgbank balance [organization]` | Show an organization's wallet<br><small>Arguments: `organization` (optional text) — Organization slug (defaults to yours).</small> | Membership in the selected organization, or `fbrp.organizations.manage` |
| `/orgbank ledger [organization]` | Recent wallet transactions<br><small>Arguments: `organization` (optional text) — Organization slug (defaults to yours).</small> | Membership in the selected organization, or `fbrp.organizations.manage` |
| `/orgbank adjust <organization> <amount> <reason>` | Add or remove money from a wallet<br><small>Arguments: `organization` (required text) — Organization slug. `amount` (required integer) — Positive to add, negative to remove. `reason` (required text) — Reason recorded in the ledger.</small> | Co-Owner rank or higher and `fbrp.organizations.manage` |
| `/orgbank leader <organization> <member> <leader>` | Grant or remove spending (leader) access<br><small>Arguments: `organization` (required text) — Organization slug. `member` (required user) — Discord member. `leader` (required true/false) — true to grant, false to remove.</small> | Co-Owner rank or higher and `fbrp.organizations.manage` |
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
| `/headtag create <kind> <label> <color> [role] [priority] [organization]` | Create a Discord-gated headtag, gang tag, or dual-slot tag<br><small>Arguments: `kind` (required text) — Tag slot. Choices: `Headtag (top)`, `Gang tag (bottom)`, `Headtag + gang tag (both)`. `label` (required text) — Text shown in game. `color` (required text) — Hex color, e.g. #43E8D8. `role` (optional role) — Existing role; leave blank to create one. `priority` (optional integer) — Wardrobe order. `organization` (optional text) — Only wearable while on duty as this organization.</small> | Co-Owner rank or higher and `fbrp.headtags.manage` |
| `/headtag delete <id> [delete_role]` | Delete a tag definition<br><small>Arguments: `id` (required integer) — Tag ID. `delete_role` (optional true/false) — Also delete the bot-created role.</small> | Co-Owner rank or higher and `fbrp.headtags.manage` |
| `/headtag grant <id> <member>` | Grant a tag directly<br><small>Arguments: `id` (required integer) — Tag ID. `member` (required user) — Discord member.</small> | Co-Owner rank or higher and `fbrp.headtags.manage` |
| `/headtag revoke <id> <member>` | Revoke direct tag access<br><small>Arguments: `id` (required integer) — Tag ID. `member` (required user) — Discord member.</small> | Co-Owner rank or higher and `fbrp.headtags.manage` |
| `/headtag list` | List all headtags and gang tags | Co-Owner rank or higher and `fbrp.headtags.manage` |

Important behavior:

- If `create` is run without a role, the bot creates one. `delete_role` controls whether deleting a tag also deletes its Discord role.

## /personal

> Runs on the separate **FBRP | Vehicle Manager** bot (`src/personals-bot.js`), not the Florida Bay Network bot.

Personal vehicles: cars only their owner and trusted people can spawn from F7 and drive

| Command | What it does | Permission required |
|---|---|---|
| `/personal add <model> <owner> [label] [plate] [bulletproof]` | Management: make a vehicle model someone's personal<br><small>Arguments: `model` (required text) — Spawn name of the vehicle, e.g. sultanrs. `owner` (required user) — Who owns it. `label` (optional text) — Name shown in the F7 garage. `plate` (optional text) — Custom plate, up to 8 characters. `bulletproof` (optional true/false) — Bullets cannot break the glass or hit anyone inside, and nobody inside can shoot out.</small> | Co-Owner rank or higher |
| `/personal edit <vehicle> [label] [model] [plate] [enabled] [bulletproof]` | Management: change a personal's name, model, plate or availability<br><small>Arguments: `vehicle` (required text) — Personal vehicle (autocomplete). `plate` — `-` resets to the automatic plate. `enabled` (optional true/false) — Turn the vehicle on or off. `bulletproof` (optional true/false) — Bulletproof glass and occupants, no shooting out.</small> | Co-Owner rank or higher |
| `/personal owner <vehicle> <member>` | Management: transfer a personal to someone else<br><small>Arguments: `vehicle` (required text) — Personal vehicle. `member` (required user) — New owner.</small> | Co-Owner rank or higher |
| `/personal remove <vehicle>` | Management: delete a personal vehicle<br><small>Arguments: `vehicle` (required text) — Personal vehicle.</small> | Co-Owner rank or higher |
| `/personal trust <vehicle> <member>` | Let someone spawn and drive a personal (up to 3 people, or 2 while tag-locked)<br><small>Arguments: `vehicle` (required text) — Personal vehicle. `member` (required user) — Who to trust.</small> | Vehicle owner; Co-Owner rank or higher for any vehicle |
| `/personal untrust <vehicle> <member>` | Remove someone from a personal's trust list<br><small>Arguments: `vehicle` (required text) — Personal vehicle. `member` (required user) — Who to remove.</small> | Vehicle owner; Co-Owner rank or higher for any vehicle |
| `/personal locktag <vehicle> <tag>` | Lock a personal to a tag so everyone holding the tag can use it<br><small>Arguments: `vehicle` (required text) — Personal vehicle. `tag` (required text) — Headtag or gang tag (autocomplete). Owners can only pick tags they hold.</small> | Vehicle owner; Co-Owner rank or higher for any vehicle |
| `/personal unlocktag <vehicle> <tag>` | Remove a tag lock from a personal<br><small>Arguments: `vehicle` (required text) — Personal vehicle. `tag` (required text) — Tag to remove.</small> | Vehicle owner; Co-Owner rank or higher for any vehicle |
| `/personal info <vehicle>` | Show one personal vehicle<br><small>Arguments: `vehicle` (required text) — Personal vehicle.</small> | Owner, trusted people and tag holders; management can view any |
| `/personal list [member] [all]` | List your personal vehicles<br><small>Arguments: `member` (optional user) — Management: whose vehicles to show. `all` (optional true/false) — Management: show every personal vehicle.</small> | Everyone for their own; management for others |

Important behavior:

- A personal is a vehicle **model** reserved for one owner. It is spawned from the **F7** garage under **Personal**; nobody else sees it there. The model must already be installed on the game server.
- The owner can trust up to **3** people, reduced to **2** while the personal has a tag lock. Trusted people and tag holders can spawn and drive it but are never registered as its owner.
- A personal can be locked to **one tag total**. The lock gives access to everyone holding that tag (Discord role or direct grant). Owners can only lock to tags they hold; management can lock to any tag.
- Edit, transfer, and delete actions are restricted to members of the **Owner ACE group**. Deleting a personal also stops and removes its `fbrp_pv_<model>` server resource files when that model is not shared by another personal.
- Only the driver seat is restricted: anyone can ride along, but only the owner, trusted people and tag holders can drive. `fbrp.personals.bypass` lets staff drive any personal vehicle.
- The same controls are on the website under **Community → Personal vehicles** (owners) and in the live configuration panel (Co-Owner and above).
- Changes reach the game server immediately.

## /coc

Create and manage the live chain-of-command board for Assistant Community Manager and above

| Command | What it does | Permission required |
|---|---|---|
| `/coc newchain [channel] [title]` | Publish the board and import active staff-roster members | `fbrp.coc.manage` |
| `/coc relocatecoc <channel>` | Move the managed board messages to another text channel | `fbrp.coc.manage` |
| `/coc adduser <member> [title] [positions] [assistants] [color]` | Add a member card | `fbrp.coc.manage` |
| `/coc updateuser <member> [title] [positions] [assistants] [color]` | Update a member card | `fbrp.coc.manage` |
| `/coc updateself [positions] [assistants]` | Update your own card; active roster members may add themselves | The member themself |
| `/coc removeuser <member>` | Remove a member card | `fbrp.coc.manage` |
| `/coc reorder <member> <position>` | Move a member to a new numbered position | `fbrp.coc.manage` |
| `/coc getorder` | Show the current order | Everyone |
| `/coc updatecoc` | Import new roster members and redraw the board immediately | `fbrp.coc.manage` |

`positions` accepts entries separated by `|`. `assistants` accepts user mentions or Discord IDs. Use `-` to clear a field. Rendered mentions do not ping anyone.

## /organization

Manage gangs, businesses, and departments

| Command | What it does | Permission required |
|---|---|---|
| `/organization create <slug> <name> <type> <color> [tag] [access_role] [network_role_id] [network_guild_id]` | Create an organization, its in-game tag, and ACE group<br><small>Arguments: `slug` (required text) — Short command name. `name` (required text) — Display name. `type` (required text) — Organization type. Choices: `Gang`, `Business`, `Law enforcement`, `Fire & rescue`, `Government`, `Other`. `color` (required text) — Hex color. `tag` (optional text) — Text of the in-game tag (defaults to the display name). `access_role` (optional role) — Role in this server required to clock in. `network_role_id` (optional text) — Required role ID from another network server. `network_guild_id` (optional text) — Server ID that owns network_role_id.</small> | Co-Owner rank or higher and `fbrp.organizations.manage` |
| `/organization delete <slug>` | Deactivate an organization<br><small>Arguments: `slug` (required text) — Organization slug.</small> | Co-Owner rank or higher and `fbrp.organizations.manage` |
| `/organization hours <slug> [member]` | Show organization duty hours<br><small>Arguments: `slug` (required text) — Organization slug. `member` (optional user) — Optional member filter.</small> | Co-Owner rank or higher and `fbrp.organizations.manage` |
| `/organization list` | List organizations | Co-Owner rank or higher and `fbrp.organizations.manage` |

Important behavior:

- Creating an organization also creates its ACE group and in-game tag and binds eligibility to an existing role in a registered network server.

## /radio

Configure in-game radio channels

| Command | What it does | Permission required |
|---|---|---|
| `/radio create <channel> <name> [organization] [description] [color]` | Create or update a managed frequency<br><small>Arguments: `channel` (required number) — Frequency from 1.00–999.99, with up to two decimals. `name` (required text) — Channel display name. `organization` (optional text) — Organization slug; omit for a public channel. `description` (optional text) — Short channel description. `color` (optional text) — Six-digit hex color.</small> | Co-Owner rank or higher and `fbrp.radio.manage` |
| `/radio delete <channel>` | Delete a managed frequency<br><small>Arguments: `channel` (required number) — Frequency from 1.00–999.99.</small> | Co-Owner rank or higher and `fbrp.radio.manage` |
| `/radio list` | List managed radio frequencies | Co-Owner rank or higher and `fbrp.radio.manage` |

## /network

Manage the Florida Bay Discord network (global roles live in /globalsync)

| Command | What it does | Permission required |
|---|---|---|
| `/network add <kind>` | Add this Discord server to the network<br><small>Arguments: `kind` (required text) — Server type. Choices: `Main`, `Staff`, `Gang`, `Department`, `Community`, `Business`, `Partner`, `Other`.</small> | Co-Owner rank or higher and `fbrp.network.manage` |
| `/network remove` | Remove this Discord server from the network | Co-Owner rank or higher and `fbrp.network.manage` |
| `/network list` | List network servers and synced roles | Co-Owner rank or higher and `fbrp.network.manage` |

## /globalsync

Sync an ACE group's Discord role across every Florida Bay server

| Command | What it does | Permission required |
|---|---|---|
| `/globalsync add <group> [name] [scope] [permissions] [all_channels] [color] [hoist] [mentionable] [existing_role] [existing_roles]` | Create a synced role: group members get it in every matching server<br><small>Arguments: `group` (required text) — ACE group whose members wear the role. Autocomplete is provided. `name` (optional text) — Role name (defaults to the group name). `scope` (optional text) — Which servers get the role: a server type, or pick individual servers. Choices: `All servers`, `Every server except main`, `Main server`, `Staff servers`, `Gang servers`, `Department servers`, `Community servers`, `Business servers`, `Partner servers`, `Other servers`, `Pick individual servers`. `permissions` (optional text) — Discord permissions integer; 0 grants no base permissions. `all_channels` (optional true/false) — See/chat in every text channel and see/join every voice channel. `color` (optional text) — Hex color, e.g. #43E8D8. `hoist` (optional true/false) — Show separately in the member list. `mentionable` (optional true/false) — Allow members to mention the role. `existing_role` (optional role) — Optional: use this existing role in this server instead of creating one. `existing_roles` (optional text) — Optional: existing role IDs to use in other servers (comma separated).</small> | Co-Owner rank or higher and `fbrp.network.manage`; configured bot owner/superuser additionally required for the `owner` group, dangerous permission bits, or an existing role with dangerous permissions |
| `/globalsync edit <group> [name] [scope] [permissions] [all_channels] [color] [hoist] [mentionable] [existing_role] [existing_roles]` | Edit an existing global role sync and apply the changes everywhere<br><small>Arguments: `group` (required text) — Synced group to edit. Autocomplete is provided. `name` (optional text) — New role name. `scope` (optional text) — Which servers get the role: a server type, or pick individual servers. Choices: `All servers`, `Every server except main`, `Main server`, `Staff servers`, `Gang servers`, `Department servers`, `Community servers`, `Business servers`, `Partner servers`, `Other servers`, `Pick individual servers`. `permissions` (optional text) — Discord permissions integer; 0 grants no base permissions. `all_channels` (optional true/false) — See/chat in every text channel and see/join every voice channel. `color` (optional text) — Hex color, e.g. #43E8D8. `hoist` (optional true/false) — Show separately in the member list. `mentionable` (optional true/false) — Allow members to mention the role. `existing_role` (optional role) — Optional: use this existing role in this server instead of creating one. `existing_roles` (optional text) — Optional: existing role IDs to use in other servers (comma separated).</small> | Co-Owner rank or higher and `fbrp.network.manage`; configured bot owner/superuser additionally required for the `owner` group, dangerous permission bits, or an existing role with dangerous permissions |
| `/globalsync remove <group> [delete_roles]` | Stop syncing a group's role<br><small>Arguments: `group` (required text) — Synced group. Autocomplete is provided. `delete_roles` (optional true/false) — Delete roles created by the bot (default: yes).</small> | Co-Owner rank or higher and `fbrp.network.manage` |
| `/globalsync list` | List every synced role and where it lives | Co-Owner rank or higher and `fbrp.network.manage` |
| `/globalsync push` | Re-create missing synced roles everywhere and re-sync every member | Co-Owner rank or higher and `fbrp.network.manage` |
| `/globalsync servers <group>` | Pick exactly which network servers a synced role lives in<br><small>Arguments: `group` (required text) — Synced group. Autocomplete is provided.</small> | Co-Owner rank or higher and `fbrp.network.manage` |
| `/globalsync order [groups]` | Show or set which synced roles sit above others in every server<br><small>Arguments: `groups` (optional text) — Comma-separated ACE groups from top to bottom.</small> | Co-Owner rank or higher and `fbrp.network.manage` |
| `/globalsync move <group> <position>` | Move one synced role to a spot in the network order (1 = top)<br><small>Arguments: `group` (required text) — Synced group. Autocomplete is provided. `position` (required integer) — 1 is highest.</small> | Co-Owner rank or higher and `fbrp.network.manage` |
| `/globalsync bind <group> <role>` | Bind an ACE group to an existing role here (creates the global sync if needed)<br><small>Arguments: `group` (required text) — ACE group whose members wear the role. Autocomplete is provided. `role` (required role) — Existing role in this server.</small> | Co-Owner rank or higher and `fbrp.network.manage`; configured bot owner/superuser additionally required for the `owner` group or a role with dangerous permissions |

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

## /protectrole

Guard sensitive Discord roles

| Command | What it does | Permission required |
|---|---|---|
| `/protectrole add <role>` | Protect a role<br><small>Arguments: `role` (required role) — Protected role.</small> | Co-Owner rank or higher, an authorized protected-role account, and the hard-coded owner account |
| `/protectrole remove <role>` | Stop protecting a role<br><small>Arguments: `role` (required role) — Protected role.</small> | Co-Owner rank or higher, an authorized protected-role account, and the hard-coded owner account |
| `/protectrole list` | List protected roles | Co-Owner rank or higher and authorized Discord ID `1090083387638812755` or `1099651002208104488` |

Only those two accounts (plus the bot itself for automated enforcement) can grant or remove a protected role. Security exemptions, Discord server ownership, ACE permissions, and other Discord roles do not bypass this policy.

## /botguard

Network bot admission and anti-nuke controls

| Command | What it does | Permission required |
|---|---|---|
| `/botguard allow-bot <bot_id> [label]` | Allow a bot application network-wide<br><small>Arguments: `bot_id` (required text) — Bot user ID. `label` (optional text) — Friendly name.</small> | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |
| `/botguard deny-bot <bot_id>` | Remove an allowed bot<br><small>Arguments: `bot_id` (required text) — Bot user ID.</small> | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |
| `/botguard trust-user <member>` | Allow a user to add approved bots<br><small>Arguments: `member` (required user) — Discord member.</small> | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |
| `/botguard trust-role <role>` | Allow a role to add approved bots<br><small>Arguments: `role` (required role) — Trusted role.</small> | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |
| `/botguard untrust-user <member>` | Remove a trusted bot adder<br><small>Arguments: `member` (required user) — Discord member.</small> | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |
| `/botguard untrust-role <role>` | Remove a trusted bot-adder role<br><small>Arguments: `role` (required role) — Trusted role.</small> | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |
| `/botguard exempt-add <member> <reason>` | Exempt an account from automated security<br><small>Arguments: `member` (required user) — Discord member. `reason` (required text) — Reason recorded in the audit log.</small> | Co-Owner rank or higher, `fbrp.security.manage`, `fbrp.botguard.exemptions`, and the hard-coded owner account |
| `/botguard exempt-remove <member>` | Remove a security exemption<br><small>Arguments: `member` (required user) — Discord member.</small> | Co-Owner rank or higher, `fbrp.security.manage`, `fbrp.botguard.exemptions`, and the hard-coded owner account |
| `/botguard sweep` | Remove unapproved bots from this server | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |
| `/botguard list` | Show Bot Guard policy | Co-Owner rank or higher and `fbrp.security.manage` |

Important behavior:

- Security exemptions bypass automated enforcement only; they do not grant command permissions and do not block manual moderation.

## /security

Anti-nuke, anti-raid, anti-spam and lockdown controls

| Command | What it does | Permission required |
|---|---|---|
| `/security status` | Show protections, lockdowns and the last 24 hours of events | Co-Owner rank or higher and `fbrp.security.manage` |
| `/security exempt-add <member> <scope> <reason>` | Owner-only: bypass automated security globally or in this server<br><small>Arguments: `member` (required user) — Trusted account. `scope` (required text) — Where the bypass applies. Choices: `Every network server`, `This server only`. `reason` (required text) — Why this account is trusted.</small> | Co-Owner rank or higher, `fbrp.security.manage`, `fbrp.security.exemptions`, and the hard-coded owner account |
| `/security exempt-remove <member> <scope>` | Owner-only: remove an automated-security bypass<br><small>Arguments: `member` (required user) — Account to remove. `scope` (required text) — Bypass to remove. Choices: `Every network server`, `This server only`.</small> | Co-Owner rank or higher, `fbrp.security.manage`, `fbrp.security.exemptions`, and the hard-coded owner account |
| `/security exempt-list` | List global and server-specific bypasses | Co-Owner rank or higher and `fbrp.security.manage` |
| `/security config <setting> [value]` | Change a network-wide security setting<br><small>Arguments: `setting` (required text) — Setting to change. Autocomplete is provided. `value` (optional text) — on/off, a number, or an option; leave blank to see the current value.</small> | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |
| `/security lockdown <reason> [minutes] [network]` | Lock this server (or the whole network) down<br><small>Arguments: `reason` (required text) — Reason recorded in the audit log. `minutes` (optional integer) — Auto-unlock after this many minutes (0 = manual). `network` (optional true/false) — Lock every network server down.</small> | Co-Owner rank or higher and `fbrp.security.manage` |
| `/security unlock [reason] [network]` | Lift a lockdown<br><small>Arguments: `reason` (optional text) — Reason recorded in the audit log. `network` (optional true/false) — Unlock every network server.</small> | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |
| `/security events [all_servers]` | Recent security events<br><small>Arguments: `all_servers` (optional true/false) — Include every network server.</small> | Co-Owner rank or higher and `fbrp.security.manage` |
| `/security health` | Check whether the bot can stop a nuke in every network server (missing permissions, dangerous roles above the bot, accounts it cannot stop, 2FA, @everyone) | Co-Owner rank or higher and `fbrp.security.manage` |
| `/security offenders` | Accounts on the network-wide anti-nuke offender list | Co-Owner rank or higher and `fbrp.security.manage` |
| `/security pardon <member>` | Owner-only: lift an anti-nuke offender (unban anti-nuke bans, end quarantine timeouts, restore stripped roles)<br><small>Arguments: `member` (required user) — Offender to pardon.</small> | Co-Owner rank or higher and `fbrp.security.manage` and the hard-coded owner account |

Important behavior:

- Exemptions fully bypass anti-nuke, raid/account-age, spam, and Bot Guard detection in their configured server or across the network. Changes take effect immediately and clear any in-progress detector counters for that account. They do not bypass manual moderation or the separate protected-role authorization policy. The hard-coded owner account is never scanned. Lockdown can target the current server or every network server.
- Anti-nuke scores only rapid/mass channel creation or deletion and role creation or deletion. Those four actions share one danger budget across the whole network (`nuke_network_scale`), so structural damage spread over several servers trips it too. Other moderation, permission, webhook, Bot Guard and server-setting events never consume this budget and continue through their separate guards.
- When anti-nuke trips, the account is role-stripped (every role the bot can reach, plus a 7-day timeout) in every network server at once instead of being banned (`nuke_punishment`, default `strip`), deleted roles/channels are rebuilt, created roles/channels are removed, and the account goes on the offender list. Offenders are stopped on a repeat role/channel create or delete, or when joining any network server, survive restarts, and are never given roles back by role sync until `/security pardon`.
- Server owners cannot be acted against in their own server; if one trips anti-nuke they are quarantined in every other network server.
- Health watch checks every network server every 10 minutes and logs (and DMs owners) when the bot loses the power to stop a nuke.

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
| `/support panel <channel>` | Post or move the ticket panel<br><small>Arguments: `channel` (required channel) — Panel channel.</small> | Co-Owner rank or higher and `fbrp.tickets.manage` |
| `/support config` | Show ticket configuration | Co-Owner rank or higher and `fbrp.tickets.manage` |
| `/support category <type> <category>` | Set a Discord category for a ticket type<br><small>Arguments: `type` (required text) — Ticket type or all. Autocomplete is provided. `category` (required channel) — Discord category.</small> | Co-Owner rank or higher and `fbrp.tickets.manage` |
| `/support role <type> <role> <level> <mode>` | Add or remove a support role<br><small>Arguments: `type` (required text) — Ticket type or all. Autocomplete is provided. `role` (required role) — Support role. `level` (required text) — Access level. Choices: `Support`, `Manager`. `mode` (required text) — Add or remove. Choices: `Add`, `Remove`.</small> | Co-Owner rank or higher and `fbrp.tickets.manage` |
| `/support limit <max_open> <cooldown_seconds>` | Set ticket limits<br><small>Arguments: `max_open` (required integer) — Maximum open tickets per user. `cooldown_seconds` (required integer) — Seconds between new tickets.</small> | Co-Owner rank or higher and `fbrp.tickets.manage` |

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
| `/global game-unban <case_id> [reason]` | Lift a directly-issued EasyAdmin ban by its Florida Bay case ID<br><small>Arguments: `case_id` (required text) — Case ID such as `FB-660754`. `reason` (optional text) — Reason.</small> | `easyadmin.player.ban.remove` |
| `/global invite <user>` | Invite a member to every Florida Bay network server<br><small>Arguments: `user` (required user) — Member.</small> | `fbrp.global.invite` |
| `/global restore <user_id>` | Invite a former member back and restore their roles in each server<br><small>Arguments: `user_id` (required text) — Former member's Discord user ID.</small> | `fbrp.global.restore`; target must rank below you |
| `/global lookup <user>` | See which Florida Bay servers a member is in and their network record<br><small>Arguments: `user` (required user) — Member.</small> | `fbrp.global.lookup` |
| `/global nick <nickname>` | Set your own nickname in every Florida Bay network server where you are a member<br><small>Arguments: `nickname` (required text, 1–32 characters) — Your new network nickname.</small> | Assistant Community Manager rank or higher |

Important behavior:

- `warn`, `timeout`, `untimeout`, `kick`, `ban`, `blacklist`, and `restore` enforce rank hierarchy. `nick` is self-service for Assistant Community Manager and higher. `invite`, `lookup`, `unban`, and `unblacklist` do not call the target rank comparison.
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
| `/blacklistedserver add <server_id> <name> <reason>` | Add a Discord server to the investigation blacklist | Co-Owner rank or higher |
| `/blacklistedserver edit <server_id> [name] [reason]` | Change a blacklisted server's display name or reason | Co-Owner rank or higher |
| `/blacklistedserver remove <server_id>` | Remove a Discord server from the investigation blacklist | Co-Owner rank or higher |
| `/blacklistedserver list` | List all blacklisted Discord servers | Co-Owner rank or higher |

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
| `/userinfo <member>` | Investigate a member: game and Discord records, organization duty hours, servers and roles, blacklisted-server matches, and linked alt accounts<br><small>Arguments: `member` (required user) — Discord member. Organization activity shows current or former membership plus 7-day, 30-day, and all-time hours. Also lists every server the bot shares with them and their roles there, the other servers from their last website sign-in, and linked alt accounts (the alt section needs `fbrp.global.alts`).</small> | `fbrp.investigate`; linked alt accounts also need `fbrp.global.alts` |

## /case

Look up a complete moderation or Internal Affairs case by its public case ID.

| Command | What it does | Permission required |
|---|---|---|
| `/case lookup <case_id>` | Display the case's complete record, linked parent/alt cases, appeals and appeal events, discipline records, and matching audit trail. A complete JSON copy is attached when Discord's embed limits would otherwise truncate the record.<br><small>Arguments: `case_id` (required text) — An `FB-...` moderation case or `IA-YYYY-....` Internal Affairs reference. A bare database ID is also accepted.</small> | `fbrp.investigate` |

The same lookup is available in the member portal under **Staff workspace → Case lookup**. Every lookup is audited.

## /office

Assign organization or staff office voice channels

| Command | What it does | Permission required |
|---|---|---|
| `/office set <channel> <member>` | Assign an office owner<br><small>Arguments: `channel` (required channel) — Office voice channel. `member` (required user) — Office owner.</small> | Co-Owner rank or higher and `fbrp.office.manage` |
| `/office clear <channel>` | Remove an office assignment<br><small>Arguments: `channel` (required channel) — Office voice channel.</small> | Co-Owner rank or higher and `fbrp.office.manage` |
| `/office list` | List office assignments | Co-Owner rank or higher and `fbrp.office.manage` |

## /join

Join any Florida Bay network server

| Command | What it does | Permission required |
|---|---|---|
| `/join <server> [user]` | Join any Florida Bay network server<br><small>Arguments: `server` (required text) — Network server to join. Autocomplete is provided. `user` (optional user) — Add this authorized member instead (needs fbrp.network.join.others).</small> | `fbrp.network.join` for yourself; `fbrp.network.join.others` when `user` is supplied |

Important behavior:

- Adds the selected, verified user directly through their Discord OAuth authorization. If authorization is missing or expired, the bot returns the verification/authorization link. `/global invite` continues to create invite links.
- The Department of Homefront Security (DHS) Discord is not offered: people get into it through an accepted application on the orgs website, which adds them automatically. `JOIN_HIDDEN_GUILD_IDS` in `.env` hides more servers.

## /invite

Get the link to add this bot to a server with Administrator

| Command | What it does | Permission required |
|---|---|---|
| `/invite` | Get the link to add this bot to a server with Administrator | Hard-coded Florida Bay owner account only |

Important behavior:

- Returns an OAuth2 bot invite with Administrator and `applications.commands`; this command is locked to the hard-coded owner ID.

## Staff Assistant bot

Staff management lives in its own bot, **FBRP | Staff Assistant**, which is only in the staff server (it is not part of the main bot's command set). Its commands are registered in the staff server only. Anything that has to happen in another server (rank roles, a network-wide ACE re-sync, the manager+ roles in the main server) is queued in `network_role_queue` / `network_sync_queue` and carried out by the main bot.

### /staff

Staff ranks and duty tracking

| Command | What it does | Permission required |
|---|---|---|
| `/staff add <member> <rank>` | Put a member in a staff rank's ACE group; Trial Head Administrator and higher receive a rank-ordered callsign | `fbrp.staff.assign`; target and assigned rank must be below your highest ACE rank |
| `/staff move <member> <rank> [reason]` | Move an existing staff member to another rank and rebalance eligible callsigns | `fbrp.staff.assign`; target and assigned rank must be below your highest ACE rank |
| `/staff remove <member> <reason>` | Remove a member's staff rank, ACE group, and callsign | `fbrp.staff.assign`; target must be below your highest ACE rank |
| `/staff hours <member>` | Show a member's staff hours | `fbrp.staff.manage` |
| `/staff leaderboard [days]` | Show staff hours leaderboard | `fbrp.staff.manage` |
| `/staff forceout <member> <reason>` | Close a member's active staff shift | `fbrp.staff.manage` |

Assistant Community Manager and every higher staff rank automatically receive the `mgmt_team` ACE group.

`add`, `move` and `remove` (and `/roster add`, `/roster remove`, `/coord add`, `/coord remove`) take either `member` or a `discord_id`, because the person may not be in the staff server. The onboarding DM from `/staff add` (rank, callsign when eligible, and a single-use staff-server invite) is sent by the main bot; the result is posted in the staff audit log.

### /roster

Manage the staff roster and discipline

| Command | What it does | Permission required |
|---|---|---|
| `/roster add <member> <rank>` | Add or update a roster member and assign a rank-ordered callsign when they are Head Administrator or higher | `fbrp.roster.manage` |
| `/roster remove <member> <reason>` | Remove a roster member | `fbrp.roster.manage` |
| `/roster status <member> <status>` | Change roster status (Active, Inactive, LOA) | `fbrp.roster.manage` |
| `/roster discipline <member> <kind> <reason>` | Issue a warning or strike | `fbrp.roster.discipline` |
| `/roster discipline-revoke <id> <reason>` | Revoke a warning or strike | `fbrp.roster.discipline` |
| `/roster profile <member>` | Show one member's complete roster record | `fbrp.roster.view` |
| `/roster note <member> <note>` | Set a private roster activity note | `fbrp.roster.manage` |
| `/roster job-assign <member> <job>` / `/roster job-remove <member> <job>` | Assign or remove a secondary job | `fbrp.roster.manage` |
| `/roster category-upsert` / `category-delete` / `rank-upsert` / `rank-delete` / `job-upsert` / `job-delete` | Callsign categories, ranks (role and ACE mapping) and jobs | Co-Owner rank or higher and `fbrp.roster.config` |
| `/roster sync` | Sync roster ranks from Discord roles | Co-Owner rank or higher and `fbrp.roster.config` |
| `/roster list` | List the staff roster | `fbrp.roster.view` |

Role pickers only list roles of the server the command runs in, so ranks and jobs bound to a role in another server keep their binding unless `role` is changed.

### /callsign, /exam, /coordall

| Command | What it does | Permission required |
|---|---|---|
| `/callsign sync` | Reassign Trial Head Administrator+ callsigns by rank order, then republish every current assignment in the staff callsigns channel | Executive Management rank or higher |
| `/exam give <member> <exam>` / `revoke` / `active` | Open, close or list staff promotion exams (60 minutes) | Community Director rank or higher; configured bot superusers also qualify |
| `/coordall add <member>` | Add a member to every coordinator staff job, role and ACE group (incl. `staff_coordination_team`) | Bot owner only |
| `/coordall remove [member] [discord_id]` | Remove the member from every coordination roster: staff coordination ranks, team and jobs, and the gang, department and business coordination roles (via the main bot) and their `coordinators` / liaison rows, plus every coordinator ACE group | Bot owner only |

### /coord (staff coordination team only)

Gang, department and business coordination teams keep their own `/coord` in their own bots. This group manages only the **staff coordination team**.

| Command | What it does | Permission required |
|---|---|---|
| `/coord add <member> <rank>` | Hire, promote or demote: gives the rank role, the Staff Coordination Team role (and Staff Leadership from Assistant Staff Manager up) and puts them on the `staff_coordination_team` ACE group | Staff Manager or higher (or Assistant Community Manager+); only ranks below your own |
| `/coord remove <member> <reason>` | Remove every coordination role and the ACE group (`Resigned` or `Removed`) | Staff Manager or higher (or ACM+); only ranks below your own |
| `/coord hours [member] [days]` | Staff hours and weekly requirement; blank member is yourself | Team members for themselves; Staff Manager+ for others |
| `/coord leaderboard [days]` | Hours for the whole team | Staff Manager or higher (or ACM+) |
| `/coord list` | The team by rank | Everyone in the staff server |
| `/coord sync` | Re-check the ACE group, roster job and chain-of-command board | Staff Manager or higher (or ACM+) |

Ranks, high to low: Staff Director, Assistant Staff Director, Staff Manager, Assistant Staff Manager, Senior Staff Coordinator, Staff Coordinator, Trial Staff Coordinator. Role changes, ACE membership and the live board in `#chain-of-command` also follow role changes made by hand in Discord.

### Manager+ roles in the main server

The bot keeps Dev Manager+ (`1570227917504385096`) in the main server aligned with the active DevOps roster. The deleted Gang Manager+, Department Manager+, Staff Manager+, and Business Manager+ main-server roles are not synchronized. The bot only removes a role it granted itself.

## Message command

| Command | What it does | Permission required |
|---|---|---|
| `!f8` | In any registered network server, replies with the current FiveM F8 `connect` command and a reminder to keep the Discord desktop app open. The match is case-insensitive and ignores surrounding spaces. | Everyone in a registered network server |

## Not included

This reference covers commands handled by the Discord bot. FiveM chat/resource commands such as `/clockin`, `/duty`, `/aop`, `/me`, and `/ooc` are registered and permission-checked by the game resources rather than the Discord bot, so they are outside this file's scope.
