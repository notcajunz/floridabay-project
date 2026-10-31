-- Permanent bans through EasyAdmin move down to Trial Head Administrator and above (they were
-- Community Director and above). Staff groups at or above the trial_head_administrator rank order get the grant.

INSERT INTO ace_entries(group_name, object, mode)
SELECT g.name, 'easyadmin.player.ban.permanent', 'allow'
FROM ace_groups g
JOIN ace_groups th ON th.name = 'trial_head_administrator'
WHERE g.staff_only = TRUE AND g.rank_order >= th.rank_order
ON DUPLICATE KEY UPDATE mode = 'allow';
