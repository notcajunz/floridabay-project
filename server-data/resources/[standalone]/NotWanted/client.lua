-- FiveM's old 2017 Not Wanted release only cleared the current stars. Keep the
-- same behavior reliable on current artifacts by also preventing new stars and
-- disabling ambient police dispatch for this player.
CreateThread(function()
    SetMaxWantedLevel(0)
    SetCreateRandomCops(false)
    SetCreateRandomCopsNotOnScenarios(false)
    SetCreateRandomCopsOnScenarios(false)

    for service = 1, 15 do
        EnableDispatchService(service, false)
    end

    while true do
        local player = PlayerId()
        SetPoliceIgnorePlayer(player, true)
        SetDispatchCopsForPlayer(player, false)
        SetPlayerWantedLevel(player, 0, false)
        SetPlayerWantedLevelNow(player, false)
        Wait(250)
    end
end)
