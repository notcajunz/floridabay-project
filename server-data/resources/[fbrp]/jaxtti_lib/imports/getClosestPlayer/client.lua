return function(coords, maxDistance, includePlayer)
    local p = lib.getNearbyPlayers(coords, maxDistance, includePlayer)[1]
    if p then return p.id, p.ped, p.coords, p.distance end
end
