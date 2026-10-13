-- Client screen-state reports from client/screenguard.lua. They land in the
-- server console so a stuck dark or grey screen can be diagnosed remotely.
local lastReport = {}

RegisterNetEvent('fbrp:screen:report', function(reason, state)
    local src = source
    local at = GetGameTimer()
    if (lastReport[src] or 0) + 1500 > at then return end
    lastReport[src] = at
    if type(state) ~= 'table' then return end

    local parts = {}
    for key, value in pairs(state) do
        local kind = type(value)
        if type(key) == 'string' and #key <= 24 and (kind == 'boolean' or kind == 'number' or kind == 'string') then
            parts[#parts + 1] = ('%s=%s'):format(key, tostring(value):sub(1, 80))
        end
        if #parts >= 40 then break end
    end
    table.sort(parts)
    print(('[FBRP] screen %s | %s #%d | %s'):format(tostring(reason):sub(1, 40), GetPlayerName(src) or '?', src, table.concat(parts, ' ')))
end)

AddEventHandler('playerDropped', function()
    lastReport[source] = nil
end)

-- One game-frame capture (no NUI) per report, saved as base64 JPEG text in this
-- resource's screencaps/ folder (Lua may only write inside its own resource).
-- Decoding is left to the host so a large image never stalls the server thread.
local lastCapture = {}

RegisterNetEvent('fbrp:screen:capture', function(reason, data)
    local src = source
    local at = GetGameTimer()
    if (lastCapture[src] or 0) + 5000 > at then return end
    lastCapture[src] = at
    if type(data) ~= 'string' or #data > 2500000 then return end
    local payload = data:match('^data:image/jpeg;base64,(.+)$')
    if not payload then return end

    local name = ('%s_%d_%s.jpg.b64'):format(os.date('!%Y%m%dT%H%M%S'), src, tostring(reason):gsub('[^%w%+%-]', ''):sub(1, 20))
    if not SaveResourceFile(GetCurrentResourceName(), 'screencaps/' .. name, payload, -1) then
        return print('[FBRP] screen capture: cannot write screencaps/' .. name)
    end
    print(('[FBRP] screen capture saved: fbrp_core/screencaps/%s (%s #%d)'):format(name, GetPlayerName(src) or '?', src))
end)

AddEventHandler('playerDropped', function()
    lastCapture[source] = nil
end)
