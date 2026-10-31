local function registerApp()
    local ok, err = pcall(function()
        exports['lb-phone']:AddCustomApp({
            identifier = 'dps_transit',
            name = 'Transit',
            description = 'Live train arrivals across DelPerroSands',
            developer = 'DPS Transit Authority',
            defaultApp = true,
            size = 512,
            ui = GetCurrentResourceName() .. '/ui/index.html',
            icon = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f686.png',
        })
    end)
    if not ok then print('^1[dps-transitapp] AddCustomApp failed: ' .. tostring(err) .. '^7') end
end

-- FBRP: the phone is sky_phone, which provides the 'lb-phone' alias and accepts this unchanged LB Phone app
-- registration. Wait for either name, and re-register if either restarts after us.
local function phoneStarted()
    return GetResourceState('sky_phone') == 'started' or GetResourceState('lb-phone') == 'started'
end

-- Register on start, and RE-register if the phone restarts after us (otherwise the
-- Transit app silently disappears until this resource is restarted too).
CreateThread(function()
    while not phoneStarted() do Wait(1000) end
    Wait(2000)
    registerApp()
end)

AddEventHandler('onResourceStart', function(res)
    if res ~= 'lb-phone' and res ~= 'sky_phone' then return end
    CreateThread(function()
        Wait(5000)
        registerApp()
    end)
end)

RegisterNUICallback('getBoard', function(_, cb)
    local board = lib.callback.await('dps-transitapp:getBoard', false) or {}
    local pos = GetEntityCoords(PlayerPedId())
    for _, st in ipairs(board) do
        if st.coords and type(st.coords.x) == 'number' and type(st.coords.y) == 'number' then
            st.dist = math.floor(#(vector2(pos.x, pos.y) - vector2(st.coords.x, st.coords.y)))
        else
            st.dist = -1  -- unknown; UI renders this as blank rather than NaN
        end
    end
    table.sort(board, function(a, b) return a.dist < b.dist end)
    cb(board)
end)
