-- Staff tiers for vMenu. Four tiers exist: Co-Owner and above, Community Director up to (but not
-- including) Co-Owner, Senior Moderator up to Community Director, and everybody else. A group's tier comes from its staff rank order, so a new
-- rank placed between two existing ones lands in the right tier automatically.
FBRP.VmenuTierGroups = { coowner = 'co_owner', director = 'community_director', senior = 'senior_moderator' }
FBRP.VmenuTierLevel = { standard = 0, senior = 1, director = 2, coowner = 3 }

-- vMenu admin features: only Co-Owner and above hold these. Everyone else loses them even when a
-- group row, vMenu.Everything or a wildcard would otherwise grant them. Whole sections are matched
-- by prefix, the rest are exact ACE objects.
FBRP.VmenuCoOwnerPrefixes = {
    'vMenu.OnlinePlayers',
    'vMenu.PlayerOptions',
    'vMenu.TimeOptions',
    'vMenu.WeatherOptions',
}

FBRP.VmenuCoOwnerObjects = {
    -- Global
    'vMenu.Staff',
    'vMenu.DontKickMe',
    'vMenu.DontBanMe',
    -- Vehicle admin tools
    'vMenu.VehicleOptions.God',
    'vMenu.VehicleOptions.Freeze',
    'vMenu.VehicleOptions.Invisible',
    'vMenu.VehicleOptions.PlaneBombs',
    -- Weapon admin tools. Spawn By Name would bypass the weapon list below.
    'vMenu.WeaponOptions.UnlimitedAmmo',
    'vMenu.WeaponOptions.NoReload',
    'vMenu.WeaponOptions.GetAll',
    'vMenu.WeaponOptions.SpawnByName',
    -- Misc settings admin tools
    'vMenu.MiscSettings.DevTools',
    'vMenu.MiscSettings.EntitySpawner',
    'vMenu.MiscSettings.ClearArea',
    'vMenu.MiscSettings.ConnectionMenu',
    'vMenu.MiscSettings.JoinQuitNotifs',
    'vMenu.MiscSettings.TeleportLocations',
    'vMenu.MiscSettings.TeleportSaveLocation',
    'vMenu.MiscSettings.TeleportToCoord',
    'vMenu.MiscSettings.TeleportToWp',
    -- Heavy base-game weapons (railgun, EMP launcher, minigun, homing launcher and friends)
    'vMenu.WeaponOptions.CompactGrenadeLauncher',
    'vMenu.WeaponOptions.EMPLauncher',
    'vMenu.WeaponOptions.Firework',
    'vMenu.WeaponOptions.GrenadeLauncher',
    'vMenu.WeaponOptions.GrenadeLauncherSmoke',
    'vMenu.WeaponOptions.HomingLauncher',
    'vMenu.WeaponOptions.Minigun',
    'vMenu.WeaponOptions.PlasmaCarbine',
    'vMenu.WeaponOptions.PlasmaMinigun',
    'vMenu.WeaponOptions.PlasmaPistol',
    'vMenu.WeaponOptions.Railgun',
    'vMenu.WeaponOptions.RailgunXM3',
    'vMenu.WeaponOptions.RPG',
    'vMenu.WeaponOptions.SnowLauncher',
}

-- Senior Moderator and above: NoClip, player names and player blips, and only while clocked in
-- (client/vmenu_gate.lua).
FBRP.VmenuSeniorObjects = {
    'vMenu.NoClip',
    'vMenu.MiscSettings.OverheadNames',
    'vMenu.MiscSettings.PlayerBlips',
}

-- Community Director and above: power and torque multipliers beyond x128. Everyone who holds the
-- multiplier permissions gets the x2 to x128 range.
FBRP.VmenuDirectorObjects = {
    'vMenu.VehicleOptions.UnlimitedMultipliers',
}

-- vMenu parents whose "All" permission also unlocks admin features above. Below Co-Owner an "All" row
-- is replaced by its individual permissions minus the admin features.
FBRP.VmenuAllSections = { 'VehicleOptions', 'WeaponOptions', 'MiscSettings' }

local coOwnerObjectSet, directorObjectSet, seniorObjectSet = {}, {}, {}
for _, object in ipairs(FBRP.VmenuCoOwnerObjects) do coOwnerObjectSet[object] = true end
for _, object in ipairs(FBRP.VmenuDirectorObjects) do directorObjectSet[object] = true end
for _, object in ipairs(FBRP.VmenuSeniorObjects) do seniorObjectSet[object] = true end

-- The tier name an ACE object needs, or nil when every tier may hold it.
function FBRP.VmenuRequiredTier(object)
    if type(object) ~= 'string' then return nil end
    if directorObjectSet[object] then return 'director' end
    if coOwnerObjectSet[object] then return 'coowner' end
    if seniorObjectSet[object] then return 'senior' end
    for _, prefix in ipairs(FBRP.VmenuCoOwnerPrefixes) do
        if object == prefix or object:sub(1, #prefix + 1) == prefix .. '.' then return 'coowner' end
    end
    return nil
end

function FBRP.VmenuTierAllows(tier, object)
    local required = FBRP.VmenuRequiredTier(object)
    if not required then return true end
    return (FBRP.VmenuTierLevel[tier] or 0) >= FBRP.VmenuTierLevel[required]
end

-- Expands an allowed ACE object for a tier: vMenu parents that cover admin features become their
-- allowed children, restricted objects disappear and everything else passes through unchanged.
function FBRP.VmenuObjectsForTier(tier, object)
    if type(object) ~= 'string' or object:sub(1, 6) ~= 'vMenu.' then return { object } end
    if (FBRP.VmenuTierLevel[tier] or 0) >= FBRP.VmenuTierLevel.coowner then return { object } end
    for _, section in ipairs(FBRP.VmenuAllSections) do
        if object == 'vMenu.' .. section .. '.All' then
            local children, prefix = {}, 'vMenu.' .. section .. '.'
            for _, name in ipairs(FBRP.VmenuEverything) do
                if name:sub(1, #prefix) == prefix and name ~= object and FBRP.VmenuTierAllows(tier, name) then
                    children[#children + 1] = name
                end
            end
            return children
        end
    end
    if FBRP.VmenuTierAllows(tier, object) then return { object } end
    return {}
end
