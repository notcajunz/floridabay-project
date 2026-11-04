local activeCharacter = nil
local lastSpawn = nil
local selectionStarted = false

-- Read by the screen guard so it leaves the selector's screen alone.
FBRP.CharacterSelecting = false

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
    FBRP.CharacterSelecting=true
    holdPlayer(true)
    DoScreenFadeIn(300)
    TriggerServerEvent('fbrp:characters:request')
end)

RegisterNetEvent('fbrp:characters:data',function(data)
    if not selectionStarted then return end
    -- fbrp_multichar (the CodeM screens) shows the character list when it is running.
    if GetResourceState('fbrp_multichar')=='started' then return end
    FBRP.OpenMenu('characters',data,true)
end)

RegisterNetEvent('fbrp:characters:spawns',function(data)
    activeCharacter=data.character
    -- fbrp_multichar shows its own spawn page with the birdseye preview.
    if GetResourceState('fbrp_multichar')=='started' then return end
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

local spawning = false

-- spawnmanager's spawnPlayer ignores every later call once one spawn stalls (a
-- model that never loads, or an error in its callback) and never reports it, so
-- the selector looked dead. This does the same steps with a deadline on each
-- wait and always releases the player and the selector when something fails.
local function placePlayer(x,y,z,h)
    local model=GetHashKey('mp_m_freemode_01')
    if IsModelInCdimage(model) then
        RequestModel(model)
        local deadline=GetGameTimer()+10000
        while not HasModelLoaded(model) and GetGameTimer()<deadline do
            RequestModel(model)
            Wait(0)
        end
        if HasModelLoaded(model) then
            SetPlayerModel(PlayerId(),model)
            SetModelAsNoLongerNeeded(model)
        end
    end
    RequestCollisionAtCoord(x,y,z)
    local ped=PlayerPedId()
    SetEntityCoordsNoOffset(ped,x,y,z,false,false,false,true)
    NetworkResurrectLocalPlayer(x,y,z,h,true,true,false)
    ped=PlayerPedId()
    ClearPedTasksImmediately(ped)
    RemoveAllPedWeapons(ped,true)
    ClearPlayerWantedLevel(PlayerId())
    local deadline=GetGameTimer()+5000
    while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer()<deadline do Wait(0) end
    ShutdownLoadingScreen()
    ShutdownLoadingScreenNui()
    SetPlayerControl(PlayerId(),true,0)
    SetEntityCollision(ped,true,true)
    return ped
end

local function spawnAt(data)
    if not activeCharacter or type(data)~='table' then return false end
    local x,y,z,h=tonumber(data.x),tonumber(data.y),tonumber(data.z),tonumber(data.h) or 0.0
    if not x or not y or not z then return false end
    if spawning then return false end
    spawning=true
    CreateThread(function()
        DoScreenFadeOut(350)
        TriggerEvent('fbrp:screen:expect',60000)
        local deadline=GetGameTimer()+1500
        while not IsScreenFadedOut() and GetGameTimer()<deadline do Wait(0) end
        local ok,err=pcall(function()
            placePlayer(x,y,z,h)
            -- fbrp_multichar drops its preview camera and releases the mouse here.
            TriggerEvent('fbrp:characters:placed')
            lastSpawn=tostring(data.id or 'custom')
            TriggerEvent('playerSpawned',{x=x,y=y,z=z,heading=h})
            -- A bare freemode ped has no drawables and renders invisible until it gets a body.
            local ped=PlayerPedId()
            SetPedDefaultComponentVariation(ped)
            SetPedHeadBlendData(ped,0,0,0,0,0,0,0.0,0.0,0.0,false)
            holdPlayer(false)
            FBRP.CharacterSelecting=false
            FBRP.CloseMenu(true)
            Wait(300)
            DoScreenFadeIn(500)
            TriggerEvent('fbrp:screen:expect',0)
            TriggerServerEvent('fbrp:characters:save',{x=x,y=y,z=z,h=h},lastSpawn)
            TriggerEvent('fbrp:characterSpawned')
            lib.notify({ title = 'Spawn', description = data.label and ('Spawned at %s.'):format(tostring(data.label):sub(1, 60)) or 'Spawned.', type = 'success' })
        end)
        if not ok then
            print(('[fbrp_core] spawn failed: %s'):format(tostring(err)))
            -- Hand the selector back so the player can pick again instead of sitting on a dead screen.
            TriggerEvent('fbrp:screen:expect',0)
            DoScreenFadeIn(400)
            if FBRP.CharacterSelecting then holdPlayer(true) end
            lib.notify({ description = 'Spawning failed. Pick your spawn again.', type = 'error' })
            TriggerEvent('fbrp:characters:spawnFailed')
        end
        spawning=false
    end)
    return true
end

RegisterNUICallback('selectSpawn',function(data,cb)
    cb({ok=spawnAt(data)})
end)

exports('SpawnAt',spawnAt)

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
