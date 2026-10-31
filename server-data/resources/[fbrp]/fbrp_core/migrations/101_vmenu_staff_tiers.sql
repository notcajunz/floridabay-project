-- vMenu staff tiers.
--
-- vMenu admin features (online players, player options, time and weather, vehicle god and freeze and
-- invisible, unlimited ammo, no reload, get all weapons, weapon spawn by name, misc dev and teleport
-- tools, noclip, staff flag, kick and ban immunity) and the heavy base-game weapons (railgun, EMP
-- launcher, minigun, homing launcher and friends) belong to Co-Owner and above. Power and torque
-- multipliers above x128 belong to Community Director and above. fbrp_core enforces the same tiers
-- when it applies ACE rows (config_vmenu_tiers.lua), so these statements only keep the stored rows, the
-- website and the staff permissions sheet in line with what is enforced.
--
-- Tiers follow rank_order: Co-Owner is the ace_groups row named co_owner, Community Director the row
-- named community_director, and any staff group at or above them is in the same tier.

DELETE e FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
JOIN ace_groups co ON co.name = 'co_owner'
WHERE (g.staff_only = FALSE OR g.rank_order < co.rank_order)
  AND e.mode = 'allow'
  AND (e.object IN (
    'vMenu.DontBanMe',
    'vMenu.DontKickMe',
    'vMenu.MiscSettings.ClearArea',
    'vMenu.MiscSettings.ConnectionMenu',
    'vMenu.MiscSettings.DevTools',
    'vMenu.MiscSettings.EntitySpawner',
    'vMenu.MiscSettings.JoinQuitNotifs',
    'vMenu.MiscSettings.OverheadNames',
    'vMenu.MiscSettings.PlayerBlips',
    'vMenu.MiscSettings.TeleportLocations',
    'vMenu.MiscSettings.TeleportSaveLocation',
    'vMenu.MiscSettings.TeleportToCoord',
    'vMenu.MiscSettings.TeleportToWp',
    'vMenu.NoClip',
    'vMenu.OnlinePlayers.All',
    'vMenu.OnlinePlayers.Identifiers',
    'vMenu.OnlinePlayers.Kick',
    'vMenu.OnlinePlayers.Kill',
    'vMenu.OnlinePlayers.Menu',
    'vMenu.OnlinePlayers.PermBan',
    'vMenu.OnlinePlayers.SeePrivateMessages',
    'vMenu.OnlinePlayers.SendMessage',
    'vMenu.OnlinePlayers.Spectate',
    'vMenu.OnlinePlayers.Summon',
    'vMenu.OnlinePlayers.Teleport',
    'vMenu.OnlinePlayers.TempBan',
    'vMenu.OnlinePlayers.Unban',
    'vMenu.OnlinePlayers.ViewBannedPlayers',
    'vMenu.OnlinePlayers.Waypoint',
    'vMenu.PlayerOptions.All',
    'vMenu.PlayerOptions.CleanPlayer',
    'vMenu.PlayerOptions.ClearBlood',
    'vMenu.PlayerOptions.DryPlayer',
    'vMenu.PlayerOptions.FastRun',
    'vMenu.PlayerOptions.FastSwim',
    'vMenu.PlayerOptions.Freeze',
    'vMenu.PlayerOptions.God',
    'vMenu.PlayerOptions.Ignored',
    'vMenu.PlayerOptions.Invisible',
    'vMenu.PlayerOptions.MaxArmor',
    'vMenu.PlayerOptions.MaxHealth',
    'vMenu.PlayerOptions.Menu',
    'vMenu.PlayerOptions.NeverWanted',
    'vMenu.PlayerOptions.NoRagdoll',
    'vMenu.PlayerOptions.Scenarios',
    'vMenu.PlayerOptions.SetBlood',
    'vMenu.PlayerOptions.SetWanted',
    'vMenu.PlayerOptions.StayInVehicle',
    'vMenu.PlayerOptions.Superjump',
    'vMenu.PlayerOptions.UnlimitedStamina',
    'vMenu.PlayerOptions.VehicleAutoPilotMenu',
    'vMenu.PlayerOptions.WetPlayer',
    'vMenu.Staff',
    'vMenu.TimeOptions.All',
    'vMenu.TimeOptions.FreezeTime',
    'vMenu.TimeOptions.Menu',
    'vMenu.TimeOptions.SetTime',
    'vMenu.VehicleOptions.Freeze',
    'vMenu.VehicleOptions.God',
    'vMenu.VehicleOptions.Invisible',
    'vMenu.VehicleOptions.PlaneBombs',
    'vMenu.WeaponOptions.CompactGrenadeLauncher',
    'vMenu.WeaponOptions.EMPLauncher',
    'vMenu.WeaponOptions.Firework',
    'vMenu.WeaponOptions.GetAll',
    'vMenu.WeaponOptions.GrenadeLauncher',
    'vMenu.WeaponOptions.GrenadeLauncherSmoke',
    'vMenu.WeaponOptions.HomingLauncher',
    'vMenu.WeaponOptions.Minigun',
    'vMenu.WeaponOptions.NoReload',
    'vMenu.WeaponOptions.PlasmaCarbine',
    'vMenu.WeaponOptions.PlasmaMinigun',
    'vMenu.WeaponOptions.PlasmaPistol',
    'vMenu.WeaponOptions.RPG',
    'vMenu.WeaponOptions.Railgun',
    'vMenu.WeaponOptions.RailgunXM3',
    'vMenu.WeaponOptions.SnowLauncher',
    'vMenu.WeaponOptions.SpawnByName',
    'vMenu.WeaponOptions.UnlimitedAmmo',
    'vMenu.WeatherOptions.All',
    'vMenu.WeatherOptions.Blackout',
    'vMenu.WeatherOptions.Dynamic',
    'vMenu.WeatherOptions.Menu',
    'vMenu.WeatherOptions.RandomizeClouds',
    'vMenu.WeatherOptions.RemoveClouds',
    'vMenu.WeatherOptions.SetWeather',
    'vMenu.WeatherOptions.VehBlackout'
  )
  OR e.object LIKE 'vMenu.OnlinePlayers.%'
  OR e.object LIKE 'vMenu.PlayerOptions.%'
  OR e.object LIKE 'vMenu.TimeOptions.%'
  OR e.object LIKE 'vMenu.WeatherOptions.%');

DELETE e FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
JOIN ace_groups cd ON cd.name = 'community_director'
WHERE (g.staff_only = FALSE OR g.rank_order < cd.rank_order)
  AND e.mode = 'allow'
  AND e.object = 'vMenu.VehicleOptions.UnlimitedMultipliers';

INSERT INTO ace_entries(group_name, object, mode)
SELECT g.name, v.object, 'allow'
FROM ace_groups g
JOIN ace_groups co ON co.name = 'co_owner'
JOIN (
  SELECT 'vMenu.Staff' AS object
    UNION ALL SELECT 'vMenu.DontBanMe'
  UNION ALL SELECT 'vMenu.DontKickMe'
  UNION ALL SELECT 'vMenu.MiscSettings.ClearArea'
  UNION ALL SELECT 'vMenu.MiscSettings.ConnectionMenu'
  UNION ALL SELECT 'vMenu.MiscSettings.DevTools'
  UNION ALL SELECT 'vMenu.MiscSettings.EntitySpawner'
  UNION ALL SELECT 'vMenu.MiscSettings.JoinQuitNotifs'
  UNION ALL SELECT 'vMenu.MiscSettings.OverheadNames'
  UNION ALL SELECT 'vMenu.MiscSettings.PlayerBlips'
  UNION ALL SELECT 'vMenu.MiscSettings.TeleportLocations'
  UNION ALL SELECT 'vMenu.MiscSettings.TeleportSaveLocation'
  UNION ALL SELECT 'vMenu.MiscSettings.TeleportToCoord'
  UNION ALL SELECT 'vMenu.MiscSettings.TeleportToWp'
  UNION ALL SELECT 'vMenu.OnlinePlayers.All'
  UNION ALL SELECT 'vMenu.OnlinePlayers.Identifiers'
  UNION ALL SELECT 'vMenu.OnlinePlayers.Kick'
  UNION ALL SELECT 'vMenu.OnlinePlayers.Kill'
  UNION ALL SELECT 'vMenu.OnlinePlayers.Menu'
  UNION ALL SELECT 'vMenu.OnlinePlayers.PermBan'
  UNION ALL SELECT 'vMenu.OnlinePlayers.SeePrivateMessages'
  UNION ALL SELECT 'vMenu.OnlinePlayers.SendMessage'
  UNION ALL SELECT 'vMenu.OnlinePlayers.Spectate'
  UNION ALL SELECT 'vMenu.OnlinePlayers.Summon'
  UNION ALL SELECT 'vMenu.OnlinePlayers.Teleport'
  UNION ALL SELECT 'vMenu.OnlinePlayers.TempBan'
  UNION ALL SELECT 'vMenu.OnlinePlayers.Unban'
  UNION ALL SELECT 'vMenu.OnlinePlayers.ViewBannedPlayers'
  UNION ALL SELECT 'vMenu.OnlinePlayers.Waypoint'
  UNION ALL SELECT 'vMenu.PlayerOptions.All'
  UNION ALL SELECT 'vMenu.PlayerOptions.CleanPlayer'
  UNION ALL SELECT 'vMenu.PlayerOptions.ClearBlood'
  UNION ALL SELECT 'vMenu.PlayerOptions.DryPlayer'
  UNION ALL SELECT 'vMenu.PlayerOptions.FastRun'
  UNION ALL SELECT 'vMenu.PlayerOptions.FastSwim'
  UNION ALL SELECT 'vMenu.PlayerOptions.Freeze'
  UNION ALL SELECT 'vMenu.PlayerOptions.God'
  UNION ALL SELECT 'vMenu.PlayerOptions.Ignored'
  UNION ALL SELECT 'vMenu.PlayerOptions.Invisible'
  UNION ALL SELECT 'vMenu.PlayerOptions.MaxArmor'
  UNION ALL SELECT 'vMenu.PlayerOptions.MaxHealth'
  UNION ALL SELECT 'vMenu.PlayerOptions.Menu'
  UNION ALL SELECT 'vMenu.PlayerOptions.NeverWanted'
  UNION ALL SELECT 'vMenu.PlayerOptions.NoRagdoll'
  UNION ALL SELECT 'vMenu.PlayerOptions.Scenarios'
  UNION ALL SELECT 'vMenu.PlayerOptions.SetBlood'
  UNION ALL SELECT 'vMenu.PlayerOptions.SetWanted'
  UNION ALL SELECT 'vMenu.PlayerOptions.StayInVehicle'
  UNION ALL SELECT 'vMenu.PlayerOptions.Superjump'
  UNION ALL SELECT 'vMenu.PlayerOptions.UnlimitedStamina'
  UNION ALL SELECT 'vMenu.PlayerOptions.VehicleAutoPilotMenu'
  UNION ALL SELECT 'vMenu.PlayerOptions.WetPlayer'
  UNION ALL SELECT 'vMenu.TimeOptions.All'
  UNION ALL SELECT 'vMenu.TimeOptions.FreezeTime'
  UNION ALL SELECT 'vMenu.TimeOptions.Menu'
  UNION ALL SELECT 'vMenu.TimeOptions.SetTime'
  UNION ALL SELECT 'vMenu.VehicleOptions.Freeze'
  UNION ALL SELECT 'vMenu.VehicleOptions.God'
  UNION ALL SELECT 'vMenu.VehicleOptions.Invisible'
  UNION ALL SELECT 'vMenu.VehicleOptions.PlaneBombs'
  UNION ALL SELECT 'vMenu.WeaponOptions.CompactGrenadeLauncher'
  UNION ALL SELECT 'vMenu.WeaponOptions.EMPLauncher'
  UNION ALL SELECT 'vMenu.WeaponOptions.Firework'
  UNION ALL SELECT 'vMenu.WeaponOptions.GetAll'
  UNION ALL SELECT 'vMenu.WeaponOptions.GrenadeLauncher'
  UNION ALL SELECT 'vMenu.WeaponOptions.GrenadeLauncherSmoke'
  UNION ALL SELECT 'vMenu.WeaponOptions.HomingLauncher'
  UNION ALL SELECT 'vMenu.WeaponOptions.Minigun'
  UNION ALL SELECT 'vMenu.WeaponOptions.NoReload'
  UNION ALL SELECT 'vMenu.WeaponOptions.PlasmaCarbine'
  UNION ALL SELECT 'vMenu.WeaponOptions.PlasmaMinigun'
  UNION ALL SELECT 'vMenu.WeaponOptions.PlasmaPistol'
  UNION ALL SELECT 'vMenu.WeaponOptions.RPG'
  UNION ALL SELECT 'vMenu.WeaponOptions.Railgun'
  UNION ALL SELECT 'vMenu.WeaponOptions.RailgunXM3'
  UNION ALL SELECT 'vMenu.WeaponOptions.SnowLauncher'
  UNION ALL SELECT 'vMenu.WeaponOptions.SpawnByName'
  UNION ALL SELECT 'vMenu.WeaponOptions.UnlimitedAmmo'
  UNION ALL SELECT 'vMenu.WeatherOptions.All'
  UNION ALL SELECT 'vMenu.WeatherOptions.Blackout'
  UNION ALL SELECT 'vMenu.WeatherOptions.Dynamic'
  UNION ALL SELECT 'vMenu.WeatherOptions.Menu'
  UNION ALL SELECT 'vMenu.WeatherOptions.RandomizeClouds'
  UNION ALL SELECT 'vMenu.WeatherOptions.RemoveClouds'
  UNION ALL SELECT 'vMenu.WeatherOptions.SetWeather'
  UNION ALL SELECT 'vMenu.WeatherOptions.VehBlackout'
) v
WHERE g.staff_only = TRUE AND g.rank_order >= co.rank_order
ON DUPLICATE KEY UPDATE mode = 'allow';

INSERT INTO ace_entries(group_name, object, mode)
SELECT g.name, 'vMenu.VehicleOptions.UnlimitedMultipliers', 'allow'
FROM ace_groups g
JOIN ace_groups cd ON cd.name = 'community_director'
WHERE g.staff_only = TRUE AND g.rank_order >= cd.rank_order
ON DUPLICATE KEY UPDATE mode = 'allow';
