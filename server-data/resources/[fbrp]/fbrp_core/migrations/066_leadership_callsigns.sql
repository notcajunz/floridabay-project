-- Callsigns are reserved for Head Administrator and higher. Record and clear
-- existing assignments held by Senior Administrators and every lower rank.
INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at)
SELECT m.discord_id,
       'callsign_rebalance',
       'migration',
       JSON_OBJECT('from',m.callsign,'to',NULL,'reason','rank_policy'),
       UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
  FROM staff_roster_members m
  JOIN staff_roster_ranks r ON r.id=m.rank_id
  JOIN ace_groups g ON g.name=r.ace_group
  JOIN (
    SELECT MAX(boundary_group.rank_order) rank_order
      FROM staff_roster_ranks boundary_rank
      JOIN ace_groups boundary_group ON boundary_group.name=boundary_rank.ace_group
     WHERE LOWER(boundary_rank.name)=LOWER('Senior Administrator')
  ) boundary ON g.rank_order<=boundary.rank_order
 WHERE m.status<>'removed' AND m.callsign IS NOT NULL;

UPDATE staff_roster_members m
JOIN staff_roster_ranks r ON r.id=m.rank_id
JOIN ace_groups g ON g.name=r.ace_group
JOIN (
  SELECT MAX(boundary_group.rank_order) rank_order
    FROM staff_roster_ranks boundary_rank
    JOIN ace_groups boundary_group ON boundary_group.name=boundary_rank.ace_group
   WHERE LOWER(boundary_rank.name)=LOWER('Senior Administrator')
) boundary ON g.rank_order<=boundary.rank_order
SET m.callsign=NULL,
    m.updated_at=UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
WHERE m.status<>'removed' AND m.callsign IS NOT NULL;
