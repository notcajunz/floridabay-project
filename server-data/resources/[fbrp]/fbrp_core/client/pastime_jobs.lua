-- Side jobs: rideshare, courier, bike messenger and air charter.

local PC = FBRP.PastimeClient
local notify = PC.notify

local job = nil   -- { info, stage, target, token, deadlineAt, passenger, seat, hits, bodyHealth, nextTry }

local function clearPassenger(instant)
    if not job or not job.passenger then return end
    local ped = job.passenger
    job.passenger = nil
    if not DoesEntityExist(ped) then return end
    if instant then
        DeleteEntity(ped)
        return
    end
    CreateThread(function()
        TaskWanderStandard(ped, 10.0, 10)
        Wait(9000)
        if DoesEntityExist(ped) then DeleteEntity(ped) end
    end)
end

local function stopJob(reason, tone)
    if not job then return end
    clearPassenger(false)
    job = nil
    PC.clearRoute()
    PC.setBanner(nil)
    if reason then notify(reason, tone or 'info') end
end

local function vehicleFor(info)
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= ped then return nil, 'Get in the driver seat. ' .. (info.requirement or '') end
    local class = GetVehicleClass(vehicle)
    if info.bicycle then
        if class ~= 13 then return nil, 'This job needs a bicycle.' end
    elseif info.air then
        if class ~= 15 and class ~= 16 then return nil, 'This job needs a helicopter or plane.' end
    else
        if class == 13 or class == 14 or class == 15 or class == 16 or class == 21 then return nil, 'Wrong vehicle. ' .. (info.requirement or '') end
        if info.passenger and class == 8 then return nil, 'You need a car to carry a passenger.' end
    end
    return vehicle
end

local function freeSeat(vehicle)
    local seats = GetVehicleModelNumberOfSeats(GetEntityModel(vehicle))
    for seat = 0, math.max(0, seats - 2) do
        if IsVehicleSeatFree(vehicle, seat) then return seat end
    end
    return nil
end

local function spawnPassenger(vehicle)
    local names = job.info.pedModels or {}
    if #names == 0 then return nil end
    local seat = freeSeat(vehicle)
    if not seat then return nil, 'Free up a passenger seat first.' end
    local hash = joaat(names[math.random(#names)])
    if not IsModelInCdimage(hash) then return nil end
    RequestModel(hash)
    local untilAt = GetGameTimer() + 3000
    while not HasModelLoaded(hash) and GetGameTimer() < untilAt do Wait(20) end
    if not HasModelLoaded(hash) then return nil end
    local at = GetOffsetFromEntityInWorldCoords(vehicle, 3.2, 3.5, 0.0)
    local ped = CreatePed(4, hash, at.x, at.y, PC.groundZ(at.x, at.y, at.z), GetEntityHeading(vehicle), false, true)
    SetModelAsNoLongerNeeded(hash)
    if ped == 0 then return nil end
    SetEntityAsMissionEntity(ped, true, true)
    SetBlockingOfNonTemporaryEvents(ped, true)
    SetPedKeepTask(ped, true)
    SetPedFleeAttributes(ped, 0, false)
    TaskEnterVehicle(ped, vehicle, 15000, seat, 1.0, 1, 0)
    return ped, nil, seat
end

local function board(vehicle)
    local ped, problem, seat = spawnPassenger(vehicle)
    if not ped then
        notify(problem or 'Your passenger could not be found. Try again.', 'error')
        return false
    end
    job.passenger, job.seat = ped, seat
    local untilAt = GetGameTimer() + 14000
    while job and GetGameTimer() < untilAt do
        if not DoesEntityExist(ped) then return false end
        if IsPedInVehicle(ped, vehicle, false) then return true end
        PC.setBanner({ title = job.info.label, rows = { 'Waiting for your passenger to get in…' } })
        Wait(150)
    end
    if job and DoesEntityExist(ped) then SetPedIntoVehicle(ped, vehicle, seat) end
    return job ~= nil
end

local function refreshBanner(distance)
    if not job then return end
    local left = math.max(0, (job.deadlineAt - GetGameTimer()) / 1000)
    local verb = job.stage == 1 and 'Pickup' or 'Drop-off'
    PC.setBanner({
        title = job.info.label,
        rows = {
            ('%s: %s'):format(verb, job.target.label or 'marked location'),
            ('Distance: %s'):format(PC.formatDistance(distance)),
            ('Time left: %s'):format(PC.formatTime(left)),
            job.info.air and 'Land inside the marker to finish.' or 'Stop inside the marker to finish.',
        },
    })
end

local function comfortStars()
    return math.max(0, 3 - (job and job.hits or 0))
end

local function run()
    local token = job.token
    CreateThread(function()
        while job and job.token == token do
            local ped = PlayerPedId()
            local coords = GetEntityCoords(ped)
            local target = job.target
            local distance = PC.flat(coords, target)
            local info = job.info
            refreshBanner(distance)

            if distance < 300.0 then
                local z = info.air and target.z or PC.groundZ(target.x, target.y, target.z)
                local size = math.min(target.radius, 40.0)
                DrawMarker(1, target.x, target.y, z - 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, size * 2.0, size * 2.0, 3.0, 63, 227, 210, 90, false, false, 2, false, nil, nil, false)
                DrawMarker(2, target.x, target.y, z + 2.5, 0.0, 0.0, 0.0, 0.0, 180.0, 0.0, 1.4, 1.4, 1.4, 255, 181, 71, 220, true, true, 2, false, nil, nil, false)
            end

            -- Comfort: heavy hits while a passenger rides along cost them stars.
            if job.stage == 2 and info.passenger then
                local vehicle = GetVehiclePedIsIn(ped, false)
                if vehicle ~= 0 then
                    local body = GetVehicleBodyHealth(vehicle)
                    if job.bodyHealth and body < job.bodyHealth - 60.0 then job.hits = (job.hits or 0) + 1 end
                    job.bodyHealth = body
                end
            end

            if distance <= target.radius and GetGameTimer() >= (job.nextTry or 0) then
                local vehicle, problem = vehicleFor(info)
                if not vehicle then
                    PC.setBanner({ title = info.label, rows = { problem } })
                else
                    local slow = GetEntitySpeed(vehicle) < (info.air and 6.0 or 3.0)
                    local grounded = not info.air or (not IsEntityInAir(vehicle) and GetEntityHeightAboveGround(vehicle) < 6.0)
                    if slow and grounded then
                        job.nextTry = GetGameTimer() + 4000
                        if job.stage == 1 then
                            local ready = true
                            if info.passenger then ready = board(vehicle) end
                            if ready and job and job.token == token then
                                if not info.passenger then
                                    PC.setBanner({ title = info.label, rows = { 'Loading the parcel…' } })
                                    Wait(1800)
                                end
                                TriggerServerEvent('fbrp:pastimes:job:pickup')
                            end
                        else
                            if info.passenger and job.passenger and DoesEntityExist(job.passenger) then
                                TaskLeaveVehicle(job.passenger, vehicle, 0)
                                Wait(1500)
                            end
                            TriggerServerEvent('fbrp:pastimes:job:deliver', comfortStars())
                        end
                    end
                end
            end
            Wait(distance < 150.0 and 0 or 250)
        end
    end)
end

RegisterNetEvent('fbrp:pastimes:job:begin', function(info)
    if job then stopJob(nil) end
    FBRP.CloseMenu()
    job = {
        info = info, stage = 1, target = info.target, token = GetGameTimer(),
        deadlineAt = GetGameTimer() + (tonumber(info.seconds) or 300) * 1000, hits = 0,
    }
    PC.setRoute(info.target.x, info.target.y, info.target.z, info.target.label or 'Pickup', info.air and 307 or 280, 5)
    run()
end)

RegisterNetEvent('fbrp:pastimes:job:stage2', function(info)
    if not job then return end
    job.stage = 2
    job.target = info.target
    job.deadlineAt = GetGameTimer() + (tonumber(info.seconds) or 300) * 1000
    job.nextTry = GetGameTimer() + 1500
    job.hits, job.bodyHealth = 0, nil
    PC.setRoute(info.target.x, info.target.y, info.target.z, info.target.label or 'Drop-off', job.info.air and 307 or 280, 2)
    PlaySoundFrontend(-1, 'CHECKPOINT_NORMAL', 'HUD_MINI_GAME_SOUNDSET', true)
    notify(('Heading to %s · %s.'):format(info.target.label or 'the drop-off', PC.formatDistance(tonumber(info.meters) or 0)), 'info')
end)

RegisterNetEvent('fbrp:pastimes:job:done', function(result)
    PlaySoundFrontend(-1, 'Mission_Pass_Notify', 'DLC_HEISTS_GENERAL_FRONTEND_SOUNDS', true)
    local bits = {}
    if result.timePct and result.timePct > 0 then bits[#bits + 1] = ('+%d%% speed'):format(result.timePct) end
    if result.tipPct and result.tipPct > 0 then bits[#bits + 1] = ('+%d%% tip'):format(result.tipPct) end
    if result.chainPct and result.chainPct > 0 then bits[#bits + 1] = ('+%d%% streak x%d'):format(result.chainPct, result.streak or 1) end
    notify(('%s complete: %s in %s · +%d Bay Rep%s'):format(
        result.label, PC.formatDistance(tonumber(result.meters) or 0), PC.formatTime(tonumber(result.seconds) or 0),
        tonumber(result.rep) or 0, #bits > 0 and (' (' .. table.concat(bits, ', ') .. ')') or ''), 'success')
    stopJob(nil)
end)

RegisterNetEvent('fbrp:pastimes:job:cancel', function(reason)
    stopJob(reason or 'Job cancelled.', 'info')
end)

PC.actions.job = function(data)
    local reason = PC.busy()
    if reason then return notify(reason, 'error') end
    FBRP.CloseMenu()
    TriggerServerEvent('fbrp:pastimes:job:start', tostring(data.id or ''))
end

PC.actions.jobcancel = function()
    FBRP.CloseMenu()
    if job then TriggerServerEvent('fbrp:pastimes:job:cancel') end
end

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    if job and job.passenger and DoesEntityExist(job.passenger) then DeleteEntity(job.passenger) end
end)
