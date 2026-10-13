-- Supply drops: a crate lands somewhere on the map every half hour or so.
-- Everyone sees a search circle, the exact spot is revealed to those who get
-- close, and the first player to finish securing it wins the prize.

local S = FBRP.Server
local P = FBRP.Pastimes
local PS = FBRP.PastimeServer
local D = P.drops
local sessions, now, notify = S.sessions, S.now, S.notify

local drop = nil
local nextAt = now() + D.firstDelayMinutes * 60000
local lastScan = {}
local lastLabel = nil

local function flat(a, b)
    local dx, dy = a.x - b.x, a.y - b.y
    return math.sqrt(dx * dx + dy * dy)
end

local function locations()
    local list = {}
    for _, cache in ipairs(FBRP.Activities.caches) do
        list[#list + 1] = { label = cache.label, region = cache.region, x = cache.x, y = cache.y, z = cache.z }
    end
    for _, landmark in ipairs(FBRP.Passport.landmarks) do
        list[#list + 1] = { label = landmark.label, region = landmark.region, x = landmark.x, y = landmark.y, z = landmark.z }
    end
    for _, extra in ipairs(D.extraLocations) do list[#list + 1] = extra end
    return list
end

local function schedule()
    nextAt = now() + math.random(D.minIntervalMinutes, D.maxIntervalMinutes) * 60000
end

local function publicDrop()
    if not drop then return nil end
    return {
        id = drop.id, x = drop.ax, y = drop.ay, radius = D.searchRadius, region = drop.region,
        seconds = math.max(0, math.floor((drop.expiresAt - now()) / 1000)),
        revealRadius = D.revealRadius, claimRadius = D.claimRadius, claimMs = D.claimMs, models = D.models,
    }
end

local function spawnDrop()
    local list = locations()
    local pick
    for _ = 1, 6 do
        pick = list[math.random(#list)]
        if pick.label ~= lastLabel then break end
    end
    lastLabel = pick.label
    local angle = math.random() * math.pi * 2
    local reach = math.random(40, 110) + 0.0
    drop = {
        id = tostring(now()), label = pick.label, region = pick.region,
        x = pick.x + 0.0, y = pick.y + 0.0, z = pick.z + 0.0,
        ax = pick.x + math.cos(angle) * reach, ay = pick.y + math.sin(angle) * reach,
        expiresAt = now() + D.lifetimeMinutes * 60000, claimers = {},
    }
    TriggerClientEvent('fbrp:pastimes:drop:announce', -1, publicDrop())
    S.broadcast('SUPPLY DROP', ('A supply crate has come down near %s. Check your map and get there first! (%d min)'):format(drop.region, D.lifetimeMinutes), { 255, 181, 71 })
end

local function endDrop(winnerName)
    if not drop then return end
    local id = drop.id
    drop = nil
    schedule()
    TriggerClientEvent('fbrp:pastimes:drop:ended', -1, { id = id, winner = winnerName })
end

RegisterNetEvent('fbrp:pastimes:drop:sync', function()
    if drop then TriggerClientEvent('fbrp:pastimes:drop:announce', source, publicDrop()) end
end)

RegisterNetEvent('fbrp:pastimes:drop:scan', function(rawId)
    local src = source
    if not drop or tostring(rawId or '') ~= drop.id or not sessions[src] then return end
    if lastScan[src] and now() - lastScan[src] < 3000 then return end
    lastScan[src] = now()
    local ped = GetPlayerPed(src)
    if ped <= 0 then return end
    if flat(GetEntityCoords(ped), drop) > D.revealRadius + 40.0 then return end
    TriggerClientEvent('fbrp:pastimes:drop:reveal', src, { id = drop.id, x = drop.x, y = drop.y, z = drop.z })
end)

RegisterNetEvent('fbrp:pastimes:drop:claimStart', function(rawId)
    local src = source
    if not drop or tostring(rawId or '') ~= drop.id or not sessions[src] then return end
    local blocked = PS.blocked(src)
    if blocked then return notify(src, blocked, 'error') end
    local ped = GetPlayerPed(src)
    if ped <= 0 then return end
    local here = GetEntityCoords(ped)
    if flat(here, drop) > D.claimRadius + 3.0 or math.abs(here.z - drop.z) > 12.0 then
        return notify(src, 'Get closer to the crate.', 'error')
    end
    drop.claimers[src] = now()
    TriggerClientEvent('fbrp:pastimes:drop:claimOk', src, D.claimMs)
end)

RegisterNetEvent('fbrp:pastimes:drop:claimCancel', function()
    if drop then drop.claimers[source] = nil end
end)

RegisterNetEvent('fbrp:pastimes:drop:claimFinish', function(rawId)
    local src = source
    local s = sessions[src]
    if not drop or not s or tostring(rawId or '') ~= drop.id then return end
    local started = drop.claimers[src]
    if not started or now() - started < D.claimMs - 800 then return end
    local ped = GetPlayerPed(src)
    if ped <= 0 or flat(GetEntityCoords(ped), drop) > D.claimRadius + 4.0 then return end

    local rivals = 0
    for other, at in pairs(drop.claimers) do
        if other ~= src and sessions[other] and now() - at < D.claimMs * 3 then rivals = rivals + 1 end
    end
    local rep = D.rep + math.min(D.extraRepCap, rivals * D.extraRepPerContender)
    local name = S.displayName(src)
    local title = PS.titleOf(src)
    PS.ensure(src)
    PS.bump(src, 'drops_won', 1)
    PS.log(s.license, 'drop', drop.label, 1)
    FBRP.DB.audit(s.discord or s.license, 'pastime.drop', drop.label, { rep = rep, rivals = rivals })
    PS.award(src, rep, 'drop')
    TriggerClientEvent('fbrp:pastimes:drop:won', src, { rep = rep, rivals = rivals, region = drop.region })
    S.broadcast('SUPPLY DROP', ('%s%s secured the crate near %s%s.'):format(
        title and (title .. ' ') or '', name, drop.region, rivals > 0 and (' against ' .. rivals .. ' rival' .. (rivals > 1 and 's' or '')) or ''), { 255, 181, 71 })
    endDrop(name)
    PS.checkAchievements(src, true)
end)

CreateThread(function()
    while true do
        Wait(15000)
        if drop then
            if now() >= drop.expiresAt then
                S.broadcast('SUPPLY DROP', 'The supply crate was never secured and has been lost to the tide.', { 147, 163, 171 })
                endDrop(nil)
            end
        elseif now() >= nextAt and #GetPlayers() >= D.minPlayers then
            spawnDrop()
        end
    end
end)

AddEventHandler('playerDropped', function()
    lastScan[source] = nil
    if drop then drop.claimers[source] = nil end
end)

RegisterCommand('supplydrop', function(source)
    if source > 0 and not S.hasPermission(source, FBRP.Ace.announce) then
        return notify(source, 'You are not allowed to call supply drops.', 'error')
    end
    if drop then
        local message = 'A supply drop is already active.'
        if source > 0 then notify(source, message, 'info') else print(message) end
        return
    end
    spawnDrop()
    if source > 0 then FBRP.DB.audit(sessions[source] and (sessions[source].discord or sessions[source].license) or source, 'pastime.drop.call', drop and drop.label or '', {}) end
end, false)

PS.sections.drops = function(src)
    local s = sessions[src]
    local won = tonumber(MySQL.scalar.await('SELECT drops_won FROM pastime_profiles WHERE license=?', { s.license })) or 0
    return {
        active = drop and { region = drop.region, seconds = math.max(0, math.floor((drop.expiresAt - now()) / 1000)) } or nil,
        nextMinutes = (not drop) and math.max(1, math.ceil((nextAt - now()) / 60000)) or nil,
        won = won, rep = D.rep,
    }
end
