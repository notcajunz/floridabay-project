-- FBRP Fuel - server: shares fuel levels and routes wrong-fuel damage to whoever controls the vehicle

local last = {}

local function nearVehicle(src, vehicle, distance)
    local ped = GetPlayerPed(src)
    if ped <= 0 or vehicle == 0 or not DoesEntityExist(vehicle) then return false end
    return #(GetEntityCoords(ped) - GetEntityCoords(vehicle)) <= distance
end

-- a player refuelled a vehicle they don't control: store the level on the vehicle for everyone
RegisterNetEvent('fbrp_fuel:set', function(netId, level)
    local src = source
    local now = GetGameTimer()
    if last[src] and now - last[src] < 400 then return end
    last[src] = now
    local vehicle = NetworkGetEntityFromNetworkId(tonumber(netId) or 0)
    if not nearVehicle(src, vehicle, 20.0) then return end
    level = math.max(0.0, math.min(100.0, tonumber(level) or 0.0))
    Entity(vehicle).state:set('fbrpFuel', math.floor(level * 10.0 + 0.5) / 10.0, true)
end)

-- wrong fuel: damage has to be applied by the client that controls the vehicle
RegisterNetEvent('fbrp_fuel:misfuel', function(netId)
    local src = source
    local vehicle = NetworkGetEntityFromNetworkId(tonumber(netId) or 0)
    if not nearVehicle(src, vehicle, 20.0) then return end
    local owner = NetworkGetEntityOwner(vehicle)
    TriggerClientEvent('fbrp_fuel:applyMisfuel', owner > 0 and owner or src, netId)
end)

AddEventHandler('playerDropped', function() last[source] = nil end)
