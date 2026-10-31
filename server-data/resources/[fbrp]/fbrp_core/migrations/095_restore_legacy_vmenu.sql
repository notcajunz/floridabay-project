-- Carry every current vMenu Enhanced tier grant to its vMenu 3.8.68 equivalent.
-- Enhanced-only announcement and handling-editor permissions remain recorded but inactive
-- because the legacy menu has no matching feature.

INSERT INTO ace_entries(group_name, object, mode)
SELECT group_name,
  CASE object
    WHEN 'vMenu.Enhanced.Menus.PlayerOptions.Menu' THEN 'vMenu.PlayerOptions.Menu'
    WHEN 'vMenu.Enhanced.Menus.PlayerOptions.All' THEN 'vMenu.PlayerOptions.All'
    WHEN 'vMenu.Enhanced.Menus.VehicleOptions.Engine' THEN 'vMenu.VehicleOptions.Engine'
    WHEN 'vMenu.Enhanced.Menus.VehicleOptions.PowerMultiplier' THEN 'vMenu.VehicleOptions.PowerMultiplier'
    WHEN 'vMenu.Enhanced.Menus.VehicleOptions.TorqueMultiplier' THEN 'vMenu.VehicleOptions.TorqueMultiplier'
    WHEN 'vMenu.Enhanced.Menus.VehicleOptions.RepairVehicle' THEN 'vMenu.VehicleOptions.Repair'
    WHEN 'vMenu.Enhanced.Menus.VehicleOptions.Freeze' THEN 'vMenu.VehicleOptions.Freeze'
    WHEN 'vMenu.Enhanced.Menus.VehicleOptions.God' THEN 'vMenu.VehicleOptions.God'
    WHEN 'vMenu.Enhanced.Menus.VehicleOptions.Invisible' THEN 'vMenu.VehicleOptions.Invisible'
    WHEN 'vMenu.Enhanced.Menus.WeaponOptions.NoReload' THEN 'vMenu.WeaponOptions.NoReload'
    WHEN 'vMenu.Enhanced.Menus.WeaponOptions.UnlimitedAmmo' THEN 'vMenu.WeaponOptions.UnlimitedAmmo'
    WHEN 'vMenu.Enhanced.Menus.WeaponOptions.GetAll' THEN 'vMenu.WeaponOptions.GetAll'
  END,
  mode
FROM ace_entries
WHERE object IN (
  'vMenu.Enhanced.Menus.PlayerOptions.Menu',
  'vMenu.Enhanced.Menus.PlayerOptions.All',
  'vMenu.Enhanced.Menus.VehicleOptions.Engine',
  'vMenu.Enhanced.Menus.VehicleOptions.PowerMultiplier',
  'vMenu.Enhanced.Menus.VehicleOptions.TorqueMultiplier',
  'vMenu.Enhanced.Menus.VehicleOptions.RepairVehicle',
  'vMenu.Enhanced.Menus.VehicleOptions.Freeze',
  'vMenu.Enhanced.Menus.VehicleOptions.God',
  'vMenu.Enhanced.Menus.VehicleOptions.Invisible',
  'vMenu.Enhanced.Menus.WeaponOptions.NoReload',
  'vMenu.Enhanced.Menus.WeaponOptions.UnlimitedAmmo',
  'vMenu.Enhanced.Menus.WeaponOptions.GetAll'
)
ON DUPLICATE KEY UPDATE mode=VALUES(mode);

-- vMenu 3.8.68 removes weapon_ before checking a per-addon permission. Older
-- Florida Bay rows retained the prefix, so copy them to the names vMenu reads.
INSERT INTO ace_entries(group_name, object, mode)
SELECT group_name,
  REPLACE(object, 'vMenu.WeaponOptions.WhitelistedModels.weapon_', 'vMenu.WeaponOptions.WhitelistedModels.'),
  mode
FROM ace_entries
WHERE object LIKE 'vMenu.WeaponOptions.WhitelistedModels.weapon_%'
ON DUPLICATE KEY UPDATE mode=VALUES(mode);

DELETE FROM ace_entries
WHERE object LIKE 'vMenu.WeaponOptions.WhitelistedModels.weapon_%';
