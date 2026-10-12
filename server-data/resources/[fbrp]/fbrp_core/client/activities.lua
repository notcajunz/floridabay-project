-- Client presentation and traversal for open-world activities.
local active = nil
local routeBlip = nil
local cache = nil
local cacheBlip = nil

local function notify(message, tone) TriggerEvent('fbrp:notify', message, tone or 'info') end
local function clearBlip(which)
    local blip = which == 'cache' and cacheBlip or routeBlip
    if blip and DoesBlipExist(blip) then RemoveBlip(blip) end
    if which == 'cache' then cacheBlip = nil else routeBlip = nil end
end
local function setRoute(point, label, sprite, colour)
    clearBlip('route')
    routeBlip = AddBlipForCoord(point.x + 0.0,point.y + 0.0,point.z + 0.0)
    SetBlipSprite(routeBlip,sprite or 1); SetBlipColour(routeBlip,colour or 18); SetBlipRoute(routeBlip,true)
    BeginTextCommandSetBlipName('STRING'); AddTextComponentString(label or 'Activity checkpoint'); EndTextCommandSetBlipName(routeBlip)
end
local function modeOkay(mode)
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped,false)
    if mode == 'foot' then return vehicle == 0, 'This challenge must be completed on foot.' end
    if vehicle == 0 or GetPedInVehicleSeat(vehicle,-1) ~= ped then return false, 'You need to be driving the correct vehicle.' end
    local bicycle = GetVehicleClass(vehicle) == 13
    if mode == 'bicycle' then return bicycle, 'This challenge requires a bicycle.' end
    return not bicycle, 'This challenge requires a motor vehicle.'
end
local function nextCheckpoint()
    return active and active.challenge.checkpoints[active.index + 1]
end
local function stop(reason)
    active = nil
    clearBlip('route')
    SendNUIMessage({ type='activityRun',active=false })
    if reason then notify(reason,'info') end
end

RegisterCommand('activities', function() TriggerServerEvent('fbrp:activities:request') end, false)

RegisterNetEvent('fbrp:activities:open', function(data)
    cache = data and data.cache or cache
    FBRP.OpenMenu('activities', data or {})
end)

RegisterNetEvent('fbrp:activities:routeStart', function(data)
    FBRP.CloseMenu()
    setRoute(data,data.label .. ' start',38,18)
    notify(('Route set to %s. Open Activities again when you arrive to start.'):format(data.label),'info')
end)

RegisterNetEvent('fbrp:activities:started', function(challenge, startedAt)
    FBRP.CloseMenu()
    active = { challenge=challenge,index=1,startedAt=tonumber(startedAt) or 0 }
    local point = nextCheckpoint()
    if point then setRoute(point,challenge.label .. ' checkpoint',1,18) end
    SendNUIMessage({ type='activityRun',active=true,label=challenge.label,index=1,total=#challenge.checkpoints,startedAt=startedAt })
    CreateThread(function()
        while active do
            local ok, reason = modeOkay(active.challenge.mode)
            if not ok then
                TriggerServerEvent('fbrp:activities:cancel')
                stop(reason)
                break
            end
            local point = nextCheckpoint()
            if not point then break end
            local coords = GetEntityCoords(PlayerPedId())
            local distance = #(coords - vector3(point.x,point.y,point.z))
            if distance < 90.0 then
                DrawMarker(1,point.x,point.y,point.z-1.0,0,0,0,0,0,0,8.0,8.0,3.0,63,227,210,105,false,false,2,false,nil,nil,false)
                DrawMarker(4,point.x,point.y,point.z+2.0,0,0,0,0,0,0,1.6,1.6,1.6,255,181,71,210,true,true,2,false,nil,nil,false)
            end
            if distance <= FBRP.Activities.checkpointRadius then
                active.index = active.index + 1
                TriggerServerEvent('fbrp:activities:checkpoint',active.challenge.id,active.index)
                PlaySoundFrontend(-1,'CHECKPOINT_NORMAL','HUD_MINI_GAME_SOUNDSET',true)
                local nextPoint = nextCheckpoint()
                if nextPoint then setRoute(nextPoint,active.challenge.label .. ' checkpoint',1,18) end
                SendNUIMessage({ type='activityRun',active=true,label=active.challenge.label,index=active.index,total=#active.challenge.checkpoints,startedAt=active.startedAt })
                Wait(1200)
            else
                Wait(distance < 120.0 and 0 or 250)
            end
        end
    end)
end)

RegisterNetEvent('fbrp:activities:advance', function() end)
RegisterNetEvent('fbrp:activities:cancelled', function(reason) stop(reason) end)
RegisterNetEvent('fbrp:activities:finished', function(result)
    stop()
    PlaySoundFrontend(-1,'Mission_Pass_Notify','DLC_HEISTS_GENERAL_FRONTEND_SOUNDS',true)
    notify(('%s complete: %.2fs · +%d points%s'):format(result.label,result.ms/1000,result.points,result.serverRecord and ' · NEW SERVER RECORD' or result.personalBest and ' · personal best' or ''),'success')
end)

RegisterNetEvent('fbrp:activities:cacheFound', function(result)
    clearBlip('cache')
    if cache then cache.found = true end
    PlaySoundFrontend(-1,'PICK_UP','HUD_FRONTEND_DEFAULT_SOUNDSET',true)
    notify(('%s found · +%d points · %d day streak'):format(result.label,result.points,result.streak),'success')
end)

RegisterNUICallback('activityAction', function(data, cb)
    local action = tostring(data.action or '')
    if action == 'start' then
        local challenge = FBRP.FindActivity(tostring(data.id or ''))
        if challenge then
            local ok, reason = modeOkay(challenge.mode)
            if not ok then notify(reason,'error') else TriggerServerEvent('fbrp:activities:start',challenge.id) end
        end
    elseif action == 'cancel' then
        TriggerServerEvent('fbrp:activities:cancel')
    elseif action == 'cache' and cache and not cache.found then
        FBRP.CloseMenu()
        clearBlip('cache')
        cacheBlip = AddBlipForRadius(cache.x + 0.0,cache.y + 0.0,cache.z + 0.0,90.0)
        SetBlipColour(cacheBlip,47); SetBlipAlpha(cacheBlip,100)
        SetNewWaypoint(cache.x + 0.0,cache.y + 0.0)
        notify(('Search area marked: %s · %s'):format(cache.region,cache.clue),'info')
    end
    cb({ok=true})
end)

CreateThread(function()
    while true do
        if cache and not cache.found then
            local coords = GetEntityCoords(PlayerPedId())
            local distance = #(coords - vector3(cache.x,cache.y,cache.z))
            if distance < 30.0 then DrawMarker(2,cache.x,cache.y,cache.z+0.7,0,0,0,0,180.0,0,0.35,0.35,0.35,255,181,71,210,true,true,2,false,nil,nil,false) end
            if distance <= FBRP.Activities.cacheRadius then
                BeginTextCommandDisplayHelp('STRING'); AddTextComponentSubstringPlayerName('Press ~INPUT_CONTEXT~ to inspect the hidden cache.'); EndTextCommandDisplayHelp(0,false,false,-1)
                if IsControlJustReleased(0,38) then TriggerServerEvent('fbrp:activities:cacheFind',cache.id); Wait(1500) end
            else Wait(distance < 100.0 and 0 or 750) end
        else Wait(1000) end
    end
end)

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    clearBlip('route'); clearBlip('cache')
end)

