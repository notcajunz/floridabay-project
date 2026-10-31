local Config = require 'shared.import'

local DEBUG = false
Log = {
    debug = function(msg) if DEBUG then print(('^5[fbrp_donatormenu] %s^7'):format(msg)) end end,
    info = function(msg) if DEBUG then print(('[fbrp_donatormenu] %s'):format(msg)) end end,
    error = function(msg) print(('^1[fbrp_donatormenu] %s^7'):format(msg)) end,
}

function isRestrained()
    if LocalPlayer.state.restrained then return true end
    if LocalPlayer.state.dead then return true end
    return false
end

function Notify(message, type)
    lib.notify({
        title = 'FBRP Donator Menu',
        description = message,
        type = type or 'inform',
        position = Config.settings.notifyPosition or 'center-right',
        icon = 'fa-solid fa-car'
    })
end

function getMenuNameFromRole(id)
    for _, data in pairs(Config.packs) do
        if data.id == id then
            return data.label
        end
    end
    for _, data in pairs(Config.core) do
        if data.id == id then
            return data.label
        end
    end
    return id
end

local maxTimer = 10000

local isSpawningVehicle = false
function spawnVehicle(vehicleData)
    Log.debug(('Spawning vehicle %s'):format(vehicleData.name))

    if isRestrained() then
        Log.error("You cannot spawn a vehicle while restrained.")
        Notify('You cannot spawn a vehicle while restrained.', 'error')
        return false
    end

    if LocalPlayer.state.restrictedPlace then
        Log.error("You cannot spawn a vehicle in this area.")
        Notify('You cannot spawn a vehicle in this area.', 'error')
        return false
    end

    if isSpawningVehicle then
        Log.error("Already spawning a vehicle. Please wait.")
        Notify('Already spawning a vehicle. Please wait.', 'error')
        return false
    end

    Log.debug(('Spawning vehicle with model %s'):format(vehicleData.spawnCode))
    isSpawningVehicle = true

    local hash = GetHashKey(vehicleData.spawnCode)
    if not IsModelInCdimage(hash) then
        Log.error("Invalid model for spawnVehicle.")
        Notify(('Vehicle model "%s" is not on the server.'):format(tostring(vehicleData.spawnCode)), 'error')
        isSpawningVehicle = false
        return
    end

    local timer = 0

    RequestModel(hash)
    while not HasModelLoaded(hash) do
        Wait(100)
        timer = timer + 100
        if timer >= maxTimer then
            Log.error("Timed out waiting for vehicle model to load.")
            Notify('Vehicle took too long to load, try again.', 'error')
            isSpawningVehicle = false
            return
        end
    end

    local targetCoords = GetEntityCoords(PlayerPedId())
    local targetHeading = GetEntityHeading(PlayerPedId())

    local ped = PlayerPedId()
    local current = GetVehiclePedIsIn(ped, false)
    if current ~= 0 and GetPedInVehicleSeat(current, -1) == ped then
        SetEntityAsMissionEntity(current, true, true)
        DeleteVehicle(current)
    end

    local vehicle = CreateVehicle(hash, targetCoords.x, targetCoords.y, targetCoords.z, targetHeading, true, false)
    SetModelAsNoLongerNeeded(hash)
    SetVehicleOnGroundProperly(vehicle)
    SetVehicleHasBeenOwnedByPlayer(vehicle, true)
    SetVehicleNeedsToBeHotwired(vehicle, false)
    SetVehRadioStation(vehicle, 'OFF')
    SetPedIntoVehicle(PlayerPedId(), vehicle, -1)

    Notify('Spawned Vehicle Successfully!', 'success')
    SetTimeout(2000, function()
        isSpawningVehicle = false
        Log.info(('Spawned vehicle %s successfully.'):format(vehicleData.name))
    end)
end

function spawnPed(model)
    if isRestrained() then
        Log.error("You cannot spawn a ped while restrained.")
        Notify('You cannot spawn a ped while restrained.', 'error')
        return false
    end

    Log.debug(('Spawning ped with model %s'):format(model))

    local ok, loaded = pcall(lib.requestModel, model, 10000)
    if not ok or not loaded then
        loaded = type(model) == 'string' and GetHashKey(model) or model
        if IsModelInCdimage(loaded) then
            RequestModel(loaded)
            local waited = 0
            while not HasModelLoaded(loaded) and waited < 10000 do Wait(100) waited = waited + 100 end
        end
        ok = HasModelLoaded(loaded)
    end
    if not ok then
        Log.error(('Failed to load model %s'):format(model))
        Notify('Failed to load model.', 'error')
        return false
    end

    SetPlayerModel(PlayerId(), loaded)
    Wait(100)
    SetPedDefaultComponentVariation(PlayerPedId());
    ClearAllPedProps(PlayerPedId());
    ClearPedDecorations(PlayerPedId());
    ClearPedFacialDecorations(PlayerPedId());
    SetModelAsNoLongerNeeded(loaded)
    Notify('Ped spawned successfully!', 'success')
end
