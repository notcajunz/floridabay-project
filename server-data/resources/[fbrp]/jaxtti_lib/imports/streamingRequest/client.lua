return function(request, hasLoaded, assetType, asset, timeout)
    if hasLoaded(asset) then return asset end
    request(asset)
    return lib.waitFor(function()
        if hasLoaded(asset) then return asset end
    end, ("failed to load %s '%s'"):format(assetType, tostring(asset)), timeout or 10000)
end
