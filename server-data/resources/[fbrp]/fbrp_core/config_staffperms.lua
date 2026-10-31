-- Rows of the staff permissions spreadsheet (Google Sheets: "FBRP | In-Game Staff Permissions").
-- fbrp_core builds the rank-by-permission matrix from the live ACE tables and serves it to the
-- Discord bot service at /staff-permissions; the bot writes it into the sheet whenever it changes
-- (services/fbrp-bot/src/staff-permissions-sheet.js).
--
-- Every legacy vMenu permission is listed automatically from config_vmenu.lua. The
-- EasyAdmin and FBRP rows below only add labels and grouping. Any other easyadmin.* or fbrp.* ACE
-- a staff group holds is appended under "Other", so a new permission appears in the sheet even
-- before somebody labels it here.

FBRP.StaffPerms = FBRP.StaffPerms or {}

FBRP.StaffPerms.easyadmin = {
    { title = 'Player moderation', rows = {
        { 'Warn player', 'easyadmin.player.warn' },
        { 'Mute player (voice and text chat)', 'easyadmin.player.mute' },
        { 'Kick player', 'easyadmin.player.kick' },
        { 'Temporary ban', 'easyadmin.player.ban.temporary' },
        { 'Permanent ban', 'easyadmin.player.ban.permanent' },
        { 'Edit bans', 'easyadmin.player.ban.edit' },
        { 'Unban player', 'easyadmin.player.ban.remove' },
        { 'View ban list', 'easyadmin.player.ban.view' },
        { 'Freeze player', 'easyadmin.player.freeze' },
        { 'Slap player', 'easyadmin.player.slap' },
        { 'Player screenshot', 'easyadmin.player.screenshot' },
        { 'Spectate player', 'easyadmin.player.spectate' },
        { 'Teleport to player', 'easyadmin.player.teleport.single' },
        { 'Teleport everyone', 'easyadmin.player.teleport.everyone' },
        { 'Allowlist', 'easyadmin.player.allowlist' },
        { 'Force routing bucket', 'easyadmin.player.bucket.force' },
        { 'Join routing bucket', 'easyadmin.player.bucket.join' },
        { 'Immune to EasyAdmin actions', 'easyadmin.immune' },
        { 'Anonymous admin actions', 'easyadmin.anon' },
    } },
    { title = 'Reports and chat', rows = {
        { 'View reports', 'easyadmin.player.reports.view' },
        { 'Claim reports', 'easyadmin.player.reports.claim' },
        { 'Process reports', 'easyadmin.player.reports.process' },
        { 'Staff chat', 'easyadmin.server.chat' },
    } },
    { title = 'Server tools', rows = {
        { 'Server announcement', 'easyadmin.server.announce' },
        { 'Cleanup: cars', 'easyadmin.server.cleanup.cars' },
        { 'Cleanup: peds', 'easyadmin.server.cleanup.peds' },
        { 'Cleanup: props', 'easyadmin.server.cleanup.props' },
        { 'Start resources', 'easyadmin.server.resources.start' },
        { 'Stop resources', 'easyadmin.server.resources.stop' },
        { 'Edit server convars', 'easyadmin.server.convars' },
        { 'View permissions', 'easyadmin.server.permissions.read' },
        { 'Edit permissions', 'easyadmin.server.permissions.write' },
        { 'Add reminders', 'easyadmin.server.reminder.add' },
        { 'Add shortcuts', 'easyadmin.server.shortcut.add' },
    } },
    { title = 'Discord bot actions', rows = {
        { 'Bot: warn', 'easyadmin.bot.warn' },
        { 'Bot: mute', 'easyadmin.bot.mute' },
        { 'Bot: unmute', 'easyadmin.bot.unmute' },
        { 'Bot: kick', 'easyadmin.bot.kick' },
        { 'Bot: ban', 'easyadmin.bot.ban' },
        { 'Bot: unban', 'easyadmin.bot.unban' },
        { 'Bot: ban info', 'easyadmin.bot.baninfo' },
        { 'Bot: freeze', 'easyadmin.bot.freeze' },
        { 'Bot: unfreeze', 'easyadmin.bot.unfreeze' },
        { 'Bot: slap', 'easyadmin.bot.slap' },
        { 'Bot: screenshot', 'easyadmin.bot.screenshot' },
        { 'Bot: cleanup', 'easyadmin.bot.cleanup' },
        { 'Bot: announce', 'easyadmin.bot.announce' },
        { 'Bot: player info', 'easyadmin.bot.playerinfo' },
        { 'Bot: player list', 'easyadmin.bot.playerlist' },
        { 'Bot: refresh permissions', 'easyadmin.bot.refreshperms' },
    } },
}

FBRP.StaffPerms.fbrp = {
    { title = 'In-game staff tools', rows = {
        { 'Staff duty (/clockin)', 'fbrp.staff' },
        { 'Staff jail', 'fbrp.staff.jail' },
        { 'Revive self', 'fbrp.staff.revive.self' },
        { 'Revive and respawn others', 'fbrp.staff.revive.others' },
        { 'Unjail and unhospitalize', 'fbrp.staff.release' },
        { 'Staff vehicles', 'fbrp.vehicles.staff' },
        { 'Support tickets', 'fbrp.tickets.support' },
        { 'Manage tickets', 'fbrp.tickets.manage' },
        { 'Investigations', 'fbrp.investigate' },
    } },
    { title = 'Server control', rows = {
        { '/aop', 'fbrp.aop' },
        { 'Priority', 'fbrp.priority' },
        { 'Peacetime', 'fbrp.peacetime' },
        { '/announce and /staff (server announcement)', 'fbrp.announce' },
        { '/ondutystaff (clocked-in staff announcement)', 'fbrp.staff.onduty_announce' },
        { '/announcement (centre-screen announcement for everyone)', 'fbrp.announce.center' },
    } },
    { title = 'Staff management', rows = {
        { 'View staff roster', 'fbrp.roster.view' },
        { 'Manage staff roster', 'fbrp.roster.manage' },
        { 'Roster discipline', 'fbrp.roster.discipline' },
        { 'Roster configuration', 'fbrp.roster.config' },
        { 'Assign staff ranks', 'fbrp.staff.assign' },
        { 'Manage staff', 'fbrp.staff.manage' },
        { 'Chain of command', 'fbrp.coc.manage' },
        { 'Office management', 'fbrp.office.manage' },
        { 'Protected roles', 'fbrp.roles.protect' },
    } },
    { title = 'Network and global moderation', rows = {
        { 'Join network servers', 'fbrp.network.join' },
        { 'Join other servers\' networks', 'fbrp.network.join.others' },
        { 'Global warn', 'fbrp.global.warn' },
        { 'Global timeout', 'fbrp.global.timeout' },
        { 'Global kick', 'fbrp.global.kick' },
        { 'Global ban', 'fbrp.global.ban' },
        { 'Global unban', 'fbrp.global.unban' },
        { 'Global blacklist', 'fbrp.global.blacklist' },
        { 'Global lookup', 'fbrp.global.lookup' },
        { 'Global invite', 'fbrp.global.invite' },
        { 'Alt account tools', 'fbrp.global.alts' },
        { 'Restore tools', 'fbrp.global.restore' },
        { 'Discord moderation', 'fbrp.discord.mod' },
        { 'Blacklisted servers', 'fbrp.blacklistedservers.manage' },
    } },
    { title = 'Community systems', rows = {
        { 'Manage organizations', 'fbrp.organizations.manage' },
        { 'Manage headtags and tags', 'fbrp.headtags.manage' },
        { 'Manage personal vehicles', 'fbrp.personals.manage' },
        { 'Personal vehicle bypass', 'fbrp.personals.bypass' },
        { 'Manage radio frequencies', 'fbrp.radio.manage' },
    } },
}
