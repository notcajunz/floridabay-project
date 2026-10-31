return function(vehicle)
    if not vehicle or not DoesEntityExist(vehicle) then return nil end

    local color1, color2 = GetVehicleColours(vehicle)
    local pearlescent, wheelColor = GetVehicleExtraColours(vehicle)

    if GetIsVehiclePrimaryColourCustom(vehicle) then
        local r, g, b = GetVehicleCustomPrimaryColour(vehicle)
        color1 = { r, g, b }
    end
    if GetIsVehicleSecondaryColourCustom(vehicle) then
        local r, g, b = GetVehicleCustomSecondaryColour(vehicle)
        color2 = { r, g, b }
    end

    local props = {
        model = GetEntityModel(vehicle),
        plate = (GetVehicleNumberPlateText(vehicle):gsub('^%s+', ''):gsub('%s+$', '')),
        plateIndex = GetVehicleNumberPlateTextIndex(vehicle),
        bodyHealth = math.floor(GetVehicleBodyHealth(vehicle) + 0.5),
        engineHealth = math.floor(GetVehicleEngineHealth(vehicle) + 0.5),
        tankHealth = math.floor(GetVehiclePetrolTankHealth(vehicle) + 0.5),
        fuelLevel = math.floor(GetVehicleFuelLevel(vehicle) * 10 + 0.5) / 10,
        oilLevel = math.floor(GetVehicleOilLevel(vehicle) * 10 + 0.5) / 10,
        dirtLevel = math.floor(GetVehicleDirtLevel(vehicle) * 10 + 0.5) / 10,
        color1 = color1,
        color2 = color2,
        pearlescentColor = pearlescent,
        wheelColor = wheelColor,
        interiorColor = GetVehicleInteriorColor(vehicle),
        dashboardColor = GetVehicleDashboardColor(vehicle),
        wheels = GetVehicleWheelType(vehicle),
        windowTint = GetVehicleWindowTint(vehicle),
        xenonColor = GetVehicleXenonLightsColor(vehicle),
        livery = GetVehicleLivery(vehicle),
        roofLivery = GetVehicleRoofLivery(vehicle),
        modTurbo = IsToggleModOn(vehicle, 18),
        modSmokeEnabled = IsToggleModOn(vehicle, 20),
        modXenon = IsToggleModOn(vehicle, 22),
        modCustomTiresF = GetVehicleModVariation(vehicle, 23),
        modCustomTiresR = GetVehicleModVariation(vehicle, 24),
        bulletProofTyres = not GetVehicleTyresCanBurst(vehicle),
        neonEnabled = {
            IsVehicleNeonLightEnabled(vehicle, 0), IsVehicleNeonLightEnabled(vehicle, 1),
            IsVehicleNeonLightEnabled(vehicle, 2), IsVehicleNeonLightEnabled(vehicle, 3),
        },
        neonColor = table.pack(GetVehicleNeonLightsColour(vehicle)),
        tyreSmokeColor = table.pack(GetVehicleTyreSmokeColor(vehicle)),
        extras = {},
        windows = {},
        doors = {},
        tyres = {},
    }
    props.neonColor.n, props.tyreSmokeColor.n = nil, nil

    for index, name in pairs(lib.vehicleMods) do
        props[name] = GetVehicleMod(vehicle, index)
    end

    for id = 0, 20 do
        if DoesExtraExist(vehicle, id) then
            props.extras[tostring(id)] = IsVehicleExtraTurnedOn(vehicle, id) == true or IsVehicleExtraTurnedOn(vehicle, id) == 1
        end
    end

    for i = 0, 7 do
        if not IsVehicleWindowIntact(vehicle, i) then props.windows[#props.windows + 1] = i end
    end

    for i = 0, 5 do
        if IsVehicleDoorDamaged(vehicle, i) then props.doors[#props.doors + 1] = i end
    end

    for _, i in ipairs({ 0, 1, 2, 3, 4, 5, 45, 47 }) do
        if IsVehicleTyreBurst(vehicle, i, true) then
            props.tyres[tostring(i)] = 2
        elseif IsVehicleTyreBurst(vehicle, i, false) then
            props.tyres[tostring(i)] = 1
        end
    end

    if GetDriftTyresEnabled then props.driftTyres = GetDriftTyresEnabled(vehicle) end

    return props
end
