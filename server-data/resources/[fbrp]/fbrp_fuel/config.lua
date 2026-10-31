FuelConfig = {}

-- Refuel speed (% of the tank per second)
FuelConfig.RefillPerSecond = 4.0

-- Usage (same feel as fbrp_core's old system): idle use + extra the harder you rev, per second
FuelConfig.IdlePerSecond = 0.006
FuelConfig.RpmPerSecond = 0.038
FuelConfig.DieselEfficiency = 0.85 -- diesel engines use a bit less
-- per vehicle class (GTA class id = multiplier)
FuelConfig.ClassMultiplier = { [8]=0.75, [10]=1.25, [11]=1.18, [12]=1.12, [14]=1.20, [15]=1.35, [16]=1.55, [17]=1.12, [18]=1.15, [19]=1.35, [20]=1.30 }

-- Show which fuel the vehicle takes in the pump menu (so people can still get it wrong if they ignore it)
FuelConfig.ShowFuelHint = true

-- Putting the wrong fuel in damages the engine and stalls it
FuelConfig.WrongFuelDamage = true
FuelConfig.WrongFuelEngineHealth = 250.0 -- engine health after misfuelling (1000 = perfect, 0 = dead)

-- Pump props you can refuel at (stand next to one)
FuelConfig.PumpModels = {
    `prop_gas_pump_1a`, `prop_gas_pump_1b`, `prop_gas_pump_1c`, `prop_gas_pump_1d`,
    `prop_gas_pump_old2`, `prop_gas_pump_old3`, `prop_vintage_pump`,
}
FuelConfig.PumpReach = 2.6      -- how close you must stand to a pump
FuelConfig.VehicleReach = 8.0   -- how close the vehicle must be to the pump

-- Vehicle classes that take diesel by default (10 industrial, 20 commercial)
FuelConfig.DieselClasses = { [10] = true, [20] = true }

-- Models that take diesel (add your addon trucks / pickups here, lowercase spawn names)
FuelConfig.DieselModels = {
    'benson', 'biff', 'boxville', 'boxville2', 'boxville3', 'boxville4', 'boxville5', 'bulldozer', 'bus', 'coach', 'airbus',
    'pbus', 'pbus2', 'tourbus', 'rentalbus', 'wastelander', 'dump', 'flatbed', 'towtruck', 'towtruck2', 'trash', 'trash2',
    'scrap', 'mixer', 'mixer2', 'rubble', 'tiptruck', 'tiptruck2', 'mule', 'mule2', 'mule3', 'mule4', 'mule5', 'pounder',
    'pounder2', 'hauler', 'hauler2', 'packer', 'phantom', 'phantom2', 'phantom3', 'phantom4', 'firetruk', 'ambulance',
    'riot', 'riot2', 'stockade', 'stockade3', 'brickade', 'brickade2', 'barracks', 'barracks2', 'barracks3', 'insurgent',
    'insurgent2', 'insurgent3', 'sandking', 'sandking2', 'guardian', 'dubsta3', 'tractor', 'tractor2', 'tractor3',
    'handler', 'docktug', 'utillitruck', 'utillitruck2', 'utillitruck3', 'terbyte', 'cerberus', 'cerberus2', 'cerberus3',
    'yosemite3', 'everon', 'sadler', 'sadler2', 'bison', 'bison2', 'bison3', 'kamacho', 'caracara2', 'contender',
}

-- Electric vehicles (no fuel used, can't be refuelled)
FuelConfig.ElectricModels = {
    'voltic', 'voltic2', 'raiden', 'neon', 'cyclone', 'cyclone2', 'tezeract', 'surge', 'khamelion', 'imorgon', 'iwagen',
    'omnisegt', 'virtue', 'caddy', 'caddy2', 'caddy3', 'airtug', 'dilettante', 'dilettante2', 'rcbandito', 'minitank',
    'powersurge', 'buffalo5', 'coureur', 'teslax', 'teslapd',
}

-- Gas station blips (same list fbrp_core used)
FuelConfig.ShowBlips = true
FuelConfig.Stations = {
    vec3(49.42, 2778.79, 58.04), vec3(263.89, 2606.46, 44.98), vec3(1039.96, 2671.13, 39.55), vec3(1207.26, 2660.18, 37.90),
    vec3(2539.69, 2594.19, 37.94), vec3(2679.86, 3263.95, 55.24), vec3(2005.06, 3773.89, 32.40), vec3(1687.16, 4929.39, 42.08),
    vec3(1701.31, 6416.03, 32.76), vec3(179.86, 6602.84, 31.87), vec3(-94.46, 6419.59, 31.49), vec3(-2554.99, 2334.40, 33.08),
    vec3(-1800.38, 803.66, 138.65), vec3(-1437.62, -276.75, 46.21), vec3(-2096.24, -320.29, 13.17), vec3(-724.62, -935.16, 19.21),
    vec3(-526.02, -1211.00, 18.18), vec3(-70.21, -1761.79, 29.53), vec3(265.65, -1261.31, 29.29), vec3(819.65, -1028.85, 26.40),
    vec3(1208.95, -1402.57, 35.22), vec3(1181.38, -330.85, 69.32), vec3(620.84, 269.10, 103.09), vec3(2581.32, 362.04, 108.47),
    vec3(176.63, -1562.03, 29.26), vec3(-319.29, -1471.72, 30.55), vec3(1784.32, 3330.55, 41.25),
}

FuelConfig.NotifyPosition = 'center-right'
