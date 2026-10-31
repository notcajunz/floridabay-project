return function(set, timeout)
    return lib.streamingRequest(RequestAnimSet, HasAnimSetLoaded, 'animSet', set, timeout)
end
