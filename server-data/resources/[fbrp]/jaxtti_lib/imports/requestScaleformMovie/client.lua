return function(name, timeout)
    local handle = RequestScaleformMovie(name)
    return lib.waitFor(function()
        if HasScaleformMovieLoaded(handle) then return handle end
    end, ("failed to load scaleform '%s'"):format(name), timeout or 10000)
end
