return function(coords, maxDistance)
    local o = lib.getNearbyObjects(coords, maxDistance or 5.0)[1]
    if o then return o.object, o.coords, o.distance end
end
