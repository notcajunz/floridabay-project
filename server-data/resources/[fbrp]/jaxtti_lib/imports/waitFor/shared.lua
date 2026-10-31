return function(cb, errMessage, timeout)
    local value = cb()
    if value ~= nil then return value end

    if timeout ~= false then timeout = tonumber(timeout) or 1000 end
    local start = GetGameTimer()

    while value == nil do
        Wait(0)
        if timeout and GetGameTimer() - start > timeout then
            error(('%s (waited %dms)'):format(errMessage or 'lib.waitFor timed out', timeout), 2)
        end
        value = cb()
    end

    return value
end
