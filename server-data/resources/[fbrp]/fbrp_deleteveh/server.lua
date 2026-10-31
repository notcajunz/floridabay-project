local cfg = DVConfig

local function notify(src, description, kind)
    TriggerClientEvent('fbrp_deleteveh:notify', src, description, kind)
end

-- other players sitting in the vehicle (not counting the person using /dv)
local function otherOccupants(vehicle, src)
    for _, id in ipairs(GetPlayers()) do
        id = tonumber(id)
        if id ~= src and GetVehiclePedIsIn(GetPlayerPed(id), false) == vehicle then return true end
    end
    return false
end

local lastUse = {}
RegisterNetEvent('fbrp_deleteveh:delete', function(netId)
    local src = source
    local now = GetGameTimer()
    if lastUse[src] and now - lastUse[src] < cfg.cooldown then return end
    lastUse[src] = now

    if cfg.ace and not IsPlayerAceAllowed(src, cfg.ace) then
        return notify(src, 'You do not have permission to use this.', 'error')
    end

    local vehicle = NetworkGetEntityFromNetworkId(tonumber(netId) or 0)
    if vehicle == 0 or not DoesEntityExist(vehicle) or GetEntityType(vehicle) ~= 2 then
        return notify(src, 'No vehicle nearby.', 'error')
    end

    -- the client says which car; make sure it's actually close to them
    local ped = GetPlayerPed(src)
    local inside = GetVehiclePedIsIn(ped, false) == vehicle
    if not inside and #(GetEntityCoords(ped) - GetEntityCoords(vehicle)) > cfg.distance + 5.0 then
        return notify(src, 'That vehicle is too far away.', 'error')
    end

    local staff = cfg.staffAce and IsPlayerAceAllowed(src, cfg.staffAce)
    if not staff and otherOccupants(vehicle, src) then
        return notify(src, 'Someone is in that vehicle.', 'error')
    end

    DeleteEntity(vehicle)
    notify(src, 'Vehicle deleted.', 'success')
end)

AddEventHandler('playerDropped', function()
    lastUse[source] = nil
end)
