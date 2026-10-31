return function(coords, maxDistance, includePlayer)
    coords = coords or GetEntityCoords(cache.ped)
    maxDistance = maxDistance or 2.0
    local out = {}
    for _, id in ipairs(GetActivePlayers()) do
        if includePlayer or id ~= cache.playerId then
            local ped = GetPlayerPed(id)
            local pc = GetEntityCoords(ped)
            local d = #(coords - pc)
            if d <= maxDistance then
                out[#out + 1] = { id = id, serverId = GetPlayerServerId(id), ped = ped, coords = pc, distance = d }
            end
        end
    end
    table.sort(out, function(a, b) return a.distance < b.distance end)
    return out
end
