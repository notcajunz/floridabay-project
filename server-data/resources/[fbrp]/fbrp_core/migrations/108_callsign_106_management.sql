-- Return callsign 106 to Management. Ownership keeps 101-105 and the
-- existing Management assignments move down together to preserve rank order.

INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at)
SELECT
  member.discord_id,
  'callsign_rebalance',
  'migration',
  JSON_OBJECT('from',member.callsign,'to',NULL,'reason','category_range'),
  UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
FROM staff_roster_members member
JOIN staff_roster_ranks rank ON rank.id=member.rank_id
JOIN staff_roster_categories category ON category.id=rank.category_id
WHERE category.name='Ownership'
  AND member.callsign=106;

UPDATE staff_roster_members member
JOIN staff_roster_ranks rank ON rank.id=member.rank_id
JOIN staff_roster_categories category ON category.id=rank.category_id
SET member.callsign=NULL,
    member.updated_at=UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
WHERE category.name='Ownership'
  AND member.callsign=106;

INSERT INTO staff_roster_history(discord_id,action,actor_id,details,created_at)
SELECT
  member.discord_id,
  'callsign_rebalance',
  'migration',
  JSON_OBJECT('from',member.callsign,'to',member.callsign-1,'reason','category_range'),
  UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
FROM staff_roster_members member
JOIN staff_roster_ranks rank ON rank.id=member.rank_id
JOIN staff_roster_categories category ON category.id=rank.category_id
WHERE category.name='Management'
  AND member.callsign BETWEEN 107 AND 149;

-- Move through an unused range so the global unique callsign key cannot
-- collide while adjacent Management callsigns are shifted down by one.
UPDATE staff_roster_members member
JOIN staff_roster_ranks rank ON rank.id=member.rank_id
JOIN staff_roster_categories category ON category.id=rank.category_id
SET member.callsign=member.callsign+1000000
WHERE category.name='Management'
  AND member.callsign BETWEEN 107 AND 149;

UPDATE staff_roster_members member
JOIN staff_roster_ranks rank ON rank.id=member.rank_id
JOIN staff_roster_categories category ON category.id=rank.category_id
SET member.callsign=member.callsign-1000001,
    member.updated_at=UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000
WHERE category.name='Management'
  AND member.callsign BETWEEN 1000107 AND 1000149;

UPDATE staff_roster_categories
SET callsign_end=105
WHERE name='Ownership';

UPDATE staff_roster_categories
SET callsign_start=106
WHERE name='Management';
