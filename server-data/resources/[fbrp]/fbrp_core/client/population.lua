-- Lower ambient population without removing the city entirely. Density natives
-- reset every frame, so these values deliberately live in one tiny hot loop.

CreateThread(function()
    while true do
        local density = FBRP.Config.populationDensity or {}
        SetVehicleDensityMultiplierThisFrame(tonumber(density.vehicles) or 0.35)
        SetRandomVehicleDensityMultiplierThisFrame(tonumber(density.randomVehicles) or 0.30)
        SetParkedVehicleDensityMultiplierThisFrame(tonumber(density.parkedVehicles) or 0.25)
        SetPedDensityMultiplierThisFrame(tonumber(density.peds) or 0.40)
        local scenarios = tonumber(density.scenarioPeds) or 0.35
        SetScenarioPedDensityMultiplierThisFrame(scenarios, scenarios)
        Wait(0)
    end
end)
