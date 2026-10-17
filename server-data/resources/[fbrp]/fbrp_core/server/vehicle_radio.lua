-- Synchronized YouTube-backed vehicle audio. The server only distributes a
-- validated video ID and playback state; every listener plays it in their own
-- NUI and the client applies distance falloff around the networked vehicle.

local stations = {}
local lastAction = {}

local function clamp(value, low, high)
    value = tonumber(value) or low
    return math.max(low, math.min(high, value))
end

local function playerVehicle(source, requestedNetId)
    local ped = GetPlayerPed(source)
    if not ped or ped == 0 then return nil end
    local vehicle = GetVehiclePedIsIn(ped, false)
    if not vehicle or vehicle == 0 or not DoesEntityExist(vehicle) then return nil end
    local netId = NetworkGetNetworkIdFromEntity(vehicle)
    if netId == 0 or netId ~= tonumber(requestedNetId) then return nil end
    return vehicle, netId
end

local function position(station)
    if station.paused then return station.offset end
    return station.offset + math.max(0, os.time() - station.startedAt)
end

local function public(station)
    return {
        netId=station.netId,
        videoId=station.videoId,
        volume=station.volume,
        paused=station.paused,
        position=position(station),
        revision=station.revision,
    }
end

local function broadcast(station)
    TriggerClientEvent('fbrp:carRadio:update', -1, public(station))
end

local function allowed(source)
    local now = GetGameTimer()
    if lastAction[source] and now - lastAction[source] < 150 then return false end
    lastAction[source] = now
    return true
end

RegisterNetEvent('fbrp:carRadio:request', function()
    local list = {}
    for _, station in pairs(stations) do list[#list + 1] = public(station) end
    TriggerClientEvent('fbrp:carRadio:sync', source, list)
end)

RegisterNetEvent('fbrp:carRadio:play', function(netId, videoId, volume)
    local src = source
    if not allowed(src) then return end
    local _, id = playerVehicle(src, netId)
    videoId = type(videoId) == 'string' and videoId or ''
    if not id or not videoId:match('^[%w_-][%w_-][%w_-][%w_-][%w_-][%w_-][%w_-][%w_-][%w_-][%w_-][%w_-]$') then return end
    local prior = stations[id]
    local station = {
        netId=id,
        videoId=videoId,
        volume=math.floor(clamp(volume, 0, 100) + 0.5),
        paused=false,
        offset=0,
        startedAt=os.time(),
        revision=(prior and prior.revision or 0) + 1,
    }
    stations[id] = station
    broadcast(station)
end)

RegisterNetEvent('fbrp:carRadio:control', function(netId, action, value)
    local src = source
    if not allowed(src) then return end
    local _, id = playerVehicle(src, netId)
    local station = id and stations[id] or nil
    if not station or type(action) ~= 'string' then return end

    if action == 'stop' then
        stations[id] = nil
        TriggerClientEvent('fbrp:carRadio:remove', -1, id)
        return
    elseif action == 'volume' then
        station.volume = math.floor(clamp(value, 0, 100) + 0.5)
    elseif action == 'pause' then
        station.offset = clamp(value, 0, 21600)
        station.startedAt = os.time()
        station.paused = true
    elseif action == 'resume' then
        station.offset = clamp(value, 0, 21600)
        station.startedAt = os.time()
        station.paused = false
    elseif action == 'seek' then
        station.offset = clamp(value, 0, 21600)
        station.startedAt = os.time()
    else
        return
    end
    station.revision = station.revision + 1
    broadcast(station)
end)

AddEventHandler('playerDropped', function()
    lastAction[source] = nil
end)

CreateThread(function()
    while true do
        Wait(15000)
        for netId in pairs(stations) do
            local entity = NetworkGetEntityFromNetworkId(netId)
            if entity == 0 or not DoesEntityExist(entity) then
                stations[netId] = nil
                TriggerClientEvent('fbrp:carRadio:remove', -1, netId)
            end
        end
    end
end)
