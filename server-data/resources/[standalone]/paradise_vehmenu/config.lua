Config = {}

-- Command settings
Config.Command = 'vehmenu' -- Command to open the vehicle menu
Config.Keybind = 'K'       -- Default key (players can rebind it under Settings > Key Bindings > FiveM)

-- Keep the engine running when the driver leaves with a long press of F.
Config.LeaveRunning = true

-- Stop the passenger from sliding over into the driver seat when the driver leaves.
Config.DisableSeatShuffle = true

-- Vehicle control settings
Config.DoorControls = {
    left_door = 0,
    right_door = 1,
    rear_left_door = 2,
    rear_right_door = 3
}

Config.WindowControls = {
    left_window = 0,
    right_window = 1,
    rear_left_window = 2,
    rear_right_window = 3
}

Config.SeatControls = {
    driver_seat = -1,
    passenger_seat = 0,
    rear_left_seat = 1,
    rear_right_seat = 2,
    rear_middle_seat = 3,
    rear_extra_seat = 4
}

Config.SeatSwitchCooldown = 2 -- Cooldown in seconds between seat switches

Config.OtherControls = {
    trunk = 5,
    hood = 4
}

-- fbrp_core owns the engine (fuel, damage and failure rules) and the car audio panel, so the
-- ENGINE and Music buttons run these commands instead of driving the vehicle directly.
Config.EngineCommand = 'engine'
Config.RadioCommand = 'carradio'

-- Notification settings
Config.Notifications = {
    seatOccupied = 'This seat is occupied!',
    seatCooldown = 'Please wait before switching seats again',
    notInVehicle = 'You must be in a vehicle to use this command',
    driverOnly = 'Only the driver can use this control',
    headlightsOn = 'Headlights on',
    headlightsOff = 'Headlights off',
    highBeamsOn = 'High beams on',
    highBeamsOff = 'High beams off',
    interiorOn = 'Interior light on',
    interiorOff = 'Interior light off'
}
