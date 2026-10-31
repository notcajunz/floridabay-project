-- Remove the hard coded vMenu staff tiers.
--
-- fbrp_core used to trim every group below Co-Owner at runtime. Permissions now come only from the
-- stored ACE rows, so the vMenu wildcard rows of those groups are written out as the explicit rows
-- they were trimmed to. Rows granted by hand, including ones the old filter silently ignored, now apply.
-- Groups at or above Co-Owner keep their rows untouched.

INSERT INTO ace_entries(group_name, object, mode)
SELECT e.group_name, o.object, 'allow'
FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
LEFT JOIN ace_groups co ON co.name = 'co_owner'
JOIN (
    SELECT 'vMenu.MiscSettings.All' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.DeathNotifs' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.DriftMode' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.LocationBlips' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.Menu' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.NightVision' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.RestoreAppearance' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.RestoreWeapons' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ShowCoordinates' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ShowLocation' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ThermalVision' AS object
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
    UNION ALL SELECT 'vMenu.SavedVehicles.All' AS object
    UNION ALL SELECT 'vMenu.SavedVehicles.Menu' AS object
    UNION ALL SELECT 'vMenu.SavedVehicles.Spawn' AS object
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
    UNION ALL SELECT 'vMenu.VehicleOptions.InfiniteFuel' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.KeepClean' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Lights' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Liveries' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Menu' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Mod' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.NoHelmet' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.NoSiren' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.PowerMultiplier' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Repair' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.SpeedLimiter' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.TorqueMultiplier' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Underglow' AS object
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
    UNION ALL SELECT 'vMenu.WeaponOptions.CompactRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Crowbar' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Dagger' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.DoubleAction' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.DoubleBarrelShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.FertilizerCan' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.FireExtinguisher' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Flare' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.FlareGun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Flashlight' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.GolfClub' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Grenade' AS object
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
    UNION ALL SELECT 'vMenu.WeaponOptions.Molotov' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Musket' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.NavyRevolver' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Newspaper' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.NightVision' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Nightstick' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Parachute' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PericoPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PetrolCan' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PipeBomb' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Pistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Pistol50' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PistolMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PistolXM3' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PoolCue' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PrecisionRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.ProximityMine' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PumpShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PumpShotgunMk2' AS object
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
    UNION ALL SELECT 'vMenu.WeaponOptions.Snowball' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Spawn' AS object
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
    UNION ALL SELECT 'vMenu.WeaponOptions.VintagePistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Wrench' AS object
) o
WHERE e.mode = 'allow'
  AND e.object = 'vMenu.Everything'
  AND NOT (g.staff_only = TRUE AND co.name IS NOT NULL AND g.rank_order >= co.rank_order)
ON DUPLICATE KEY UPDATE mode = ace_entries.mode;

INSERT INTO ace_entries(group_name, object, mode)
SELECT e.group_name, o.object, 'allow'
FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
LEFT JOIN ace_groups co ON co.name = 'co_owner'
JOIN (
    SELECT 'vMenu.VehicleOptions.Alarm' AS object
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
    UNION ALL SELECT 'vMenu.VehicleOptions.InfiniteFuel' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.KeepClean' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Lights' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Liveries' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Menu' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Mod' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.NoHelmet' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.NoSiren' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.PowerMultiplier' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Repair' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.SpeedLimiter' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.TorqueMultiplier' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Underglow' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Wash' AS object
    UNION ALL SELECT 'vMenu.VehicleOptions.Windows' AS object
) o
WHERE e.mode = 'allow'
  AND e.object = 'vMenu.VehicleOptions.All'
  AND NOT (g.staff_only = TRUE AND co.name IS NOT NULL AND g.rank_order >= co.rank_order)
ON DUPLICATE KEY UPDATE mode = ace_entries.mode;

INSERT INTO ace_entries(group_name, object, mode)
SELECT e.group_name, o.object, 'allow'
FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
LEFT JOIN ace_groups co ON co.name = 'co_owner'
JOIN (
    SELECT 'vMenu.WeaponOptions.APPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.AcidPackage' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.AdvancedRifle' AS object
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
    UNION ALL SELECT 'vMenu.WeaponOptions.CompactRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Crowbar' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Dagger' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.DoubleAction' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.DoubleBarrelShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.FertilizerCan' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.FireExtinguisher' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Flare' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.FlareGun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Flashlight' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.GolfClub' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Grenade' AS object
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
    UNION ALL SELECT 'vMenu.WeaponOptions.Molotov' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Musket' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.NavyRevolver' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Newspaper' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.NightVision' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Nightstick' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Parachute' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PericoPistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PetrolCan' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PipeBomb' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Pistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Pistol50' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PistolMk2' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PistolXM3' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PoolCue' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PrecisionRifle' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.ProximityMine' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PumpShotgun' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.PumpShotgunMk2' AS object
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
    UNION ALL SELECT 'vMenu.WeaponOptions.Snowball' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Spawn' AS object
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
    UNION ALL SELECT 'vMenu.WeaponOptions.VintagePistol' AS object
    UNION ALL SELECT 'vMenu.WeaponOptions.Wrench' AS object
) o
WHERE e.mode = 'allow'
  AND e.object = 'vMenu.WeaponOptions.All'
  AND NOT (g.staff_only = TRUE AND co.name IS NOT NULL AND g.rank_order >= co.rank_order)
ON DUPLICATE KEY UPDATE mode = ace_entries.mode;

INSERT INTO ace_entries(group_name, object, mode)
SELECT e.group_name, o.object, 'allow'
FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
LEFT JOIN ace_groups co ON co.name = 'co_owner'
JOIN (
    SELECT 'vMenu.MiscSettings.DeathNotifs' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.DriftMode' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.LocationBlips' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.Menu' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.NightVision' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.RestoreAppearance' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.RestoreWeapons' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ShowCoordinates' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ShowLocation' AS object
    UNION ALL SELECT 'vMenu.MiscSettings.ThermalVision' AS object
) o
WHERE e.mode = 'allow'
  AND e.object = 'vMenu.MiscSettings.All'
  AND NOT (g.staff_only = TRUE AND co.name IS NOT NULL AND g.rank_order >= co.rank_order)
ON DUPLICATE KEY UPDATE mode = ace_entries.mode;

DELETE e FROM ace_entries e
JOIN ace_groups g ON g.name = e.group_name
LEFT JOIN ace_groups co ON co.name = 'co_owner'
WHERE e.mode = 'allow'
  AND e.object IN ('vMenu.Everything', 'vMenu.VehicleOptions.All', 'vMenu.WeaponOptions.All', 'vMenu.MiscSettings.All')
  AND NOT (g.staff_only = TRUE AND co.name IS NOT NULL AND g.rank_order >= co.rank_order);
