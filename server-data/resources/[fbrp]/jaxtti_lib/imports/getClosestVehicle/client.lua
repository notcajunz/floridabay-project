return function(coords, maxDistance, includePlayerVehicle)
    local v = lib.getNearbyVehicles(coords, maxDistance or 5.0, includePlayerVehicle)[1]
    if v then return v.vehicle, v.coords, v.distance end
end
