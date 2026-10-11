FBRP = FBRP or {}

FBRP.Config = {
    serverName = 'Florida Bay Roleplay',
    discordInvite = GetConvar('fbrp_discordInvite', ''),
    serviceToken = GetConvar('fbrp_serviceToken', ''),
    tagDistance = 35.0,
    interactionDistance = 3.0,
    staffHeartbeatSeconds = 60,
    orgHeartbeatSeconds = 60,
    defaultAop = 'Statewide',
    defaultPeacetime = false,
    maxTagLabel = 40,
    vehicleSpawnCooldownMs = 3500,
    characterSlots = 3,
}

FBRP.SpawnLocations = {
    { id='legion', label='Legion Square', description='Central Los Santos', x=215.76, y=-810.12, z=30.73, h=157.0 },
    { id='airport', label='Los Santos Airport', description='Southern Los Santos', x=-1037.72, y=-2737.87, z=20.17, h=329.0 },
    { id='sandy', label='Sandy Shores', description='Blaine County', x=1841.84, y=3673.56, z=34.28, h=207.0 },
    { id='grapeseed', label='Grapeseed', description='Northern Blaine County', x=1682.17, y=4884.32, z=42.06, h=98.0 },
    { id='paleto', label='Paleto Bay', description='North coast', x=-110.41, y=6468.31, z=31.63, h=136.0 }
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
    announce = 'fbrp.announce',
    policeJail = 'fbrp.police.jail',
    policeCite = 'fbrp.police.cite',
    policeMdt = 'fbrp.police.mdt',
    policeImpound = 'fbrp.police.impound',
    policeSpikes = 'fbrp.police.spikes',
    ems = 'fbrp.ems',
    emsRevive = 'fbrp.ems.revive',
    staffRevive = 'fbrp.staff.revive',
    staffJail = 'fbrp.staff.jail',
}

FBRP.VehicleCatalog = {
    {
        id = 'civilian',
        label = 'Civilian',
        icon = 'car',
        ace = 'fbrp.vehicles',
        vehicles = {
            { model = 'blista', label = 'Blista' },
            { model = 'buffalo', label = 'Buffalo' },
            { model = 'cavalcade', label = 'Cavalcade' },
            { model = 'futo', label = 'Futo' },
            { model = 'granger', label = 'Granger' },
            { model = 'mesa', label = 'Mesa' },
            { model = 'oracle', label = 'Oracle' },
            { model = 'stanier', label = 'Stanier' }
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
            { model = 'firetruk', label = 'Fire Engine' }
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
            { model = 'buzzard2', label = 'Staff Air Unit' }
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
    { id = 'blindfold', label = 'Apply blindfold', aceAny = { FBRP.Ace.policeCuff, FBRP.Ace.civRestrain } },
    { id = 'unblindfold', label = 'Remove blindfold', aceAny = { FBRP.Ace.policeCuff, FBRP.Ace.civRestrain } },
    { id = 'gsr', label = 'Gunshot residue test', ace = FBRP.Ace.policeSearch },
    { id = 'cite', label = 'Write citation', ace = FBRP.Ace.policeCite },
    { id = 'jail', label = 'Book into prison', aceAny = { FBRP.Ace.policeJail, FBRP.Ace.staffJail } },
    { id = 'revive', label = 'Revive patient', aceAny = { FBRP.Ace.emsRevive, FBRP.Ace.staffRevive } },
    { id = 'heal', label = 'Treat wounds', ace = FBRP.Ace.ems },
    { id = 'diagnose', label = 'Check injuries', aceAny = { FBRP.Ace.ems, FBRP.Ace.police } },
    { id = 'showid', label = 'Show my ID', public = true },
}

