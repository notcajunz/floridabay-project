-- Made by Saif | © 2026 Saif. All rights reserved.
Config = {}

-- ─────────────────────────── General ───────────────────────────
Config.Command      = 'carplay'   -- /carplay opens and closes the system
Config.CursorKey    = 'F9'        -- default key: toggle cursor (full UI) <-> mini mode. Players can rebind it in
                                  -- Settings > Key Bindings > FiveM > "CarPlay: toggle cursor"
Config.ControlMode  = 'everyone'  -- 'everyone' = every occupant can control the music, 'driver' = driver only
Config.Units        = 'kmh'       -- default speed unit: 'kmh' or 'mph' (players can change it in CarPlay settings)

-- ─────────────────────────── Music ───────────────────────────
Config.DefaultVolume    = 0.5     -- 0.0 - 1.0
Config.MaxQueue         = 30      -- max songs in a vehicle queue
Config.AddCooldown      = 1500    -- ms between "add song" requests per player (anti-spam)
Config.AllowDirectLinks = true    -- also allow direct .mp3 / .ogg / .wav / .m4a links. Needed for the real muffled-window sound
                                  -- (YouTube links can't be filtered, they only get the quieter / shorter-range effect)
Config.StopWhenEmpty    = 300     -- seconds after the last player leaves before the music is shut off (0 = never).
                                  -- The timer never runs while the engine is ON: the music keeps playing after you step out.

Config.Audio = {
    allowOutside      = true,     -- people outside the vehicle can hear it
    defaultOutside    = false,    -- new vehicles start with the windows rolled up
    requireEngine     = true,     -- outside the car the music plays only while the engine is running
    distance          = 30.0,     -- how far (meters) it carries with windows down / a door open / a convertible roof down
    closedMultiplier  = 0.55,     -- volume outside when everything is closed (windows up = muffled, "thump from the street")
    closedDistance    = 0.5,      -- range multiplier when closed up (0.5 = half the distance)
    closedMuffle      = 0.9,      -- 0.0 - 1.0: how dull / bass-heavy it sounds with windows up (needs the patched xsound + a direct audio link)
    maxDrift          = 3.0,      -- seconds of drift before a client re-syncs to the vehicle's playback position
}

-- ─────────────────────────── GPS ───────────────────────────
Config.MaxPins = 40               -- saved pins per player

-- GTA V map shown in the Maps app. Put your map picture at html/img/map.jpg (or .png / change `image`).
-- bounds = the world coordinates of the picture's edges. The defaults fit the common square "full island" GTA V map
-- (Social Club / satellite style). If your picture is a different atlas and the blue car dot lands in the wrong
-- place, only these 4 numbers need tuning (hover the map: the corner of the screen shows the world X / Y).
Config.Map = {
    image  = 'img/map.jpg',
    bounds = { minX = -5661.0, maxX = 6694.0, minY = -4058.0, maxY = 8429.0 },
}

-- Built-in places shown in the Maps app. Add / remove whatever you like.
Config.Places = {
    { name = 'Legion Square',            x =  195.17, y =  -933.77, z =  30.69 },
    { name = 'Los Santos Airport',       x = -1034.60, y = -2730.00, z =  20.17 },
    { name = 'Mission Row Police Dept.', x =  428.00, y =  -984.00, z =  30.00 },
    { name = 'Pillbox Medical Center',   x =  298.00, y =  -584.00, z =  43.00 },
    { name = 'Pacific Standard Bank',    x =  235.00, y =   216.00, z = 106.00 },
    { name = 'Los Santos Customs',       x = -359.00, y =  -133.00, z =  38.00 },
    { name = 'Maze Bank Arena',          x = -250.00, y = -2000.00, z =  24.00 },
    { name = 'Del Perro Pier',           x = -1850.00, y = -1230.00, z = 13.00 },
    { name = 'Vinewood Sign',            x =  711.00, y =  1198.00, z = 348.00 },
    { name = 'Galileo Observatory',      x = -408.00, y =  1175.00, z = 325.00 },
    { name = 'Sandy Shores',             x = 1960.00, y =  3740.00, z =  32.00 },
    { name = 'Grapeseed',                x = 1698.00, y =  4822.00, z =  42.00 },
    { name = 'Paleto Bay',               x = -276.00, y =  6225.00, z =  31.00 },
    { name = 'Mount Chiliad',            x =  450.00, y =  5566.00, z = 794.00 },
}

-- ─────────────────────────── Notifications ───────────────────────────
-- Client only. Replace the body with ox_lib / your framework / etc. if you want.
if not IsDuplicityVersion() then
    function Config.Notify(msg, kind)
        BeginTextCommandThefeedPost('STRING')
        AddTextComponentSubstringPlayerName(msg)
        EndTextCommandThefeedPostTicker(false, true)
    end
end
