-- Junior Management (formerly Trial Manager) sits between Assistant Community
-- Manager and Head Administrator. It is not management: it stays below the derived
-- management group. It owns callsigns 150-199 in its own roster category placed
-- between Management and Pre Management. Existing management keeps 107-149.
-- Discord role reconciliation is migration 089.

INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by)
SELECT 'junior_management','Junior Management',FLOOR((manager.rank_order + head_admin.rank_order) / 2),TRUE,'migration'
FROM ace_groups manager
JOIN ace_groups head_admin ON head_admin.name='head_administrator'
WHERE manager.name='assistant_community_manager'
  AND manager.rank_order > head_admin.rank_order + 1
ON DUPLICATE KEY UPDATE
  label=VALUES(label),
  rank_order=VALUES(rank_order),
  staff_only=VALUES(staff_only);

-- Split the current management pool at 150 without relying on its display name.
-- Assistant Community Manager identifies the existing management category and
-- Head Administrator identifies the category immediately below the new rank.
UPDATE staff_roster_categories category
JOIN staff_roster_ranks manager
  ON manager.category_id=category.id
 AND manager.name='Assistant Community Manager'
SET category.callsign_end=149
WHERE category.callsign_start<150
  AND category.callsign_end>=150;

INSERT INTO staff_roster_categories(
  name,callsign_start,callsign_end,sort_order,created_at
)
SELECT
  'Junior Management',150,199,
  FLOOR((manager_category.sort_order + pre_category.sort_order) / 2),
  UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
FROM staff_roster_ranks manager
JOIN staff_roster_categories manager_category ON manager_category.id=manager.category_id
JOIN staff_roster_categories pre_category ON pre_category.name='Pre Management'
WHERE manager.name='Assistant Community Manager'
ON DUPLICATE KEY UPDATE
  callsign_start=VALUES(callsign_start),
  callsign_end=VALUES(callsign_end),
  sort_order=VALUES(sort_order);

INSERT INTO staff_roster_ranks(
  category_id,name,discord_role_id,discord_guild_id,ace_group,
  sort_order,weekly_seconds,minimum_days,created_at
)
SELECT
  junior_category.id,'Junior Management',NULL,NULL,'junior_management',
  manager.sort_order + 1,manager.weekly_seconds,manager.minimum_days,
  UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
FROM staff_roster_ranks manager
JOIN staff_roster_categories junior_category ON junior_category.name='Junior Management'
WHERE manager.name='Assistant Community Manager'
ON DUPLICATE KEY UPDATE
  category_id=VALUES(category_id),
  ace_group=VALUES(ace_group),
  sort_order=VALUES(sort_order),
  weekly_seconds=VALUES(weekly_seconds),
  minimum_days=VALUES(minimum_days);
