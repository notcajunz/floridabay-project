return function(coords, maxDistance)
    local p = lib.getNearbyPeds(coords, maxDistance or 5.0)[1]
    if p then return p.ped, p.coords, p.distance end
end
