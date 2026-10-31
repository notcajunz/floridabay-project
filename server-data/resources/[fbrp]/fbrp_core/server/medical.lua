-- Medical (server). The old downed / bleed-out / revive death system has been removed;
-- a new death system will replace it. What's left: /revive (staff), /heal, /armour,
-- EMS "Treat wounds" / "Check injuries", kill logging, and a TEMPORARY hospital respawn.
local S = FBRP.Server
local M = FBRP.Medical
local sessions = S.sessions
local now, clean, notify, chat, hasPermission = S.now, S.clean, S.notify, S.chat, S.hasPermission

local selfCareUsed = { heal={}, armour={} }
local lastRespawn = {}

local function pedCoords(source)
    local ped = GetPlayerPed(source)
    return ped > 0 and GetEntityCoords(ped) or nil
end

---------------------------------------------------------------- kill log (staff audit)

-- In-game kill log. A real player killer becomes `player.kill`; anything else (NPCs, falls,
-- drowning, a suicide) becomes `player.death`. The Discord bot sends both to #kill-logs.
local WEAPON_NAMES = {}
for _, name in ipairs({
    'WEAPON_UNARMED','WEAPON_KNIFE','WEAPON_NIGHTSTICK','WEAPON_HAMMER','WEAPON_BAT','WEAPON_CROWBAR','WEAPON_GOLFCLUB',
    'WEAPON_BOTTLE','WEAPON_DAGGER','WEAPON_HATCHET','WEAPON_MACHETE','WEAPON_SWITCHBLADE','WEAPON_WRENCH','WEAPON_BATTLEAXE',
    'WEAPON_POOLCUE','WEAPON_PISTOL','WEAPON_PISTOL_MK2','WEAPON_COMBATPISTOL','WEAPON_APPISTOL','WEAPON_STUNGUN',
    'WEAPON_PISTOL50','WEAPON_SNSPISTOL','WEAPON_SNSPISTOL_MK2','WEAPON_HEAVYPISTOL','WEAPON_VINTAGEPISTOL','WEAPON_REVOLVER',
    'WEAPON_REVOLVER_MK2','WEAPON_DOUBLEACTION','WEAPON_CERAMICPISTOL','WEAPON_MICROSMG','WEAPON_SMG','WEAPON_SMG_MK2',
    'WEAPON_ASSAULTSMG','WEAPON_COMBATPDW','WEAPON_MACHINEPISTOL','WEAPON_MINISMG','WEAPON_PUMPSHOTGUN','WEAPON_PUMPSHOTGUN_MK2',
    'WEAPON_SAWNOFFSHOTGUN','WEAPON_ASSAULTSHOTGUN','WEAPON_BULLPUPSHOTGUN','WEAPON_HEAVYSHOTGUN','WEAPON_DBSHOTGUN',
    'WEAPON_AUTOSHOTGUN','WEAPON_COMBATSHOTGUN','WEAPON_ASSAULTRIFLE','WEAPON_ASSAULTRIFLE_MK2','WEAPON_CARBINERIFLE',
    'WEAPON_CARBINERIFLE_MK2','WEAPON_ADVANCEDRIFLE','WEAPON_SPECIALCARBINE','WEAPON_SPECIALCARBINE_MK2','WEAPON_BULLPUPRIFLE',
    'WEAPON_BULLPUPRIFLE_MK2','WEAPON_COMPACTRIFLE','WEAPON_MILITARYRIFLE','WEAPON_MG','WEAPON_COMBATMG','WEAPON_COMBATMG_MK2',
    'WEAPON_GUSENBERG','WEAPON_SNIPERRIFLE','WEAPON_HEAVYSNIPER','WEAPON_HEAVYSNIPER_MK2','WEAPON_MARKSMANRIFLE',
    'WEAPON_MARKSMANRIFLE_MK2','WEAPON_MUSKET','WEAPON_RPG','WEAPON_GRENADELAUNCHER','WEAPON_MINIGUN','WEAPON_GRENADE',
    'WEAPON_STICKYBOMB','WEAPON_MOLOTOV','WEAPON_PROXMINE','WEAPON_PIPEBOMB','WEAPON_FLARE','WEAPON_FIREEXTINGUISHER',
    'WEAPON_PETROLCAN','WEAPON_BZGAS','WEAPON_SMOKEGRENADE','WEAPON_FALL','WEAPON_EXPLOSION','WEAPON_FIRE','WEAPON_DROWNING',
    'WEAPON_DROWNING_IN_VEHICLE','WEAPON_BLEEDING','WEAPON_RUN_OVER_BY_CAR','WEAPON_RAMMED_BY_CAR','WEAPON_ANIMAL',
    'WEAPON_BARBED_WIRE','WEAPON_ELECTRIC_FENCE','WEAPON_VEHICLE_ROCKET','WEAPON_AIR_DEFENCE_GUN','WEAPON_TRANQUILIZER',
}) do WEAPON_NAMES[joaat(name) & 0xFFFFFFFF] = name:gsub('^WEAPON_', ''):gsub('_', ' '):lower() end

local function weaponLabel(hash)
    hash = tonumber(hash)
    if not hash then return 'Unknown' end
    hash = math.floor(hash) & 0xFFFFFFFF
    return WEAPON_NAMES[hash] or ('addon/other (0x%08X)'):format(hash)
end

local lastDeath = {}
RegisterNetEvent('fbrp:medical:died', function(info)
    local victim = source
    if type(info) ~= 'table' then info = {} end
    if lastDeath[victim] and now() - lastDeath[victim] < 3000 then return end
    lastDeath[victim] = now()
    local vs = sessions[victim]
    if not vs then return end
    local killer = tonumber(info.killer)
    local ks = killer and killer ~= victim and sessions[killer] or nil
    local vc = pedCoords(victim)
    local kc = ks and pedCoords(killer) or nil
    local payload = {
        victim = vs.name, victim_id = victim, victim_discord = vs.discord, weapon = weaponLabel(info.weapon),
        location = vc and ('%.0f, %.0f, %.0f'):format(vc.x, vc.y, vc.z) or nil,
    }
    if ks then
        payload.killer = ks.name; payload.killer_id = killer; payload.killer_discord = ks.discord
        payload.distance_m = (vc and kc) and math.floor(#(vc - kc) + 0.5) or nil
        FBRP.DB.audit(ks.discord or killer, 'player.kill', vs.discord, payload)
    else
        FBRP.DB.audit(vs.discord or victim, 'player.death', vs.discord, payload)
    end
end)

---------------------------------------------------------------- TEMPORARY hospital respawn
-- Remove once the new death system is in (or set FBRP.Medical.basicRespawn = false).

-- Respawning is only allowed once the bleed-out timer has run.
RegisterNetEvent('fbrp:medical:respawn', function()
    local src = source
    if M.basicRespawn == false or not sessions[src] then return end
    if lastRespawn[src] and now() - lastRespawn[src] < 5000 then return end
    local ped = GetPlayerPed(src)
    if ped <= 0 or GetEntityHealth(ped) > 100 then return end -- only dead players (GTA: 100 hp or less = dead)
    lastRespawn[src] = now()
    if FBRP.Justice.IsJailed and FBRP.Justice.IsJailed(src) and FBRP.Justice.PrisonSpawn then
        return TriggerClientEvent('fbrp:medical:hospitalRespawn', src, FBRP.Justice.PrisonSpawn(), 'the Bolingbroke infirmary')
    end
    local coords = pedCoords(src) or vector3(0.0, 0.0, 0.0)
    local best, bestDistance
    for _, hospital in ipairs(M.hospitals) do
        local distance = #(coords - vector3(hospital.coords.x, hospital.coords.y, hospital.coords.z))
        if not bestDistance or distance < bestDistance then best, bestDistance = hospital, distance end
    end
    TriggerClientEvent('fbrp:medical:hospitalRespawn', src, best.coords, best.label)
end)

AddEventHandler('playerDropped', function()
    lastRespawn[source] = nil
    lastDeath[source] = nil
end)

---------------------------------------------------------------- staff /revive

-- DeathScript owns /revive (self get-up) and /adrev (staff) when it's installed
if GetResourceState('DeathScript') == 'missing' then
RegisterCommand('revive', function(source, args)
    local target = tonumber(args[1]) or (source > 0 and source or nil)
    if not target or not sessions[target] then return notify(source, 'Usage: /revive [server id]', 'error') end
    local permission = target == source and FBRP.Ace.staffReviveSelf or FBRP.Ace.staffRevive
    if source > 0 and not hasPermission(source, permission) then return S.deny(source, permission) end
    TriggerClientEvent('fbrp:medical:revive', target, S.actorOf(source))
    notify(target, 'You were revived by staff.', 'success')
    if source > 0 and source ~= target then notify(source, 'Player revived.', 'success') end
end, false)
end

---------------------------------------------------------------- /heal and /armour

-- Self-service recovery commands are server-authoritative so reconnecting or
-- invoking client events directly cannot bypass their cooldowns.
local function selfCareKey(source)
    local s = sessions[source]
    return s and (s.license or s.discord) or nil
end

local function useSelfCare(source, kind, cooldownSeconds, clientEvent, label)
    if source <= 0 or not sessions[source] then return end
    local ped = GetPlayerPed(source)
    if ped > 0 and GetEntityHealth(ped) <= 100 then return notify(source, ('You cannot use /%s while dead.'):format(kind), 'error') end
    local key = selfCareKey(source)
    if not key then return notify(source, 'Your player session is not ready yet.', 'error') end
    local stamp = now()
    local cooldownMs = cooldownSeconds * 1000
    local readyAt = (selfCareUsed[kind][key] or 0) + cooldownMs
    if readyAt > stamp then
        local remaining = math.ceil((readyAt - stamp) / 1000)
        return notify(source, ('/%s is ready again in %dm %02ds.'):format(kind, math.floor(remaining / 60), remaining % 60), 'warning')
    end
    selfCareUsed[kind][key] = stamp
    -- Raising health or armour is legitimate here; tell the anticheat before
    -- the client applies the increase.
    local grantKind = kind == 'heal' and 'health' or kind
    pcall(function() exports.corevia_ac:recordHealthGrant(source, grantKind, 100) end)
    TriggerClientEvent(clientEvent, source)
    notify(source, ('%s replenished.'):format(label), 'success')
end

RegisterCommand('heal', function(source)
    useSelfCare(source, 'heal', FBRP.Config.healCooldownSeconds or 180, 'fbrp:medical:selfHeal', 'Health')
end, false)

local function armourCommand(source)
    useSelfCare(source, 'armour', FBRP.Config.armourCooldownSeconds or 300, 'fbrp:medical:selfArmour', 'Armour')
end

RegisterCommand('armour', armourCommand, false)
RegisterCommand('armor', armourCommand, false)

---------------------------------------------------------------- third eye: EMS treat wounds / check injuries

FBRP.InteractionHandlers.heal = function(src, target)
    TriggerClientEvent('fbrp:medical:cpr', src, 2500, true)
    TriggerClientEvent('fbrp:medical:heal', target)
    notify(target, ('%s treated your wounds.'):format(S.displayName(src)), 'success')
    notify(src, 'Wounds treated.', 'success')
end

FBRP.InteractionHandlers.diagnose = function(src, target)
    local name = S.displayName(target)
    local ped = GetPlayerPed(target)
    local health = ped > 0 and GetEntityHealth(ped) or 200
    if health <= 100 then
        return notify(src, ('%s · Unresponsive'):format(name), 'error')
    end
    local pct = math.max(0, math.min(100, math.floor((health - 100) / 1.0)))
    local state = pct >= 85 and 'Stable' or pct >= 50 and 'Minor injuries' or 'Serious injuries'
    notify(src, ('%s · Conscious · %s (%d%%)'):format(name, state, pct), 'inform')
end

-- DeathScript: "Revive patient" (medics) and "Help up" (anyone, knocked-out players) on the third eye.
-- The helper's screen plays the progress bar, then DeathScript's server checks and revives.
FBRP.InteractionVisible.revive = function(_, target)
    return GetResourceState('DeathScript') == 'started' and Player(target).state.dead == true
end
FBRP.InteractionHandlers.revive = function(src, target)
    TriggerClientEvent('DeathScript:StartMedRevive', src, target)
end
FBRP.InteractionVisible.helpup = function(_, target)
    return GetResourceState('DeathScript') == 'started' and Player(target).state.knockedout == true
end
FBRP.InteractionHandlers.helpup = function(src, target)
    TriggerClientEvent('DeathScript:StartHelpUp', src, target)
end

-- the new death system should set Player(src).state['fbrp:downed'] while someone is down
FBRP.Medical.IsDowned = function(source)
    local player = Player(tonumber(source))
    return player and player.state['fbrp:downed'] ~= nil and player.state['fbrp:downed'] ~= false or false
end
