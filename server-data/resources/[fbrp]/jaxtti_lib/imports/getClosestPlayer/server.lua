return function(coords, maxDistance, ignore)
    local p = lib.getNearbyPlayers(coords, maxDistance, ignore)[1]
    if p then return p.id, p.ped, p.coords, p.distance end
end
