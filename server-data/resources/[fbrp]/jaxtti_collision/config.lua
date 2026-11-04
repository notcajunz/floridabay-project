Config = {}

Config.DetectWindow = 200
Config.Cooldown = 1500
Config.Classes = {
    [0] = true, [1] = true, [2] = true, [3] = true, [4] = true, [5] = true, [6] = true, [7] = true,
    [8] = true, [9] = true, [10] = true, [11] = true, [12] = true, [17] = true, [18] = true, [20] = true,
}

Config.SeatbeltInjuryMultiplier = 0.35
Config.MotorcycleInjuryMultiplier = 1.4

Config.Tiers = {
    {
        name = 'minor', minDelta = 12,
        damage = { 0, 3 }, shake = 0.15, blur = 0, dazed = 0, blackout = 0,
        tinnitus = false, heartbeat = false,
        stall = 0.0, stallTime = 0, engine = 25, tires = 0.0, stress = 1,
    },
    {
        name = 'moderate', minDelta = 25,
        damage = { 4, 12 }, shake = 0.35, blur = 2500, dazed = 6000, blackout = 0,
        tinnitus = true, heartbeat = false,
        stall = 0.35, stallTime = 3000, engine = 120, tires = 0.1, stress = 4,
    },
    {
        name = 'severe', minDelta = 45,
        damage = { 15, 30 }, shake = 0.7, blur = 6000, dazed = 15000, blackout = 1800,
        tinnitus = true, heartbeat = true,
        stall = 0.8, stallTime = 6000, engine = 300, tires = 0.3, stress = 8,
    },
    {
        name = 'critical', minDelta = 70,
        damage = { 35, 65 }, shake = 1.0, blur = 10000, dazed = 25000, blackout = 4000,
        tinnitus = true, heartbeat = true,
        stall = 1.0, stallTime = 10000, engine = 600, tires = 0.6, stress = 15,
    },
}

Config.Ejection = {
    enabled = true,
    minDelta = 50,
    chance = 0.75,
    frontSeatsOnly = false,
    extraDamage = 20,
}

Config.Stress = {
    event = 'core',
}

Config.HideHudOnBlackout = true

Config.Volume = 0.45

Config.Debug = false
