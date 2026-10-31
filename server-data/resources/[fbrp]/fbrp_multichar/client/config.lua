Config = {}

-- Where character select / create happens. While the menu is open the (hidden, frozen) player is moved to
-- `player` so the area loads, and a camera at `camera` looks at `lookAt`.
-- Default: the Galileo Observatory terrace, looking out over Los Santos.
Config.Lobby = {
    enabled = true,
    player = vector4(-425.0, 1123.0, 325.9, 345.0),
    camera = vector3(-430.0, 1058.0, 362.0),   -- above the terrace in front of the observatory
    lookAt = vector3(-75.0, -818.0, 280.0),   -- downtown skyline
    fov = 50.0,
    minCameraHeight = 6.0,  -- the camera is pushed up to at least this many metres above the ground
    drift = true,          -- very slow sideways drift so the view isn't static
    -- Hour of day shown while in the lobby (0-23), or false to keep the server's time.
    -- A time-sync script may override this; that's fine.
    hour = 19,
}
