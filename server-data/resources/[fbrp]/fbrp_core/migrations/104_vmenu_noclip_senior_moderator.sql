-- vMenu NoClip moves down to Senior Moderator and above (it was Co-Owner and above).
-- Staff groups at or above the senior_moderator rank order get the grant. fbrp_core still only
-- lets it work while the staff member is clocked in, and config_vmenu_tiers.lua keeps lower
-- ranks from holding it even if a stray row or vMenu.Everything would otherwise give it.

INSERT INTO ace_entries(group_name, object, mode)
SELECT g.name, 'vMenu.NoClip', 'allow'
FROM ace_groups g
JOIN ace_groups sm ON sm.name = 'senior_moderator'
WHERE g.staff_only = TRUE AND g.rank_order >= sm.rank_order
ON DUPLICATE KEY UPDATE mode = 'allow';
