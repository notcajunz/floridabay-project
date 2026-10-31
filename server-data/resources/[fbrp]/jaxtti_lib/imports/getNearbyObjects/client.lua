return function(coords, maxDistance)
    coords = coords or GetEntityCoords(cache.ped)
    maxDistance = maxDistance or 2.0
    local out = {}
    for _, obj in ipairs(GetGamePool('CObject')) do
        local oc = GetEntityCoords(obj)
        local d = #(coords - oc)
        if d <= maxDistance then out[#out + 1] = { object = obj, coords = oc, distance = d } end
    end
    table.sort(out, function(a, b) return a.distance < b.distance end)
    return out
end
