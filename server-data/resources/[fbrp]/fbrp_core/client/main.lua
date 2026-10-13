local menuOpen = false
local menuLocked = false
local menuView = nil
local radialOpen = false
local sessionInfo = {}

local function ui(message)
    SendNUIMessage(message)
end

-- A loadscreen NUI can survive the normal spawnmanager shutdown and leave a
-- dark, focused browser layer over gameplay. Clear every transient loading /
-- visual state once the session is usable and whenever the player spawns.
local function clearStuckScreen()
    ShutdownLoadingScreen()
    ShutdownLoadingScreenNui()
    SetNuiFocus(false, false)
    SetNuiFocusKeepInput(false)
    ClearTimecycleModifier()
    ClearExtraTimecycleModifier()
    AnimpostfxStopAll()

    if IsScreenFadedOut() or IsScreenFadingOut() then
        DoScreenFadeIn(250)
    end
end

local function resetCoreUi()
    menuOpen = false
    menuLocked = false
    menuView = nil
    radialOpen = false
    clearStuckScreen()
    ui({ type='reset' })
end

AddEventHandler('onClientResourceStart', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    resetCoreUi()

    CreateThread(function()
        while not NetworkIsSessionStarted() do Wait(100) end
        clearStuckScreen()
        Wait(1000)
        clearStuckScreen()
    end)
end)

AddEventHandler('playerSpawned', function()
    SetTimeout(250, resetCoreUi)
end)

RegisterCommand('fixscreen', function()
    resetCoreUi()
    TriggerEvent('fbrp:screen:fix')
    TriggerEvent('fbrp:notify', 'Screen and UI effects reset.', 'success')
end, false)

local function closeRadial()
    if not radialOpen then return end
    radialOpen = false
    SetNuiFocus(false, false)
    ui({ type='radial',open=false })
end

function FBRP.OpenMenu(view, payload, locked)
    closeRadial()
    menuOpen = true
    menuView = view
    menuLocked = locked == true
    SetNuiFocus(true, true)
    ui({ type='menu',open=true,view=view,payload=payload or {},locked=menuLocked })
end

function FBRP.CloseMenu(force)
    if menuLocked and not force then return end
    menuOpen = false
    menuView = nil
    menuLocked = false
    SetNuiFocus(false, false)
    ui({ type='menu',open=false })
    TriggerEvent('fbrp:menuClosed')
end

function FBRP.IsMenuOpen()
    return menuOpen
end

function FBRP.MenuView()
    return menuOpen and menuView or nil
end

RegisterNUICallback('close', function(_, cb)
    FBRP.CloseMenu()
    cb({ ok=true })
end)

-- /aop and /priority control menu
RegisterNetEvent('fbrp:control:open', function(payload)
    FBRP.OpenMenu('control', payload)
end)

RegisterNetEvent('fbrp:control:update', function(payload)
    if menuOpen and menuView == 'control' then ui({ type='controlUpdate',data=payload }) end
end)

RegisterNUICallback('controlAction', function(data, cb)
    if type(data) == 'table' then TriggerServerEvent('fbrp:control:action', data.kind, data) end
    cb({ ok=true })
end)

-- Keep an open control menu in sync when someone else changes AOP, peacetime or priority.
for _, key in ipairs({ 'fbrp:aop', 'fbrp:peacetime', 'fbrp:priority' }) do
    AddStateBagChangeHandler(key, 'global', function()
        if menuOpen and menuView == 'control' then
            SetTimeout(700, function() TriggerServerEvent('fbrp:control:action', 'refresh', {}) end)
        end
    end)
end

RegisterNetEvent('fbrp:notify', function(message, tone)
    ui({ type='notify',message=message,tone=tone or 'info' })
end)

RegisterNetEvent('fbrp:session', function(data)
    resetCoreUi()
    sessionInfo = data or {}
    ui({ type='session',data=data })
end)

-- M is the everyday interaction wheel. Categories fan out into a second ring
-- of actions, while detailed systems can still open their purpose-built menu.
local function openHub()
    if menuOpen then return FBRP.CloseMenu() end
    if radialOpen then return closeRadial() end
    local state = LocalPlayer.state
    radialOpen = true
    SetNuiFocus(true, true)
    ui({ type='radial',open=true,payload={
        jailed=state['fbrp:jailed'] == true,
        communityService=state['fbrp:communityService'] == true,
        restrained=state['fbrp:restrained'] ~= nil,
        downed=FBRP.IsDowned and FBRP.IsDowned() or false,
        discordLinked=sessionInfo.discordLinked == true,
        staff=sessionInfo.staff == true,
        inVehicle=IsPedInAnyVehicle(PlayerPedId(),false),
    } })
end

RegisterCommand('fbrp_hub', openHub, false)
RegisterKeyMapping('fbrp_hub', 'Open Florida Bay interaction menu', 'keyboard', 'M')

RegisterNUICallback('closeRadial', function(_, cb)
    closeRadial()
    cb({ok=true})
end)

local function closeInteractionMenus()
    closeRadial()
    if menuOpen then FBRP.CloseMenu() end
end

RegisterNUICallback('hubAction', function(data, cb)
    local action = type(data) == 'table' and tostring(data.action or '') or ''
    local commands = {
        fish='fish', prisonwork='prisonwork', passport='passport', scenes='scenes',
        emotes='emotes', radio='radio', vehicles='vehicles', tags='tags',
        pastimes='pastimes', interactions='interactions', carcontrols='carcontrols', showid='showid',
        org='org', bodycam='bodycam', spikes='spikes', handsup='handsup', point='point',
    }
    if action == 'activities' then
        closeInteractionMenus(); TriggerServerEvent('fbrp:activities:request')
    elseif action == 'custody' then
        closeInteractionMenus(); TriggerServerEvent('fbrp:justice:status')
    elseif action == 'mdt' then
        closeInteractionMenus(); TriggerServerEvent('fbrp:mdt:request')
    elseif commands[action] then
        closeInteractionMenus(); ExecuteCommand(commands[action])
    end
    cb({ok=true})
end)

RegisterNUICallback('hubDispatch', function(data, cb)
    local kind = type(data) == 'table' and tostring(data.kind or '') or ''
    local message = type(data) == 'table' and tostring(data.message or '') or ''
    TriggerServerEvent('fbrp:hub:dispatch', kind, message)
    closeInteractionMenus()
    cb({ok=true})
end)

-- pma-voice cycles proximity without showing any acknowledgement of its own.
-- Surface the new mode through the shared HUD UI so a working keybind never
-- looks like a dead one.
AddEventHandler('pma-voice:setTalkingMode', function(mode)
    local proximity = LocalPlayer.state.proximity
    local label = type(proximity) == 'table' and proximity.mode or nil
    if not label then label = ({ 'Whisper', 'Normal', 'Shout' })[tonumber(mode)] or ('Mode ' .. tostring(mode)) end
    TriggerEvent('fbrp:notify', 'Voice proximity: ' .. tostring(label) .. '.', 'info')
end)

-- Use a Florida Bay-owned mapping name so F11 receives a fresh default even for
-- players whose built-in EasyAdmin mapping was previously saved as unbound.
RegisterCommand('fbrp_easyadmin', function()
    ExecuteCommand('easyadmin')
end, false)
RegisterKeyMapping('fbrp_easyadmin', 'Toggle EasyAdmin menu', 'keyboard', 'F11')

RegisterNetEvent('fbrp:dispatch', function(call)
    PlaySoundFrontend(-1, call.kind == 'PANIC' and 'TIMER_STOP' or 'Event_Start_Text', 'GTAO_FM_Events_Soundset', true)
    if call.coords then
        local c = call.coords
        local streetHash, crossHash = GetStreetNameAtCoord(c.x + 0.0, c.y + 0.0, c.z + 0.0)
        local street = GetStreetNameFromHashKey(streetHash)
        if crossHash ~= 0 then street = street .. ' / ' .. GetStreetNameFromHashKey(crossHash) end
        call.street = street
        call.distance = #(GetEntityCoords(PlayerPedId()) - vector3(c.x + 0.0, c.y + 0.0, c.z + 0.0))
    end
    ui({ type='dispatch',data=call })
    if call.coords then
        local blip = AddBlipForCoord(call.coords.x + 0.0, call.coords.y + 0.0, call.coords.z + 0.0)
        SetBlipSprite(blip, call.kind == 'PANIC' and 161 or 280)
        SetBlipColour(blip, call.kind == 'PANIC' and 1 or 3)
        SetBlipScale(blip, call.kind == 'PANIC' and 1.25 or 0.9)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentString(call.kind == 'PANIC' and 'Officer Panic' or ('911 Call #' .. tostring(call.id or '')))
        EndTextCommandSetBlipName(blip)
        SetTimeout(call.kind == 'PANIC' and 120000 or 60000, function()
            if DoesBlipExist(blip) then RemoveBlip(blip) end
        end)
    end
end)

RegisterNetEvent('fbrp:dispatch:waypoint', function(coords, id)
    if type(coords) ~= 'table' then return end
    SetNewWaypoint(coords.x + 0.0, coords.y + 0.0)
    PlaySoundFrontend(-1, 'WAYPOINT_SET', 'HUD_FRONTEND_DEFAULT_SOUNDSET', true)
end)

RegisterNetEvent('fbrp:proximityChat', function(sourceId, channel, text, color)
    local player = GetPlayerFromServerId(tonumber(sourceId))
    if player == -1 then return end
    local targetPed = GetPlayerPed(player)
    if not DoesEntityExist(targetPed) then return end
    local mine, theirs = GetEntityCoords(PlayerPedId()), GetEntityCoords(targetPed)
    if #(mine - theirs) > 20.0 then return end
    TriggerEvent('chat:addMessage', {
        color=color or {255,255,255},
        multiline=true,
        args={('%s · %s [%d]'):format(channel,GetPlayerName(player),sourceId),text}
    })
end)

RegisterCommand('tags', function() TriggerServerEvent('fbrp:tags:request') end, false)
RegisterCommand('tagmenu', function() TriggerServerEvent('fbrp:tags:request') end, false)
RegisterKeyMapping('tags', 'Open Florida Bay headtag wardrobe', 'keyboard', 'F6')

CreateThread(function()
    while not NetworkIsSessionStarted() do Wait(500) end
    Wait(1000)
    TriggerServerEvent('fbrp:requestSession')
end)

CreateThread(function()
    while true do
        if menuOpen and IsControlJustReleased(0, 200) then FBRP.CloseMenu() end
        Wait(menuOpen and 0 or 250)
    end
end)
