local stations = {}
local nuiStations = {}
local panelOpen = false
local panelNetId = 0
local maxDistance = 45.0

local function remember(station)
    station.receivedAt = GetGameTimer()
    return station
end

local function snapshot(station)
    local copy = {}
    for key, value in pairs(station) do
        if key ~= 'receivedAt' then copy[key] = value end
    end
    if not station.paused then
        copy.position = (tonumber(station.position) or 0) + math.max(0, GetGameTimer() - (station.receivedAt or GetGameTimer())) / 1000
    end
    return copy
end

local function currentVehicle()
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle == 0 or not NetworkGetEntityIsNetworked(vehicle) then return nil end
    local netId = NetworkGetNetworkIdFromEntity(vehicle)
    return vehicle, netId ~= 0 and netId or nil
end

local function closePanel()
    if not panelOpen then return end
    panelOpen = false
    panelNetId = 0
    SetNuiFocus(false, false)
    SendNUIMessage({type='carRadioPanel', open=false})
end

local function openPanel()
    local _, netId = currentVehicle()
    if not netId then
        TriggerEvent('fbrp:notify', 'Get in a vehicle to use its sound system.', 'error')
        return
    end
    if FBRP.IsMenuOpen and FBRP.IsMenuOpen() then FBRP.CloseMenu() end
    panelOpen = true
    panelNetId = netId
    SetNuiFocus(true, true)
    local station = stations[netId]
    if station then
        SendNUIMessage({type='carRadioStation', station=snapshot(station)})
        nuiStations[netId] = station.revision
    end
    SendNUIMessage({type='carRadioPanel', open=true, netId=netId, station=station and snapshot(station) or nil})
end

RegisterCommand('carradio', function()
    if panelOpen then closePanel() else openPanel() end
end, false)

RegisterNUICallback('carRadioClose', function(_, cb)
    closePanel()
    cb({ok=true})
end)

RegisterNUICallback('carRadioPlay', function(data, cb)
    local _, netId = currentVehicle()
    if not panelOpen or not netId or netId ~= panelNetId then
        closePanel()
        cb({ok=false})
        return
    end
    TriggerServerEvent('fbrp:carRadio:play', netId, tostring(data.videoId or ''), tonumber(data.volume) or 35)
    cb({ok=true})
end)

RegisterNUICallback('carRadioControl', function(data, cb)
    local _, netId = currentVehicle()
    if not panelOpen or not netId or netId ~= panelNetId then
        closePanel()
        cb({ok=false})
        return
    end
    TriggerServerEvent('fbrp:carRadio:control', netId, tostring(data.action or ''), tonumber(data.value))
    cb({ok=true})
end)

RegisterNetEvent('fbrp:carRadio:sync', function(list)
    stations = {}
    for _, station in ipairs(type(list) == 'table' and list or {}) do
        local netId = tonumber(station.netId)
        if netId then stations[netId] = remember(station) end
    end
    nuiStations = {}
    SendNUIMessage({type='carRadioSync', stations={}})
end)

RegisterNetEvent('fbrp:carRadio:update', function(station)
    if type(station) ~= 'table' or not tonumber(station.netId) then return end
    local netId = tonumber(station.netId)
    stations[netId] = remember(station)
    if nuiStations[netId] or (panelOpen and panelNetId == netId) then
        SendNUIMessage({type='carRadioStation', station=snapshot(station)})
        nuiStations[netId] = station.revision
    end
    if panelOpen and panelNetId == netId then
        SendNUIMessage({type='carRadioPanelState', station=snapshot(station)})
    end
end)

RegisterNetEvent('fbrp:carRadio:remove', function(netId)
    netId = tonumber(netId)
    if not netId then return end
    stations[netId] = nil
    nuiStations[netId] = nil
    SendNUIMessage({type='carRadioRemove', netId=netId})
    if panelOpen and panelNetId == netId then
        SendNUIMessage({type='carRadioPanelState'})
    end
end)

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(500) end
    Wait(1500)
    TriggerServerEvent('fbrp:carRadio:request')
end)

CreateThread(function()
    while true do
        local levels = {}
        local myCoords = GetEntityCoords(PlayerPedId())
        local occupiedVehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        local activeNetId, activeLevel, activeScore = nil, 0, -1
        for netId, station in pairs(stations) do
            local level = 0
            local inRange = false
            local score = -1
            local vehicle = NetworkGetEntityFromNetworkId(netId)
            if vehicle ~= 0 and DoesEntityExist(vehicle) then
                local distance = #(myCoords - GetEntityCoords(vehicle))
                if occupiedVehicle == vehicle then
                    inRange = true
                    level = tonumber(station.volume) or 0
                    score = 1000 + level
                elseif distance < maxDistance then
                    inRange = true
                    local falloff = 1.0 - (distance / maxDistance)
                    level = (tonumber(station.volume) or 0) * falloff * falloff
                    score = level
                end
            end
            if inRange and score > activeScore then
                activeNetId, activeLevel, activeScore = netId, level, score
            end
        end

        -- A client plays only the strongest nearby vehicle. This prevents a
        -- crowd of cars from creating a matching crowd of browser decoders.
        for netId in pairs(nuiStations) do
            if netId ~= activeNetId then
                SendNUIMessage({type='carRadioRemove', netId=netId})
                nuiStations[netId] = nil
            end
        end
        if activeNetId then
            local station = stations[activeNetId]
            if not nuiStations[activeNetId] then
                SendNUIMessage({type='carRadioStation', station=snapshot(station)})
                nuiStations[activeNetId] = station.revision
            end
            levels[tostring(activeNetId)] = math.floor(math.max(0, math.min(100, activeLevel)) + 0.5)
        end
        SendNUIMessage({type='carRadioLevels', levels=levels})

        if panelOpen then
            local _, netId = currentVehicle()
            if not netId or netId ~= panelNetId then closePanel() end
        end
        Wait(next(stations) and 250 or 1000)
    end
end)

AddEventHandler('onClientResourceStop', function(resource)
    if resource == GetCurrentResourceName() then SetNuiFocus(false, false) end
end)
