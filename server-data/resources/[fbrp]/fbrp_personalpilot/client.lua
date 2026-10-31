local cfg = PersonalPilotConfig
local active

local function notify(text, kind)
    local color = kind == 'error' and { 255, 80, 80 } or kind == 'success' and { 80, 220, 120 } or { 90, 170, 255 }
    TriggerEvent('chat:addMessage', { color = color, args = { 'Personal Pilot', text } })
end

RegisterNetEvent('fbrp_personalpilot:notify', notify)

local function loadModel(model)
    local hash = type(model) == 'number' and model or GetHashKey(model)
    if not IsModelInCdimage(hash) or not IsModelValid(hash) then return nil end
    RequestModel(hash)
    local deadline = GetGameTimer() + 10000
    while not HasModelLoaded(hash) do
        if GetGameTimer() >= deadline then return nil end
        Wait(10)
    end
    return hash
end

local function deleteEntity(entity)
    if not entity or entity == 0 or not DoesEntityExist(entity) then return end
    NetworkRequestControlOfEntity(entity)
    local deadline = GetGameTimer() + 1500
    while not NetworkHasControlOfEntity(entity) and GetGameTimer() < deadline do Wait(0) end
    SetEntityAsMissionEntity(entity, true, true)
    DeleteEntity(entity)
end

local function aircraftIsEmpty(aircraft)
    if not DoesEntityExist(aircraft) then return true end
    local seats = GetVehicleModelNumberOfSeats(GetEntityModel(aircraft))
    for seat = -1, seats - 2 do
        if not IsVehicleSeatFree(aircraft, seat) then return false end
    end
    return true
end

local function aircraftHasPassengers(aircraft)
    if not DoesEntityExist(aircraft) then return false end
    local seats = GetVehicleModelNumberOfSeats(GetEntityModel(aircraft))
    for seat = 0, seats - 2 do
        if not IsVehicleSeatFree(aircraft, seat) then return true end
    end
    return false
end

local function cleanup(state, deleteSpawnedAircraft)
    if not state then return end
    local keepPilotForSafety = state.aircraft and DoesEntityExist(state.aircraft)
        and aircraftHasPassengers(state.aircraft) and not IsVehicleOnAllWheels(state.aircraft)
    if state.pilot and DoesEntityExist(state.pilot) then
        if keepPilotForSafety then
            SetEntityAsNoLongerNeeded(state.pilot)
        else
            ClearPedTasksImmediately(state.pilot)
            deleteEntity(state.pilot)
        end
    end
    if deleteSpawnedAircraft and state.spawned and state.aircraft and aircraftIsEmpty(state.aircraft) then
        deleteEntity(state.aircraft)
    elseif state.aircraft and DoesEntityExist(state.aircraft) then
        SetEntityAsNoLongerNeeded(state.aircraft)
    end
    if active == state then active = nil end
end

local function isAircraftModel(hash)
    return IsThisModelAPlane(hash) or IsThisModelAHeli(hash)
end

local function closestUsableAircraft(coords)
    local playerPed = PlayerPedId()
    local current = GetVehiclePedIsIn(playerPed, false)
    if current ~= 0 and isAircraftModel(GetEntityModel(current)) then return current end

    local closest, distance
    for _, vehicle in ipairs(GetGamePool('CVehicle')) do
        if DoesEntityExist(vehicle) and isAircraftModel(GetEntityModel(vehicle)) and IsVehicleSeatFree(vehicle, -1) then
            local d = #(GetEntityCoords(vehicle) - coords)
            if d <= cfg.NearbyAircraftRadius and (not distance or d < distance) then
                closest, distance = vehicle, d
            end
        end
    end
    return closest
end

local function validPassengerAircraft(hash)
    return IsModelInCdimage(hash)
        and IsModelAVehicle(hash)
        and isAircraftModel(hash)
        and GetVehicleModelNumberOfSeats(hash) >= 2
end

local function freePilotSeat(aircraft, playerPed)
    local driver = GetPedInVehicleSeat(aircraft, -1)
    if driver == 0 then return true end
    if driver ~= playerPed then return false end

    local seats = GetVehicleModelNumberOfSeats(GetEntityModel(aircraft))
    for seat = 0, seats - 2 do
        if IsVehicleSeatFree(aircraft, seat) then
            SetPedIntoVehicle(playerPed, aircraft, seat)
            return true
        end
    end
    return false
end

local function selectRunway(point, maximumDistance)
    local best, bestDistance
    for _, runway in ipairs(cfg.Runways) do
        local center = (runway.a + runway.b) * 0.5
        local distance = #(vector2(point.x, point.y) - vector2(center.x, center.y))
        if not bestDistance or distance < bestDistance then
            best, bestDistance = runway, distance
        end
    end
    if bestDistance and bestDistance <= maximumDistance then return best end
    return nil
end

local function orientRunway(runway, aircraftCoords)
    if #(aircraftCoords - runway.a) <= #(aircraftCoords - runway.b) then return runway.a, runway.b end
    return runway.b, runway.a
end

local function resolveGround(point, fallbackZ)
    RequestCollisionAtCoord(point.x, point.y, math.max(point.z, fallbackZ or 0.0))
    for _, height in ipairs({ 1000.0, 500.0, 250.0, 100.0, 50.0 }) do
        local found, groundZ = GetGroundZFor_3dCoord(point.x, point.y, height, false)
        if found then return vector3(point.x, point.y, groundZ) end
        Wait(50)
    end
    return vector3(point.x, point.y, fallbackZ or point.z)
end

local function spawnAircraft(modelHash, playerPed)
    local pos = GetOffsetFromEntityInWorldCoords(playerPed, 0.0, cfg.SpawnForwardDistance, 1.0)
    local aircraft = CreateVehicle(modelHash, pos.x, pos.y, pos.z, GetEntityHeading(playerPed), true, true)
    if aircraft == 0 then return nil end
    SetEntityAsMissionEntity(aircraft, true, true)
    SetVehicleOnGroundProperly(aircraft)
    SetVehicleEngineOn(aircraft, true, true, false)
    return aircraft
end

local function putPilotInAircraft(pilot, aircraft)
    TaskEnterVehicle(pilot, aircraft, 15000, -1, 2.0, 1, 0)
    local deadline = GetGameTimer() + 16000
    while GetGameTimer() < deadline and DoesEntityExist(pilot) and GetPedInVehicleSeat(aircraft, -1) ~= pilot do Wait(100) end
    if GetPedInVehicleSeat(aircraft, -1) ~= pilot then SetPedIntoVehicle(pilot, aircraft, -1) end
    return GetPedInVehicleSeat(aircraft, -1) == pilot
end

local function waitForBoarding(state)
    notify(cfg.Messages.boarding:format(cfg.BoardingTimeoutSeconds), 'inform')
    local playerPed = PlayerPedId()
    local deadline = GetGameTimer() + cfg.BoardingTimeoutSeconds * 1000
    while active == state and GetGameTimer() < deadline do
        if IsPedInVehicle(playerPed, state.aircraft, false) then
            Wait(2500)
            return true
        end
        Wait(250)
    end
    return false
end

local function preparePilot(state)
    SetDriverAbility(state.pilot, 1.0)
    SetDriverAggressiveness(state.pilot, 0.0)
    SetBlockingOfNonTemporaryEvents(state.pilot, true)
    SetPedKeepTask(state.pilot, true)
    SetVehicleEngineOn(state.aircraft, true, true, false)
    SetVehicleHandbrake(state.aircraft, false)
    state.aircraftMaxSpeed = math.max(GetVehicleEstimatedMaxSpeed(state.aircraft), cfg.CruiseSpeed * 1.5)
end

local function headingDelta(target, current)
    return (target - current + 540.0) % 360.0 - 180.0
end

local function restoreAircraftSpeed(state)
    if state.aircraft and DoesEntityExist(state.aircraft) then
        SetVehicleMaxSpeed(state.aircraft, state.aircraftMaxSpeed or cfg.CruiseSpeed * 1.5)
    end
end

local function stopTaxi(state)
    local aircraft, pilot = state.aircraft, state.pilot
    TaskVehicleTempAction(pilot, aircraft, 1, 2000)
    local deadline = GetGameTimer() + 3000
    while active == state and DoesEntityExist(aircraft) and GetEntitySpeed(aircraft) > 0.6
        and GetGameTimer() < deadline do Wait(100) end
    SetVehicleHandbrake(aircraft, true)
    SetVehicleBrakeLights(aircraft, false)
    restoreAircraftSpeed(state)
end

local function taxiTo(state, target, timeoutSeconds)
    local aircraft, pilot = state.aircraft, state.pilot
    state.taxiSerial = (state.taxiSerial or 0) + 1
    local serial = state.taxiSerial
    SetVehicleLandingGear(aircraft, 0)
    SetVehicleHandbrake(aircraft, false)
    SetVehicleBrakeLights(aircraft, false)
    SetVehicleMaxSpeed(aircraft, cfg.TaxiSpeed)
    TaskVehicleTempAction(pilot, aircraft, 9, 1200)

    local deadline = GetGameTimer() + timeoutSeconds * 1000
    local actionAt = GetGameTimer() + 800
    local progressAt = GetGameTimer()
    local progressCoords = GetEntityCoords(aircraft)
    local recoveries = 0
    while active == state and serial == state.taxiSerial and DoesEntityExist(aircraft)
        and DoesEntityExist(pilot) and GetGameTimer() < deadline do
        local coords = GetEntityCoords(aircraft)
        local distance = #(vector2(coords.x, coords.y) - vector2(target.x, target.y))
        if distance <= cfg.TaxiStopRange then
            stopTaxi(state)
            return true
        end

        local desiredHeading = GetHeadingFromVector_2d(target.x - coords.x, target.y - coords.y)
        local currentHeading = GetEntityHeading(aircraft)
        local delta = headingDelta(desiredHeading, currentHeading)
        local turnStep = cfg.TaxiTurnRate * 0.1
        local adjustedHeading = currentHeading + math.max(-turnStep, math.min(turnStep, delta))
        SetEntityHeading(aircraft, adjustedHeading % 360.0)

        local desiredSpeed = cfg.TaxiSpeed
        if math.abs(delta) > 35.0 then desiredSpeed = cfg.TaxiTurnSpeed end
        if distance < cfg.TaxiBrakeDistance then
            local brakingSpeed = math.max(1.5, cfg.TaxiSpeed * distance / cfg.TaxiBrakeDistance)
            desiredSpeed = math.min(desiredSpeed, brakingSpeed)
        end
        SetVehicleMaxSpeed(aircraft, desiredSpeed)

        if GetGameTimer() >= actionAt then
            TaskVehicleTempAction(pilot, aircraft, 9, 1200)
            actionAt = GetGameTimer() + 800
        end

        if GetGameTimer() - progressAt >= cfg.TaxiStuckSeconds * 1000 then
            local moved = #(vector2(coords.x, coords.y) - vector2(progressCoords.x, progressCoords.y))
            if moved < 1.5 then
                recoveries = recoveries + 1
                if recoveries > cfg.TaxiMaxRecoveries then
                    stopTaxi(state)
                    return false
                end
                TaskVehicleTempAction(pilot, aircraft, 3, 1400)
                Wait(1500)
                SetVehicleHandbrake(aircraft, false)
                TaskVehicleTempAction(pilot, aircraft, 9, 1200)
                actionAt = GetGameTimer() + 800
            else
                recoveries = 0
            end
            progressCoords = GetEntityCoords(aircraft)
            progressAt = GetGameTimer()
        end
        Wait(100)
    end
    stopTaxi(state)
    return false
end

local function planeFlight(state, destinationRunway, waypoint)
    local aircraft, pilot = state.aircraft, state.pilot
    local departureRunway = selectRunway(GetEntityCoords(aircraft), cfg.DepartureRunwayDistance)
    if not departureRunway then return false, 'no_departure_runway' end

    local takeoffStart, takeoffEnd = orientRunway(departureRunway, GetEntityCoords(aircraft))
    local takeoffVector = takeoffEnd - takeoffStart
    local takeoffLength = math.sqrt(takeoffVector.x * takeoffVector.x + takeoffVector.y * takeoffVector.y)
    if takeoffLength < 1.0 then return false end
    local tux, tuy = takeoffVector.x / takeoffLength, takeoffVector.y / takeoffLength
    local holdingPoint = vector3(takeoffStart.x - tux * 20.0, takeoffStart.y - tuy * 20.0, takeoffStart.z)
    local lineup = vector3(takeoffStart.x + tux * 45.0, takeoffStart.y + tuy * 45.0, takeoffStart.z)

    state.phase = 'departure_taxi'
    notify(cfg.Messages.taxiDeparture:format(departureRunway.name), 'inform')
    if not taxiTo(state, holdingPoint, cfg.TaxiTimeoutSeconds) then return false, 'taxi_blocked' end
    if not taxiTo(state, lineup, cfg.TaxiTimeoutSeconds) then return false, 'taxi_blocked' end

    state.phase = 'takeoff'
    notify(cfg.Messages.takingOff:format(departureRunway.name), 'inform')
    restoreAircraftSpeed(state)
    SetVehicleHandbrake(aircraft, false)
    local takeoffTarget = vector3(
        takeoffEnd.x + tux * 900.0,
        takeoffEnd.y + tuy * 900.0,
        takeoffEnd.z + cfg.ApproachAltitude
    )
    local takeoffHeading = GetHeadingFromVector_2d(takeoffVector.x, takeoffVector.y)
    TaskPlaneMission(pilot, aircraft, 0, 0, takeoffTarget.x, takeoffTarget.y, takeoffTarget.z,
        4, cfg.CruiseSpeed, 0.0, takeoffHeading, cfg.ApproachAltitude, 40.0)

    local deadline = GetGameTimer() + cfg.FlightTimeoutMinutes * 60000
    while active == state and DoesEntityExist(aircraft) and DoesEntityExist(pilot) and GetGameTimer() < deadline do
        if IsEntityDead(aircraft) or IsEntityDead(pilot) then return false end
        if GetEntityHeightAboveGround(aircraft) >= cfg.TakeoffClearanceHeight then break end
        Wait(500)
    end
    if GetEntityHeightAboveGround(aircraft) < cfg.TakeoffClearanceHeight then return false end
    -- State 1 starts the native retract animation; fixed-gear aircraft ignore it.
    SetVehicleLandingGear(aircraft, 1)

    local landStart, landEnd = orientRunway(destinationRunway, GetEntityCoords(aircraft))
    local landingVector = landEnd - landStart
    local landingLength = math.sqrt(landingVector.x * landingVector.x + landingVector.y * landingVector.y)
    if landingLength < 1.0 then return false end
    local lux, luy = landingVector.x / landingLength, landingVector.y / landingLength
    local approach = vector3(
        landStart.x - lux * cfg.ApproachDistance,
        landStart.y - luy * cfg.ApproachDistance,
        landStart.z + cfg.ApproachAltitude
    )
    local landingHeading = GetHeadingFromVector_2d(landingVector.x, landingVector.y)

    state.phase = 'cruise'
    notify(cfg.Messages.departing:format(destinationRunway.name), 'inform')
    TaskPlaneMission(pilot, aircraft, 0, 0, approach.x, approach.y, approach.z,
        4, cfg.CruiseSpeed, 0.0, landingHeading, cfg.ApproachAltitude, 60.0)

    local landingIssued = false
    while active == state and DoesEntityExist(aircraft) and DoesEntityExist(pilot) and GetGameTimer() < deadline do
        if IsEntityDead(aircraft) or IsEntityDead(pilot) then return false end
        local coords = GetEntityCoords(aircraft)
        if not landingIssued and #(coords - approach) < 900.0 then
            landingIssued = true
            state.phase = 'landing'
            notify(cfg.Messages.landing:format(destinationRunway.name), 'inform')
            SetVehicleLandingGear(aircraft, 0)
            TaskPlaneLand(pilot, aircraft, landStart.x, landStart.y, landStart.z,
                landEnd.x, landEnd.y, landEnd.z)
        elseif landingIssued then
            local distanceFromRunway = #(vector2(coords.x, coords.y) - vector2(landEnd.x, landEnd.y))
            if IsVehicleOnAllWheels(aircraft) and distanceFromRunway < 700.0 and GetEntitySpeed(aircraft) < 5.0 then
                state.phase = 'arrival_taxi'
                notify(cfg.Messages.taxiArrival:format(destinationRunway.name), 'inform')
                local taxiTarget = resolveGround(waypoint, destinationRunway.a.z)
                if not taxiTo(state, taxiTarget, cfg.TaxiTimeoutSeconds) then return false, 'taxi_blocked' end
                return true, destinationRunway.name
            end
        end
        Wait(500)
    end
    return false
end

local function helicopterFlight(state, waypoint)
    local aircraft, pilot = state.aircraft, state.pilot
    local origin = GetEntityCoords(aircraft)
    local destination = resolveGround(waypoint, waypoint.z)
    local heading = GetEntityHeading(aircraft)
    local deadline = GetGameTimer() + cfg.FlightTimeoutMinutes * 60000

    state.phase = 'heli_takeoff'
    notify(cfg.Messages.heliTakingOff, 'inform')
    TaskHeliMission(pilot, aircraft, 0, 0, origin.x, origin.y, origin.z + cfg.HeliTakeoffHeight,
        4, cfg.HeliTakeoffSpeed, -1.0, heading, cfg.HeliTakeoffHeight, 5.0, -1.0, 0)
    local takeoffDeadline = GetGameTimer() + cfg.HeliTakeoffTimeoutSeconds * 1000
    while active == state and DoesEntityExist(aircraft) and GetGameTimer() < takeoffDeadline do
        if IsEntityDead(aircraft) or IsEntityDead(pilot) then return false end
        if GetEntityHeightAboveGround(aircraft) >= cfg.HeliTakeoffClearanceHeight then break end
        Wait(100)
    end
    if GetEntityHeightAboveGround(aircraft) < cfg.HeliTakeoffClearanceHeight then return false end
    SetVehicleLandingGear(aircraft, 1)

    state.phase = 'cruise'
    TaskHeliMission(pilot, aircraft, 0, 0, destination.x, destination.y,
        destination.z + cfg.HeliCruiseAltitude, 4, cfg.HeliCruiseSpeed, -1.0, heading,
        cfg.HeliCruiseAltitude, 35.0, -1.0, 0)

    local landingIssued = false
    while active == state and DoesEntityExist(aircraft) and DoesEntityExist(pilot) and GetGameTimer() < deadline do
        if IsEntityDead(aircraft) or IsEntityDead(pilot) then return false end
        local coords = GetEntityCoords(aircraft)
        local horizontal = #(vector2(coords.x, coords.y) - vector2(destination.x, destination.y))
        if not landingIssued and horizontal < 350.0 then
            landingIssued = true
            state.phase = 'heli_landing'
            notify(cfg.Messages.heliLanding, 'inform')
            SetVehicleLandingGear(aircraft, 0)
            TaskHeliMission(pilot, aircraft, 0, 0, destination.x, destination.y, destination.z,
                20, 15.0, 5.0, heading, 20.0, 5.0, -1.0, 0)
        elseif landingIssued and horizontal < 25.0 and IsVehicleOnAllWheels(aircraft)
            and GetEntitySpeed(aircraft) < 2.5 then
            SetVehicleHandbrake(aircraft, true)
            return true, 'waypoint'
        end
        Wait(500)
    end
    return false
end

local function standby(state, destinationName)
    state.phase = 'parked'
    SetVehicleHandbrake(state.aircraft, true)
    notify(cfg.Messages.arrived:format(destinationName), 'success')

    state.standbyUntil = GetGameTimer() + cfg.PostFlightStandbySeconds * 1000
    while active == state and GetGameTimer() < state.standbyUntil do Wait(500) end
    if active ~= state then return end

    state.phase = 'dismissed'
    TaskLeaveVehicle(state.pilot, state.aircraft, 0)
    local cleanupDeadline = GetGameTimer() + cfg.CleanupWaitSeconds * 1000
    while active == state and GetGameTimer() < cleanupDeadline and not aircraftIsEmpty(state.aircraft) do Wait(1000) end
    cleanup(state, true)
    TriggerServerEvent('fbrp_personalpilot:finished', 'arrived')
end

RegisterNetEvent('fbrp_personalpilot:start', function(model, x, y, z)
    if active then return end
    local playerPed = PlayerPedId()
    local waypoint = vector3(tonumber(x) or 0.0, tonumber(y) or 0.0, tonumber(z) or 0.0)

    CreateThread(function()
        local state = { spawned = false, taxiSerial = 0 }
        active = state

        if model then
            local modelHash = GetHashKey(model)
            if not validPassengerAircraft(modelHash) then
                notify(cfg.Messages.badAircraft, 'error')
                cleanup(state, false)
                return TriggerServerEvent('fbrp_personalpilot:finished', 'bad_aircraft')
            end
            modelHash = loadModel(modelHash)
            if not modelHash then
                notify(cfg.Messages.loadFailed, 'error')
                cleanup(state, false)
                return TriggerServerEvent('fbrp_personalpilot:finished', 'load_failed')
            end
            state.aircraft, state.spawned = spawnAircraft(modelHash, playerPed), true
            SetModelAsNoLongerNeeded(modelHash)
        else
            state.aircraft = closestUsableAircraft(GetEntityCoords(playerPed))
        end

        if not state.aircraft or state.aircraft == 0 or not DoesEntityExist(state.aircraft) then
            notify(model and cfg.Messages.loadFailed or cfg.Messages.noAircraft, 'error')
            cleanup(state, true)
            return TriggerServerEvent('fbrp_personalpilot:finished', 'no_aircraft')
        end

        local aircraftHash = GetEntityModel(state.aircraft)
        if not validPassengerAircraft(aircraftHash) or not freePilotSeat(state.aircraft, playerPed) then
            notify(cfg.Messages.badAircraft, 'error')
            cleanup(state, true)
            return TriggerServerEvent('fbrp_personalpilot:finished', 'bad_aircraft')
        end
        state.isHelicopter = IsThisModelAHeli(aircraftHash)
        local destinationRunway = not state.isHelicopter and selectRunway(waypoint, cfg.RunwaySnapDistance) or nil
        if not state.isHelicopter and not destinationRunway then
            notify(cfg.Messages.badWaypoint, 'error')
            cleanup(state, true)
            return TriggerServerEvent('fbrp_personalpilot:finished', 'bad_runway')
        end
        if not state.isHelicopter and not selectRunway(GetEntityCoords(state.aircraft), cfg.DepartureRunwayDistance) then
            notify(cfg.Messages.noDepartureRunway, 'error')
            cleanup(state, true)
            return TriggerServerEvent('fbrp_personalpilot:finished', 'bad_departure_runway')
        end

        local pilotHash = loadModel(cfg.PilotModel)
        if not pilotHash then
            notify(cfg.Messages.loadFailed, 'error')
            cleanup(state, true)
            return TriggerServerEvent('fbrp_personalpilot:finished', 'pilot_load_failed')
        end

        local pos = GetOffsetFromEntityInWorldCoords(state.aircraft, -4.0, 0.0, 0.5)
        state.pilot = CreatePed(4, pilotHash, pos.x, pos.y, pos.z, GetEntityHeading(state.aircraft), true, true)
        SetModelAsNoLongerNeeded(pilotHash)
        if state.pilot == 0 or not putPilotInAircraft(state.pilot, state.aircraft) then
            notify(cfg.Messages.flightFailed, 'error')
            cleanup(state, true)
            return TriggerServerEvent('fbrp_personalpilot:finished', 'pilot_entry_failed')
        end

        if not waitForBoarding(state) then
            notify(cfg.Messages.boardingExpired, 'error')
            cleanup(state, true)
            return TriggerServerEvent('fbrp_personalpilot:finished', 'boarding_timeout')
        end

        preparePilot(state)
        local completed, destinationName
        if state.isHelicopter then
            completed, destinationName = helicopterFlight(state, waypoint)
        else
            completed, destinationName = planeFlight(state, destinationRunway, waypoint)
        end

        if completed then
            standby(state, destinationName)
        elseif active == state then
            if destinationName == 'no_departure_runway' then notify(cfg.Messages.noDepartureRunway, 'error')
            elseif destinationName == 'taxi_blocked' then notify(cfg.Messages.taxiBlocked, 'error')
            else notify(cfg.Messages.flightFailed, 'error') end
            cleanup(state, true)
            TriggerServerEvent('fbrp_personalpilot:finished', destinationName or 'flight_failed')
        end
    end)
end)

RegisterNetEvent('fbrp_personalpilot:cancelled', function()
    if active then cleanup(active, true) end
    notify(cfg.Messages.cancelled, 'inform')
end)

RegisterCommand(cfg.Command, function(_, args)
    if active then return notify(cfg.Messages.busy, 'error') end
    local blip = GetFirstBlipInfoId(8)
    if blip == 0 then return notify(cfg.Messages.noWaypoint, 'error') end
    local waypoint = GetBlipCoords(blip)
    local model = args[1] and args[1]:lower() or nil
    TriggerServerEvent('fbrp_personalpilot:request', model, waypoint.x, waypoint.y, waypoint.z)
end, false)

RegisterCommand(cfg.TaxiCommand, function()
    local state = active
    if not state or state.isHelicopter or state.phase ~= 'parked' then
        return notify(cfg.Messages.taxiUnavailable, 'error')
    end
    local blip = GetFirstBlipInfoId(8)
    if blip == 0 then return notify(cfg.Messages.taxiNoWaypoint, 'error') end
    local waypoint = GetBlipCoords(blip)
    local target = resolveGround(waypoint, GetEntityCoords(state.aircraft).z)
    state.phase = 'manual_taxi'
    state.standbyUntil = GetGameTimer() + (cfg.TaxiTimeoutSeconds + cfg.PostFlightStandbySeconds) * 1000
    notify(cfg.Messages.taxiing, 'inform')
    CreateThread(function()
        local arrived = taxiTo(state, target, cfg.TaxiTimeoutSeconds)
        if active == state then
            state.phase = 'parked'
            if arrived then notify(cfg.Messages.arrived:format('the taxi waypoint'), 'success')
            else notify(cfg.Messages.taxiBlocked, 'error') end
        end
    end)
end, false)

RegisterCommand(cfg.CancelCommand, function()
    if active then TriggerServerEvent('fbrp_personalpilot:cancel') end
end, false)

TriggerEvent('chat:addSuggestion', '/' .. cfg.Command, '[Trial Management+] Hire an NPC pilot for a complete waypoint flight', {
    { name = 'aircraft model', help = 'Optional passenger plane or helicopter model (for example luxor2, nimbus, swift, or maverick)' },
})
TriggerEvent('chat:addSuggestion', '/' .. cfg.TaxiCommand, 'After landing, taxi the plane to your current waypoint')
TriggerEvent('chat:addSuggestion', '/' .. cfg.CancelCommand, 'Cancel or dismiss your active personal pilot')

AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() and active then cleanup(active, true) end
end)
