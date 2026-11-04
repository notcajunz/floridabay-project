Config = {}

Config.ServerName = 'Florida Bay Roleplay'

---------------------------------------------------------------- look

-- Chat look for everyone: 'minimal' (coloured text lines). 'default' (cards) and 'imessage' (bubbles) also exist.
Config.Style = 'minimal'

-- Where the chat sits: distance from the top of the screen (vh = % of screen height). Bigger = lower.
Config.Top = '7vh'

-- Background behind the /chatclear line: 0 = none, 1 = solid black.
Config.ClearBackground = 0.55

Config.Accent = '#3B82F6'          -- input outline / suggestion highlight
Config.FadeSeconds = 12            -- chat fades out this long after the last message
Config.MaxMessages = 80
Config.Placeholder = 'Say something or type / for commands'
Config.OpenKey = 'T'

-- Season icons / particles around the input. 'auto' = by date, 'off', or a season name.
Config.Season = 'auto'
Config.Seasons = {
    { theme = 'halloween',    from = '10-15', to = '11-01' },
    { theme = 'thanksgiving', from = '11-02', to = '11-30' },
    { theme = 'christmas',    from = '12-01', to = '12-26' },
    { theme = 'valentine',    from = '02-08', to = '02-15' },
    { theme = 'winter',       from = '12-27', to = '03-19' },
    { theme = 'july4',        from = '06-28', to = '07-05' },
    { theme = 'spring',       from = '03-20', to = '06-20' },
    { theme = 'summer',       from = '06-21', to = '09-21' },
    { theme = 'autumn',       from = '09-22', to = '10-14' },
}

-- Message kinds -> tag label + colour.
Config.Kinds = {
    ooc        = { label = 'OOC',       color = '#60A5FA' },
    me         = { label = 'ME',        color = '#C084FC' },
    ['do']     = { label = 'DO',        color = '#34D399' },
    gme        = { label = 'GME',       color = '#4FE08C' },
    staff      = { label = 'STAFF',     color = '#22C55E' },
    staffonly  = { label = 'STAFF',     color = '#9CA3AF' },
    system     = { label = 'SYSTEM',    color = '#F59E0B' },
    police     = { label = 'LEO',       color = '#3B82F6' },
    panic      = { label = '10-99',     color = '#FF4D5E' },
    ambulance  = { label = 'FIRE/EMS',  color = '#F59E0B' },
    pm         = { label = 'SMS',       color = '#A78BFA' },
    twitter    = { label = 'TWT',       color = '#38BDF8' },
    instagram  = { label = 'INSTA',     color = '#F06EAA' },
    youtube    = { label = 'YT',        color = '#EF4444' },
    tiktok     = { label = 'TIKTOK',    color = '#FE2C55' },
    twitch     = { label = 'TWITCH',    color = '#A78BFA' },
    ad         = { label = 'AD',        color = '#FBBF24' },
    news       = { label = 'NEWS',      color = '#69C9FF' },
    darkweb    = { label = 'DARK WEB',  color = '#FF596D' },
    anonymous  = { label = 'VPN',       color = '#FBBF24' },  -- /vpn: looks like an ad, name hidden
    muted      = { label = 'MUTED',     color = '#F97316' },
}

---------------------------------------------------------------- behaviour (server)

Config.MaxLength = 250
Config.ChatCooldownMs = 1000       -- between two normal messages
Config.AdCooldown = 30             -- seconds between /youtube /tiktok /twitch /twt /vpn /ad ... posts
Config.MaxMuteSeconds = 86400

-- Plain typed messages (OOC): false = everyone sees them, or a distance in metres for nearby only.
Config.OocRange = false
-- /me and /do: shown to players this close, and above the player's head.
Config.RoleplayRange = 20.0

-- Join / leave lines in chat.
Config.ShowJoins = false
Config.ShowQuits = false

-- Rotating server tips (every AutoMessageMinutes; 0 turns them off).
Config.AutoMessageMinutes = 15
Config.AutoMessages = {
    'Welcome to Florida Bay Roleplay. Build a character, create a story, and keep every scene fair.',
    'Need staff assistance? Use /report followed by a short explanation of what happened.',
    'Use /me for character actions and /do for scene details. Both are visible to nearby players.',
    'Keep in-character and out-of-character knowledge separate. Good roleplay gives everyone room to respond.',
    'Questions about server systems belong in the community Discord or a support ticket.',
}

-- Staff badge colour by fbrp_core staff rank name. Ranks not listed use StaffDefaultColor.
Config.StaffColors = {
    owner = '#8466E2', ['co-owner'] = '#8466E2', founder = '#8466E2', srmanager = '#8466E2', assistantcommunitydirector = '#8466E2',
    manager = '#5DB6E5', ['asst-manager'] = '#5DB6E5', trialmanager = '#5DB6E5', mgmt_team = '#5DB6E5',
    ['head-admin'] = '#72CC72', ['jr-head-admin'] = '#72CC72',
}
Config.StaffDefaultColor = '#E03232'
Config.ModerateAce = 'chat.moderate'   -- lets someone /mute, /unmute, /chatclear without being clocked in
Config.ClearColor = '#4DA3FF'         -- colour of the "Chat has been cleared by" line
