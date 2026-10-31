local cfg = DVConfig

local function notify(description, kind)
    lib.notify({ title = 'Delete Vehicle', description = description, type = kind or 'inform', position = cfg.notifyPosition, icon = 'fa-solid fa-car-burst' })
end

-- the vehicle you're in, else the one you're looking at, else the closest one nearby
local function findVehicle()
    local ped = PlayerPedId()
    local inside = GetVehiclePedIsIn(ped, false)
    if inside ~= 0 then return inside end

    local from = GetEntityCoords(ped)
    local to = GetOffsetFromEntityInWorldCoords(ped, 0.0, cfg.distance, 0.0)
    local ray = StartShapeTestCapsule(from.x, from.y, from.z, to.x, to.y, to.z, 1.5, 10, ped, 7)
    local _, hit, _, _, entity = GetShapeTestResult(ray)
    if hit == 1 and entity ~= 0 and IsEntityAVehicle(entity) then return entity end

    local closest, best = 0, cfg.distance
    for _, vehicle in ipairs(GetGamePool('CVehicle')) do
        local dist = #(from - GetEntityCoords(vehicle))
        if dist <= best then closest, best = vehicle, dist end
    end
    return closest
end

RegisterNetEvent('fbrp_deleteveh:notify', notify)

local lastUse = 0
RegisterCommand(cfg.command, function()
    if GetGameTimer() - lastUse < cfg.cooldown then return end
    lastUse = GetGameTimer()

    local vehicle = findVehicle()
    if vehicle == 0 or not DoesEntityExist(vehicle) then
        return notify('No vehicle nearby.', 'error')
    end

    if NetworkGetEntityIsNetworked(vehicle) then
        -- networked: the server deletes it, so it works no matter who spawned it
        TriggerServerEvent('fbrp_deleteveh:delete', NetworkGetNetworkIdFromEntity(vehicle))
    else
        -- local-only vehicle (e.g. a parked ambient car that never synced)
        SetEntityAsMissionEntity(vehicle, true, true)
        DeleteVehicle(vehicle)
        notify('Vehicle deleted.', 'success')
    end
end, false)

TriggerEvent('chat:addSuggestion', '/' .. cfg.command, 'Delete the vehicle you are in or the closest one')
