local function closeLoadingScreen()
    ShutdownLoadingScreen()
    ShutdownLoadingScreenNui()
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
end

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(100) end
    closeLoadingScreen()

    -- Run once more after the first frame transition in case the browser was
    -- still finishing its load-progress message during the initial shutdown.
    Wait(750)
    closeLoadingScreen()
end)

AddEventHandler('playerSpawned', function()
    SetTimeout(100, closeLoadingScreen)
end)
