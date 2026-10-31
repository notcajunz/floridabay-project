-- vMenu Enhanced restrictions.
--
-- Everyone loses Player Options entirely. Engine options, the engine power and torque multipliers,
-- vehicle repair and vehicle handling become Head Administrator and above, plus holders of the VIP
-- Membership Discord role. Unlimited ammo and Get All weapons become management only. The base grants
-- for everyone live in server-data/config/permissions.cfg.
--
-- Stored names here are vMenu Enhanced names and fbrp_core expands them (see config_vmenu.lua). Every
-- staff rank carries the entries of the ranks below it, so Head Administrator is enough, and the
-- ranks above it are listed too in case any derived membership is ever incomplete.

INSERT INTO ace_entries(group_name,object,mode)
SELECT g.name,v.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'vMenu.Enhanced.Menus.PlayerOptions.Menu' AS object
  UNION ALL SELECT 'vMenu.Enhanced.Menus.PlayerOptions.All'
  UNION ALL SELECT 'vMenu.Enhanced.Menus.VehicleOptions.Engine'
  UNION ALL SELECT 'vMenu.Enhanced.Menus.VehicleOptions.PowerMultiplier'
  UNION ALL SELECT 'vMenu.Enhanced.Menus.VehicleOptions.TorqueMultiplier'
  UNION ALL SELECT 'vMenu.Enhanced.Menus.VehicleOptions.RepairVehicle'
  UNION ALL SELECT 'vMenu.Enhanced.Menus.VehicleOptions.Handling'
) v
WHERE g.name IN ('head_administrator','junior_management','assistant_community_manager','community_manager',
                 'assistant_community_director','community_director','co_owner','owner')
ON DUPLICATE KEY UPDATE mode='allow';

-- VIP Membership gets the vehicle tuning options only (not Player Options).
INSERT INTO ace_groups(name,label,rank_order,staff_only,created_by)
VALUES ('vip_vehicle_tuning','VIP Vehicle Tuning',0,FALSE,'system')
ON DUPLICATE KEY UPDATE label=VALUES(label),staff_only=FALSE;

INSERT INTO ace_entries(group_name,object,mode) VALUES
 ('vip_vehicle_tuning','vMenu.Enhanced.Menus.VehicleOptions.Engine','allow'),
 ('vip_vehicle_tuning','vMenu.Enhanced.Menus.VehicleOptions.PowerMultiplier','allow'),
 ('vip_vehicle_tuning','vMenu.Enhanced.Menus.VehicleOptions.TorqueMultiplier','allow'),
 ('vip_vehicle_tuning','vMenu.Enhanced.Menus.VehicleOptions.RepairVehicle','allow'),
 ('vip_vehicle_tuning','vMenu.Enhanced.Menus.VehicleOptions.Handling','allow')
ON DUPLICATE KEY UPDATE mode='allow';

INSERT IGNORE INTO discord_role_bindings(guild_id,role_id,group_name)
VALUES ('1557594282976747550','1557689749198868520','vip_vehicle_tuning');

-- Unlimited ammo and Get All weapons: the management team group (Assistant Community Manager and up).
INSERT INTO ace_entries(group_name,object,mode)
SELECT g.name,v.object,'allow'
FROM ace_groups g
JOIN (
  SELECT 'vMenu.Enhanced.Menus.WeaponOptions.UnlimitedAmmo' AS object
  UNION ALL SELECT 'vMenu.Enhanced.Menus.WeaponOptions.GetAll'
) v
WHERE g.name='mgmt_team'
ON DUPLICATE KEY UPDATE mode='allow';

-- Player screenshots: Trial Head Administrator and above. They were Senior Moderator and above.
DELETE FROM ace_entries
WHERE object='easyadmin.player.screenshot'
  AND group_name IN ('senior_moderator','head_moderator','admin','senior_administrator');
