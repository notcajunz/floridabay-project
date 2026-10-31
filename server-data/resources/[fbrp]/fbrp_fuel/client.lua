-- FBRP Fuel - client
-- Fuel lives in the game's own fuel level (GetVehicleFuelLevel), which fbrp_core's HUD gauge reads,
-- and is shared between players through the vehicle state bag 'fbrpFuel' (same key fbrp_core used).
local cfg = FuelConfig

---------------------------------------------------------------- fuel types

local DIESEL, ELECTRIC = {}, {}
for _, name in ipairs(cfg.DieselModels) do DIESEL[joaat(name)] = true end
for _, name in ipairs(cfg.ElectricModels) do ELECTRIC[joaat(name)] = true end

local LABEL = { gasoline = 'Gasoline', diesel = 'Diesel', electric = 'Electric' }

-- 'gasoline' | 'diesel' | 'electric' | nil (bikes, trains, no tank)
local function fuelTypeOf(vehicle)
    if vehicle == 0 or not DoesEntityExist(vehicle) then return nil end
    local class = GetVehicleClass(vehicle)
    if class == 13 or class == 21 then return nil end
    local model = GetEntityModel(vehicle)
    if ELECTRIC[model] then return 'electric' end
    if GetVehicleHandlingFloat(vehicle, 'CHandlingData', 'fPetrolTankVolume') <= 0.0 then return nil end
    if DIESEL[model] or cfg.DieselClasses[class] then return 'diesel' end
    return 'gasoline'
end

local function usesFuel(vehicle)
    local kind = fuelTypeOf(vehicle)
    return kind == 'gasoline' or kind == 'diesel'
end

local function vehicleName(vehicle)
    local model = GetDisplayNameFromVehicleModel(GetEntityModel(vehicle))
    local label = GetLabelText(model)
    return label ~= 'NULL' and label or model
end

---------------------------------------------------------------- read / write (+ sync)

local function clamp(v, lo, hi) return math.max(lo, math.min(hi, v)) end

local function getFuel(vehicle)
    if not usesFuel(vehicle) then return 100.0 end
    return clamp(tonumber(GetVehicleFuelLevel(vehicle)) or 0.0, 0.0, 100.0)
end

local lastSent = {}
local function setFuel(vehicle, value, replicate)
    if not usesFuel(vehicle) then return 100.0 end
    value = clamp(tonumber(value) or 0.0, 0.0, 100.0)
    SetVehicleFuelLevel(vehicle, value + 0.0)
    if replicate and NetworkGetEntityIsNetworked(vehicle) then
        local rounded = math.floor(value * 10.0 + 0.5) / 10.0
        if NetworkHasControlOfEntity(vehicle) then
            pcall(function() Entity(vehicle).state:set('fbrpFuel', rounded, true) end)
        else
            TriggerServerEvent('fbrp_fuel:set', NetworkGetNetworkIdFromEntity(vehicle), rounded)
        end
        lastSent[vehicle] = rounded
    end
    return value
end

-- someone else changed a vehicle's fuel (refuelled it, drove it): apply it here too
AddStateBagChangeHandler('fbrpFuel', nil, function(bagName, _, value)
    local entity = GetEntityFromStateBagName(bagName)
    if entity == 0 or not DoesEntityExist(entity) or not value then return end
    SetVehicleFuelLevel(entity, clamp(tonumber(value) or 0.0, 0.0, 100.0) + 0.0)
end)

local function initialiseFuel(vehicle)
    if not usesFuel(vehicle) then return end
    local shared
    if NetworkGetEntityIsNetworked(vehicle) then
        local ok, value = pcall(function() return Entity(vehicle).state.fbrpFuel end)
        if ok then shared = tonumber(value) end
    end
    local level = shared or tonumber(GetVehicleFuelLevel(vehicle)) or 100.0
    if not shared and level <= 0.0 then level = math.random(55, 90) + 0.0 end
    setFuel(vehicle, level, true)
end

---------------------------------------------------------------- notify / text UI

local function notify(description, kind)
    lib.notify({ title = 'Fuel', description = description, type = kind or 'inform', position = cfg.NotifyPosition, icon = 'fa-solid fa-gas-pump' })
end

local shownText = nil
local function showText(text, icon)
    if shownText == text then return end
    shownText = text
    lib.showTextUI(text, { position = 'right-center', icon = icon or 'gas-pump' })
end
local function hideText()
    if not shownText then return end
    shownText = nil
    lib.hideTextUI()
end

---------------------------------------------------------------- using fuel while driving

local activeVehicle, emptyWarned = 0, false
local refuelling = nil -- { vehicle, kind }

CreateThread(function()
    while true do
        local ped = PlayerPedId()
        local vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle ~= 0 and GetPedInVehicleSeat(vehicle, -1) == ped and usesFuel(vehicle) then
            if activeVehicle ~= vehicle then
                activeVehicle = vehicle
                initialiseFuel(vehicle)
                emptyWarned = getFuel(vehicle) <= 0.05
            end
            if GetIsVehicleEngineRunning(vehicle) then
                local rpm = clamp(GetVehicleCurrentRpm(vehicle), 0.0, 1.0)
                local multiplier = cfg.ClassMultiplier[GetVehicleClass(vehicle)] or 1.0
                if fuelTypeOf(vehicle) == 'diesel' then multiplier = multiplier * cfg.DieselEfficiency end
                local used = (cfg.IdlePerSecond + (rpm ^ 1.55) * cfg.RpmPerSecond) * multiplier
                local before = getFuel(vehicle)
                local level = math.max(0.0, before - used)
                -- share it every half percent (not every second) to keep network traffic down
                local share = math.abs((lastSent[vehicle] or 100.0) - level) >= 0.5 or level <= 0.05
                setFuel(vehicle, level, share)
                if level <= 0.05 then
                    SetVehicleEngineOn(vehicle, false, true, true)
                    if not emptyWarned then
                        emptyWarned = true
                        notify('Out of fuel. Gas stations are marked on the map.', 'error')
                    end
                end
            end
        else
            if activeVehicle ~= 0 and DoesEntityExist(activeVehicle) then setFuel(activeVehicle, getFuel(activeVehicle), true) end
            activeVehicle, emptyWarned = 0, false
        end
        Wait(1000)
    end
end)

---------------------------------------------------------------- pumps

local function nearestPump(coords)
    local best, bestDistance
    for _, model in ipairs(cfg.PumpModels) do
        local pump = GetClosestObjectOfType(coords.x, coords.y, coords.z, cfg.PumpReach, model, false, false, false)
        if pump ~= 0 then
            local distance = #(coords - GetEntityCoords(pump))
            if not bestDistance or distance < bestDistance then best, bestDistance = pump, distance end
        end
    end
    return best
end

local function vehicleAtPump(pump)
    local pumpCoords = GetEntityCoords(pump)
    local best, bestDistance
    for _, vehicle in ipairs(GetGamePool('CVehicle')) do
        local distance = #(pumpCoords - GetEntityCoords(vehicle))
        if distance <= cfg.VehicleReach and (not bestDistance or distance < bestDistance) then
            best, bestDistance = vehicle, distance
        end
    end
    return best
end

local function playPumpAnim()
    local ped = PlayerPedId()
    RequestAnimDict('timetable@gardener@filling_can')
    local untilAt = GetGameTimer() + 2000
    while not HasAnimDictLoaded('timetable@gardener@filling_can') and GetGameTimer() < untilAt do Wait(10) end
    TaskPlayAnim(ped, 'timetable@gardener@filling_can', 'gar_ig_5_filling_can', 2.0, -2.0, -1, 49, 0, false, false, false)
end

local function stopPumpAnim()
    StopAnimTask(PlayerPedId(), 'timetable@gardener@filling_can', 'gar_ig_5_filling_can', 2.0)
end

-- wrong fuel: damage + stall (sent to whoever controls the car)
local function misfuel(vehicle, put, needs)
    if not cfg.WrongFuelDamage then return end
    TriggerServerEvent('fbrp_fuel:misfuel', NetworkGetNetworkIdFromEntity(vehicle))
    notify(('You put %s in a %s vehicle. The engine is damaged - get it repaired.'):format(LABEL[put]:lower(), LABEL[needs]:lower()), 'error')
end

RegisterNetEvent('fbrp_fuel:applyMisfuel', function(netId)
    local vehicle = NetworkGetEntityFromNetworkId(netId)
    if vehicle == 0 or not DoesEntityExist(vehicle) then return end
    SetVehicleEngineHealth(vehicle, math.min(GetVehicleEngineHealth(vehicle), cfg.WrongFuelEngineHealth + 0.0))
    SetVehicleEngineOn(vehicle, false, true, true)
end)

local function startRefuel(vehicle, kind)
    if refuelling then return end
    if GetIsVehicleEngineRunning(vehicle) then return notify('Turn the engine off first.', 'error') end
    refuelling = { vehicle = vehicle, kind = kind, start = getFuel(vehicle) }
    TaskTurnPedToFaceEntity(PlayerPedId(), vehicle, 600)
    Wait(600)
    playPumpAnim()

    CreateThread(function()
        local last = GetGameTimer()
        local lastShare = 0
        local stopped = false
        while refuelling do
            Wait(0)
            local now = GetGameTimer()
            local elapsed = clamp((now - last) / 1000.0, 0.0, 0.25)
            last = now
            local ped = PlayerPedId()
            local level = getFuel(vehicle)

            local cancelled = not DoesEntityExist(vehicle) or GetIsVehicleEngineRunning(vehicle) or GetEntitySpeed(vehicle) > 1.0
                or IsPedInAnyVehicle(ped, false) or #(GetEntityCoords(ped) - GetEntityCoords(vehicle)) > cfg.VehicleReach + 2.0
            if cancelled then
                notify('Refuelling stopped.', 'inform')
                break
            end

            level = math.min(100.0, level + cfg.RefillPerSecond * elapsed)
            local share = now - lastShare >= 1000
            if share then lastShare = now end
            setFuel(vehicle, level, share)

            showText(('Refuelling %s - %d%%  \n[E] Stop'):format(LABEL[kind], math.floor(level + 0.5)), 'gas-pump')
            if IsControlJustReleased(0, 38) then
                notify(('Stopped at %d%%.'):format(math.floor(level + 0.5)), 'inform')
                stopped = true
                break
            end
            if level >= 99.95 then
                notify('Tank full.', 'success')
                break
            end
            if not IsEntityPlayingAnim(ped, 'timetable@gardener@filling_can', 'gar_ig_5_filling_can', 3) then playPumpAnim() end
        end

        if DoesEntityExist(vehicle) then
            local level = getFuel(vehicle)
            setFuel(vehicle, level, true)
            local needs = fuelTypeOf(vehicle)
            if needs and needs ~= kind and level - (refuelling and refuelling.start or level) > 1.0 then misfuel(vehicle, kind, needs) end
        end
        stopPumpAnim()
        hideText()
        refuelling = nil
    end)
end

-- pick gasoline or diesel (ox_lib context menu)
local function openPumpMenu(vehicle)
    local needs = fuelTypeOf(vehicle)
    local hint = cfg.ShowFuelHint and needs and ('This vehicle takes %s'):format(LABEL[needs]:lower()) or nil
    lib.registerContext({
        id = 'fbrp_fuel_pump',
        title = ('Fuel Pump - %s (%d%%)'):format(vehicleName(vehicle), math.floor(getFuel(vehicle) + 0.5)),
        options = {
            {
                title = 'Gasoline', icon = 'gas-pump', iconColor = '#53aaa2',
                description = (hint and needs == 'gasoline') and ('Recommended - ' .. hint) or 'Regular unleaded, for most cars and bikes',
                onSelect = function() startRefuel(vehicle, 'gasoline') end,
            },
            {
                title = 'Diesel', icon = 'truck', iconColor = '#f2c14e',
                description = (hint and needs == 'diesel') and ('Recommended - ' .. hint) or 'For trucks, buses, vans and heavy pickups',
                onSelect = function() startRefuel(vehicle, 'diesel') end,
            },
        },
    })
    lib.showContext('fbrp_fuel_pump')
end

-- prompt when standing at a pump (looks around 4x a second, checks the E key every frame)
CreateThread(function()
    local canRefuel, lastScan = nil, 0
    while true do
        local wait = 500
        if not refuelling then
            local now = GetGameTimer()
            if now - lastScan >= 250 then
                lastScan = now
                canRefuel = nil
                local ped = PlayerPedId()
                local pump = nearestPump(GetEntityCoords(ped))
                if pump then
                    if IsPedInAnyVehicle(ped, false) then
                        showText('Get out of the vehicle to refuel', 'gas-pump')
                    else
                        local vehicle = vehicleAtPump(pump)
                        local kind = vehicle and fuelTypeOf(vehicle)
                        if not vehicle then
                            showText('Park a vehicle next to the pump', 'gas-pump')
                        elseif kind == 'electric' then
                            showText(('%s is electric - no fuel needed'):format(vehicleName(vehicle)), 'bolt')
                        elseif not kind then
                            showText('This vehicle has no fuel tank', 'gas-pump')
                        elseif getFuel(vehicle) >= 99.5 then
                            showText(('%s - tank is full'):format(vehicleName(vehicle)), 'gas-pump')
                        elseif GetIsVehicleEngineRunning(vehicle) then
                            showText(('%s - turn the engine off to refuel'):format(vehicleName(vehicle)), 'gas-pump')
                        else
                            canRefuel = vehicle
                            showText(('[E] Refuel %s - %d%%'):format(vehicleName(vehicle), math.floor(getFuel(vehicle) + 0.5)), 'gas-pump')
                        end
                    end
                else
                    hideText()
                end
            end
            if shownText then wait = 0 end
            if canRefuel and IsControlJustReleased(0, 38) then
                local vehicle = canRefuel
                canRefuel = nil
                hideText()
                openPumpMenu(vehicle)
                lastScan = GetGameTimer() + 750 -- give the menu a moment
            end
        end
        Wait(wait)
    end
end)

---------------------------------------------------------------- blips

CreateThread(function()
    if not cfg.ShowBlips then return end
    for _, station in ipairs(cfg.Stations) do
        local blip = AddBlipForCoord(station.x, station.y, station.z)
        SetBlipSprite(blip, 361)
        SetBlipColour(blip, 1)
        SetBlipScale(blip, 0.65)
        SetBlipAsShortRange(blip, true)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString('Gas Station')
        EndTextCommandSetBlipName(blip)
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    hideText()
    stopPumpAnim()
end)

---------------------------------------------------------------- exports (LegacyFuel-style names so other scripts work)

exports('GetFuel', function(vehicle) return getFuel(vehicle) end)
exports('SetFuel', function(vehicle, value) return setFuel(vehicle, value, true) end)
exports('GetFuelType', function(vehicle) return fuelTypeOf(vehicle) end)
