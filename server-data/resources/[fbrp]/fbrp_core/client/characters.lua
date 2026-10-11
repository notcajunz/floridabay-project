local activeCharacter = nil
local lastSpawn = nil
local selectionStarted = false

local function holdPlayer(active)
    local ped=PlayerPedId()
    FreezeEntityPosition(ped,active)
    SetEntityVisible(ped,not active,false)
    if not active then
        ResetEntityAlpha(ped)
        NetworkSetEntityInvisibleToNetwork(ped,false)
    end
    SetPlayerInvincible(PlayerId(),active)
    DisplayRadar(not active)
end

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(500) end
    Wait(1800)
    selectionStarted=true
    holdPlayer(true)
    DoScreenFadeIn(300)
    TriggerServerEvent('fbrp:characters:request')
end)

RegisterNetEvent('fbrp:characters:data',function(data)
    if not selectionStarted then return end
    FBRP.OpenMenu('characters',data,true)
end)

RegisterNetEvent('fbrp:characters:spawns',function(data)
    activeCharacter=data.character
    FBRP.OpenMenu('spawns',data,true)
end)

RegisterNUICallback('createCharacter',function(data,cb)
    TriggerServerEvent('fbrp:characters:create',data or {})
    cb({ok=true})
end)

RegisterNUICallback('selectCharacter',function(data,cb)
    TriggerServerEvent('fbrp:characters:select',tonumber(data and data.id))
    cb({ok=true})
end)

RegisterNUICallback('selectSpawn',function(data,cb)
    if not activeCharacter or type(data)~='table' then cb({ok=false});return end
    local x,y,z,h=tonumber(data.x),tonumber(data.y),tonumber(data.z),tonumber(data.h) or 0.0
    if not x or not y or not z then cb({ok=false});return end
    DoScreenFadeOut(350)
    Wait(400)
    RequestCollisionAtCoord(x,y,z)
    exports.spawnmanager:spawnPlayer({x=x,y=y,z=z,heading=h,model='mp_m_freemode_01',skipFade=true},function()
        lastSpawn=tostring(data.id or 'custom')
        -- A bare freemode ped has no drawables and renders invisible until it gets a body.
        local ped=PlayerPedId()
        SetPedDefaultComponentVariation(ped)
        SetPedHeadBlendData(ped,0,0,0,0,0,0,0.0,0.0,0.0,false)
        holdPlayer(false)
        FBRP.CloseMenu(true)
        Wait(300)
        DoScreenFadeIn(500)
        TriggerServerEvent('fbrp:characters:save',{x=x,y=y,z=z,h=h},lastSpawn)
        TriggerEvent('fbrp:characterSpawned')
    end)
    cb({ok=true})
end)

CreateThread(function()
    while true do
        Wait(60000)
        if activeCharacter then
            local ped=PlayerPedId()
            local p=GetEntityCoords(ped)
            TriggerServerEvent('fbrp:characters:save',{x=p.x,y=p.y,z=p.z,h=GetEntityHeading(ped)},lastSpawn)
        end
    end
end)
