LG = {}

LG.enabled = true

-- Long guns a player can carry at once (in hand plus slung).
LG.maxCarried = 2
-- Long guns one vehicle trunk can hold.
LG.trunkCapacity = 6
-- How close (metres) you stand to the boot to open it.
LG.reach = 2.1
-- Stored trunk guns older than this are cleaned up on resource start.
LG.trunkRetentionDays = 45

-- Only these weapon groups are restricted. Pistols, stun guns, melee, thrown
-- items, tools and everything else stay available everywhere.
LG.groups = { 'GROUP_SMG', 'GROUP_RIFLE', 'GROUP_MG', 'GROUP_SHOTGUN', 'GROUP_SNIPER', 'GROUP_HEAVY' }

-- Weapons that can be stowed in and taken from trunks. Group detection decides
-- what is restricted; this list is what can be named, stored and restored.
LG.weapons = {
    -- SMG / machine pistols
    'WEAPON_MICROSMG', 'WEAPON_SMG', 'WEAPON_SMG_MK2', 'WEAPON_ASSAULTSMG', 'WEAPON_COMBATPDW',
    'WEAPON_MACHINEPISTOL', 'WEAPON_MINISMG', 'WEAPON_GUSENBERG',
    -- Machine guns
    'WEAPON_MG', 'WEAPON_COMBATMG', 'WEAPON_COMBATMG_MK2',
    -- Rifles
    'WEAPON_ASSAULTRIFLE', 'WEAPON_ASSAULTRIFLE_MK2', 'WEAPON_CARBINERIFLE', 'WEAPON_CARBINERIFLE_MK2',
    'WEAPON_ADVANCEDRIFLE', 'WEAPON_SPECIALCARBINE', 'WEAPON_SPECIALCARBINE_MK2', 'WEAPON_BULLPUPRIFLE',
    'WEAPON_BULLPUPRIFLE_MK2', 'WEAPON_COMPACTRIFLE', 'WEAPON_MILITARYRIFLE', 'WEAPON_TACTICALRIFLE',
    -- Shotguns
    'WEAPON_PUMPSHOTGUN', 'WEAPON_PUMPSHOTGUN_MK2', 'WEAPON_SAWNOFFSHOTGUN', 'WEAPON_ASSAULTSHOTGUN',
    'WEAPON_BULLPUPSHOTGUN', 'WEAPON_MUSKET', 'WEAPON_HEAVYSHOTGUN', 'WEAPON_DBSHOTGUN',
    'WEAPON_AUTOSHOTGUN', 'WEAPON_COMBATSHOTGUN',
    -- Snipers / marksman
    'WEAPON_SNIPERRIFLE', 'WEAPON_HEAVYSNIPER', 'WEAPON_HEAVYSNIPER_MK2', 'WEAPON_MARKSMANRIFLE',
    'WEAPON_MARKSMANRIFLE_MK2',
    -- Heavy
    'WEAPON_RPG', 'WEAPON_GRENADELAUNCHER', 'WEAPON_GRENADELAUNCHER_SMOKE', 'WEAPON_MINIGUN',
    'WEAPON_FIREWORK', 'WEAPON_RAILGUN', 'WEAPON_HOMINGLAUNCHER', 'WEAPON_COMPACTLAUNCHER', 'WEAPON_EMPLAUNCHER',
    -- Florida Bay addon weapons (fbrp_guns2)
    'WEAPON_MP9A', 'WEAPON_FBIARB', 'WEAPON_HK416B', 'WEAPON_MM4', 'WEAPON_M700', 'WEAPON_GHOSTARP',
    'WEAPON_TACTICALCARBINE'
}

LG.labels = {
    WEAPON_MP9A = 'MP9', WEAPON_FBIARB = 'FBI AR-15', WEAPON_HK416B = 'HK416', WEAPON_MM4 = 'Military M4',
    WEAPON_M700 = 'M700', WEAPON_GHOSTARP = 'Ghost ARP', WEAPON_TACTICALCARBINE = 'Tactical Carbine'
}

-- Sling placement. bone 24818 = SKEL_Spine3, 24816 = SKEL_Spine2.
-- pos = x,y,z offset from the bone; rot = x,y,z degrees. Tune live with
-- /slingtune <back|chest> x y z rx ry rz and paste the printed line here.
LG.sling = {
    back  = { bone = 24816, pos = { 0.075, -0.15, -0.02 }, rot = { 0.0, 165.0, 0.0 } },
    -- Hangs down the front of the torso, flat to the chest, instead of lying across the shoulders.
    chest = { bone = 24818, pos = { -0.08, 0.19, 0.0 },    rot = { 0.0, 160.0, 0.0 } }
}
