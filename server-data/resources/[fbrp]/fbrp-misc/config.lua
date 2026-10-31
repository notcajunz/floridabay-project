-- FBRP Misc - Developed by Jaxtti
MiscConfig = {
    -- Tackle: sprint and press the key into someone
    TackleKey = 'g',             -- players can rebind it in FiveM key bindings
    TackleCooldown = 5000,       -- ms between tackles
    TackleReach = 2.0,           -- metres (server check)
    TackledDownMs = 3000,        -- how long the tackled person stays down

    -- Piggyback (/piggyback next to someone). nil = everyone can use it.
    -- Set an ace (e.g. 'fbrp.piggyback') to limit it; clocked-in staff can always use it.
    PiggybackAce = nil,
    PiggybackReach = 1.75,

    -- Purge broadcast (shown when DeathScript's /purge is turned on)
    PurgeTitle = "~r~EMERGENCY BROADCAST ANNOUNCEMENT",
    PurgeText = "Stay safe. Seek shelter. Be cautious of the locals, they will attack you. You can do /revive",
    PurgeSoundUrl = "https://www.youtube.com/watch?v=us_0aLWOa8E", -- played with xsound if it's installed

    -- Bigger world limits for map add-ons far from the island
    ExpandWorldLimits = true,

    NotifyPosition = "center-right",
}
