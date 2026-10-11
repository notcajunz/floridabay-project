-- Medical: players go down instead of dying, can call EMS, and are revived by
-- medics or respawn at the nearest hospital once they bleed out.

local S = FBRP.Server
local M = FBRP.Medical
local sessions = S.sessions
local now, clean, notify, chat, hasPermission = S.now, S.clean, S.notify, S.chat, S.hasPermission

local downed = {}       -- source -> { since, cause, lastDistress }
local reviving = {}     -- medic source -> target

local function setDowned(source, value)
    local player = Player(source)
    if player then player.state:set('fbrp:downed', value, true) end
end

local function pedCoords(source)
    local ped = GetPlayerPed(source)
    return ped > 0 and GetEntityCoords(ped) or nil
end

local function revive(target, by)
    if not downed[target] then return false end
    downed[target] = nil
    setDowned(target, nil)
    TriggerClientEvent('fbrp:medical:revive', target, by)
    local s = sessions[target]
    FBRP.DB.audit(by or 'system', 'medical.revive', s and s.discord or target, {})
    return true
end

RegisterNetEvent('fbrp:medical:downed', function(info)
    local src = source
    if downed[src] or not sessions[src] then return end
    local cause = type(info) == 'table' and clean(info.cause, 60) or 'Unknown injuries'
    downed[src] = { since=now(), cause=cause ~= '' and cause or 'Unknown injuries', lastDistress=0 }
    setDowned(src, { since=os.time(), cause=downed[src].cause })
    local s = sessions[src]
    FBRP.DB.audit(s and s.discord or src, 'medical.downed', nil, { cause=downed[src].cause })
end)

RegisterNetEvent('fbrp:medical:distress', function()
    local src = source
    local d = downed[src]
    if not d then return end
    if now() - d.lastDistress < M.distressCooldownSeconds * 1000 then
        return notify(src, 'You already sent a distress signal. Hang on.', 'info')
    end
    d.lastDistress = now()
    local coords = pedCoords(src)
    local id, sent = S.sendDispatch('EMS', src, ('Person down: %s.'):format(d.cause), coords, { FBRP.Ace.ems, FBRP.Ace.police }, true)
    notify(src, sent > 0 and ('Distress signal sent (call #%d). %d responder(s) notified.'):format(id, sent) or 'Distress signal sent, but no medics are on duty.', sent > 0 and 'success' or 'warning')
end)

-- Respawning is only allowed once the bleed-out timer has run.
RegisterNetEvent('fbrp:medical:respawn', function()
    local src = source
    local d = downed[src]
    if not d then return end
    if now() - d.since < (M.bleedoutSeconds - 3) * 1000 then return notify(src, 'You are not ready to respawn yet.', 'error') end
    downed[src] = nil
    setDowned(src, nil)
    if FBRP.Justice.IsJailed and FBRP.Justice.IsJailed(src) then
        return TriggerClientEvent('fbrp:medical:hospitalRespawn', src, FBRP.Justice.PrisonSpawn(), 'the Bolingbroke infirmary')
    end
    local coords = pedCoords(src) or vector3(0.0, 0.0, 0.0)
    local best, bestDistance
    for _, hospital in ipairs(M.hospitals) do
        local distance = #(coords - vector3(hospital.coords.x, hospital.coords.y, hospital.coords.z))
        if not bestDistance or distance < bestDistance then best, bestDistance = hospital, distance end
    end
    TriggerClientEvent('fbrp:medical:hospitalRespawn', src, best.coords, best.label)
    local s = sessions[src]
    FBRP.DB.audit(s and s.discord or src, 'medical.respawn', nil, { hospital=best.label })
end)

-- The client got back up on its own (resource restart, admin heal from vMenu).
RegisterNetEvent('fbrp:medical:recovered', function()
    local src = source
    downed[src] = nil
    setDowned(src, nil)
end)

AddEventHandler('playerDropped', function()
    local src = source
    downed[src] = nil
    reviving[src] = nil
end)

RegisterCommand('revive', function(source, args)
    if source > 0 and not hasPermission(source, FBRP.Ace.staffRevive) then return S.deny(source, FBRP.Ace.staffRevive) end
    local target = tonumber(args[1]) or (source > 0 and source or nil)
    if not target or not sessions[target] then return notify(source, 'Usage: /revive [server id]', 'error') end
    local actor = S.actorOf(source)
    if not revive(target, actor) then
        -- Not tracked as downed (e.g. died before the module loaded): still pick them up.
        TriggerClientEvent('fbrp:medical:revive', target, actor)
    end
    notify(target, 'You were revived by staff.', 'success')
    if source > 0 and source ~= target then notify(source, 'Player revived.', 'success') end
end, false)

-- ─────────────────────────── third eye ───────────────────────────

FBRP.InteractionVisible.revive = function(_, target) return downed[target] ~= nil end
FBRP.InteractionHandlers.revive = function(src, target)
    if not downed[target] then notify(src, 'They do not need reviving.', 'info') return false end
    if reviving[src] then return false end
    reviving[src] = target
    TriggerClientEvent('fbrp:medical:cpr', src, M.reviveMs)
    notify(target, ('%s is treating you.'):format(S.displayName(src)), 'info')
    SetTimeout(M.reviveMs, function()
        reviving[src] = nil
        if not sessions[src] or not sessions[target] then return end
        if not S.playersNear(src, target, FBRP.Config.interactionDistance + 1.5) then return notify(src, 'You moved away from the patient.', 'error') end
        if revive(target, sessions[src].discord or src) then
            notify(src, 'Patient stabilised.', 'success')
            notify(target, ('You were revived by %s.'):format(S.displayName(src)), 'success')
        end
    end)
end

FBRP.InteractionVisible.heal = function(_, target) return downed[target] == nil end
FBRP.InteractionHandlers.heal = function(src, target)
    TriggerClientEvent('fbrp:medical:cpr', src, 2500, true)
    TriggerClientEvent('fbrp:medical:heal', target)
    notify(target, ('%s treated your wounds.'):format(S.displayName(src)), 'success')
    notify(src, 'Wounds treated.', 'success')
end

FBRP.InteractionHandlers.diagnose = function(src, target)
    local d = downed[target]
    local name = S.displayName(target)
    if d then
        local seconds = math.floor((now() - d.since) / 1000)
        local left = math.max(0, M.bleedoutSeconds - seconds)
        chat(src, 'MEDICAL', ('%s · UNRESPONSIVE · %s · down %dm %02ds · %s'):format(
            name, d.cause, math.floor(seconds / 60), seconds % 60, left > 0 and ('critical in %dm %02ds'):format(math.floor(left / 60), left % 60) or 'critical'), { 255, 107, 87 })
    else
        local ped = GetPlayerPed(target)
        local health = ped > 0 and GetEntityHealth(ped) or 200
        local pct = math.max(0, math.min(100, math.floor((health - 100) / 1.0)))
        local state = pct >= 85 and 'Stable' or pct >= 50 and 'Minor injuries' or 'Serious injuries'
        chat(src, 'MEDICAL', ('%s · Conscious · %s (%d%%)'):format(name, state, pct), { 79, 224, 140 })
    end
end

FBRP.Medical.IsDowned = function(source) return downed[tonumber(source)] ~= nil end
