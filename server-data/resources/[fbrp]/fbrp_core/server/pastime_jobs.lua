-- Side jobs: rideshare, courier, bike messenger and air charter. The server
-- chooses both legs, then checks the vehicle type, position and elapsed time
-- before it pays anything.

local S = FBRP.Server
local P = FBRP.Pastimes
local PS = FBRP.PastimeServer
local J = P.jobs
local sessions, now, notify = S.sessions, S.now, S.notify

local ORDER = { 'rideshare', 'courier', 'messenger', 'charter' }
local CENTER = vector3(195.0, -935.0, 30.69)   -- Legion Square: bike messengers stay downtown
local CENTRAL_RANGE = 3300.0

local active = {}   -- source -> job state
local chain = {}    -- source -> { count, lastAt }
local lastEnd = {}  -- source -> ms

local function flat(a, b)
    local dx, dy = (a.x or a[1]) - (b.x or b[1]), (a.y or a[2]) - (b.y or b[2])
    return math.sqrt(dx * dx + dy * dy)
end

local function inCentral(point)
    return flat(point, CENTER) <= CENTRAL_RANGE
end

local function vehicleInfo(src)
    local ped = GetPlayerPed(src)
    if ped <= 0 then return nil end
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 then return nil end
    local speed = 0.0
    local okSpeed, velocity = pcall(GetEntityVelocity, vehicle)
    if okSpeed and velocity then speed = #velocity end
    local okType, kind = pcall(GetVehicleType, vehicle)
    return vehicle, GetPedInVehicleSeat(vehicle, -1) == ped, okType and kind or nil, speed
end

local function typeAllowed(def, kind)
    if kind == nil or kind == '' then return true end
    return def.vehicles[kind] == true
end

local function poolFor(def)
    local pool = {}
    for _, point in ipairs(J.pools[def.pool]) do
        if not def.central or inCentral(point) then pool[#pool + 1] = point end
    end
    return pool
end

local function pickDropoff(def, pickup, kind)
    local fits, fallback = {}, {}
    for _, point in ipairs(poolFor(def)) do
        local usable = not (point.heliOnly and kind == 'plane')
        local distance = flat(pickup, point)
        if usable and distance > 80.0 then
            if distance >= def.minLeg and distance <= def.maxLeg then fits[#fits + 1] = point end
            fallback[#fallback + 1] = { point = point, distance = distance }
        end
    end
    if #fits > 0 then return fits[math.random(#fits)] end
    table.sort(fallback, function(a, b) return a.distance > b.distance end)
    return fallback[1] and fallback[1].point or nil
end

local function describe(point, def)
    return { x = point.x + 0.0, y = point.y + 0.0, z = point.z + 0.0, label = point.label, radius = (point.radius or J.pickupRadius) + 0.0 }
end

local function finish(src, reason)
    local job = active[src]
    active[src] = nil
    lastEnd[src] = now()
    if job and reason then TriggerClientEvent('fbrp:pastimes:job:cancel', src, reason) end
end

RegisterNetEvent('fbrp:pastimes:job:start', function(rawType)
    local src = source
    local s = sessions[src]
    local key = tostring(rawType or '')
    local def = J.types[key]
    if not s or not def then return end
    local blocked = PS.blocked(src)
    if blocked then return notify(src, blocked, 'error') end
    if active[src] then return notify(src, 'Finish or cancel your current job first.', 'error') end
    if lastEnd[src] and now() - lastEnd[src] < J.cooldownSeconds * 1000 then
        return notify(src, 'Give it a moment before taking another job.', 'info')
    end
    local ped = GetPlayerPed(src)
    if ped <= 0 then return end
    local here = GetEntityCoords(ped)
    local ranked = {}
    for _, point in ipairs(poolFor(def)) do
        ranked[#ranked + 1] = { point = point, distance = flat(here, point) }
    end
    if #ranked == 0 then return end
    table.sort(ranked, function(a, b) return a.distance < b.distance end)
    local choice = ranked[math.random(math.min(3, #ranked))]
    local seconds = math.floor(choice.distance / def.parSpeed * 2.5 + 240)
    local job = {
        type = key, stage = 1, pickup = choice.point, startedAt = now(),
        deadline = now() + seconds * 1000,
    }
    active[src] = job
    TriggerClientEvent('fbrp:pastimes:job:begin', src, {
        type = key, label = def.label, stage = 1, target = describe(choice.point, def),
        seconds = seconds, passenger = def.passenger == true, air = def.air == true,
        bicycle = def.bicycleOnly == true, requirement = def.requirement,
        pedModels = def.pedModels, vehicles = def.vehicles,
    })
    notify(src, ('%s started. Head to %s.'):format(def.label, choice.point.label), 'success')
end)

RegisterNetEvent('fbrp:pastimes:job:pickup', function()
    local src = source
    local job = active[src]
    if not job or job.stage ~= 1 then return end
    local def = J.types[job.type]
    local ped = GetPlayerPed(src)
    if ped <= 0 then return end
    local radius = (job.pickup.radius or J.pickupRadius) + 10.0
    if flat(GetEntityCoords(ped), job.pickup) > radius then
        return notify(src, 'You are not at the pickup yet.', 'error')
    end
    local vehicle, driver, kind = vehicleInfo(src)
    if not vehicle or not driver then return notify(src, 'You need to be driving. ' .. def.requirement .. '.', 'error') end
    if not typeAllowed(def, kind) then return notify(src, 'Wrong vehicle. ' .. def.requirement .. '.', 'error') end
    local drop = pickDropoff(def, job.pickup, kind)
    if not drop then return finish(src, 'No destination is available right now.') end
    job.stage = 2
    job.dropoff = drop
    job.leg = flat(job.pickup, drop)
    job.stageAt = now()
    job.deadline = now() + math.floor(job.leg / def.parSpeed * 2.2 + 150) * 1000
    TriggerClientEvent('fbrp:pastimes:job:stage2', src, {
        type = job.type, label = def.label, stage = 2, target = describe(drop, def),
        seconds = math.floor((job.deadline - now()) / 1000), meters = math.floor(job.leg),
    })
    notify(src, ('Picked up. Deliver to %s.'):format(drop.label), 'info')
end)

RegisterNetEvent('fbrp:pastimes:job:deliver', function(rawComfort)
    local src = source
    local job = active[src]
    local s = sessions[src]
    if not job or job.stage ~= 2 or not s then return end
    local def = J.types[job.type]
    local ped = GetPlayerPed(src)
    if ped <= 0 then return end
    local radius = (job.dropoff.radius or J.pickupRadius) + 12.0
    if flat(GetEntityCoords(ped), job.dropoff) > radius then
        return notify(src, 'You are not at the drop-off yet.', 'error')
    end
    local vehicle, driver, kind, speed = vehicleInfo(src)
    if not vehicle or not driver or not typeAllowed(def, kind) then
        return notify(src, 'Arrive in the same kind of vehicle you started with.', 'error')
    end
    if def.air and speed > 28.0 then return notify(src, 'Slow down and put it on the pad.', 'error') end

    local elapsed = now() - job.stageAt
    local ceiling = def.air and J.maxSpeed.air or (def.bicycleOnly and J.maxSpeed.bike or J.maxSpeed.ground)
    if elapsed < (job.leg / ceiling) * 1000 then
        finish(src, 'That leg was completed too quickly to validate.')
        return FBRP.DB.audit(s.discord or s.license, 'pastime.job.rejected', job.type, { leg = job.leg, elapsed = elapsed })
    end

    local km = job.leg / 1000.0
    local base = def.baseRep + math.floor(def.perKm * km + 0.5)
    local seconds = elapsed / 1000.0
    local par = job.leg / def.parSpeed
    local timePct = seconds <= par and 40 or (seconds <= par * 1.5 and 20 or 0)
    local stars = 0
    if def.passenger then stars = math.max(0, math.min(3, math.floor(tonumber(rawComfort) or 3))) end
    local tipPct = stars * 5

    local streak = chain[src]
    local count = (streak and now() - streak.lastAt <= J.chainWindowSeconds * 1000) and streak.count + 1 or 1
    chain[src] = { count = count, lastAt = now() }
    local chainPct = math.min(J.chainMaxPercent, (count - 1) * J.chainBonusPercent)

    local total = math.floor(base * (1 + (timePct + tipPct + chainPct) / 100.0) + 0.5)
    local pace = math.max(1, math.floor(elapsed / math.max(0.1, km)))

    PS.ensure(src)
    MySQL.prepare.await([[
        INSERT INTO pastime_job_stats(license,job_id,completions,best_ms,rep_total,meters_total,updated_at) VALUES(?,?,1,?,?,?,?)
        ON DUPLICATE KEY UPDATE completions=completions+1,best_ms=LEAST(COALESCE(best_ms,VALUES(best_ms)),VALUES(best_ms)),
          rep_total=rep_total+VALUES(rep_total),meters_total=meters_total+VALUES(meters_total),updated_at=VALUES(updated_at)
    ]], { s.license, job.type, pace, total, math.floor(job.leg), now() })
    PS.bump(src, 'jobs_done', 1)
    PS.log(s.license, 'job', job.type, 1)
    FBRP.DB.audit(s.discord or s.license, 'pastime.job', job.type, { meters = math.floor(job.leg), seconds = seconds, rep = total })
    active[src] = nil
    lastEnd[src] = now()
    PS.award(src, total, 'job')
    TriggerClientEvent('fbrp:pastimes:job:done', src, {
        label = def.label, rep = total, meters = math.floor(job.leg), seconds = math.floor(seconds),
        timePct = timePct, tipPct = tipPct, chainPct = chainPct, streak = count, stars = stars,
    })
    PS.checkAchievements(src, true)
end)

RegisterNetEvent('fbrp:pastimes:job:cancel', function()
    local src = source
    if active[src] then
        finish(src, 'Job cancelled.')
    end
end)

CreateThread(function()
    while true do
        Wait(3000)
        local list = {}
        for src in pairs(active) do list[#list + 1] = src end
        for _, src in ipairs(list) do
            local job = active[src]
            if job then
                if GetPlayerPing(src) <= 0 then
                    active[src] = nil
                elseif now() > job.deadline then
                    finish(src, 'You ran out of time.')
                elseif PS.blocked(src) then
                    finish(src, 'Job cancelled.')
                end
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    active[source] = nil
    chain[source] = nil
    lastEnd[source] = nil
end)

PS.sections.jobs = function(src)
    local s = sessions[src]
    local rows = MySQL.query.await('SELECT job_id,completions,best_ms,rep_total,meters_total FROM pastime_job_stats WHERE license=?', { s.license })
    local stats = {}
    for _, row in ipairs(rows) do stats[row.job_id] = row end
    local list = {}
    for _, key in ipairs(ORDER) do
        local def = J.types[key]
        local row = stats[key] or {}
        list[#list + 1] = {
            id = key, label = def.label, icon = def.icon, description = def.description, requirement = def.requirement,
            completions = tonumber(row.completions) or 0, rep = tonumber(row.rep_total) or 0,
            km = math.floor((tonumber(row.meters_total) or 0) / 100) / 10,
            bestPace = tonumber(row.best_ms) or nil,
            baseRep = def.baseRep, perKm = def.perKm,
        }
    end
    local job = active[src]
    local streak = chain[src]
    return {
        types = list,
        active = job and { type = job.type, stage = job.stage } or nil,
        streak = streak and now() - streak.lastAt <= J.chainWindowSeconds * 1000 and streak.count or 0,
    }
end
