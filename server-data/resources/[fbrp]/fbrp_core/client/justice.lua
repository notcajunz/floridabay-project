local J = FBRP.Justice
local prison = J.prison

local jail = nil          -- { remaining, months, total, charges, outfit }
local workIndex = nil
local workBlip = nil
local task = nil          -- 'work' | 'escape' while a timed job is running
local bodycam = false
local lastLeash = 0

local function ui(message) SendNUIMessage(message) end
local function notify(message, tone) TriggerEvent('fbrp:notify', message, tone or 'info') end

local function help(text)
    BeginTextCommandDisplayHelp('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayHelp(0, false, false, -1)
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
    for component, value in pairs(suit) do SetPedComponentVariation(ped, component, value[1], value[2], 0) end
    ClearPedProp(ped, 0)
end

local function restoreOutfit(ped, saved)
    if not saved or saved.model ~= GetEntityModel(ped) then return end
    for component, value in pairs(saved.components) do SetPedComponentVariation(ped, component, value[1], value[2], 0) end
    if saved.hat[1] and saved.hat[1] >= 0 then SetPedPropIndex(ped, 0, saved.hat[1], saved.hat[2], true) end
end

-- ─────────────────────────── prison ───────────────────────────

local function clearWork()
    workIndex = nil
    if workBlip and DoesBlipExist(workBlip) then RemoveBlip(workBlip) end
    workBlip = nil
end

local function pushJailHud()
    if not jail then return ui({ type='jail', active=false }) end
    ui({ type='jail', active=true, remaining=jail.remaining, months=jail.months, total=jail.total, charges=jail.charges, prison=jail.prison,
         task=workIndex and 'Head to the marked electrical box and press E.' or 'Type /prisonwork for a work detail that shortens your sentence.' })
end

local function cancelTask(reason)
    if not task then return end
    if task == 'escape' then TriggerServerEvent('fbrp:jail:escapeCancel') end
    task = nil
    ClearPedTasks(PlayerPedId())
    ui({ type='progress', cancel=true })
    if reason then notify(reason, 'error') end
end

-- Runs a timed prison job: stay near the spot, X cancels.
local function runTask(kind, spot, ms, scenario, label, onDone)
    if task then return end
    task = kind
    local ped = PlayerPedId()
    TaskStartScenarioInPlace(ped, scenario, 0, true)
    ui({ type='progress', label=label, ms=ms })
    local endsAt = GetGameTimer() + ms
    CreateThread(function()
        while task == kind and GetGameTimer() < endsAt do
            local here = GetEntityCoords(PlayerPedId())
            if #(here - vector3(spot.x, spot.y, spot.z)) > 2.5 then return cancelTask('You moved away.') end
            if IsControlJustReleased(0, 73) then return cancelTask('Stopped.') end
            if not jail then return cancelTask() end
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
            if workIndex and not task then
                local spot = prison.work[workIndex]
                local point = vector3(spot.x, spot.y, spot.z)
                local distance = #(here - point)
                if distance < 40.0 then
                    DrawMarker(1, spot.x, spot.y, spot.z - 1.0, 0, 0, 0, 0, 0, 0, 1.0, 1.0, 0.6, 63, 227, 210, 120, false, false, 2, false, nil, nil, false)
                end
                if distance < 1.6 then
                    help('Press ~INPUT_CONTEXT~ to repair the electrical box.')
                    if IsControlJustReleased(0, 38) then
                        SetEntityHeading(ped, spot.w)
                        runTask('work', spot, J.workHoldMs, 'WORLD_HUMAN_WELDING', 'Repairing electrical box', function()
                            TriggerServerEvent('fbrp:jail:workDone')
                            clearWork()
                            pushJailHud()
                        end)
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
    local wasJailed = jail ~= nil
    jail = info or {}
    if not wasJailed then
        jail.outfit = saveOutfit(ped)
        jailLoop()
    end
    RemoveAllPedWeapons(ped, true)
    teleport(spawn)
    wearJumpsuit(PlayerPedId())
    pushJailHud()
    PlaySoundFrontend(-1, 'Bed', 'WastedSounds', true)
end)

RegisterNetEvent('fbrp:jail:update', function(remaining)
    if not jail then return end
    jail.remaining = tonumber(remaining) or jail.remaining
    pushJailHud()
end)

RegisterNetEvent('fbrp:jail:return', function(spawn)
    if not jail then return end
    cancelTask()
    teleport(spawn)
    notify('The guards drag you back into the yard.', 'error')
end)

RegisterNetEvent('fbrp:jail:release', function(release, reason)
    if not jail then return end
    local outfit = jail.outfit
    jail = nil
    cancelTask()
    clearWork()
    pushJailHud()
    teleport(release)
    restoreOutfit(PlayerPedId(), outfit)
    notify(reason == 'served' and 'You have served your time. Welcome back to Florida Bay.' or 'You have been released.', 'success')
end)

RegisterNetEvent('fbrp:jail:work', function(index)
    if not jail then return end
    clearWork()
    workIndex = tonumber(index)
    local spot = prison.work[workIndex]
    if not spot then workIndex = nil return end
    workBlip = AddBlipForCoord(spot.x, spot.y, spot.z)
    SetBlipSprite(workBlip, 354)
    SetBlipColour(workBlip, 5)
    SetBlipRoute(workBlip, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentString('Work detail')
    EndTextCommandSetBlipName(workBlip)
    pushJailHud()
    notify('Work detail assigned. Follow the marker.', 'info')
end)

RegisterCommand('prisonwork', function()
    if not jail then return notify('You are not in prison.', 'info') end
    TriggerServerEvent('fbrp:jail:workRequest')
end, false)

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
    clearWork()
    pushJailHud()
    teleport(exit, true)
    notify('You slipped through the fence. Every cop in the county is looking for you. Run!', 'warning')
    PlaySoundFrontend(-1, 'Mission_Pass_Notify', 'DLC_HEISTS_GENERAL_FRONTEND_SOUNDS', true)
end)

AddEventHandler('fbrp:characterSpawned', function()
    TriggerServerEvent('fbrp:justice:spawned')
end)

-- ─────────────────────────── MDT ───────────────────────────

RegisterNetEvent('fbrp:mdt:open', function(payload)
    payload = payload or {}
    payload.penal = FBRP.PenalCode
    FBRP.OpenMenu('mdt', payload)
end)

RegisterNetEvent('fbrp:mdt:data', function(kind, data)
    if FBRP.MenuView() == 'mdt' then ui({ type='mdtData', kind=kind, data=data }) end
end)

RegisterNUICallback('mdtAction', function(data, cb)
    if type(data) == 'table' then TriggerServerEvent('fbrp:mdt:action', tostring(data.kind or ''), data) end
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
    TriggerServerEvent('fbrp:justice:impound', NetworkGetNetworkIdFromEntity(vehicle))
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

RegisterCommand('showid', function()
    local me = PlayerPedId()
    local mine = GetEntityCoords(me)
    local shown = 0
    for _, player in ipairs(GetActivePlayers()) do
        if player ~= PlayerId() and #(GetEntityCoords(GetPlayerPed(player)) - mine) <= 3.0 then
            TriggerServerEvent('fbrp:interactions:use', GetPlayerServerId(player), 'showid')
            shown = shown + 1
        end
    end
    if shown == 0 then notify('Nobody is close enough to see your ID.', 'info') end
end, false)

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
    if name ~= GetCurrentResourceName() or not jail then return end
    restoreOutfit(PlayerPedId(), jail.outfit)
end)
