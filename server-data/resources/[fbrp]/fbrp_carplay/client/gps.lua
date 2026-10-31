-- Made by Saif | © 2026 Saif. All rights reserved.
-- CarPlay Maps app
-- * Navigate to built-in places, your own saved pins, or locations shared by passengers
-- * Uses the game's own GPS route (waypoint) so you get the real road line on the minimap,
--   while the CarPlay screen shows distance, ETA and a live heading-up radar to the destination
-- * "Mark here" / "Save waypoint" store pins per player (persisted on the server)

local dest         = nil     -- { x, y, z, name }
local routeT       = 0
local routeDist    = nil
local smoothSpeed  = 14.0    -- m/s, used for the ETA

local function notify(msg, kind)
    if CarPlay.open then
        SendNUIMessage({ action = 'toast', msg = msg, kind = kind })
    else
        Config.Notify(msg, kind)
    end
end

local function pushPins()
    SendNUIMessage({ action = 'pins', pins = CarPlay.pins, shared = CarPlay.shared })
end

function CarPlay.setDestination(x, y, z, name)
    dest = { x = x + 0.0, y = y + 0.0, z = z and (z + 0.0) or nil, name = name or 'Destination' }
    routeT, routeDist = 0, nil
    SetNewWaypoint(dest.x, dest.y)             -- real GPS route on the minimap
    notify(('Navigating to %s'):format(dest.name), 'success')
end

function CarPlay.clearDestination(silent)
    dest = nil
    routeDist = nil
    SetWaypointOff()
    if not silent then notify('Navigation stopped.', 'info') end
end

-- Called every UI tick from client/main.lua
function CarPlay.getNav(coords, speed)
    if not dest then return nil end

    local dx, dy = dest.x - coords.x, dest.y - coords.y
    local straight = math.sqrt(dx * dx + dy * dy)

    if straight < 35.0 then
        notify(('You have arrived at %s.'):format(dest.name), 'success')
        CarPlay.clearDestination(true)
        return nil
    end

    -- road distance (refreshed every 2 s). Falls back to an estimate if the game can't compute it.
    local t = GetGameTimer()
    if t - routeT > 2000 then
        routeT = t
        routeDist = straight * 1.3
        if dest.z then
            local d = CalculateTravelDistanceBetweenPoints(coords.x, coords.y, coords.z, dest.x, dest.y, dest.z)
            if d and d > 0.0 and d < 90000.0 and d < straight * 6.0 then routeDist = d end
        end
    end

    smoothSpeed = smoothSpeed + ((math.max(speed, 8.0) - smoothSpeed) * 0.05)
    smoothSpeed = math.min(smoothSpeed, 45.0)
    local dist = routeDist or (straight * 1.3)

    return { x = dest.x, y = dest.y, name = dest.name, dist = dist, eta = dist / smoothSpeed }
end

local function waypointCoords()
    local blip = GetFirstBlipInfoId(8)             -- 8 = waypoint blip
    if not DoesBlipExist(blip) then return nil end
    local c = GetBlipInfoIdCoord(blip)
    return c.x, c.y
end

-- NUI callbacks ---------------------------------------------------------------------------------

RegisterNUICallback('gpsSet', function(data, cb)
    if data and tonumber(data.x) and tonumber(data.y) then
        CarPlay.setDestination(tonumber(data.x), tonumber(data.y), tonumber(data.z), tostring(data.name or 'Destination'))
    end
    cb('ok')
end)

RegisterNUICallback('gpsClear', function(_, cb)
    CarPlay.clearDestination()
    cb('ok')
end)

RegisterNUICallback('pinHere', function(data, cb)
    if CarPlay.veh and DoesEntityExist(CarPlay.veh) then
        local c = GetEntityCoords(CarPlay.veh)
        TriggerServerEvent('carplay:server:savePin', data and data.name or '', c.x, c.y, c.z)
    end
    cb('ok')
end)

RegisterNUICallback('pinWaypoint', function(data, cb)
    local x, y = waypointCoords()
    if x then
        TriggerServerEvent('carplay:server:savePin', data and data.name or '', x, y, 0.0)
    else
        notify('Set a waypoint on the map first.', 'error')
    end
    cb('ok')
end)

RegisterNUICallback('pinAt', function(data, cb)
    if data and tonumber(data.x) and tonumber(data.y) then
        TriggerServerEvent('carplay:server:savePin', data.name or '', tonumber(data.x), tonumber(data.y), 0.0)
    end
    cb('ok')
end)

RegisterNUICallback('pinDelete', function(data, cb)
    if data and data.id then TriggerServerEvent('carplay:server:deletePin', data.id) end
    cb('ok')
end)

RegisterNUICallback('pinShare', function(data, cb)
    if CarPlay.netId and data and tonumber(data.x) and tonumber(data.y) then
        TriggerServerEvent('carplay:server:sharePin', CarPlay.netId, data.name, data.x, data.y, data.z)
    end
    cb('ok')
end)

-- Server events ---------------------------------------------------------------------------------

RegisterNetEvent('carplay:client:pins', function(pins)
    CarPlay.pins = pins or {}
    pushPins()
end)

RegisterNetEvent('carplay:client:sharedPin', function(from, name, x, y, z)
    table.insert(CarPlay.shared, 1, { name = name, from = from, x = x, y = y, z = z })
    while #CarPlay.shared > 10 do table.remove(CarPlay.shared) end
    pushPins()
    notify(('%s shared a destination: %s'):format(from, name), 'info')
end)

-- UI just opened -> give it the pin lists right away
AddEventHandler('onClientResourceStart', function(res)
    if res ~= GetCurrentResourceName() then return end
    CarPlay.shared = {}
end)

RegisterNUICallback('uiReady', function(_, cb)
    pushPins()
    cb('ok')
end)
