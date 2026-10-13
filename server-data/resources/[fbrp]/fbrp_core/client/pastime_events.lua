-- Supply drops: a search circle for everyone, the exact crate for whoever
-- gets close, and a hold-to-secure prompt.

local PC = FBRP.PastimeClient
local notify = PC.notify

local drop = nil        -- { id, ax, ay, radius, region, expiresAt, revealRadius, claimRadius, claimMs, models, crate, blip, circle, lastScan }
local claiming = false

local function clearDrop()
    if not drop then return end
    if drop.crate and DoesEntityExist(drop.crate) then DeleteEntity(drop.crate) end
    if drop.blip and DoesBlipExist(drop.blip) then RemoveBlip(drop.blip) end
    if drop.circle and DoesBlipExist(drop.circle) then RemoveBlip(drop.circle) end
    drop = nil
    claiming = false
end

local function spawnCrate(x, y, z)
    for _, name in ipairs(drop.models or {}) do
        local hash = joaat(name)
        if IsModelInCdimage(hash) then
            RequestModel(hash)
            local untilAt = GetGameTimer() + 3000
            while not HasModelLoaded(hash) and GetGameTimer() < untilAt do Wait(20) end
            if HasModelLoaded(hash) then
                local object = CreateObject(hash, x + 0.0, y + 0.0, z + 0.0, false, false, false)
                SetModelAsNoLongerNeeded(hash)
                if object ~= 0 then
                    PlaceObjectOnGroundProperly(object)
                    FreezeEntityPosition(object, true)
                    return object
                end
            end
        end
    end
    return nil
end

RegisterNetEvent('fbrp:pastimes:drop:announce', function(info)
    if type(info) ~= 'table' then return end
    clearDrop()
    drop = info
    drop.expiresAt = GetGameTimer() + (tonumber(info.seconds) or 600) * 1000
    drop.lastScan = 0
    drop.circle = AddBlipForRadius(info.x + 0.0, info.y + 0.0, 0.0, (info.radius or 260.0) + 0.0)
    SetBlipColour(drop.circle, 47)
    SetBlipAlpha(drop.circle, 110)
    drop.blip = AddBlipForCoord(info.x + 0.0, info.y + 0.0, 0.0)
    SetBlipSprite(drop.blip, 306)
    SetBlipColour(drop.blip, 47)
    SetBlipScale(drop.blip, 0.9)
    SetBlipAsShortRange(drop.blip, false)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentString('Supply drop search area')
    EndTextCommandSetBlipName(drop.blip)
    PlaySoundFrontend(-1, 'Event_Start_Text', 'GTAO_FM_Events_Soundset', true)
end)

RegisterNetEvent('fbrp:pastimes:drop:reveal', function(spot)
    if not drop or type(spot) ~= 'table' or spot.id ~= drop.id or drop.spot then return end
    drop.spot = { x = spot.x + 0.0, y = spot.y + 0.0, z = spot.z + 0.0 }
    drop.crate = spawnCrate(spot.x, spot.y, spot.z)
    if drop.blip and DoesBlipExist(drop.blip) then
        SetBlipCoords(drop.blip, spot.x + 0.0, spot.y + 0.0, spot.z + 0.0)
        SetBlipSprite(drop.blip, 478)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString('Supply crate')
        EndTextCommandSetBlipName(drop.blip)
    end
    notify('You found the supply crate! Hold E next to it to secure it.', 'success')
end)

RegisterNetEvent('fbrp:pastimes:drop:ended', function(info)
    if drop and type(info) == 'table' and info.id == drop.id then clearDrop() end
end)

RegisterNetEvent('fbrp:pastimes:drop:won', function(result)
    claiming = false
    PlaySoundFrontend(-1, 'Mission_Pass_Notify', 'DLC_HEISTS_GENERAL_FRONTEND_SOUNDS', true)
    notify(('Supply crate secured · +%d Bay Rep'):format(tonumber(result.rep) or 0), 'success')
end)

local function progress(fraction)
    DrawRect(0.5, 0.86, 0.2, 0.014, 6, 10, 14, 200)
    DrawRect(0.5 - 0.1 + 0.1 * fraction, 0.86, 0.2 * fraction, 0.01, 255, 181, 71, 235)
    PC.drawText(0.5, 0.826, 'SECURING SUPPLY CRATE', 0.38, PC.colors.amber, true)
end

RegisterNetEvent('fbrp:pastimes:drop:claimOk', function(ms)
    if not drop or not drop.spot then return end
    claiming = true
    local started = GetGameTimer()
    local total = tonumber(ms) or 7000
    local id = drop.id
    CreateThread(function()
        local ok = true
        while claiming and drop and drop.id == id do
            local elapsed = GetGameTimer() - started
            local ped = PlayerPedId()
            local near = PC.flat(GetEntityCoords(ped), drop.spot) <= (drop.claimRadius or 4.5) + 1.5
            if not IsControlPressed(0, 38) or not near or IsPedInAnyVehicle(ped, false) or IsPedRagdoll(ped) then ok = false break end
            progress(math.min(1.0, elapsed / total))
            if elapsed >= total then break end
            Wait(0)
        end
        if ok and claiming and drop and drop.id == id then
            TriggerServerEvent('fbrp:pastimes:drop:claimFinish', id)
        else
            TriggerServerEvent('fbrp:pastimes:drop:claimCancel')
            claiming = false
        end
    end)
end)

CreateThread(function()
    while true do
        if not drop then
            Wait(1500)
        else
            local ped = PlayerPedId()
            local coords = GetEntityCoords(ped)
            if GetGameTimer() > drop.expiresAt + 5000 then
                clearDrop()
            elseif not drop.spot then
                -- Close enough to the search circle: ask the server for the exact spot.
                local distance = PC.flat(coords, { x = drop.x, y = drop.y })
                if distance <= (drop.revealRadius or 230.0) + 60.0 and GetGameTimer() - drop.lastScan > 4000 then
                    drop.lastScan = GetGameTimer()
                    TriggerServerEvent('fbrp:pastimes:drop:scan', drop.id)
                end
                Wait(1000)
            else
                local distance = #(coords - vector3(drop.spot.x, drop.spot.y, drop.spot.z))
                if distance < 300.0 then
                    DrawMarker(1, drop.spot.x, drop.spot.y, drop.spot.z - 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.3, 1.3, 60.0, 255, 181, 71, 70, false, false, 2, false, nil, nil, false)
                end
                if distance <= (drop.claimRadius or 4.5) and not claiming and not IsPedInAnyVehicle(ped, false) then
                    BeginTextCommandDisplayHelp('STRING')
                    AddTextComponentSubstringPlayerName('Hold ~INPUT_CONTEXT~ to secure the supply crate.')
                    EndTextCommandDisplayHelp(0, false, false, -1)
                    if IsControlJustPressed(0, 38) then
                        TriggerServerEvent('fbrp:pastimes:drop:claimStart', drop.id)
                        Wait(500)
                    end
                end
                Wait(distance < 300.0 and 0 or 750)
            end
        end
    end
end)

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(500) end
    Wait(7000)
    TriggerServerEvent('fbrp:pastimes:drop:sync')
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    clearDrop()
end)
