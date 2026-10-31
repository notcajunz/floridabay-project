Config = {}

-- Spawn names that roll coal
Config.Models = { 'johnf350' }

-- Super Duty speed governor in mph (0 = off)
Config.GovernorMph = 0

Config.Coal = {
    enabled = true,          -- players can still turn it off for themselves with /coal
    command = 'coal',
    minThrottle = 0.80,      -- how hard you have to press the gas (0-1)
    launchMph = 25,          -- below this speed, flooring it gives the big black cloud
    -- bigger number = bigger cloud
    launchScale = 0.85,
    driveScale = 0.45,
    -- milliseconds between puffs (lower = thicker)
    launchInterval = 60,
    driveInterval = 120,
    -- 0 = black, 1 = white
    shade = 0.03,
    opacity = 0.95,
}
