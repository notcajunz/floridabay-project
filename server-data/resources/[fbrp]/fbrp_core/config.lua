FBRP = FBRP or {}

FBRP.Config = {
    serverName = 'Florida Bay Roleplay',
    discordInvite = GetConvar('fbrp_discordInvite', ''),
    serviceToken = GetConvar('fbrp_serviceToken', ''),
    -- Discord rich presence (client/discord_presence.lua). The application id is public. Images
    -- may be Rich Presence art-asset names uploaded in the Discord developer portal or direct
    -- https image URLs; organization logos come from the website. Override any of these with
    -- the matching convar, or set fbrp_discordAppId to an empty value to turn presence off.
    discordPresence = {
        appId = GetConvar('fbrp_discordAppId', '1558518806417117305'),
        largeImage = GetConvar('fbrp_discordLargeImage', 'https://floridabay.net/logo-720.webp'),
        logoBase = GetConvar('fbrp_discordLogoBase', 'https://floridabay.net/api/orgs/logo/'),
        joinUrl = GetConvar('fbrp_discordJoinUrl', 'https://join.floridabay.net'),
        inviteUrl = GetConvar('fbrp_discordInviteUrl', 'https://discord.gg/floridabayrp'),
        refreshMs = 15000, -- Discord rate-limits presence updates; do not go much lower
    },
    -- Keep overhead identity close enough to support a scene without carrying
    -- player information across a street or through a large interior.
    tagDistance = 10.0,
    -- vMenu's "Show Player Names" draws a native "Name [id]" gamer tag over every player in
    -- range, including staff in noclip. fbrp tags replace it, so those gamer tags are removed.
    hideVmenuGamerTags = true,
    interactionDistance = 3.0,
    staffHeartbeatSeconds = 60,
    orgHeartbeatSeconds = 60,
    defaultAop = 'Statewide',
    defaultPeacetime = false,
    maxTagLabel = 40,
    vehicleSpawnCooldownMs = 3500,
    -- Base-game vehicles are spawned from the vMenu Vehicle Spawner. The F7 garage lists
    -- only personal vehicles (and organization garages); set this to true to offer the
    -- FBRP.VehicleCatalog sections there again. The catalog is still used to tell which
    -- models are public, so keep it.
    garageCatalogEnabled = false,
    ownedVehicleDeleteDistance = 15.0,
    healCooldownSeconds = 3 * 60,
    armourCooldownSeconds = 5 * 60,
    -- Ambient traffic and pedestrians. GTA requires these multipliers every
    -- frame; 1.0 is stock density and 0.0 disables that population entirely.
    populationDensity = {
        vehicles = 0.35,
        randomVehicles = 0.30,
        parkedVehicles = 0.25,
        peds = 0.40,
        scenarioPeds = 0.35,
    },
    -- Every driven vehicle is capped client-side. Holding the configured Discord
    -- role raises the cap; the server publishes the allowed value in player state.
    vehicleSpeedLimitMph = 180,
    vehicleSpeedPrivilegedLimitMph = 250,
    vehicleSpeedPrivilegedRoleId = '1559633446429786162',
    -- Only members with this Discord role may open or control vehicle audio.
    -- Playback remains audible to everyone nearby.
    carRadioRoleId = '1560857811364356218',
    -- Staff normally cannot clock in while already working an organization.
    -- This role and Head Administrator-or-higher staff ranks bypass that guard.
    staffOrgDutyBypassRoleId = '1559580245093253272',
    staffOrgDutyBypassMinGroup = 'head_administrator',
    -- Holders of this role may clock in as staff while on duty as a gang (not other org types).
    staffGangDutyBypassRoleId = '1559683033576247326',
    -- Fuel is measured as a percentage. A typical car lasts roughly an hour
    -- of mixed driving, while an empty tank takes about 35 seconds to fill.
    fuelTickMs = 1000,
    fuelIdleConsumptionPerSecond = 0.006,
    fuelRpmConsumptionPerSecond = 0.038,
    fuelRefillPerSecond = 3.0,
    fuelStationRadius = 18.0,
    characterSlots = 3,
}

-- GTA V's public filling stations. These drive both the map blips and the
-- server's free refuelling zones, keeping what players see and use in sync.
FBRP.FuelStations = {
    { x=49.42, y=2778.79, z=58.04 },
    { x=263.89, y=2606.46, z=44.98 },
    { x=1039.96, y=2671.13, z=39.55 },
    { x=1207.26, y=2660.18, z=37.90 },
    { x=2539.69, y=2594.19, z=37.94 },
    { x=2679.86, y=3263.95, z=55.24 },
    { x=2005.06, y=3773.89, z=32.40 },
    { x=1687.16, y=4929.39, z=42.08 },
    { x=1701.31, y=6416.03, z=32.76 },
    { x=179.86, y=6602.84, z=31.87 },
    { x=-94.46, y=6419.59, z=31.49 },
    { x=-2554.99, y=2334.40, z=33.08 },
    { x=-1800.38, y=803.66, z=138.65 },
    { x=-1437.62, y=-276.75, z=46.21 },
    { x=-2096.24, y=-320.29, z=13.17 },
    { x=-724.62, y=-935.16, z=19.21 },
    { x=-526.02, y=-1211.00, z=18.18 },
    { x=-70.21, y=-1761.79, z=29.53 },
    { x=265.65, y=-1261.31, z=29.29 },
    { x=819.65, y=-1028.85, z=26.40 },
    { x=1208.95, y=-1402.57, z=35.22 },
    { x=1181.38, y=-330.85, z=69.32 },
    { x=620.84, y=269.10, z=103.09 },
    { x=2581.32, y=362.04, z=108.47 },
    { x=176.63, y=-1562.03, z=29.26 },
    { x=-319.29, y=-1471.72, z=30.55 },
    { x=1784.32, y=3330.55, z=41.25 },
}

FBRP.SpawnLocations = {
    { id='legion', label='Legion Square', description='Central Los Santos', x=215.76, y=-810.12, z=30.73, h=157.0 },
    { id='airport', label='Los Santos Airport', description='Southern Los Santos', x=-1037.72, y=-2737.87, z=20.17, h=329.0 },
    { id='sandy', label='Sandy Shores', description='Blaine County', x=1841.84, y=3673.56, z=34.28, h=207.0 },
    { id='grapeseed', label='Grapeseed', description='Northern Blaine County', x=1679.1794, y=4852.8662, z=42.0513, h=105.8817 },
    { id='paleto', label='Paleto Bay', description='North coast', x=-428.5734, y=6205.4624, z=30.4449, h=269.7508 }
}

-- Priority is tracked separately for each part of the map.
FBRP.PriorityZones = {
    { id='ls', label='Los Santos', short='LS' },
    { id='blaine', label='Sandy / Grapeseed', short='Sandy/Grapeseed' },
    { id='paleto', label='Paleto Bay', short='Paleto' },
    { id='zancudo', label='Fort Zancudo', short='Zancudo' },
}
FBRP.PriorityCooldownDefault = 20

-- Quick picks in the /aop menu; any custom text can still be typed in.
FBRP.AopPresets = { 'Statewide', 'Los Santos', 'Blaine County', 'Sandy Shores', 'Grapeseed', 'Paleto Bay', 'City Limits' }

-- Which priority zone a position belongs to (client side: uses the game's zone names).
function FBRP.PriorityZoneAt(x, y, z)
    if GetNameOfZone and GetNameOfZone(x, y, z) == 'ARMYB' then return 'zancudo' end
    if y >= 5600.0 then return 'paleto' end
    if y >= 1500.0 then return 'blaine' end
    return 'ls'
end

FBRP.Ace = {
    staff = 'fbrp.staff',
    staffManage = 'fbrp.staff.manage',
    police = 'fbrp.police',
    policeCuff = 'fbrp.police.cuff',
    policeArrest = 'fbrp.police.arrest',
    policeSearch = 'fbrp.police.search',
    policeEscort = 'fbrp.police.escort',
    civRestrain = 'fbrp.civ.restrain',
    vehicleMenu = 'fbrp.vehicles',
    aop = 'fbrp.aop',
    priority = 'fbrp.priority',
    peacetime = 'fbrp.peacetime',
    announce = 'fbrp.announce',
    staffOnDutyAnnounce = 'fbrp.staff.onduty_announce',
    policeJail = 'fbrp.police.jail',
    policeCite = 'fbrp.police.cite',
    policeMdt = 'fbrp.police.mdt',
    policeImpound = 'fbrp.police.impound',
    policeSpikes = 'fbrp.police.spikes',
    ems = 'fbrp.ems',
    emsRevive = 'fbrp.ems.revive',
    staffReviveSelf = 'fbrp.staff.revive.self',
    staffRevive = 'fbrp.staff.revive.others',
    staffJail = 'fbrp.staff.jail',
    staffRelease = 'fbrp.staff.release',
}

FBRP.VehicleCatalog = {
    {
        id = 'civilian',
        label = 'Civilian',
        icon = 'car',
        ace = 'fbrp.vehicles',
        vehicles = {
            { model = 'asea', label = 'Asea' },
            { model = 'asterope', label = 'Asterope' },
            { model = 'blista', label = 'Blista' },
            { model = 'buffalo', label = 'Buffalo' },
            { model = 'cavalcade', label = 'Cavalcade' },
            { model = 'dilettante', label = 'Dilettante' },
            { model = 'futo', label = 'Futo' },
            { model = 'granger', label = 'Granger' },
            { model = 'intruder', label = 'Intruder' },
            { model = 'issi2', label = 'Issi' },
            { model = 'jackal', label = 'Jackal' },
            { model = 'mesa', label = 'Mesa' },
            { model = 'oracle', label = 'Oracle' },
            { model = 'premier', label = 'Premier' },
            { model = 'primo', label = 'Primo' },
            { model = 'stanier', label = 'Stanier' },
            { model = 'stratum', label = 'Stratum' },
            { model = 'tailgater', label = 'Tailgater' },
            { model = 'washington', label = 'Washington' }
        }
    },
    {
        id = 'sports',
        label = 'Sports & Super',
        icon = 'sparkles',
        ace = 'fbrp.vehicles',
        vehicles = {
            { model = 'alpha', label = 'Alpha' },
            { model = 'banshee', label = 'Banshee' },
            { model = 'carbonizzare', label = 'Carbonizzare' },
            { model = 'comet2', label = 'Comet' },
            { model = 'coquette', label = 'Coquette' },
            { model = 'elegy2', label = 'Elegy RH8' },
            { model = 'feltzer2', label = 'Feltzer' },
            { model = 'fusilade', label = 'Fusilade' },
            { model = 'jester', label = 'Jester' },
            { model = 'kuruma', label = 'Kuruma' },
            { model = 'massacro', label = 'Massacro' },
            { model = 'ninef', label = '9F' },
            { model = 'rapidgt', label = 'Rapid GT' },
            { model = 'schafter3', label = 'Schafter V12' },
            { model = 'sultan', label = 'Sultan' },
            { model = 'adder', label = 'Adder' },
            { model = 'bullet', label = 'Bullet' },
            { model = 'cheetah', label = 'Cheetah' },
            { model = 'entityxf', label = 'Entity XF' },
            { model = 'infernus', label = 'Infernus' },
            { model = 'osiris', label = 'Osiris' },
            { model = 't20', label = 'T20' },
            { model = 'turismor', label = 'Turismo R' },
            { model = 'vacca', label = 'Vacca' },
            { model = 'zentorno', label = 'Zentorno' }
        }
    },
    {
        id = 'muscle',
        label = 'Muscle & Classics',
        icon = 'car',
        ace = 'fbrp.vehicles',
        vehicles = {
            { model = 'blade', label = 'Blade' },
            { model = 'buccaneer', label = 'Buccaneer' },
            { model = 'chino', label = 'Chino' },
            { model = 'dominator', label = 'Dominator' },
            { model = 'gauntlet', label = 'Gauntlet' },
            { model = 'hotknife', label = 'Hotknife' },
            { model = 'nightshade', label = 'Nightshade' },
            { model = 'phoenix', label = 'Phoenix' },
            { model = 'ruiner', label = 'Ruiner' },
            { model = 'sabregt', label = 'Sabre Turbo' },
            { model = 'stalion', label = 'Stallion' },
            { model = 'tampa', label = 'Tampa' },
            { model = 'vigero', label = 'Vigero' },
            { model = 'voodoo', label = 'Voodoo' }
        }
    },
    {
        id = 'utility',
        label = 'SUVs & Off-Road',
        icon = 'car',
        ace = 'fbrp.vehicles',
        vehicles = {
            { model = 'baller', label = 'Baller' },
            { model = 'bjxl', label = 'BeeJay XL' },
            { model = 'bison', label = 'Bison' },
            { model = 'bobcatxl', label = 'Bobcat XL' },
            { model = 'dubsta', label = 'Dubsta' },
            { model = 'fq2', label = 'FQ 2' },
            { model = 'gresley', label = 'Gresley' },
            { model = 'guardian', label = 'Guardian' },
            { model = 'huntley', label = 'Huntley S' },
            { model = 'landstalker', label = 'Landstalker' },
            { model = 'patriot', label = 'Patriot' },
            { model = 'rancherxl', label = 'Rancher XL' },
            { model = 'rebel2', label = 'Rebel' },
            { model = 'rocoto', label = 'Rocoto' },
            { model = 'sandking', label = 'Sandking XL' },
            { model = 'seminole', label = 'Seminole' }
        }
    },
    {
        id = 'motorcycles',
        label = 'Motorcycles',
        icon = 'car',
        ace = 'fbrp.vehicles',
        vehicles = {
            { model = 'akuma', label = 'Akuma' },
            { model = 'bagger', label = 'Bagger' },
            { model = 'bati', label = 'Bati 801' },
            { model = 'bf400', label = 'BF400' },
            { model = 'carbonrs', label = 'Carbon RS' },
            { model = 'daemon', label = 'Daemon' },
            { model = 'double', label = 'Double-T' },
            { model = 'enduro', label = 'Enduro' },
            { model = 'faggio', label = 'Faggio' },
            { model = 'hexer', label = 'Hexer' },
            { model = 'innovation', label = 'Innovation' },
            { model = 'pcj', label = 'PCJ 600' },
            { model = 'sanchez', label = 'Sanchez' },
            { model = 'thrust', label = 'Thrust' }
        }
    },
    {
        id = 'emergency',
        label = 'Law Enforcement',
        icon = 'shield',
        ace = 'fbrp.vehicles.leo',
        vehicles = {
            { model = 'police', label = 'Patrol Cruiser' },
            { model = 'police2', label = 'Interceptor' },
            { model = 'police3', label = 'Traffic Unit' },
            { model = 'police4', label = 'Unmarked Cruiser' },
            { model = 'policeb', label = 'Police Motorcycle' },
            { model = 'policet', label = 'Police Transporter' },
            { model = 'fbi', label = 'Unmarked Buffalo' },
            { model = 'fbi2', label = 'Unmarked Granger' },
            { model = 'pranger', label = 'Park Ranger SUV' },
            { model = 'riot', label = 'Armored Response' },
            { model = 'sheriff', label = 'Sheriff Cruiser' },
            { model = 'sheriff2', label = 'Sheriff SUV' }
        }
    },
    {
        id = 'fire',
        label = 'Fire & Rescue',
        icon = 'heart-pulse',
        ace = 'fbrp.vehicles.fire',
        vehicles = {
            { model = 'ambulance', label = 'Rescue Ambulance' },
            { model = 'firetruk', label = 'Fire Engine' },
            { model = 'lguard', label = 'Lifeguard SUV' },
            { model = 'blazer2', label = 'Lifeguard ATV' },
            { model = 'polmav', label = 'Air Rescue Helicopter' }
        }
    },
    {
        id = 'staff',
        label = 'Staff',
        icon = 'sparkles',
        ace = 'fbrp.vehicles.staff',
        onDuty = true,
        vehicles = {
            { model = 'baller7', label = 'Staff Response SUV' },
            { model = 'buzzard2', label = 'Staff Air Unit' },
            { model = 'buffalo4', label = 'Staff Buffalo STX' },
            { model = 'deity', label = 'Staff Deity' },
            { model = 'granger2', label = 'Staff Granger 3600LX' },
            { model = 'jubilee', label = 'Staff Jubilee' },
            { model = 'maverick', label = 'Staff Helicopter' }
        }
    }
}

FBRP.Interactions = {
    { id = 'softcuff', label = 'Soft cuff', ace = FBRP.Ace.policeCuff },
    { id = 'hardcuff', label = 'Hard cuff', ace = FBRP.Ace.policeCuff },
    { id = 'uncuff', label = 'Remove cuffs / ties', aceAny = { FBRP.Ace.policeCuff, FBRP.Ace.civRestrain } },
    { id = 'arrest', label = 'Arrest', ace = FBRP.Ace.policeArrest },
    { id = 'escort', label = 'Escort / release', ace = FBRP.Ace.policeEscort },
    { id = 'seat', label = 'Place in vehicle', ace = FBRP.Ace.policeEscort },
    { id = 'unseat', label = 'Remove from vehicle', ace = FBRP.Ace.policeEscort },
    { id = 'search', label = 'Search person', ace = FBRP.Ace.policeSearch },
    { id = 'checkid', label = 'Check identification', aceAny = { FBRP.Ace.police, FBRP.Ace.civRestrain } },
    { id = 'ziptie', label = 'Apply zip tie', ace = FBRP.Ace.civRestrain },
    { id = 'cutziptie', label = 'Cut zip tie with knife', public = true },
    { id = 'blindfold', label = 'Apply blindfold', aceAny = { FBRP.Ace.policeCuff, FBRP.Ace.civRestrain } },
    { id = 'unblindfold', label = 'Remove blindfold', aceAny = { FBRP.Ace.policeCuff, FBRP.Ace.civRestrain } },
    { id = 'gsr', label = 'Gunshot residue test', ace = FBRP.Ace.policeSearch },
    { id = 'cite', label = 'Write citation', ace = FBRP.Ace.policeCite },
    { id = 'jail', label = 'Book into prison', aceAny = { FBRP.Ace.policeJail, FBRP.Ace.staffJail } },
    { id = 'commserv', label = 'Assign community service', aceAny = { FBRP.Ace.policeJail, FBRP.Ace.staffJail } },
    { id = 'revive', label = 'Revive patient', aceAny = { FBRP.Ace.emsRevive, FBRP.Ace.staffRevive } },
    { id = 'heal', label = 'Treat wounds', ace = FBRP.Ace.ems },
    { id = 'diagnose', label = 'Check injuries', aceAny = { FBRP.Ace.ems, FBRP.Ace.police } },
    { id = 'showid', label = 'Show my ID', public = true },
}
