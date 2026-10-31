local J = FBRP.Justice
local CS = FBRP.CommunityService
local prison = J.prison

local jail = nil          -- latest info from the server plus the saved outfit
local outfit = nil
local job = nil           -- assigned prison job step { id,label,step,steps,spot,holdMs,scenario,prompt,stepLabel }
local jobGround = nil     -- ground-snapped marker position for the current step
local jobBlip = nil
local task = nil          -- 'work' | 'escape' | 'pickup' while a timed job is running
local bodycam = false
local lastLeash = 0

local service = nil       -- live community service info
local rubbish = {}        -- { entity, x, y, z }
local serviceBlips = {}

local function ui(message) SendNUIMessage(message) end
local function notify(message, tone) lib.notify({ description = message, type = tone or 'info' }) end

local function help(text)
    BeginTextCommandDisplayHelp('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayHelp(0, false, false, -1)
end

local function groundAt(x, y, z)
    for _, offset in ipairs({ 2.0, 10.0, 30.0 }) do
        local found, ground = GetGroundZFor_3dCoord(x + 0.0, y + 0.0, z + offset, false)
        if found then return ground end
    end
    return z
end

local function teleport(coords, snapToGround)
    local ped = PlayerPedId()
    DoScreenFadeOut(400)
    local untilAt = GetGameTimer() + 1500
    while not IsScreenFadedOut() and GetGameTimer() < untilAt do Wait(10) end
    if IsPedInAnyVehicle(ped, false) then ClearPedTasksImmediately(ped) end
    local x, y, z = coords.x + 0.0, coords.y + 0.0, coords.z + 0.0
    RequestCollisionAtCoord(x, y, z)
    SetEntityCoords(ped, x, y, z, false, false, false, false)
    if coords.w then SetEntityHeading(ped, coords.w + 0.0) end
    untilAt = GetGameTimer() + 4000
    while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer() < untilAt do
        RequestCollisionAtCoord(x, y, z)
        Wait(25)
    end
    if snapToGround then
        for _ = 1, 20 do
            local found, ground = GetGroundZFor_3dCoord(x, y, z + 50.0, false)
            if found then SetEntityCoords(ped, x, y, ground + 0.5, false, false, false, false) break end
            Wait(50)
        end
    end
    Wait(250)
    DoScreenFadeIn(600)
end

-- ─────────────────────────── prison outfit ───────────────────────────

local OUTFIT_COMPONENTS = { 1, 3, 4, 6, 8, 11 }
local JUMPSUIT = {
    [joaat('mp_m_freemode_01')] = { [3]={0,0}, [4]={3,7}, [6]={12,12}, [8]={15,0}, [11]={146,0}, [1]={0,0} },
    [joaat('mp_f_freemode_01')] = { [3]={2,0}, [4]={3,15}, [6]={66,5}, [8]={3,0}, [11]={38,3}, [1]={0,0} },
}

local function saveOutfit(ped)
    local saved = { model=GetEntityModel(ped), components={}, hat={ GetPedPropIndex(ped, 0), GetPedPropTextureIndex(ped, 0) } }
    for _, component in ipairs(OUTFIT_COMPONENTS) do
        saved.components[component] = { GetPedDrawableVariation(ped, component), GetPedTextureVariation(ped, component) }
    end
    return saved
end

local function wearJumpsuit(ped)
    local suit = JUMPSUIT[GetEntityModel(ped)]
    if not suit then return end
    TriggerEvent('fbrp:appearanceChanged')
    for component, value in pairs(suit) do SetPedComponentVariation(ped, component, value[1], value[2], 0) end
    ClearPedProp(ped, 0)
end

local function restoreOutfit(ped, saved)
    if not saved or saved.model ~= GetEntityModel(ped) then return end
    TriggerEvent('fbrp:appearanceChanged')
    for component, value in pairs(saved.components) do SetPedComponentVariation(ped, component, value[1], value[2], 0) end
    if saved.hat[1] and saved.hat[1] >= 0 then SetPedPropIndex(ped, 0, saved.hat[1], saved.hat[2], true) end
end

-- ─────────────────────────── prison ───────────────────────────

local function clearJobBlip()
    if jobBlip and DoesBlipExist(jobBlip) then RemoveBlip(jobBlip) end
    jobBlip = nil
end

local function jailTaskText()
    if job then return ('%s · step %d/%d - follow the marker and press E.'):format(job.stepLabel or job.label, job.step, job.steps) end
    return 'Type /prisonwork to pick a job. Good behaviour shortens your time.'
end

local function pushJailHud()
    if not jail then return ui({ type='jail', active=false }) end
    ui({ type='jail', active=true, remaining=jail.remaining, months=jail.months, total=jail.total, charges=jail.charges, prison=jail.prison,
         behaviour=jail.behaviour, tier=jail.tier, mult=jail.mult, reduced=jail.reduced, maxReduction=jail.maxReduction, goodTime=jail.goodTime,
         jobsDone=jail.jobsDone, task=jailTaskText(), job=job })
end

local function setJob(view)
    clearJobBlip()
    job = view
    jobGround = nil
    if job and job.spot then
        jobGround = vector3(job.spot.x, job.spot.y, groundAt(job.spot.x, job.spot.y, job.spot.z))
        jobBlip = AddBlipForCoord(job.spot.x, job.spot.y, job.spot.z)
        SetBlipSprite(jobBlip, 354)
        SetBlipColour(jobBlip, 5)
        SetBlipRoute(jobBlip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString(job.label)
        EndTextCommandSetBlipName(jobBlip)
    end
    pushJailHud()
end

local function cancelTask(reason)
    if not task then return end
    if task == 'escape' then TriggerServerEvent('fbrp:jail:escapeCancel') end
    task = nil
    ClearPedTasks(PlayerPedId())
    ui({ type='progress', cancel=true })
    if reason then notify(reason, 'error') end
end

-- Runs a timed job: stay near the spot, X cancels.
local function runTask(kind, spot, ms, scenario, label, onDone, stillValid)
    if task then return end
    task = kind
    local ped = PlayerPedId()
    if scenario then TaskStartScenarioInPlace(ped, scenario, 0, true) end
    ui({ type='progress', label=label, ms=ms })
    local endsAt = GetGameTimer() + ms
    CreateThread(function()
        while task == kind and GetGameTimer() < endsAt do
            local here = GetEntityCoords(PlayerPedId())
            if #(here - vector3(spot.x, spot.y, spot.z)) > 3.0 then return cancelTask('You moved away.') end
            if IsControlJustReleased(0, 73) then return cancelTask('Stopped.') end
            if stillValid and not stillValid() then return cancelTask() end
            Wait(0)
        end
        if task ~= kind then return end
        task = nil
        ClearPedTasks(PlayerPedId())
        onDone()
    end)
end

local function jailLoop()
    CreateThread(function()
        local lastStrip = 0
        while jail do
            local ped = PlayerPedId()
            local here = GetEntityCoords(ped)
            DisablePlayerFiring(PlayerId(), true)
            DisableControlAction(0, 140, true) -- melee
            DisableControlAction(0, 141, true)
            DisableControlAction(0, 142, true)
            if GetGameTimer() - lastStrip > 2000 then
                lastStrip = GetGameTimer()
                if GetSelectedPedWeapon(ped) ~= joaat('WEAPON_UNARMED') then RemoveAllPedWeapons(ped, true) end
            end
            if not task and #(here - prison.center) > prison.leashRadius and GetGameTimer() - lastLeash > 4000 then
                lastLeash = GetGameTimer()
                TriggerServerEvent('fbrp:jail:leash')
            end
            if job and jobGround and not task then
                local distance = #(here - jobGround)
                if distance < 45.0 then
                    DrawMarker(1, jobGround.x, jobGround.y, jobGround.z - 0.05, 0, 0, 0, 0, 0, 0, 1.1, 1.1, 0.5, 63, 227, 210, 110, false, false, 2, false, nil, nil, false)
                    DrawMarker(20, jobGround.x, jobGround.y, jobGround.z + 1.15, 0, 0, 0, 0, 180.0, 0, 0.45, 0.45, 0.45, 255, 181, 71, 190, true, true, 2, false, nil, nil, false)
                end
                if distance < 1.8 then
                    help(('Press ~INPUT_CONTEXT~ to %s (%s).'):format(job.prompt or 'work', job.stepLabel or job.label))
                    if IsControlJustReleased(0, 38) then
                        local current = job
                        runTask('work', jobGround, current.holdMs, current.scenario, current.stepLabel or current.label, function()
                            TriggerServerEvent('fbrp:jail:jobStep')
                        end, function() return job == current and jail ~= nil end)
                    end
                end
            end
            if not task and #(here - prison.escapeSpot) < 1.4 then
                help('Press ~INPUT_CONTEXT~ to work at the loose fence panel.')
                if IsControlJustReleased(0, 38) then TriggerServerEvent('fbrp:jail:escapeStart') end
            end
            Wait(0)
        end
    end)
end

RegisterNetEvent('fbrp:jail:enter', function(spawn, info)
    local ped = PlayerPedId()
    TriggerEvent('fbrp:cancelActivities')
    TriggerEvent('fbrp:restraints:clear')
    local wasJailed = jail ~= nil
    jail = info or {}
    if not wasJailed then
        outfit = saveOutfit(ped)
        jailLoop()
    end
    setJob(jail.job)
    RemoveAllPedWeapons(ped, true)
    teleport(spawn)
    wearJumpsuit(PlayerPedId())
    pushJailHud()
    PlaySoundFrontend(-1, 'Bed', 'WastedSounds', true)
end)

RegisterNetEvent('fbrp:jail:update', function(info)
    if not jail or type(info) ~= 'table' then return end
    jail = info
    pushJailHud()
end)

RegisterNetEvent('fbrp:jail:job', function(view)
    if not jail then return end
    cancelTask()
    setJob(view)
    if view then PlaySoundFrontend(-1, 'NAV_UP_DOWN', 'HUD_FRONTEND_DEFAULT_SOUNDSET', true) end
end)

RegisterNetEvent('fbrp:jail:board', function(payload)
    if not jail then return end
    FBRP.OpenMenu('prisonjobs', payload)
end)

RegisterNUICallback('prisonJob', function(data, cb)
    if type(data) == 'table' then
        if data.action == 'start' then
            TriggerServerEvent('fbrp:jail:jobStart', tostring(data.id or ''))
            FBRP.CloseMenu()
        elseif data.action == 'cancel' then
            TriggerServerEvent('fbrp:jail:jobCancel')
        end
    end
    cb({ ok=true })
end)

RegisterNetEvent('fbrp:jail:return', function(spawn)
    if not jail then return end
    cancelTask()
    teleport(spawn)
    notify('The guards drag you back into the yard. Your behaviour record took a hit.', 'error')
end)

RegisterNetEvent('fbrp:jail:release', function(release, reason)
    if not jail then return end
    jail = nil
    cancelTask()
    setJob(nil)
    pushJailHud()
    teleport(release)
    restoreOutfit(PlayerPedId(), outfit)
    outfit = nil
    notify(reason == 'served' and 'You have served your time. Welcome back to Florida Bay.' or 'You have been released.', 'success')
end)

RegisterCommand('prisonwork', function()
    if not jail then return notify('You are not in prison.', 'info') end
    TriggerServerEvent('fbrp:jail:workRequest')
end, false)
RegisterCommand('prisonjobs', function() ExecuteCommand('prisonwork') end, false)

RegisterNetEvent('fbrp:jail:escapeApproved', function(ms)
    if not jail then return end
    runTask('escape', prison.escapeSpot, tonumber(ms) or J.escapeHoldMs, 'WORLD_HUMAN_GARDENER_PLANT', 'Prying the fence panel loose', function()
        TriggerServerEvent('fbrp:jail:escapeDone')
    end)
end)

RegisterNetEvent('fbrp:jail:escape', function(exit)
    if not jail then return end
    jail = nil
    cancelTask()
    setJob(nil)
    pushJailHud()
    teleport(exit, true)
    notify('You slipped through the fence. Every cop in the county is looking for you. Run!', 'warning')
    PlaySoundFrontend(-1, 'Mission_Pass_Notify', 'DLC_HEISTS_GENERAL_FRONTEND_SOUNDS', true)
end)

AddEventHandler('fbrp:characterSpawned', function()
    TriggerServerEvent('fbrp:justice:spawned')
end)

-- ─────────────────────────── community service ───────────────────────────

local function loadModel(hash)
    if not IsModelInCdimage(hash) then return false end
    RequestModel(hash)
    local untilAt = GetGameTimer() + 3000
    while not HasModelLoaded(hash) and GetGameTimer() < untilAt do Wait(10) end
    return HasModelLoaded(hash)
end

local function spawnRubbish()
    for _ = 1, 12 do
        local angle = math.random() * math.pi * 2
        local distance = 4.0 + math.random() * (CS.rubbishSpread - 4.0)
        local x, y = CS.center.x + math.cos(angle) * distance, CS.center.y + math.sin(angle) * distance
        local found, z = GetGroundZFor_3dCoord(x, y, CS.center.z + 15.0, false)
        if found and math.abs(z - CS.center.z) < 6.0 then
            local tooClose = false
            for _, item in ipairs(rubbish) do
                if #(vector2(item.x, item.y) - vector2(x, y)) < 4.0 then tooClose = true break end
            end
            if not tooClose then
                local model = CS.rubbishModels[math.random(#CS.rubbishModels)]
                local hash = joaat(model)
                if not loadModel(hash) then hash = joaat('prop_cs_rub_binbag_01'); loadModel(hash) end
                local entity = CreateObject(hash, x, y, z, false, false, false)
                if entity ~= 0 then
                    PlaceObjectOnGroundProperly(entity)
                    FreezeEntityPosition(entity, true)
                    SetEntityCollision(entity, false, false)
                    SetModelAsNoLongerNeeded(hash)
                    rubbish[#rubbish + 1] = { entity=entity, x=x, y=y, z=z }
                    return true
                end
            end
        end
    end
    return false
end

local function clearRubbish()
    for _, item in ipairs(rubbish) do
        if DoesEntityExist(item.entity) then DeleteEntity(item.entity) end
    end
    rubbish = {}
    for _, blip in ipairs(serviceBlips) do
        if DoesBlipExist(blip) then RemoveBlip(blip) end
    end
    serviceBlips = {}
end

local function pushServiceHud()
    if not service or not service.active then return ui({ type='service', active=false }) end
    ui({ type='service', active=true, remaining=service.remaining, total=service.total, minutes=service.minutes, collected=service.collected,
         state=service.state, graceLeft=service.graceLeft, charges=service.charges, idleLeft=service.idleLeft, idleSeconds=service.idleSeconds })
end

local function serviceLoop()
    CreateThread(function()
        local lastStrip, lastRefill = 0, 0
        while service do
            local ped = PlayerPedId()
            local here = GetEntityCoords(ped)
            DisablePlayerFiring(PlayerId(), true)
            DisableControlAction(0, 140, true)
            DisableControlAction(0, 141, true)
            DisableControlAction(0, 142, true)
            DisableControlAction(0, 23, true)  -- enter vehicle
            DisableControlAction(0, 75, true)
            if IsPedInAnyVehicle(ped, false) and GetGameTimer() - lastStrip > 1000 then TaskLeaveAnyVehicle(ped, 0, 16) end
            if GetGameTimer() - lastStrip > 2000 then
                lastStrip = GetGameTimer()
                if GetSelectedPedWeapon(ped) ~= joaat('WEAPON_UNARMED') then RemoveAllPedWeapons(ped, true) end
            end
            if #rubbish < CS.rubbishVisible and GetGameTimer() - lastRefill > 400 then
                lastRefill = GetGameTimer()
                spawnRubbish()
            end
            local fromCenter = #(vector2(here.x, here.y) - vector2(CS.center.x, CS.center.y))
            if fromCenter > CS.radius - 12.0 then
                DrawMarker(1, CS.center.x, CS.center.y, CS.center.z - 2.0, 0, 0, 0, 0, 0, 0, CS.radius * 2.0, CS.radius * 2.0, 6.0, 255, 181, 71, 40, false, false, 2, false, nil, nil, false)
            end
            local nearest, nearestIndex, nearestDistance = nil, nil, 99.0
            for index, item in ipairs(rubbish) do
                local distance = #(here - vector3(item.x, item.y, item.z))
                if distance < 30.0 then
                    DrawMarker(2, item.x, item.y, item.z + 1.0, 0, 0, 0, 0, 180.0, 0, 0.28, 0.28, 0.28, 255, 181, 71, 200, true, true, 2, false, nil, nil, false)
                end
                if distance < nearestDistance then nearest, nearestIndex, nearestDistance = item, index, distance end
            end
            if nearest and nearestDistance < 1.8 and not task then
                help('Press ~INPUT_CONTEXT~ to pick up the rubbish.')
                if IsControlJustReleased(0, 38) then
                    local item = nearest
                    runTask('pickup', vector3(item.x, item.y, item.z), CS.pickupMs, 'PROP_HUMAN_BUM_BIN', 'Picking up rubbish', function()
                        for i, entry in ipairs(rubbish) do
                            if entry == item then
                                if DoesEntityExist(entry.entity) then DeleteEntity(entry.entity) end
                                table.remove(rubbish, i)
                                break
                            end
                        end
                        TriggerServerEvent('fbrp:service:pickup')
                        PlaySoundFrontend(-1, 'PICK_UP', 'HUD_FRONTEND_DEFAULT_SOUNDSET', true)
                    end, function() return service ~= nil end)
                end
            end
            Wait(0)
        end
    end)
end

RegisterNetEvent('fbrp:service:enter', function(spawn, info)
    TriggerEvent('fbrp:cancelActivities')
    TriggerEvent('fbrp:restraints:clear')
    local fresh = service == nil
    service = info or { active=true }
    local ped = PlayerPedId()
    RemoveAllPedWeapons(ped, true)
    teleport(spawn)
    if fresh then
        local area = AddBlipForRadius(CS.center.x, CS.center.y, CS.center.z, CS.radius)
        SetBlipColour(area, 47)
        SetBlipAlpha(area, 90)
        local pin = AddBlipForCoord(CS.center.x, CS.center.y, CS.center.z)
        SetBlipSprite(pin, 318)
        SetBlipColour(pin, 47)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString('Community service')
        EndTextCommandSetBlipName(pin)
        serviceBlips = { area, pin }
        serviceLoop()
    end
    pushServiceHud()
    PlaySoundFrontend(-1, 'Event_Message_Purple', 'GTAO_FM_Events_Soundset', true)
end)

RegisterNetEvent('fbrp:service:update', function(info)
    if not service or type(info) ~= 'table' then return end
    local wasOutside = service.state == 'outside'
    service = info
    if info.state == 'outside' and not wasOutside then PlaySoundFrontend(-1, 'TIMER_STOP', 'HUD_MINI_GAME_SOUNDSET', true) end
    pushServiceHud()
end)

RegisterNetEvent('fbrp:service:release', function(status)
    if not service then return end
    service = nil
    if task == 'pickup' then cancelTask() end
    clearRubbish()
    pushServiceHud()
    if status == 'completed' then PlaySoundFrontend(-1, 'Mission_Pass_Notify', 'DLC_HEISTS_GENERAL_FRONTEND_SOUNDS', true) end
end)

-- ─────────────────────────── MDT ───────────────────────────

local function streetHere()
    local c = GetEntityCoords(PlayerPedId())
    local streetHash, crossHash = GetStreetNameAtCoord(c.x, c.y, c.z)
    local street = GetStreetNameFromHashKey(streetHash)
    if crossHash ~= 0 then street = street .. ' / ' .. GetStreetNameFromHashKey(crossHash) end
    return street
end

RegisterNetEvent('fbrp:mdt:open', function(payload)
    payload = payload or {}
    payload.penal = FBRP.PenalCode
    payload.street = streetHere()
    FBRP.OpenMenu('mdt', payload)
end)

RegisterNetEvent('fbrp:mdt:data', function(kind, data)
    if FBRP.MenuView() == 'mdt' then ui({ type='mdtData', kind=kind, data=data }) end
end)

RegisterNUICallback('mdtAction', function(data, cb)
    if type(data) == 'table' then
        local kind = tostring(data.kind or '')
        if kind == 'report' or kind == 'selfDispatch' then data.street = streetHere() end
        TriggerServerEvent('fbrp:mdt:action', kind, data)
    end
    cb({ ok=true })
end)

-- ─────────────────────────── vehicles ───────────────────────────

local function vehicleAhead(distance)
    local ped = PlayerPedId()
    local own = GetVehiclePedIsIn(ped, false)
    local origin = own ~= 0 and GetOffsetFromEntityInWorldCoords(own, 0.0, 2.5, 0.3) or GetOffsetFromEntityInWorldCoords(ped, 0.0, 0.5, 0.0)
    local target = own ~= 0 and GetOffsetFromEntityInWorldCoords(own, 0.0, distance, 0.0) or GetOffsetFromEntityInWorldCoords(ped, 0.0, distance, 0.0)
    local probe = StartShapeTestCapsule(origin.x, origin.y, origin.z, target.x, target.y, target.z, 1.2, 10, own ~= 0 and own or ped, 7)
    local status, hit, _, _, entity = 1, 0, nil, nil, 0
    local timeout = GetGameTimer() + 150
    repeat
        status, hit, _, _, entity = GetShapeTestResult(probe)
        if status == 1 then Wait(0) end
    until status ~= 1 or GetGameTimer() > timeout
    if hit == 1 and entity ~= 0 and IsEntityAVehicle(entity) then return entity end
    return nil
end

local function nearestVehicle(radius)
    local coords = GetEntityCoords(PlayerPedId())
    local best, bestDistance = nil, radius
    for _, vehicle in ipairs(GetGamePool('CVehicle')) do
        local distance = #(coords - GetEntityCoords(vehicle))
        if distance < bestDistance then best, bestDistance = vehicle, distance end
    end
    return best
end

local function plateOf(vehicle)
    return ((GetVehicleNumberPlateText(vehicle) or ''):gsub('^%s+', ''):gsub('%s+$', ''))
end

RegisterCommand('runplate', function(_, args)
    local plate = table.concat(args, ' ')
    if plate == '' then
        local vehicle = vehicleAhead(30.0) or nearestVehicle(6.0)
        if not vehicle or vehicle == GetVehiclePedIsIn(PlayerPedId(), false) then return notify('No vehicle ahead. Use /runplate <plate>.', 'error') end
        plate = plateOf(vehicle)
    end
    TriggerServerEvent('fbrp:justice:runplate', plate)
end, false)

RegisterNetEvent('fbrp:justice:plateResult', function(report)
    ui({ type='plate', data=report })
end)

RegisterCommand('registervehicle', function()
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= ped then return notify('Sit in the driver seat of the vehicle you want to register.', 'error') end
    local model = GetDisplayNameFromVehicleModel(GetEntityModel(vehicle))
    local label = GetLabelText(model)
    TriggerServerEvent('fbrp:justice:register', plateOf(vehicle), model, label ~= 'NULL' and label or model, false)
end, false)

RegisterCommand('impound', function()
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) then return notify('Step out of your vehicle first.', 'error') end
    local vehicle = nearestVehicle(6.0)
    if not vehicle then return notify('No vehicle close enough.', 'error') end
    if not NetworkGetEntityIsNetworked(vehicle) then
        SetEntityAsMissionEntity(vehicle, true, true)
        DeleteVehicle(vehicle)
        return notify('Abandoned vehicle cleared.', 'success')
    end
    TaskStartScenarioInPlace(ped, 'CODE_HUMAN_MEDIC_TEND_TO_DEAD', 0, true)
    ui({ type='progress', label='Calling the tow truck', ms=3000 })
    Wait(3000)
    ClearPedTasks(ped)
    -- The vehicle can leave scope or be deleted while the tow animation runs.
    if not DoesEntityExist(vehicle) or not NetworkGetEntityIsNetworked(vehicle) then
        return notify('The vehicle is no longer available.', 'error')
    end
    local netId = NetworkGetNetworkIdFromEntity(vehicle)
    if netId <= 0 then return notify('The vehicle is no longer available.', 'error') end
    TriggerServerEvent('fbrp:justice:impound', netId)
end, false)

-- ─────────────────────────── spike strips ───────────────────────────

local SPIKE = joaat('p_ld_stinger_s')
local WHEELS = { { 'wheel_lf', 0 }, { 'wheel_rf', 1 }, { 'wheel_lm1', 2 }, { 'wheel_rm1', 3 }, { 'wheel_lr', 4 }, { 'wheel_rr', 5 } }
local spikeMin, spikeMax

RegisterCommand('spikes', function()
    local ped = PlayerPedId()
    if IsPedInAnyVehicle(ped, false) then return notify('Deploy spike strips on foot.', 'error') end
    local spot = GetOffsetFromEntityInWorldCoords(ped, 0.0, 3.5, 0.0)
    local found, ground = GetGroundZFor_3dCoord(spot.x, spot.y, spot.z + 1.5, false)
    TaskStartScenarioInPlace(ped, 'CODE_HUMAN_MEDIC_KNEEL', 0, true)
    Wait(1200)
    ClearPedTasks(ped)
    TriggerServerEvent('fbrp:justice:spikes', { x=spot.x, y=spot.y, z=found and ground or spot.z - 0.9 }, GetEntityHeading(ped))
end, false)

CreateThread(function()
    while true do
        local sleep = 300
        local ped = PlayerPedId()
        local vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle ~= 0 and GetPedInVehicleSeat(vehicle, -1) == ped and GetEntitySpeed(vehicle) > 1.0 then
            local coords = GetEntityCoords(vehicle)
            local strip = GetClosestObjectOfType(coords.x, coords.y, coords.z, 20.0, SPIKE, false, false, false)
            if strip ~= 0 then
                sleep = 0
                if not spikeMin then spikeMin, spikeMax = GetModelDimensions(SPIKE) end
                for _, wheel in ipairs(WHEELS) do
                    local bone = GetEntityBoneIndexByName(vehicle, wheel[1])
                    if bone ~= -1 and not IsVehicleTyreBurst(vehicle, wheel[2], false) then
                        local world = GetWorldPositionOfEntityBone(vehicle, bone)
                        local l = GetOffsetFromEntityGivenWorldCoords(strip, world.x, world.y, world.z)
                        if l.x >= spikeMin.x - 0.25 and l.x <= spikeMax.x + 0.25 and l.y >= spikeMin.y - 0.25 and l.y <= spikeMax.y + 0.25 and math.abs(l.z) < 1.2 then
                            SetVehicleTyreBurst(vehicle, wheel[2], true, 1000.0)
                        end
                    end
                end
            end
        end
        Wait(sleep)
    end
end)

-- ─────────────────────────── evidence ───────────────────────────

-- Firing a gun leaves residue for J.gsrMinutes; swimming washes it off.
CreateThread(function()
    local lastMark = 0
    while true do
        local ped = PlayerPedId()
        if IsPedShooting(ped) and GetGameTimer() - lastMark > 10000 then
            local weapon = GetSelectedPedWeapon(ped)
            if weapon ~= joaat('WEAPON_STUNGUN') and weapon ~= joaat('WEAPON_FIREEXTINGUISHER') then
                lastMark = GetGameTimer()
                LocalPlayer.state:set('fbrp:gsr', GetCloudTimeAsInt(), true)
            end
        elseif LocalPlayer.state['fbrp:gsr'] and IsPedSwimming(ped) then
            LocalPlayer.state:set('fbrp:gsr', nil, true)
        end
        Wait(IsPedArmed(ped, 4) and 0 or 500)
    end
end)

-- ─────────────────────────── cards & overlays ───────────────────────────

RegisterNetEvent('fbrp:idcard:show', function(card)
    ui({ type='idcard', data=card })
    PlaySoundFrontend(-1, 'NAV_UP_DOWN', 'HUD_FRONTEND_DEFAULT_SOUNDSET', true)
end)

RegisterCommand('showid', function(_, args)
    local me = PlayerPedId()
    local mine = GetEntityCoords(me)
    local wanted = tonumber(args and args[1])
    local shown = 0
    for _, player in ipairs(GetActivePlayers()) do
        local serverId = GetPlayerServerId(player)
        if player ~= PlayerId() and (not wanted or serverId == wanted)
            and #(GetEntityCoords(GetPlayerPed(player)) - mine) <= 3.0 then
            TriggerServerEvent('fbrp:interactions:use', serverId, 'showid')
            shown = shown + 1
        end
    end
    -- Always preview your own card so the command visibly works.
    TriggerServerEvent('fbrp:idcard:own')
    if shown == 0 then notify('Nobody is close enough to see your ID.', 'info') end
end, false)

TriggerEvent('chat:addSuggestion', '/showid', 'Show your ID to people nearby', {
    { name = 'ID', help = 'Player to show it to (leave empty for everyone within reach)' }
})

RegisterNetEvent('fbrp:citation:received', function(data)
    ui({ type='citation', data=data })
    PlaySoundFrontend(-1, 'Event_Message_Purple', 'GTAO_FM_Events_Soundset', true)
end)

RegisterNetEvent('fbrp:bodycam:toggle', function(info)
    bodycam = not bodycam
    ui({ type='bodycam', active=bodycam, unit=info and info.unit, dept=info and info.dept })
    notify(bodycam and 'Body camera recording.' or 'Body camera stopped.', bodycam and 'success' or 'info')
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    clearRubbish()
    if jail then restoreOutfit(PlayerPedId(), outfit) end
end)
