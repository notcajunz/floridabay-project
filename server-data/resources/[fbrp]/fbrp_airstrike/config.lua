AirstrikeConfig = {
    Command = 'airstrike',

    -- Executive Management and above, clocked in as staff (same rule as fbrp_core station doors).
    RankName  = 'executive_management',
    RankLabel = 'Executive Management',
    RequireOnDuty = true,

    -- Seconds between strikes for the whole server, and per staff member. 0 = no cooldown (one strike at a time still applies).
    GlobalCooldown = 0,
    PlayerCooldown = 0,

    -- Longest allowed distance (m) between the caller and the waypoint. 0 disables the check.
    MaxCallerDistance = 0,

    -- Only players this close (m) to the target get the inbound warning notification.
    WarningRadius = 150.0,

    StrikeBlipSeconds = 30,   -- red target area on the map
    CrashDelayMs      = 15000, -- jets are shot down this long after releasing
    CleanupDelayMs    = 8000,  -- wreck and pilot are removed after the crash
    FlightTimeoutMs   = 120000,

    -- Every rocket is a networked projectile + explosion + fire event, and FiveM's event pools are small
    -- (the reference script's ~140 rockets per jet crashed clients). Keep salvos small and slow.
    MaxRocketsPerAircraft = 24,

    Pilot = 's_m_m_movalien_01',
    Weapon = 'VEHICLE_WEAPON_SPACE_ROCKET',

    -- Jets start this far from the waypoint (reference script uses +1000/+1000/+800 for medium).
    SpawnOffset = { x = 1000.0, y = 1000.0, z = 800.0 },

    Types = {
        light = {
            description = 'One jet, a short rocket run',
            aircraft = { { model = 'lazer', dx = 0.0, dy = 0.0, dz = 0.0, radius = 10.0, interval = 100, pattern = 'light' } },
        },
        medium = {
            description = 'Three jets, a rocket line each',
            aircraft = {
                { model = 'lazer', dx = 0.0,   dy = 0.0,  dz = 0.0, radius = 30.0, interval = 120, pattern = 'line', span = 20 },
                { model = 'lazer', dx = 100.0, dy = 50.0, dz = 0.0, radius = 30.0, interval = 120, pattern = 'line', span = 20 },
                { model = 'lazer', dx = 200.0, dy = 100.0, dz = 0.0, radius = 30.0, interval = 120, pattern = 'line', span = 20 },
            },
        },
        heavy = {
            description = 'A bomber and two jets, a wide carpet of rockets',
            aircraft = {
                { model = 'bombushka', dx = 0.0,   dy = 0.0,  dz = 100.0, radius = 30.0, interval = 160, pattern = 'carpet', span = 120, count = 22, speed = 200.0, bomber = true },
                { model = 'lazer',     dx = 100.0, dy = 50.0, dz = 0.0,   radius = 30.0, interval = 160, pattern = 'carpet', span = 120, count = 22 },
                { model = 'lazer',     dx = 200.0, dy = 100.0, dz = 0.0,  radius = 30.0, interval = 160, pattern = 'carpet', span = 120, count = 22 },
            },
        },
    },

    Messages = {
        usage        = 'Usage: /airstrike [light|medium|heavy] - set a map waypoint first.',
        noWaypoint   = 'Set a waypoint on the map to mark the target first.',
        denied       = 'Airstrikes are restricted to Executive Management and above.',
        notOnDuty    = 'Clock in as staff (/clockin) to call an airstrike.',
        cooldown     = 'Airstrike unavailable for another %d seconds.',
        inProgress   = 'An airstrike is already in progress.',
        tooFar       = 'The target is too far from you.',
        confirmed    = 'Airstrike confirmed (%s). Impact in about 30 seconds.',
        incoming     = 'AIRSTRIKE INBOUND',
    },
}
