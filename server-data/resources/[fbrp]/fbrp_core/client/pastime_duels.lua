-- Street duels: challenge a nearby driver to a race to your waypoint.

local PC = FBRP.PastimeClient
local notify = PC.notify

local duel = nil      -- { x, y, radius, opponent, meters, phase='countdown'|'go', goAt, frozen }
local invite = nil    -- { from, id, meters, expiresAt }

local function nearestDriver(maxDistance)
    local mine = GetEntityCoords(PlayerPedId())
    local best, bestDistance
    for _, player in ipairs(GetActivePlayers()) do
        if player ~= PlayerId() then
            local ped = GetPlayerPed(player)
            if ped ~= 0 and IsPedInAnyVehicle(ped, false) then
                local distance = #(GetEntityCoords(ped) - mine)
                if distance <= maxDistance and (not bestDistance or distance < bestDistance) then
                    best, bestDistance = GetPlayerServerId(player), distance
                end
            end
        end
    end
    return best
end

local function challenge(targetId)
    local reason = PC.busy()
    if reason then return notify(reason, 'error') end
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= ped then
        return notify('Sit in the driver seat of a car or bike to start a duel.', 'error')
    end
    targetId = tonumber(targetId) or nearestDriver(FBRP.Pastimes.duels.challengeRadius)
    if not targetId then return notify('No driver is close enough. Pull up next to them first.', 'error') end
    local blip = GetFirstBlipInfoId(8)
    if not DoesBlipExist(blip) then
        return notify('Set a map waypoint first. It becomes the finish line.', 'error')
    end
    local spot = GetBlipInfoIdCoord(blip)
    TriggerServerEvent('fbrp:pastimes:duel:challenge', targetId, spot.x + 0.0, spot.y + 0.0)
end

RegisterCommand('duel', function(_, args)
    challenge(args[1])
end, false)

RegisterCommand('duelaccept', function()
    invite = nil
    TriggerServerEvent('fbrp:pastimes:duel:accept')
end, false)
RegisterCommand('dueldecline', function()
    invite = nil
    TriggerServerEvent('fbrp:pastimes:duel:decline')
end, false)
RegisterKeyMapping('duelaccept', 'Accept a street duel challenge', 'keyboard', '')

local function stopDuel()
    if duel and duel.frozen then
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if vehicle ~= 0 then FreezeEntityPosition(vehicle, false) end
    end
    duel = nil
    PC.clearRoute()
    PC.setBanner(nil)
end

RegisterNetEvent('fbrp:pastimes:duel:invite', function(data)
    invite = { from = data.from, id = data.id, meters = data.meters, expiresAt = GetGameTimer() + (tonumber(data.seconds) or 30) * 1000 }
    PlaySoundFrontend(-1, 'Event_Start_Text', 'GTAO_FM_Events_Soundset', true)
    notify(('%s challenged you to a street duel (%s). Type /duelaccept or open Pastimes to accept.'):format(
        data.from or 'A driver', PC.formatDistance(tonumber(data.meters) or 0)), 'info')
end)

RegisterNetEvent('fbrp:pastimes:duel:countdown', function(data)
    invite = nil
    FBRP.CloseMenu()
    duel = {
        x = data.x + 0.0, y = data.y + 0.0, radius = tonumber(data.radius) or 30.0, opponent = data.opponent,
        meters = tonumber(data.meters) or 0, phase = 'countdown', goAt = GetGameTimer() + (tonumber(data.seconds) or 5) * 1000,
    }
    PC.setRoute(duel.x, duel.y, 0.0, 'Street duel finish', 38, 1)
    local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
    if vehicle ~= 0 then
        FreezeEntityPosition(vehicle, true)
        duel.frozen = true
    end
    local token = duel.goAt
    CreateThread(function()
        while duel and duel.goAt == token do
            local remaining = (duel.goAt - GetGameTimer()) / 1000.0
            if duel.phase == 'countdown' then
                if remaining > 0.0 then
                    PC.drawText(0.5, 0.28, tostring(math.ceil(remaining)), 1.6, PC.colors.amber, true)
                    PC.drawText(0.5, 0.2, ('vs %s'):format(duel.opponent or 'opponent'), 0.55, PC.colors.white, true)
                elseif remaining < -1.5 then
                    -- The server normally sends the go signal. This is only the safety net.
                    TriggerEvent('fbrp:pastimes:duel:go')
                end
            end
            Wait(0)
        end
    end)
end)

RegisterNetEvent('fbrp:pastimes:duel:go', function()
    if not duel or duel.phase == 'go' then return end
    duel.phase = 'go'
    if duel.frozen then
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if vehicle ~= 0 then FreezeEntityPosition(vehicle, false) end
        duel.frozen = false
    end
    PlaySoundFrontend(-1, 'GO', 'HUD_MINI_GAME_SOUNDSET', true)
    local token = duel.goAt
    local startedAt = GetGameTimer()
    CreateThread(function()
        while duel and duel.goAt == token do
            local coords = GetEntityCoords(PlayerPedId())
            local distance = PC.flat(coords, duel)
            PC.drawText(0.5, 0.2, 'GO!', 1.2, PC.colors.aqua, GetGameTimer() - startedAt < 1500)
            PC.setBanner({
                title = 'Street duel',
                rows = { ('vs %s'):format(duel.opponent or 'opponent'), ('To finish: %s'):format(PC.formatDistance(distance)), 'First to the marker wins.' },
            })
            if distance < 400.0 then
                local z = PC.groundZ(duel.x, duel.y, coords.z)
                DrawMarker(4, duel.x, duel.y, z + 3.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 6.0, 6.0, 6.0, 255, 181, 71, 220, true, false, 2, true, nil, nil, false)
                DrawMarker(1, duel.x, duel.y, z - 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, duel.radius * 2.0, duel.radius * 2.0, 4.0, 63, 227, 210, 80, false, false, 2, false, nil, nil, false)
            end
            Wait(0)
        end
    end)
end)

RegisterNetEvent('fbrp:pastimes:duel:result', function(result)
    stopDuel()
    if result.draw then
        return notify('The duel timed out. No winner, no rating change.', 'info')
    end
    PlaySoundFrontend(-1, result.won and 'Mission_Pass_Notify' or 'ScreenFlash', result.won and 'DLC_HEISTS_GENERAL_FRONTEND_SOUNDS' or 'WastedSounds', true)
    local sign = (tonumber(result.delta) or 0) >= 0 and '+' or ''
    notify(('%s vs %s · %s%d rating (%d) · +%d Bay Rep%s'):format(
        result.won and 'You won' or 'You lost', result.opponent or 'opponent', sign, tonumber(result.delta) or 0,
        tonumber(result.rating) or 0, tonumber(result.rep) or 0,
        (result.won and (tonumber(result.streak) or 0) >= 2) and (' · %d win streak'):format(result.streak) or ''),
        result.won and 'success' or 'info')
end)

PC.actions.duel = function(data)
    FBRP.CloseMenu()
    challenge(tonumber(data.id))
end
PC.actions.duelaccept = function()
    FBRP.CloseMenu()
    TriggerServerEvent('fbrp:pastimes:duel:accept')
end
PC.actions.dueldecline = function()
    TriggerServerEvent('fbrp:pastimes:duel:decline')
    TriggerServerEvent('fbrp:pastimes:request')
end

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    stopDuel()
end)
