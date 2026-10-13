-- Configuration and control-plane permissions belong to Co-Owner and above.
-- Delete lower-rank allows instead of adding denies: senior staff inherit the
-- lower staff groups, so a deny there would also block Co-Owners and Owners.
DELETE e
FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
JOIN ace_groups co ON co.name = 'co_owner'
WHERE g.staff_only = TRUE
  AND g.rank_order < co.rank_order
  AND e.mode = 'allow'
  AND e.object IN (
    '*',
    'fbrp',
    'fbrp.*',
    'fbrp.perms.manage',
    'fbrp.network.manage',
    'fbrp.security.manage',
    'fbrp.headtags.manage',
    'fbrp.organizations.manage',
    'fbrp.radio.manage',
    'fbrp.office.manage',
    'fbrp.roles.protect',
    'fbrp.roster.config',
    'fbrp.tickets.manage',
    'fbrp.personals.manage',
    'fbrp.blacklistedservers.manage',
    'fbrp.global',
    'fbrp.global.restore',
    'easyadmin',
    'easyadmin.bot',
    'easyadmin.player',
    'easyadmin.player.ban',
    'easyadmin.player.bucket',
    'easyadmin.server',
    'easyadmin.server.convars',
    'easyadmin.server.permissions.write',
    'easyadmin.server.resources.start',
    'easyadmin.server.resources.stop',
    'easyadmin.server.shortcut.add',
    'easyadmin.server.reminder.add',
    'vMenu.Everything',
    'vMenu.OnlinePlayers.All',
    'command',
    'runcode'
  );
