-- Management Team is derived from Assistant Community Manager or any higher
-- staff ACE rank. Rebuild existing manual/stale assignments immediately. The
-- Discord control plane keeps the same invariant current after this migration.
DELETE FROM ace_memberships WHERE group_name='mgmt_team';

INSERT IGNORE INTO ace_memberships(discord_id,group_name,origin,added_by,added_at)
SELECT DISTINCT m.discord_id,'mgmt_team','derived:acm_plus','migration',UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
FROM ace_memberships m
JOIN ace_groups held ON held.name=m.group_name
JOIN ace_groups floor ON floor.name='assistant_community_manager'
JOIN ace_groups management ON management.name='mgmt_team'
WHERE m.group_name<>'mgmt_team'
  AND held.staff_only=TRUE
  AND held.rank_order>=floor.rank_order
  AND (m.origin NOT LIKE 'discord:%' OR m.group_name='ban_blacklist_moderator');
