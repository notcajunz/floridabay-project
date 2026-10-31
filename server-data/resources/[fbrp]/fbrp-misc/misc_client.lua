local hasSpawned = false
AddEventHandler("playerSpawned", function()
    if hasSpawned then return end
    hasSpawned = true
    -- preload the nitrous effects so cars with nitrous work properly (gives up after 10s)
    RequestNamedPtfxAsset("weap_xs_vehicle_weapons")
    local untilAt = GetGameTimer() + 10000
    while not HasNamedPtfxAssetLoaded("weap_xs_vehicle_weapons") and GetGameTimer() < untilAt do
        Wait(50)
    end
end)

-- no free weapons / armour from getting into police cars and similar
CreateThread(function()
    while true do
        DisablePlayerVehicleRewards(PlayerId())
        Wait(0)
    end
end)
