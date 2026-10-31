CreateThread(function()
    while not NetworkIsPlayerActive(PlayerId()) do Wait(500) end
    TriggerServerEvent('fbrp_buildprobe:report', GetGameBuildNumber())
end)
