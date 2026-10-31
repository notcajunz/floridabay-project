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

-- ox_lib notification in the same style as the server's AOP change notice, with the AOP change sound
local function announce(title,description,tone,icon,duration)
    SendNUIMessage({ type = 'fbrpHud', action = 'sfx', data = { name = 'aop-change' } })
    lib.notify({
        title = title, description = description, type = tone or 'inform',
        position = 'center-right', duration = duration or 12000, icon = icon or 'fa-solid fa-map-location-dot',
    })
end

local function currentAop()
    return tostring(GlobalState['fbrp:aop'] or 'Statewide')
end

local spawnData = nil -- last spawn list, kept so spawns can be checked against the AOP

local function markSpawns(aop)
    if not spawnData then return end
    spawnData.aop=tostring(aop or currentAop())
    FBRP.MarkSpawnsForAop(spawnData.spawns,spawnData.aop)
end

local function showSpawns()
    -- fbrp_multichar draws its own spawn screen; it gets the same data through this event
    TriggerEvent('fbrp:characters:spawnsUpdated',spawnData)
    if GetResourceState('fbrp_multichar')=='started' then return end
    FBRP.OpenMenu('spawns',spawnData,true)
end

RegisterNetEvent('fbrp:characters:spawns',function(data)
    activeCharacter=data.character
    spawnData=data
    FBRP.SpawnSelecting=true -- the HUD shows only the AOP & priority panel while this is on
    markSpawns(data.aop)
    -- tell them the area of play before they pick where to spawn
    announce('Area of Play',('The current area of play is %s. Pick a spawn inside it.'):format(spawnData.aop),'warning')
    -- fbrp_multichar shows its own spawn page with the birdseye preview.
    if GetResourceState('fbrp_multichar')=='started' then return end
    FBRP.OpenMenu('spawns',spawnData,true)
end)

-- AOP changed while they are still picking: recheck the spawns and redraw the list
RegisterNetEvent('fbrp:aop:changed',function(value)
    if not FBRP.CharacterSelecting or not spawnData then return end
    markSpawns(value)
    showSpawns()
end)

local function findSpawn(id)
    for _, spawn in ipairs(spawnData and spawnData.spawns or {}) do
        if tostring(spawn.id)==tostring(id) then return spawn end
    end
end

local function aopBlocks(data)
    if not FBRP.CharacterSelecting or not spawnData then return false end
    markSpawns(currentAop())
    local spawn=findSpawn(data.id)
    if spawn then return not spawn.allowed end
    -- a spot that is not in the list (custom coords) still has to be inside the AOP
    return not FBRP.SpawnAllowedByAop({ id='custom', x=data.x, y=data.y, z=data.z },currentAop())
end

exports('GetSpawnData',function() return spawnData end)
exports('IsSpawnAllowed',function(id)
    markSpawns(currentAop())
    local spawn=findSpawn(id)
    return spawn~=nil and spawn.allowed==true
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
    if aopBlocks(data) then
        announce('Area of Play',FBRP.AopSpawnDenied or 'The place you selected you can not spawn to due to AOP location.','error','fa-solid fa-ban',8000)
        TriggerEvent('fbrp:characters:spawnDenied',data.id,currentAop())
        return false
    end
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
            FBRP.SpawnSelecting=false
            spawnData=nil
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

-- /logout: back to character selection so they can play a different character
RegisterCommand('logout',function()
    if FBRP.CharacterSelecting or not activeCharacter then
        return lib.notify({ title = 'Logout', description = 'You are already at character selection.', type = 'error', position = 'center-right' })
    end
    if spawning then return end
    local confirm=lib.alertDialog({
        header='Log out',
        content=('Log out of **%s** and go back to character selection?'):format(tostring(activeCharacter.name or 'this character')),
        centered=true,
        cancel=true,
        labels={ confirm = 'Log out', cancel = 'Stay' },
    })
    if confirm~='confirm' then return end
    local ped=PlayerPedId()
    local p=GetEntityCoords(ped)
    TriggerServerEvent('fbrp:characters:logout',{x=p.x,y=p.y,z=p.z,h=GetEntityHeading(ped)},lastSpawn)
end,false)
TriggerEvent('chat:addSuggestion','/logout','Log out and pick a different character')

RegisterNetEvent('fbrp:characters:loggedOut',function(name)
    if FBRP.CharacterSelecting then return end
    CreateThread(function()
        DoScreenFadeOut(500)
        TriggerEvent('fbrp:screen:expect',60000)
        local deadline=GetGameTimer()+2000
        while not IsScreenFadedOut() and GetGameTimer()<deadline do Wait(0) end

        -- close anything that could still be open from the old character
        if lib.hideMenu then pcall(lib.hideMenu) end
        if lib.hideContext then pcall(lib.hideContext) end
        if lib.closeInputDialog then pcall(lib.closeInputDialog) end
        if lib.hideTextUI then pcall(lib.hideTextUI) end

        local ped=PlayerPedId()
        local vehicle=GetVehiclePedIsIn(ped,false)
        if vehicle~=0 then TaskLeaveVehicle(ped,vehicle,16) Wait(100) end
        ClearPedTasksImmediately(ped)
        RemoveAllPedWeapons(ped,true)

        activeCharacter=nil
        lastSpawn=nil
        spawnData=nil
        FBRP.SpawnSelecting=false
        selectionStarted=true
        FBRP.CharacterSelecting=true
        holdPlayer(true)
        TriggerEvent('fbrp:characterLogout')

        Wait(300)
        DoScreenFadeIn(400)
        TriggerEvent('fbrp:screen:expect',0)
        announce('Logged Out',('You logged out of %s. Pick a character to keep playing.'):format(tostring(name or 'your character')),'inform','fa-solid fa-right-from-bracket',8000)
        TriggerServerEvent('fbrp:characters:request')
    end)
end)

exports('Logout',function() ExecuteCommand('logout') end)

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
