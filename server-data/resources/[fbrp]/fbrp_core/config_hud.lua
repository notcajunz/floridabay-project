-- Player HUD settings (compass, status, speedometer, minimap frame, AOP & priority panel, postals).
-- The HUD page itself is web/hud/; its Lua is client/hud*.lua.

HudConfig = {}

HudConfig.Command = 'hud'              -- opens the HUD settings panel
HudConfig.ToggleCommand = 'togglehud'  -- hides / shows the whole HUD
HudConfig.SpeedUnit = 'mph'            -- default for new players ('mph' or 'kmh'); players can change it in /hud
HudConfig.ShowMinimapOnFoot = true     -- default for new players; players can change it in /hud -> Map

-- Turn signals. Seatbelt (B) and cruise (Y) stay in fbrp_core; the HUD just shows them.
HudConfig.Keys = {
    indicatorLeft = 'LEFT',
    indicatorRight = 'RIGHT',
    hazards = 'DOWN',
}

-- GTA HUD pieces to hide while the HUD is up (wanted stars, weapon icon, cash, vehicle/area/street names ...)
-- Voice tile: colour, and the key shown in its corner (read from the player's own pma-voice binding).
HudConfig.Voice = {
    color = '#38BDF8',                  -- mic / ring colour (players can still recolour it in /hud -> On foot)
    cycleCommand = '+cycleproximity',   -- pma-voice's "cycle proximity" command
    fallbackKey = 'F9',                 -- shown if the binding can't be read (your server's cycle key)
}

-- Minimap look.
HudConfig.Minimap = {
    -- dark bezel around the border (pixels) that covers any map that fades out past it; 0 = off
    bezel = 0,
    bezelColor = 'rgba(10, 12, 16, 0.94)',
    -- default border fit in pixels (players can fine-tune in /hud -> Map -> Border fit)
    fit = { x = -5, y = -3, w = 6, h = -14 },
}

HudConfig.HideGtaHud = { 1, 2, 3, 4, 6, 7, 8, 9, 13, 20 }

-- Plane stall warning sound: above this height (m) and below this speed (m/s)
HudConfig.Stall = { minHeight = 15.0, minSpeedMs = 22.0 }

-- Postal codes on the compass, plus /postal <code> to set a route.
-- Set enabled = false if another postal resource already runs on the server.
HudConfig.Postals = {
    enabled = true,
    commands = { 'postal', 'p' },
    arriveDistance = 100.0,
}

-- AOP & priority panel (top right). Colours take #RRGGBB.
HudConfig.Priority = {
    ServerName = 'Florida Bay Roleplay',
    Lobby = 'Dev Server',             -- shown as "(Server 1)" after the name; '' to hide
    Font = 'Proxima Nova Bold',     -- 'Proxima Nova Bold' or 'Poppins'
    FontSize = 16,                  -- default; players can change it in /hud
    PrimaryColour = '#D6DA1E',      -- default label colour; players can change it in /hud

    -- Rows, top to bottom. id = fbrp_core priority zone id.
    Zones = {
        { id = 'zancudo', label = 'Fort Zancudo' },
        { id = 'ls',      label = 'Los Angeles' },
        { id = 'blaine',  label = 'Sandy/Grapeseed' },
        { id = 'paleto',  label = 'Paleto Bay' },
        { id = 'roxwood', label = 'Roxwood' },
    },

    -- Colours. Leave ServerName / Time as '' to use the label colour (PrimaryColour, or the player's pick in /hud).
    Colours = {
        ServerName   = '',
        Time         = '',
        AOPValue     = '#FFFFFF',
        TagValue     = '#FFFFFF',  -- job, and any headtag / gangtag with no colour of its own
        Available    = '#90EE90',
        Cooldown     = '#FFFFFF',
        InProgress   = '#FFA500',
        OnHold       = '#FF3B3B',
        Peacetime    = '#32CD32',
        NotAvailable = '#FF3B3B',  -- empty headtag / gangtag ("Hidden")
    },

    -- What the Job row shows for an on-duty organization, by its type. Types not listed show the organization's name.
    JobLabels = {
        leo = 'Police',
        fire = 'Fire',
        government = 'Government',
    },

    Text = {
        AOPLabel      = 'AOP:',
        HeadtagLabel  = 'Headtag',
        GangtagLabel  = 'Gangtag',
        JobLabel      = 'Job',
        Available     = 'Available',
        InProgress    = 'In Progress',
        OnHold        = 'On Hold',
        Peacetime     = '(PT)',
        MinutesSuffix = 'm',
        NotAvailable  = 'Hidden',  -- shown when no headtag / gangtag is set
        OffDuty       = 'Off Duty',
    },
}
