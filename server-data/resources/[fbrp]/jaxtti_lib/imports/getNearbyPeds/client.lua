return function(coords, maxDistance)
    coords = coords or GetEntityCoords(cache.ped)
    maxDistance = maxDistance or 2.0
    local out = {}
    for _, ped in ipairs(GetGamePool('CPed')) do
        if not IsPedAPlayer(ped) then
            local pc = GetEntityCoords(ped)
            local d = #(coords - pc)
            if d <= maxDistance then out[#out + 1] = { ped = ped, coords = pc, distance = d } end
        end
    end
    table.sort(out, function(a, b) return a.distance < b.distance end)
    return out
end
