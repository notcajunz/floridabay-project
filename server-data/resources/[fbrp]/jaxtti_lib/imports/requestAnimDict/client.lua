return function(dict, timeout)
    if type(dict) ~= 'string' then error('requestAnimDict: dict must be a string', 2) end
    if not DoesAnimDictExist(dict) then error(("animation dictionary '%s' does not exist"):format(dict), 2) end
    return lib.streamingRequest(RequestAnimDict, HasAnimDictLoaded, 'animDict', dict, timeout)
end
