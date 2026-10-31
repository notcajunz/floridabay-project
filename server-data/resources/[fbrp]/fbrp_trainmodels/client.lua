-- amb-roxwood-trains (escrowed) builds its freight trains with CreateMissionTrain but never requests the
-- vanilla carriage models, so the game logs "Failed to spawn mission train as carriage hash '184361638'
-- (freightcar) is not loaded". These are the vehicles named in the package's trains.xml. Request them
-- up front and keep them loaded.
local models = {
    'freight', 'freightcar', 'freightcar2', 'freightcont1', 'freightcont2', 'freightgrain', 'tankercar', 'metrotrain',
}

local function ensureLoaded(name)
    local hash = joaat(name)
    if not IsModelInCdimage(hash) then return end
    local timeout = GetGameTimer() + 5000
    RequestModel(hash)
    while not HasModelLoaded(hash) and GetGameTimer() < timeout do
        Wait(50)
        RequestModel(hash)
    end
end

CreateThread(function()
    while true do
        for _, name in ipairs(models) do
            if not HasModelLoaded(joaat(name)) then ensureLoaded(name) end
        end
        Wait(15000)
    end
end)
