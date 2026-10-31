return function(set, timeout)
    return lib.streamingRequest(RequestClipSet, HasClipSetLoaded, 'clipSet', set, timeout)
end
