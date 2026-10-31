DVConfig = {
    command = 'dv',               -- chat command
    distance = 5.0,               -- how close a vehicle must be (metres) when you're on foot
    ace = nil,                    -- nil = everyone can use /dv, or an ace like 'fbrp.dv' to limit it
    staffAce = 'fbrp.dv.staff',   -- players with this ace can delete cars other players are sitting in
    cooldown = 1500,              -- ms between uses
    notifyPosition = 'center-right',
}
