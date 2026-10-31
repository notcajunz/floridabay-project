return function(model, timeout)
    if type(model) ~= 'number' then model = joaat(model) end
    if not IsModelValid(model) and not IsModelInCdimage(model) then
        error(("invalid model '%s'"):format(tostring(model)), 2)
    end
    return lib.streamingRequest(RequestModel, HasModelLoaded, 'model', model, timeout)
end
