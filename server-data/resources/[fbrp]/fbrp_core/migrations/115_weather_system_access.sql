-- Weather System access and Owner-only vMenu weather and time.
--
-- 1. Members of mgmt_team (and everyone ranked above it, who inherit that group) may open the
--    gg_weathersystem panel: its /weather command checks the command.weather ACE.
-- 2. the vMenu weather and time options (vMenu.WeatherOptions.*, vMenu.TimeOptions.*) are Owner and
--    above only. They are removed from every group ranked below Owner. A group below Owner that held
--    the vMenu.Everything shortcut gets it written out as explicit rows without those two sections,
--    since the shortcut expands to them. Re-grant them to a group in the portal to override this.
-- Rows are matched by rank, not by group name.

INSERT INTO ace_entries(group_name, object, mode)
SELECT 'mgmt_team', 'command.weather', 'allow'
FROM ace_groups
WHERE name = 'mgmt_team'
ON DUPLICATE KEY UPDATE mode = ace_entries.mode;

INSERT INTO ace_entries(group_name, object, mode)
SELECT e.group_name, o.object, 'allow'
FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
JOIN ace_groups owner ON owner.name = 'owner'
JOIN (
    SELECT 'vMenu.DontBanMe' AS object
    UNION ALL SELECT 'vMenu.DontKickMe' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.All' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ClearArea' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ConnectionMenu' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.DeathNotifs' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.DevTools' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.DriftMode' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.EntitySpawner' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.JoinQuitNotifs' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.LocationBlips' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.Menu' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.NightVision' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.OverheadNames' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.PlayerBlips' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.RestoreAppearance' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.RestoreWeapons' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ShowCoordinates' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ShowLocation' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.TeleportLocations' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.TeleportSaveLocation' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.TeleportToCoord' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.TeleportToWp' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ThermalVision' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.All' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.Identifiers' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.Kick' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.Kill' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.Menu' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.PermBan' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.SeePrivateMessages' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.SendMessage' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.Spectate' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.Summon' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.Teleport' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.TempBan' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.Unban' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.ViewBannedPlayers' AS object
    UNION ALL SELECT 'vMenu.OnlinePlayers.Waypoint' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.AddBlip' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.All' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.Doors' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.ExclusiveDriver' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.KickPassengers' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.LockDoors' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.Menu' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.SoundHorn' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.ToggleAlarm' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.ToggleEngine' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.ToggleLights' AS object
    UNION ALL SELECT 'vMenu.PersonalVehicle.ToggleStance' AS object
    UNION ALL SELECT 'vMenu.PlayerAppearance.AddonPeds' AS object
    UNION ALL SELECT 'vMenu.PlayerAppearance.All' AS object
    UNION ALL SELECT 'vMenu.PlayerAppearance.Customize' AS object
    UNION ALL SELECT 'vMenu.PlayerAppearance.Menu' AS object
    UNION ALL SELECT 'vMenu.PlayerAppearance.SpawnNew' AS object
    UNION ALL SELECT 'vMenu.PlayerAppearance.SpawnSaved' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.All' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.CleanPlayer' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.ClearBlood' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.DryPlayer' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.FastRun' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.FastSwim' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.Freeze' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.God' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.Ignored' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.Invisible' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.MaxArmor' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.MaxHealth' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.Menu' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.NeverWanted' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.NoRagdoll' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.Scenarios' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.SetBlood' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.SetWanted' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.StayInVehicle' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.Superjump' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.UnlimitedStamina' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.VehicleAutoPilotMenu' AS object
    UNION ALL SELECT 'vMenu.PlayerOptions.WetPlayer' AS object
    UNION ALL SELECT 'vMenu.SavedVehicles.All' AS object
    UNION ALL SELECT 'vMenu.SavedVehicles.Menu' AS object
    UNION ALL SELECT 'vMenu.SavedVehicles.Spawn' AS object
    UNION ALL SELECT 'vMenu.Staff' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Alarm' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.All' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.AnchorBoat' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.BikeSeatbelt' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.BypassExtraDamage' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.ChangePlate' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Colors' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Components' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.CycleSeats' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Delete' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.DestroyEngine' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.DisableTurbulence' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Doors' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Engine' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.EngineAlwaysOn' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.FixOrDestroyTires' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Flares' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.FlashHighbeamsOnHonk' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Flip' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Freeze' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.God' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.InfiniteFuel' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Invisible' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.KeepClean' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Lights' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Liveries' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Menu' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Mod' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.NoHelmet' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.NoSiren' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.PlaneBombs' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.PowerMultiplier' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Repair' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.SpeedLimiter' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.TorqueMultiplier' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Underglow' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.UnlimitedMultipliers' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Wash' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Windows' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Addon' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.All' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Boats' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.BypassRateLimit' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Commercial' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Compacts' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Coupes' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Cycles' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.DisableReplacePrevious' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Emergency' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Helicopters' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Industrial' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Menu' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Military' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Motorcycles' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Muscle' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.OffRoad' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.OpenWheel' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Planes' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.SUVs' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Sedans' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Service' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.SpawnByName' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Sports' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.SportsClassic' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Super' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Trains' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Utility' AS object
    UNION ALL SELECT 'vMenu.VehicleSpawner.Vans' AS object
    UNION ALL SELECT 'vMenu.WeaponLoadouts.All' AS object
    UNION ALL SELECT 'vMenu.WeaponLoadouts.Equip' AS object
    UNION ALL SELECT 'vMenu.WeaponLoadouts.EquipOnRespawn' AS object
    UNION ALL SELECT 'vMenu.WeaponLoadouts.Menu' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.APPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.AcidPackage' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.AdvancedRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.All' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.AssaultRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.AssaultRifleMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.AssaultSMG' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.AssaultShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.BZGas' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Ball' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Bat' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.BattleAxe' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.BattleRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Bottle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.BullpupRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.BullpupRifleMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.BullpupShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CandyCane' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CarbineRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CarbineRifleMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CeramicPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CombatMG' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CombatMGMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CombatPDW' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CombatPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CombatShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CompactGrenadeLauncher' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.CompactRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Crowbar' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Dagger' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.DoubleAction' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.DoubleBarrelShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.EMPLauncher' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.FertilizerCan' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.FireExtinguisher' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Firework' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Flare' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.FlareGun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Flashlight' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.GetAll' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.GolfClub' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Grenade' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.GrenadeLauncher' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.GrenadeLauncherSmoke' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Gusenberg' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.HackingDevice' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Hammer' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Hatchet' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.HazardCan' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.HeavyPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.HeavyRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.HeavyShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.HeavySniper' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.HeavySniperMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.HomingLauncher' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Knife' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.KnuckleDuster' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.MG' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Machete' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.MachinePistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.MarksmanPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.MarksmanRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.MarksmanRifleMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Menu' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.MicroSMG' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.MilitaryRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.MiniSMG' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Minigun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Molotov' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Musket' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.NavyRevolver' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Newspaper' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.NightVision' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Nightstick' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.NoReload' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Parachute' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PericoPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PetrolCan' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PipeBomb' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Pistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Pistol50' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PistolMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PistolXM3' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PlasmaCarbine' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PlasmaMinigun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PlasmaPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PoolCue' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PrecisionRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.ProximityMine' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PumpShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PumpShotgunMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.RPG' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Railgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.RailgunXM3' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.RemoveAll' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Revolver' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.RevolverMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SMG' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SMGMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SNSPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SNSPistolMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SawnOffShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SetAllAmmo' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SmokeGrenade' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SniperRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SnowLauncher' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Snowball' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Spawn' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SpawnByName' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SpecialCarbine' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SpecialCarbineMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.StickyBomb' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.StoneHatchet' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.StunGun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.StunGunMP' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.StunRod' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SweeperShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.SwitchBlade' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.TacticalRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.TecPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Unarmed' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.UnlimitedAmmo' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.VintagePistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Wrench' AS object
) o
WHERE e.mode = 'allow'
  AND e.object = 'vMenu.Everything'
  AND g.rank_order < owner.rank_order
ON DUPLICATE KEY UPDATE mode = ace_entries.mode;

DELETE e FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
JOIN ace_groups owner ON owner.name = 'owner'
WHERE e.mode = 'allow'
  AND e.object = 'vMenu.Everything'
  AND g.rank_order < owner.rank_order;

DELETE e FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
JOIN ace_groups owner ON owner.name = 'owner'
WHERE (e.object LIKE 'vMenu.WeatherOptions.%' OR e.object LIKE 'vMenu.TimeOptions.%')
  AND g.rank_order < owner.rank_order;
