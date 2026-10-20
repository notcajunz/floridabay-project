-- Publishes the live player count for the Discord rich presence tooltip. Everything else the
-- presence shows (character, organization, duty) already travels in player state bags.

local function publish(excluding)
    local count = #GetPlayers()
    if excluding then count = math.max(0, count - 1) end
    GlobalState['fbrp:onlinePlayers'] = count
    GlobalState['fbrp:maxPlayers'] = GetConvarInt('sv_maxclients', 48)
end

AddEventHandler('playerJoining', function() SetTimeout(1000, publish) end)
AddEventHandler('playerDropped', function() publish(true) end)

CreateThread(function()
    while true do
        publish()
        Wait(30000)
    end
end)
