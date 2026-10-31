Config = {}

-- Command name (/carwipe)
Config.Command = 'carwipe'

-- Discord ACE permissions allowed to use /carwipe.
-- These match fbrp_core's Discord role -> ace group bridge (config_staffperms.lua).
-- A player only needs ONE of these aces.
Config.AllowedAces = {
    'easyadmin.server.cleanup.cars', -- EasyAdmin: Cleanup cars
    'fbrp.staff',                    -- FBRP: Staff duty
    'jaxtti.carwipe',                -- Standalone ace if you want to grant it directly:
                                     --   add_ace group.admin jaxtti.carwipe allow
}

-- Require the player to be clocked in as staff (fbrp_core /clockin) on top of
-- having an allowed ace. Uses the replicated 'fbrp:staffDuty' statebag.
Config.RequireClockedIn = true
Config.DutyStateBag = 'fbrp:staffDuty'

-- Countdown choices (seconds) shown in the input dialog
Config.CountdownOptions = { 0, 10, 30, 60, 120 }
Config.DefaultCountdown = 30

-- Radius limits for "Nearby only" wipes (metres)
Config.MinRadius = 10
Config.MaxRadius = 1000
Config.DefaultRadius = 100

-- Warnings sent to everyone while the countdown runs (seconds remaining)
Config.WarningSteps = { 120, 60, 30, 10, 5 }

-- Vehicles that are never wiped (model hashes are generated at runtime)
Config.ExemptModels = {
    -- 'police3',
    -- 'ambulance',
}

-- Never wipe vehicles a player is sitting in (can still be overridden per-wipe in the dialog)
Config.ProtectOccupiedByDefault = true

-- Chat announcement colour {r, g, b}
Config.AnnounceColor = { 255, 80, 80 }

-- Notification position for ox_lib notifications
Config.NotifyPosition = 'top'
