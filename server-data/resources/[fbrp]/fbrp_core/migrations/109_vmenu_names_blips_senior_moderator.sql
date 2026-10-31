-- vMenu player names and player blips move down to Senior Moderator and above (they were
-- Co-Owner and above). Staff groups at or above the senior_moderator rank order get the grants.
-- fbrp_core still only lets them work while the staff member is clocked in, and
-- config_vmenu_tiers.lua keeps lower ranks from holding them.

INSERT INTO ace_entries(group_name, object, mode)
SELECT g.name, o.object, 'allow'
FROM ace_groups g
JOIN ace_groups sm ON sm.name = 'senior_moderator'
JOIN (SELECT 'vMenu.MiscSettings.OverheadNames' AS object UNION ALL SELECT 'vMenu.MiscSettings.PlayerBlips') o
WHERE g.staff_only = TRUE AND g.rank_order >= sm.rank_order
ON DUPLICATE KEY UPDATE mode = 'allow';
