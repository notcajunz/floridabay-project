IronManConfig = {
    Command = 'ironman',
    DefaultKey = 'F5',

    -- Co-Owner and above, clocked in as staff (same rule as /grief).
    RankName  = 'co_owner',
    RankLabel = 'Co-Owner',
    RequireOnDuty = true,

    -- The suit's files are streamed as a replacement for the unused vanilla ig_bankman ped: the Mark 50 files would not
    -- load as a new add-on ped on this server, but load fine under this vanilla name.
    Model = 'ig_bankman',

    -- How often (seconds) the server re-checks that a suited player is still allowed to be one.
    RecheckSeconds = 10,

    -- Arc reactor: flight and weapons share one pool (percent).
    Energy = {
        Max = 100.0,
        RegenPerSecond = 9.0,
        RegenDelayMs = 1500,
        FlightPerSecond = 1.6,
        BoostPerSecond = 4.0,
        UnibeamPerSecond = 14.0,
        GunPerSecond = 5.0,
        Repulsor = 6.0,
        Shot = 1.5,
        Missiles = 20.0,
        Pulse = 15.0,
        Slam = 10.0,
        Punch = 2.0,
        LowWarning = 20.0,
    },

    Flight = {
        Speed = 28.0,
        BoostSpeed = 85.0,
        Strafe = 18.0,
        Climb = 16.0,
        Smoothing = 0.12,
    },

    -- Scale of the explosions the repulsors, unibeam, missiles and slam create (1.0 = full).
    ExplosionScale = 0.6,

    LogActions = true,
}
