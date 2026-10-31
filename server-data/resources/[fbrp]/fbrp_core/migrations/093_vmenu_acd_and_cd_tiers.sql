-- Tighter vMenu tiers on top of migration 092.
--
-- No Reload plus vehicle Freeze, God mode and Invisible become Assistant Community Director and above.
-- Player Options moves up from Head Administrator to Community Director and above.
-- Each staff rank carries the entries of the ranks below it, so the lowest group of a tier is enough
-- and the groups above it are listed too in case any derived membership is ever incomplete.

INSERT INTO ace_entries(group_name,object,mode)
SELECT g.name,v.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'vMenu.Enhanced.Menus.WeaponOptions.NoReload' AS object
  UNION ALL SELECT 'vMenu.Enhanced.Menus.VehicleOptions.Freeze'
  UNION ALL SELECT 'vMenu.Enhanced.Menus.VehicleOptions.God'
  UNION ALL SELECT 'vMenu.Enhanced.Menus.VehicleOptions.Invisible'
) v
WHERE g.name IN ('assistant_community_director','community_director','co_owner','owner')
ON DUPLICATE KEY UPDATE mode='allow';

DELETE FROM ace_entries
WHERE object IN ('vMenu.Enhanced.Menus.PlayerOptions.Menu','vMenu.Enhanced.Menus.PlayerOptions.All')
  AND group_name IN ('head_administrator','junior_management','assistant_community_manager','community_manager','assistant_community_director');

INSERT INTO ace_entries(group_name,object,mode)
SELECT g.name,v.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'vMenu.Enhanced.Menus.PlayerOptions.Menu' AS object
  UNION ALL SELECT 'vMenu.Enhanced.Menus.PlayerOptions.All'
) v
WHERE g.name IN ('community_director','co_owner','owner')
ON DUPLICATE KEY UPDATE mode='allow';
