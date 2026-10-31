return function(coords, maxDistance, includePlayerVehicle)
    coords = coords or GetEntityCoords(cache.ped)
    maxDistance = maxDistance or 2.0
    local out = {}
    for _, veh in ipairs(GetGamePool('CVehicle')) do
        if includePlayerVehicle or veh ~= cache.vehicle then
            local vc = GetEntityCoords(veh)
            local d = #(coords - vc)
            if d <= maxDistance then out[#out + 1] = { vehicle = veh, coords = vc, distance = d } end
        end
    end
    table.sort(out, function(a, b) return a.distance < b.distance end)
    return out
end
