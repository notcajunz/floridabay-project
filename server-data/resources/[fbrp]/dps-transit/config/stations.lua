--[[
    DPS-Transit Station Configuration
    All station definitions and properties

    ROUTE LAYOUT:
    +-------------------------------------------------------------------+
    |                                                                   |
    |   LSIA --> Davis --> Downtown --> Del Perro --> Paleto Junction   |
    |   Zone A   Zone A    Zone A       Zone A        Zone B            |
    |   Track 0  Track 0   Track 0      Track 0       Track 0           |
    |                                                                   |
    |   Paleto Junction is the northern terminus of the Regional line.  |
    |   Sandy Shores / Grapeseed (Track 12) are freight-only sidings    |
    |   branching east of the junction (no passenger service).          |
    |                                                                   |
    +-------------------------------------------------------------------+
]]

Config.Stations = {
    --[[
        Zone A: Los Santos Metropolitan
    ]]
    ['lsia'] = {
        name = 'Los Santos International Airport',
        shortName = 'LSIA',
        zone = 'A',
        track = 0,

        -- Platform location (where train stops)
        platform = vec4(-1102.44, -2894.58, 13.95, 315.0),

        -- Kiosk/ticket machine location
        kiosk = vec4(-1098.5, -2890.2, 13.95, 135.0),

        -- Waiting area center
        waitingArea = vec3(-1095.0, -2888.0, 13.95),

        -- Track progress (0.0 - 1.0 along full route)
        trackProgress = 0.0,

        -- Connections
        next = 'davis',
        prev = nil,  -- Terminus

        -- Features
        features = {
            hasParking = true,
            hasRestrooms = true,
            hasCafe = false,
            isAccessible = true,
            isTerminus = true
        },

        -- Blip override (optional)
        blip = {
            scale = 0.9
        }
    },

    ['davis'] = {
        name = 'Davis Station',
        shortName = 'Davis',
        zone = 'A',
        track = 0,

        -- Near the freight yard in south LS
        -- ESTIMATED COORDINATES - Verify in-game
        platform = vec4(-195.0, -1680.0, 33.0, 320.0),
        kiosk = vec4(-191.0, -1676.0, 33.0, 140.0),
        waitingArea = vec3(-188.0, -1673.0, 33.0),

        trackProgress = 0.10,

        next = 'downtown',
        prev = 'lsia',

        features = {
            hasParking = true,
            hasRestrooms = false,
            hasCafe = false,
            isAccessible = true
        },

        blip = {
            scale = 0.8
        }
    },

    ['downtown'] = {
        name = 'Union Depot - Downtown Los Santos',
        shortName = 'Downtown',
        zone = 'A',
        track = 0,

        platform = vec4(457.85, -619.35, 28.59, 90.0),
        kiosk = vec4(462.0, -615.0, 28.59, 270.0),
        waitingArea = vec3(465.0, -618.0, 28.59),

        trackProgress = 0.25,

        next = 'del_perro',
        prev = 'davis',

        features = {
            hasParking = true,
            hasRestrooms = true,
            hasCafe = true,
            isAccessible = true,
            isHub = true  -- Main hub station
        },

        blip = {
            scale = 1.0  -- Larger for main hub
        }
    },

    ['del_perro'] = {
        name = 'Del Perro Station',
        shortName = 'Del Perro',
        zone = 'A',
        track = 0,

        platform = vec4(-1336.55, -433.82, 33.58, 140.0),
        kiosk = vec4(-1332.0, -430.0, 33.58, 320.0),
        waitingArea = vec3(-1330.0, -428.0, 33.58),

        trackProgress = 0.40,

        next = 'paleto_junction',
        prev = 'downtown',

        features = {
            hasParking = false,
            hasRestrooms = true,
            hasCafe = false,
            isAccessible = true
        }
    },

    --[[
        Zone B: Blaine County - Paleto Junction (Northern Terminus)
        Northern end of the Regional passenger line (Track 0). Freight-only
        sidings (Sandy Shores / Grapeseed, Track 12) branch east of here.
    ]]
    ['paleto_junction'] = {
        name = 'Paleto Junction',
        shortName = 'Junction',
        zone = 'B',
        track = 0,

        -- ESTIMATED COORDINATES - Verify in-game
        -- Located on eastern approach to Paleto, south of town
        platform = vec4(650.0, 5650.0, 35.0, 315.0),
        kiosk = vec4(654.0, 5654.0, 35.0, 135.0),
        waitingArea = vec3(658.0, 5658.0, 35.0),

        trackProgress = 1.0,

        next = nil,  -- Northern terminus of the passenger line
        prev = 'del_perro',

        features = {
            hasParking = true,
            hasRestrooms = true,
            hasCafe = false,
            isAccessible = true,
            isTerminus = true,
            -- Track 0 continues to Paleto Bay; Sandy Shores / Grapeseed (Track 12,
            -- freight only) branch east of the junction.
        },

        blip = {
            scale = 1.0  -- Larger for junction
        }
    },

    --[[
        LS METRO (Track 3) - FBRP stations on the vanilla underground metro.
        Coordinates were read in game with vMenu > Show Coordinates (x, y, z, heading).
        Free rides; no kiosk, so boarding needs no ticket.
    ]]
    ['metro_airport'] = {
        name = 'LSIA Terminal 4 Metro',
        shortName = 'LSIA T4',
        zone = 'A',
        track = 3,
        platform = vec4(-1067.3877, -2705.5085, -7.4101, 228.7211),
        waitingArea = vec3(-1067.3877, -2705.5085, -7.4101),
        trackProgress = 0.0,
        next = 'metro_parking',
        prev = nil,
        features = { isAccessible = true, isTerminus = true }
    },

    ['metro_parking'] = {
        name = 'LSIA Parking Metro',
        shortName = 'LSIA Pkg',
        zone = 'A',
        track = 3,
        platform = vec4(-896.1577, -2337.6904, -11.7327, 71.9923),
        waitingArea = vec3(-896.1577, -2337.6904, -11.7327),
        trackProgress = 0.33,
        next = 'metro_puerto_del_sol',
        prev = 'metro_airport',
        features = { isAccessible = true }
    },

    ['metro_puerto_del_sol'] = {
        name = 'Puerto Del Sol Metro',
        shortName = 'Puerto',
        zone = 'A',
        track = 3,
        platform = vec4(-535.7524, -1278.3768, 26.9016, 248.6337),
        waitingArea = vec3(-535.7524, -1278.3768, 26.9016),
        trackProgress = 0.67,
        next = 'metro_strawberry',
        prev = 'metro_parking',
        features = { isAccessible = true }
    },

    ['metro_strawberry'] = {
        name = 'Strawberry Metro',
        shortName = 'Strawberry',
        zone = 'A',
        track = 3,
        platform = vec4(248.5795, -1208.0962, 38.9079, 181.0042),
        waitingArea = vec3(248.5795, -1208.0962, 38.9079),
        trackProgress = 0.6,
        next = 'metro_burton',
        prev = 'metro_puerto_del_sol',
        features = { isAccessible = true }
    },

    ['metro_burton'] = {
        name = 'Burton Metro',
        shortName = 'Burton',
        zone = 'A',
        track = 3,
        platform = vec4(-288.677, -335.0993, 10.063, 270.002),
        waitingArea = vec3(-288.677, -335.0993, 10.063),
        trackProgress = 0.8,
        next = 'metro_portola_drive',
        prev = 'metro_strawberry',
        features = { isAccessible = true }
    },

    ['metro_portola_drive'] = {
        name = 'Portola Drive Metro',
        shortName = 'Portola',
        zone = 'A',
        track = 3,
        platform = vec4(-813.9764, -130.2018, 19.9503, 28.8045),
        waitingArea = vec3(-813.9764, -130.2018, 19.9503),
        trackProgress = 0.75,
        next = 'metro_del_perro',
        prev = 'metro_burton',
        features = { isAccessible = true }
    },

    ['metro_del_perro'] = {
        name = 'Del Perro Metro',
        shortName = 'Del Perro',
        zone = 'A',
        track = 3,
        platform = vec4(-1356.184, -468.6306, 15.0453, 121.4116),
        waitingArea = vec3(-1356.184, -468.6306, 15.0453),
        trackProgress = 0.87,
        next = 'metro_little_seoul',
        prev = 'metro_portola_drive',
        features = { isAccessible = true }
    },

    ['metro_little_seoul'] = {
        name = 'Little Seoul Metro',
        shortName = 'Little Seoul',
        zone = 'A',
        track = 3,
        platform = vec4(-504.1793, -679.0389, 11.809, 182.7213),
        waitingArea = vec3(-504.1793, -679.0389, 11.809),
        trackProgress = 0.93,
        next = 'metro_pillbox_south',
        prev = 'metro_del_perro',
        features = { isAccessible = true }
    },

    ['metro_pillbox_south'] = {
        name = 'Pillbox South Metro',
        shortName = 'Pillbox S',
        zone = 'A',
        track = 3,
        platform = vec4(-212.5303, -1022.6653, 30.1409, 68.0024),
        waitingArea = vec3(-212.5303, -1022.6653, 30.1409),
        trackProgress = 0.96,
        next = 'metro_davis',
        prev = 'metro_little_seoul',
        features = { isAccessible = true }
    },

    ['metro_davis'] = {
        name = 'Davis Metro',
        shortName = 'Davis Metro',
        zone = 'A',
        track = 3,
        platform = vec4(106.6429, -1721.9415, 30.1095, 145.2918),
        waitingArea = vec3(106.6429, -1721.9415, 30.1095),
        trackProgress = 1.0,
        next = nil,
        prev = 'metro_pillbox_south',
        features = { isAccessible = true, isTerminus = true }
    },

    --[[
        FREIGHT-ONLY SIDINGS
        Sandy Shores and Grapeseed are freight sidings (Track 12) branching east
        of Paleto Junction. They are NOT on the passenger route.
        Passenger trains should SKIP these stations.
    ]]

    ['sandy'] = {
        name = 'Sandy Shores Freight Yard',
        shortName = 'Sandy (Freight)',
        zone = 'B',
        track = 0,

        -- Freight siding - no passenger service
        platform = vec4(1766.82, 3782.55, 34.18, 30.0),
        kiosk = nil,  -- No ticket kiosk
        waitingArea = nil,  -- No passenger waiting

        trackProgress = 0.75,

        -- Not connected to passenger route
        next = 'grapeseed',
        prev = nil,  -- Dead end for passengers

        features = {
            freightOnly = true,  -- IMPORTANT: No passenger service
            hasParking = true,
            hasRestrooms = false,
            hasCafe = false,
            isAccessible = false
        }
    },

    ['grapeseed'] = {
        name = 'Grapeseed Depot',
        shortName = 'Grapeseed (Freight)',
        zone = 'B',
        track = 0,

        -- Freight depot - no passenger service
        platform = vec4(2448.65, 4098.32, 38.12, 60.0),
        kiosk = nil,
        waitingArea = nil,

        trackProgress = 0.80,

        next = nil,  -- End of freight line
        prev = 'sandy',

        features = {
            freightOnly = true,  -- IMPORTANT: No passenger service
            hasParking = true,
            hasRestrooms = false,
            hasCafe = false,
            isAccessible = false
        }
    }
}

-- Station order for route calculation (LSIA to Paleto Junction - Passenger Only)
Config.StationOrder = {
    'lsia',
    'davis',
    'downtown',
    'del_perro',
    'paleto_junction'
}

-- Freight station order (includes freight-only sidings)
Config.FreightStationOrder = {
    'lsia',
    'davis',
    'downtown',
    'del_perro',
    'paleto_junction',
    'sandy',     -- Freight only
    'grapeseed'  -- Freight only
}

-- Zone station groupings
Config.ZoneStations = {
    ['A'] = { 'lsia', 'davis', 'downtown', 'del_perro', 'metro_airport', 'metro_parking', 'metro_puerto_del_sol', 'metro_strawberry', 'metro_burton', 'metro_portola_drive', 'metro_del_perro', 'metro_little_seoul', 'metro_pillbox_south', 'metro_davis' },
    ['B'] = { 'paleto_junction', 'sandy', 'grapeseed' },  -- Include freight yards
}

-- Get station zone
function GetStationZone(stationId)
    local station = Config.Stations[stationId]
    return station and station.zone or nil
end

-- Get zone by station
function GetZoneByStation(stationId)
    for zone, stations in pairs(Config.ZoneStations) do
        for _, id in ipairs(stations) do
            if id == stationId then
                return zone
            end
        end
    end
    return nil
end

-- Get stations between two points
function GetStationsBetween(fromStation, toStation)
    local stations = {}
    local recording = false

    for _, stationId in ipairs(Config.StationOrder) do
        if stationId == fromStation then
            recording = true
        elseif stationId == toStation then
            break
        elseif recording then
            table.insert(stations, stationId)
        end
    end

    return stations
end
