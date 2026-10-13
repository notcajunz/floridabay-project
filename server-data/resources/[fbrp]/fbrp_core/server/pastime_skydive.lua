-- Skydiving challenges. The server sends the player to the platform (the
-- client lands them once collision has streamed in), hands out a parachute, and the landing is measured against the
-- target using the player's server-side position.

local S = FBRP.Server
local P = FBRP.Pastimes
local PS = FBRP.PastimeServer
local K = P.skydive
local sessions, now, notify = S.sessions, S.now, S.notify

local runs = {}      -- source -> { id, startedAt }
local cooldown = {}  -- source -> ms

local function flat(a, b)
    local dx, dy = a.x - b.x, a.y - b.y
    return math.sqrt(dx * dx + dy * dy)
end

local function bandFor(distance)
    for _, band in ipairs(K.bands) do
        if distance <= band.max then return band end
    end
    return nil
end

RegisterNetEvent('fbrp:pastimes:skydive:start', function(rawId)
    local src = source
    local s = sessions[src]
    local jump = FBRP.FindSkydive(tostring(rawId or ''))
    if not s or not jump then return end
    local blocked = PS.blocked(src)
    if blocked then return notify(src, blocked, 'error') end
    if runs[src] then return notify(src, 'Finish or cancel your current jump first.', 'error') end
    if cooldown[src] and now() - cooldown[src] < K.cooldownSeconds * 1000 then
        return notify(src, 'Pack your parachute first. Try again in a moment.', 'info')
    end
    local ped = GetPlayerPed(src)
    if ped <= 0 then return end
    if GetVehiclePedIsIn(ped, false) ~= 0 then return notify(src, 'Get out of the vehicle first.', 'error') end
    -- The parachute is handed out client side. Tell the anticheat it is expected.
    pcall(function() exports.corevia_ac:recordWeaponGrant(src, GetHashKey('GADGET_PARACHUTE')) end)
    runs[src] = { id = jump.id, startedAt = now() }
    -- The event name carries "teleport" and the payload carries coordinates, which is how the
    -- anticheat bridge learns that this move is ours. The client waits for collision before it lands.
    TriggerClientEvent('fbrp:pastimes:skydive:teleportStart', src, {
        id = jump.id, label = jump.label,
        start = { x = jump.start.x + 0.0, y = jump.start.y + 0.0, z = jump.start.z + 0.0 },
        target = { x = jump.target.x + 0.0, y = jump.target.y + 0.0, z = jump.target.z + 0.0 },
        bullseye = K.bands[1].max, radius = K.bands[#K.bands].max,
    })
    notify(src, ('%s: jump, open your chute and land on the marker.'):format(jump.label), 'success')
end)

RegisterNetEvent('fbrp:pastimes:skydive:landed', function()
    local src = source
    local s = sessions[src]
    local run = runs[src]
    if not s or not run then return end
    local jump = FBRP.FindSkydive(run.id)
    local ped = GetPlayerPed(src)
    if not jump or ped <= 0 then return end
    local elapsed = (now() - run.startedAt) / 1000.0
    if elapsed < K.minFlightSeconds then return end
    local coords = GetEntityCoords(ped)
    if jump.start.z - coords.z < 20.0 then return end   -- never left the platform

    runs[src] = nil
    cooldown[src] = now()
    local distance = flat(coords, jump.target)
    local band = distance <= K.maxLandingRange and bandFor(distance) or nil
    local rep = band and band.rep or K.offTargetRep
    local label = band and band.label or 'Off target'

    PS.ensure(src)
    local cm = math.min(4000000, math.floor(distance * 100 + 0.5))
    local before = tonumber(MySQL.scalar.await('SELECT MIN(best_cm) FROM pastime_skydive_records WHERE jump_id=?', { jump.id }))
    local mine = tonumber(MySQL.scalar.await('SELECT best_cm FROM pastime_skydive_records WHERE license=? AND jump_id=?', { s.license, jump.id }))
    MySQL.prepare.await([[
        INSERT INTO pastime_skydive_records(license,jump_id,name,best_cm,attempts,updated_at) VALUES(?,?,?,?,1,?)
        ON DUPLICATE KEY UPDATE name=VALUES(name),best_cm=LEAST(best_cm,VALUES(best_cm)),attempts=attempts+1,updated_at=VALUES(updated_at)
    ]], { s.license, jump.id, S.displayName(src), cm, now() })
    local personalBest = not mine or cm < mine
    local serverRecord = band ~= nil and (not before or cm < before)

    PS.bump(src, 'skydives', 1)
    if band and band.label == K.bands[1].label then PS.bump(src, 'bullseyes', 1) end
    PS.log(s.license, 'skydive', jump.id, 1)
    FBRP.DB.audit(s.discord or s.license, 'pastime.skydive', jump.id, { meters = distance, band = label })
    PS.award(src, rep, 'skydive')
    TriggerClientEvent('fbrp:pastimes:skydive:result', src, {
        id = jump.id, label = jump.label, band = label, meters = math.floor(distance * 10 + 0.5) / 10,
        rep = rep, personalBest = personalBest and band ~= nil, serverRecord = serverRecord, seconds = math.floor(elapsed),
    })
    if serverRecord then
        S.broadcast('SKYDIVING', ('%s landed %.1f m from the %s target. New server record!'):format(S.displayName(src), distance, jump.label), { 111, 168, 255 })
    end
    PS.checkAchievements(src, true)
end)

RegisterNetEvent('fbrp:pastimes:skydive:abort', function()
    runs[source] = nil
end)

CreateThread(function()
    while true do
        Wait(5000)
        local list = {}
        for src in pairs(runs) do list[#list + 1] = src end
        for _, src in ipairs(list) do
            local run = runs[src]
            if run then
                if GetPlayerPing(src) <= 0 then
                    runs[src] = nil
                elseif (now() - run.startedAt) / 1000.0 > K.maxFlightSeconds then
                    runs[src] = nil
                    TriggerClientEvent('fbrp:pastimes:skydive:expired', src)
                end
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    runs[source] = nil
    cooldown[source] = nil
end)

PS.sections.skydive = function(src)
    local s = sessions[src]
    local mine = {}
    for _, row in ipairs(MySQL.query.await('SELECT jump_id,best_cm,attempts FROM pastime_skydive_records WHERE license=?', { s.license })) do
        mine[row.jump_id] = row
    end
    local records = {}
    for _, row in ipairs(MySQL.query.await([[
        SELECT r.jump_id,r.name,r.best_cm FROM pastime_skydive_records r
        JOIN (SELECT jump_id,MIN(best_cm) best FROM pastime_skydive_records GROUP BY jump_id) m
          ON m.jump_id=r.jump_id AND m.best=r.best_cm
    ]])) do
        records[row.jump_id] = row
    end
    local list = {}
    for _, jump in ipairs(K.jumps) do
        local row, rec = mine[jump.id], records[jump.id]
        list[#list + 1] = {
            id = jump.id, label = jump.label, difficulty = jump.difficulty, description = jump.description,
            attempts = row and tonumber(row.attempts) or 0,
            best = row and (tonumber(row.best_cm) or 0) / 100.0 or nil,
            record = rec and { name = rec.name, meters = (tonumber(rec.best_cm) or 0) / 100.0 } or nil,
        }
    end
    return { jumps = list, active = runs[src] and runs[src].id or nil }
end
