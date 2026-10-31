return function(vehicle, props)
    if not vehicle or not DoesEntityExist(vehicle) or type(props) ~= 'table' then return false end

    SetVehicleModKit(vehicle, 0)

    if props.plate then SetVehicleNumberPlateText(vehicle, props.plate) end
    if props.plateIndex then SetVehicleNumberPlateTextIndex(vehicle, props.plateIndex) end

    if props.bodyHealth then SetVehicleBodyHealth(vehicle, props.bodyHealth + 0.0) end
    if props.engineHealth then SetVehicleEngineHealth(vehicle, props.engineHealth + 0.0) end
    if props.tankHealth then SetVehiclePetrolTankHealth(vehicle, props.tankHealth + 0.0) end
    if props.fuelLevel then SetVehicleFuelLevel(vehicle, props.fuelLevel + 0.0) end
    if props.oilLevel then SetVehicleOilLevel(vehicle, props.oilLevel + 0.0) end
    if props.dirtLevel then SetVehicleDirtLevel(vehicle, props.dirtLevel + 0.0) end

    local c1, c2 = GetVehicleColours(vehicle)
    if props.color1 ~= nil then
        if type(props.color1) == 'table' then
            SetVehicleCustomPrimaryColour(vehicle, props.color1[1], props.color1[2], props.color1[3])
        else
            ClearVehicleCustomPrimaryColour(vehicle)
            c1 = props.color1
        end
    end
    if props.color2 ~= nil then
        if type(props.color2) == 'table' then
            SetVehicleCustomSecondaryColour(vehicle, props.color2[1], props.color2[2], props.color2[3])
        else
            ClearVehicleCustomSecondaryColour(vehicle)
            c2 = props.color2
        end
    end
    SetVehicleColours(vehicle, c1, c2)

    local pearl, wheel = GetVehicleExtraColours(vehicle)
    SetVehicleExtraColours(vehicle, props.pearlescentColor or pearl, props.wheelColor or wheel)
    if props.interiorColor then SetVehicleInteriorColor(vehicle, props.interiorColor) end
    if props.dashboardColor then SetVehicleDashboardColor(vehicle, props.dashboardColor) end

    if props.wheels then SetVehicleWheelType(vehicle, props.wheels) end
    if props.windowTint then SetVehicleWindowTint(vehicle, props.windowTint) end

    for index, name in pairs(lib.vehicleMods) do
        local value = props[name]
        if value ~= nil then
            local custom = (index == 23 and props.modCustomTiresF) or (index == 24 and props.modCustomTiresR) or false
            SetVehicleMod(vehicle, index, value, custom and true or false)
        end
    end

    if props.modTurbo ~= nil then ToggleVehicleMod(vehicle, 18, props.modTurbo) end
    if props.modSmokeEnabled ~= nil then ToggleVehicleMod(vehicle, 20, props.modSmokeEnabled) end
    if props.modXenon ~= nil then ToggleVehicleMod(vehicle, 22, props.modXenon) end
    if props.xenonColor then SetVehicleXenonLightsColor(vehicle, props.xenonColor) end

    if props.livery and props.livery ~= -1 then SetVehicleLivery(vehicle, props.livery) end
    if props.roofLivery and props.roofLivery ~= -1 then SetVehicleRoofLivery(vehicle, props.roofLivery) end

    if props.neonEnabled then
        for i = 1, 4 do SetVehicleNeonLightEnabled(vehicle, i - 1, props.neonEnabled[i] == true) end
    end
    if props.neonColor then SetVehicleNeonLightsColour(vehicle, props.neonColor[1], props.neonColor[2], props.neonColor[3]) end
    if props.tyreSmokeColor then SetVehicleTyreSmokeColor(vehicle, props.tyreSmokeColor[1], props.tyreSmokeColor[2], props.tyreSmokeColor[3]) end

    if props.extras then
        for id, on in pairs(props.extras) do
            SetVehicleExtra(vehicle, tonumber(id), not on)
        end
    end

    if props.bulletProofTyres ~= nil then SetVehicleTyresCanBurst(vehicle, not props.bulletProofTyres) end
    if props.driftTyres ~= nil and SetDriftTyresEnabled then SetDriftTyresEnabled(vehicle, props.driftTyres) end

    if props.windows then
        for _, i in ipairs(props.windows) do SmashVehicleWindow(vehicle, i) end
    end
    if props.doors then
        for _, i in ipairs(props.doors) do SetVehicleDoorBroken(vehicle, i, true) end
    end
    if props.tyres then
        for i, state in pairs(props.tyres) do
            SetVehicleTyreBurst(vehicle, tonumber(i), state == 2, 1000.0)
        end
    end

    return true
end
