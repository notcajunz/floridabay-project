-- HUD vehicle cluster data. Seatbelt, cruise control, fuel and engine health come from client/vehicles.lua
-- (it owns those systems and their keys); the HUD adds turn signals, odometer and warning sounds.

local odo = {}
local lastPos, lastVeh = nil, 0
local lastBelt = nil
local alarmOn, stallOn = false, false

local function currentVehicle()
    local ped = PlayerPedId()
    local veh = GetVehiclePedIsIn(ped, false)
    if veh == 0 then return 0, false end
    return veh, GetPedInVehicleSeat(veh, -1) == ped
end

local function vehicleType(veh)
    local class = GetVehicleClass(veh)
    if class == 15 or class == 16 then return 'air' end
    if class == 14 then return 'sea' end
    if class == 13 then return 'bicycle' end
    if class == 8 then return 'bike' end
    return 'land'
end

local function sfx(name, loop, stop) FBRPHud.send('sfx', { name = name, loop = loop, stop = stop }) end

---------------------------------------------------------------- turn signals

local function setIndicator(mode)
    local veh, driver = currentVehicle()
    if veh == 0 or not driver then return end
    local cur = Entity(veh).state.fbrpIndicator
    Entity(veh).state:set('fbrpIndicator', cur ~= mode and mode or nil, true)
end

RegisterCommand('+fbrp_ind_left', function() setIndicator('left') end, false)
RegisterCommand('-fbrp_ind_left', function() end, false)
RegisterCommand('+fbrp_ind_right', function() setIndicator('right') end, false)
RegisterCommand('-fbrp_ind_right', function() end, false)
RegisterCommand('+fbrp_hazards', function() setIndicator('hazards') end, false)
RegisterCommand('-fbrp_hazards', function() end, false)
RegisterKeyMapping('+fbrp_ind_left', 'Left indicator', 'keyboard', HudConfig.Keys.indicatorLeft)
RegisterKeyMapping('+fbrp_ind_right', 'Right indicator', 'keyboard', HudConfig.Keys.indicatorRight)
RegisterKeyMapping('+fbrp_hazards', 'Hazard lights', 'keyboard', HudConfig.Keys.hazards)

AddStateBagChangeHandler('fbrpIndicator', nil, function(bagName, _, value)
    local veh = GetEntityFromStateBagName(bagName)
    if veh == 0 then return end
    local tries = 0
    while not DoesEntityExist(veh) and tries < 20 do Wait(50) tries = tries + 1 end
    if not DoesEntityExist(veh) then return end
    SetVehicleIndicatorLights(veh, 1, value == 'left' or value == 'hazards')
    SetVehicleIndicatorLights(veh, 0, value == 'right' or value == 'hazards')
end)

---------------------------------------------------------------- data

local data = false
FBRPHud.vehicleData = function() return data end

local function unitMult() return (FBRPHud.settings.speedUnit == 'kmh') and 3.6 or 2.236936 end

CreateThread(function()
    while true do
        local veh, driver = currentVehicle()
        if veh ~= 0 then
            if veh ~= lastVeh then
                lastVeh = veh
                lastPos = GetEntityCoords(veh)
                lastBelt = nil
            end
            local kind = vehicleType(veh)
            local speedMs = GetEntitySpeed(veh)
            local pos = GetEntityCoords(veh)
            local plate = GetVehicleNumberPlateText(veh)
            local km = FBRPHud.settings.speedUnit == 'kmh'
            local moved = #(pos - lastPos)
            if moved < 50.0 then odo[plate] = (odo[plate] or (Entity(veh).state.odo or 0)) + moved / (km and 1000.0 or 1609.34) end
            lastPos = pos

            local core = FBRP.VehicleStatus() or {}
            local hasBelt = kind == 'land'
            local belted = core.seatbelt == true
            local speed = speedMs * unitMult()
            local beltWarn = hasBelt and not belted and speed > 15

            if hasBelt and lastBelt ~= nil and belted ~= lastBelt and FBRPHud.visible then
                FBRPHud.send('sound', belted and 'beltOn' or 'beltOff')
            end
            lastBelt = belted

            local cruise = false
            if core.cruise and core.cruiseSpeed then
                cruise = km and core.cruiseSpeed * 1.609344 or core.cruiseSpeed
            elseif core.cruise then
                cruise = speed
            end

            local _, lightsOn, highOn = GetVehicleLightsState(veh)
            local ind = Entity(veh).state.fbrpIndicator
            local gear = GetVehicleCurrentGear(veh)
            local noFuel = kind == 'bicycle'

            data = {
                speed = speed,
                unit = km and 'kmh' or 'mph',
                rpm = GetIsVehicleEngineRunning(veh) and GetVehicleCurrentRpm(veh) or 0,
                gear = kind == 'bicycle' and nil or (gear == 0 and (speedMs > 0.5 and 'R' or 'N') or tostring(gear)),
                maxGear = GetVehicleHighGear(veh),
                fuel = (not noFuel) and (tonumber(core.fuel) or GetVehicleFuelLevel(veh)) or nil,
                engine = (not noFuel) and (tonumber(core.engineHealth) or math.max(0, math.min(100, GetVehicleEngineHealth(veh) / 10))) or nil,
                lights = highOn == 1 and 'high' or lightsOn == 1 and 'low' or 'off',
                indicators = (ind == 'left' and 1) or (ind == 'right' and 2) or (ind == 'hazards' and 3) or 0,
                hasBelt = hasBelt,
                belted = belted,
                beltWarn = beltWarn,
                cruise = cruise,
                mileage = kind ~= 'air' and (odo[plate] or 0) or nil,
                mileageUnit = km and 'km' or 'miles',
                altitude = kind == 'air' and GetEntityHeightAboveGround(veh) * (km and 1.0 or 3.28084) or nil,
            }

            if beltWarn and FBRPHud.visible then
                if not alarmOn then alarmOn = true sfx('seatbelt-alarm', true) end
            elseif alarmOn then alarmOn = false sfx('seatbelt-alarm', false, true) end

            local stall = kind == 'air' and IsThisModelAPlane(GetEntityModel(veh)) and GetEntityHeightAboveGround(veh) > HudConfig.Stall.minHeight
                and speedMs < HudConfig.Stall.minSpeedMs and GetIsVehicleEngineRunning(veh)
            if stall and FBRPHud.visible then
                if not stallOn then stallOn = true sfx('air-stall-warning', true) end
            elseif stallOn then stallOn = false sfx('air-stall-warning', false, true) end

            Wait(50)
        else
            if lastVeh ~= 0 then
                if DoesEntityExist(lastVeh) and NetworkGetEntityOwner(lastVeh) == PlayerId() then
                    local p = GetVehicleNumberPlateText(lastVeh)
                    if odo[p] then Entity(lastVeh).state:set('odo', odo[p], true) end
                end
                lastVeh = 0
                lastBelt = nil
                if alarmOn then alarmOn = false sfx('seatbelt-alarm', false, true) end
                if stallOn then stallOn = false sfx('air-stall-warning', false, true) end
                data = false
            end
            Wait(300)
        end
    end
end)

-- indicator tick sound
CreateThread(function()
    while true do
        local veh = currentVehicle()
        local ind = veh ~= 0 and Entity(veh).state.fbrpIndicator or nil
        if ind and FBRPHud.visible then
            sfx('indicator')
            Wait(420)
        else
            Wait(200)
        end
    end
end)
