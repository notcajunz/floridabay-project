return function(coords, maxDistance, ignore)
    maxDistance = maxDistance or 2.0
    local out = {}
    for _, sid in ipairs(GetPlayers()) do
        local id = tonumber(sid)
        if id ~= ignore then
            local ped = GetPlayerPed(id)
            if ped ~= 0 then
                local pc = GetEntityCoords(ped)
                local d = #(coords - pc)
                if d <= maxDistance then out[#out + 1] = { id = id, ped = ped, coords = pc, distance = d } end
            end
        end
    end
    table.sort(out, function(a, b) return a.distance < b.distance end)
    return out
end
