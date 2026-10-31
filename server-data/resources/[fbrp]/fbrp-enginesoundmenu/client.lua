local STATE_SOUND = 'vehdata:sound'
local STATE_LABEL = 'vehdata:soundLabel'
local DEFAULT_LABEL = "Default (vehicle's normal)"
local DEFAULT_KEY = '__default'

-- ───────────────────────────────────────────────────────────────────────────
--  data
-- ───────────────────────────────────────────────────────────────────────────

local Labels = {}
for label in pairs(Config.EngineSounds) do
    Labels[#Labels + 1] = label
end
table.sort(Labels, function(a, b) return a:lower() < b:lower() end)

local Favourites = {}
local storedModelSounds = {}
local storeSoundsForModel = Config.StoreSoundsByModel

do
    local ok, favs = pcall(function() return json.decode(GetResourceKvpString('favouriteEngineSounds') or '{}') end)
    if ok and type(favs) == 'table' then
        for label in pairs(favs) do
            if Config.EngineSounds[label] then Favourites[label] = true end
        end
    end

    local ok2, stored = pcall(function() return json.decode(GetResourceKvpString('storedModelSounds') or '{}') end)
    if ok2 and type(stored) == 'table' then storedModelSounds = stored end

    local store = GetResourceKvpString('storeSoundsForModel')
    if store ~= nil then storeSoundsForModel = (store == '1') end
end

local function saveFavourites()
    SetResourceKvp('favouriteEngineSounds', json.encode(Favourites))
end

local function saveStored()
    SetResourceKvp('storedModelSounds', json.encode(storedModelSounds))
end

local function favouriteCount()
    local n = 0
    for _ in pairs(Favourites) do n = n + 1 end
    return n
end

-- ───────────────────────────────────────────────────────────────────────────
--  helpers
-- ───────────────────────────────────────────────────────────────────────────

local function getDrivenVehicle()
    local ped = PlayerPedId()
    if not IsPedInAnyVehicle(ped, false) then return nil end
    local veh = GetVehiclePedIsIn(ped, false)
    if veh == 0 or GetPedInVehicleSeat(veh, -1) ~= ped then return nil end
    return veh
end

local function isRestricted()
    return LocalPlayer.state.dead or IsEntityDead(PlayerPedId())
end

local function activeLabel(veh)
    if not veh or not DoesEntityExist(veh) then return nil end
    return Entity(veh).state[STATE_LABEL] or DEFAULT_LABEL
end

local function defaultAudioFor(veh)
    local model = GetEntityModel(veh)
    local name = GetEntityArchetypeName and GetEntityArchetypeName(veh) or nil
    if not name or name == '' then name = GetDisplayNameFromVehicleModel(model) end
    name = (name or ''):lower()
    return Config.DefaultAudioOverrides[name] or name
end

-- ───────────────────────────────────────────────────────────────────────────
--  menu state
-- ───────────────────────────────────────────────────────────────────────────

local open = false
local view = 'all' -- 'all' | 'fav'
local list = {}
local index = 1
local lastLabel = nil
local pending = nil
local nextApplyAt = 0

local function buildList()
    local l = {}
    if Config.AllowDefault then l[1] = DEFAULT_LABEL end
    for _, label in ipairs(Labels) do
        if view == 'all' or Favourites[label] then
            l[#l + 1] = label
        end
    end
    return l
end

local function indexOf(label)
    if not label then return nil end
    for i, v in ipairs(list) do
        if v == label then return i end
    end
    return nil
end

local function render(dir)
    local label = list[index]
    local veh = getDrivenVehicle()
    SendNUIMessage({
        action = 'render',
        name = label,
        index = index,
        total = #list,
        favourite = Favourites[label] == true,
        active = veh ~= nil and activeLabel(veh) == label,
        isDefault = label == DEFAULT_LABEL,
        view = view,
        dir = dir or 0,
    })
end

local function status(kind, text)
    SendNUIMessage({ action = 'status', kind = kind, text = text })
end

local function step(dir)
    index = index + dir
    if index < 1 then index = #list elseif index > #list then index = 1 end
    lastLabel = list[index]
    render(dir)
end

local function toggleView()
    local current = list[index]
    if view == 'all' then
        if favouriteCount() == 0 then
            return status('info', 'NO FAVOURITES YET')
        end
        view = 'fav'
    else
        view = 'all'
    end
    list = buildList()
    index = indexOf(current) or 1
    render(0)
end

local function toggleFavourite()
    local label = list[index]
    if label == DEFAULT_LABEL then
        return status('info', "DEFAULT CAN'T BE A FAVOURITE")
    end

    local added
    if Favourites[label] then
        Favourites[label] = nil
        added = false
    else
        Favourites[label] = true
        added = true
    end
    saveFavourites()

    if view == 'fav' then
        list = buildList()
        if favouriteCount() == 0 then
            view = 'all'
            list = buildList()
            index = indexOf(label) or 1
        elseif index > #list then
            index = #list
        end
    end

    render(0)
    status('info', added and 'ADDED TO FAVOURITES' or 'REMOVED FROM FAVOURITES')
end

local function applySelected()
    local now = GetGameTimer()
    if now < nextApplyAt then return end

    local label = list[index]
    local veh = getDrivenVehicle()

    if not veh then
        return status('error', 'YOU NEED TO BE DRIVING')
    end
    if isRestricted() then
        return status('error', 'NOT AVAILABLE RIGHT NOW')
    end
    if Config.BlockWhenSirenOn and IsVehicleSirenOn(veh) then
        return status('error', 'TURN THE SIREN OFF FIRST')
    end
    if not NetworkGetEntityIsNetworked(veh) then
        return status('error', 'VEHICLE NOT SYNCED')
    end

    nextApplyAt = now + 500
    pending = { model = GetEntityModel(veh), label = label }
    TriggerServerEvent(
        'FBRP:EngineSounds:ChangeEngineSound',
        VehToNet(veh),
        label == DEFAULT_LABEL and DEFAULT_KEY or label
    )
end

local function closeMenu()
    if not open then return end
    open = false
    SendNUIMessage({ action = 'hide' })
end

-- Controls: the menu never takes NUI focus, so the player keeps full control of
-- the vehicle. Menu keys are read straight from the game and blocked so they
-- don't also trigger their normal action (phone on Arrow Up, etc).
local function startInput()
    local C = Config.Controls

    local blocked = { 27, C.left, C.right, C.favourite, C.list }
    for _, c in ipairs(C.select) do blocked[#blocked + 1] = c end
    for _, c in ipairs(C.close) do blocked[#blocked + 1] = c end

    local function anyJustPressed(controls)
        for _, c in ipairs(controls) do
            if IsDisabledControlJustPressed(0, c) then return true end
        end
        return false
    end

    CreateThread(function()
        local held, nextAt, heldSince, nextCheck = 0, 0, 0, 0

        while open do
            for i = 1, #blocked do
                DisableControlAction(0, blocked[i], true)
            end

            local now = GetGameTimer()

            if now >= nextCheck then
                nextCheck = now + 250
                if IsPauseMenuActive() or isRestricted() or not getDrivenVehicle() then
                    closeMenu()
                    break
                end
            end

            -- left / right, hold to scroll (slow at first, then faster)
            local dir = 0
            if IsDisabledControlPressed(0, C.right) then dir = 1
            elseif IsDisabledControlPressed(0, C.left) then dir = -1 end

            if dir ~= 0 then
                if dir ~= held then
                    held, heldSince, nextAt = dir, now, now + 380
                    step(dir)
                elseif now >= nextAt then
                    nextAt = now + ((now - heldSince > 1200) and 28 or 60)
                    step(dir)
                end
            else
                held = 0
            end

            if IsDisabledControlJustPressed(0, C.favourite) then
                toggleFavourite()
            elseif IsDisabledControlJustPressed(0, C.list) then
                toggleView()
            elseif anyJustPressed(C.select) then
                SendNUIMessage({ action = 'press' })
                applySelected()
            elseif anyJustPressed(C.close) then
                closeMenu()
                break
            end

            Wait(0)
        end
    end)
end

local function openMenu()
    if open then return end

    local veh = getDrivenVehicle()
    if not veh then
        return Config.Notify('You need to be driving a vehicle to use the engine sound menu.')
    end
    if isRestricted() then
        return Config.Notify("You can't use the engine sound menu right now.")
    end

    view = 'all'
    list = buildList()
    index = indexOf(activeLabel(veh)) or indexOf(lastLabel) or 1
    open = true

    SendNUIMessage({
        action = 'show',
        header = Config.Header,
        right = Config.Position.right,
        bottom = Config.Position.bottom,
    })
    render(0)
    startInput()
end

-- ───────────────────────────────────────────────────────────────────────────
--  events / commands
-- ───────────────────────────────────────────────────────────────────────────

RegisterNetEvent('FBRP:EngineSounds:OpenMenu', openMenu)

RegisterNetEvent('FBRP:EngineSounds:Result', function(ok, text, label, asNotification)
    if not open then
        pending = nil
        if not ok and asNotification then
            Config.Notify("You don't have access to the engine sound menu.")
        end
        return
    end

    if ok then
        if pending and storeSoundsForModel then
            local key = tostring(pending.model)
            storedModelSounds[key] = pending.label ~= DEFAULT_LABEL and pending.label or nil
            saveStored()
        end
        status('ok', text)
        render(0)
    else
        status('error', text)
    end
    pending = nil
end)

-- Another player (or this one) changed a vehicle's sound.
AddStateBagChangeHandler(STATE_SOUND, nil, function(bagName, _, value)
    CreateThread(function()
        local entity = 0
        for _ = 1, 50 do
            entity = GetEntityFromStateBagName(bagName)
            if entity ~= 0 and DoesEntityExist(entity) then break end
            Wait(100)
        end
        if entity == 0 or not DoesEntityExist(entity) or not IsEntityAVehicle(entity) then return end

        ForceUseAudioGameObject(entity, value or defaultAudioFor(entity))

        if open and entity == getDrivenVehicle() then render(0) end
    end)
end)

-- Put the remembered sound back when the player gets in as driver.
CreateThread(function()
    local lastVeh = 0
    while true do
        Wait(500)
        local veh = getDrivenVehicle() or 0
        if veh ~= lastVeh then
            lastVeh = veh
            if veh ~= 0 and storeSoundsForModel and NetworkGetEntityIsNetworked(veh) then
                local label = storedModelSounds[tostring(GetEntityModel(veh))]
                local siren = Config.BlockWhenSirenOn and IsVehicleSirenOn(veh)
                if label and Config.EngineSounds[label] and not siren and activeLabel(veh) ~= label then
                    TriggerServerEvent('FBRP:EngineSounds:ChangeEngineSound', VehToNet(veh), label)
                end
            end
        end
    end
end)

RegisterCommand('enginesound', function()
    if open then return closeMenu() end
    TriggerServerEvent('FBRP:EngineSounds:RequestOpen')
end, false)

RegisterKeyMapping('enginesound', 'Open Engine Sound Menu', 'keyboard', Config.Keybind)

RegisterCommand('enginesoundstore', function()
    storeSoundsForModel = not storeSoundsForModel
    SetResourceKvp('storeSoundsForModel', storeSoundsForModel and '1' or '0')
    Config.Notify(storeSoundsForModel
        and 'Engine sounds will now be remembered per vehicle.'
        or 'Engine sounds will no longer be remembered per vehicle.')
end, false)

TriggerEvent('chat:addSuggestion', '/enginesound', 'Open the engine sound menu')
TriggerEvent('chat:addSuggestion', '/enginesoundstore', 'Toggle remembering the engine sound per vehicle')

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    SendNUIMessage({ action = 'hide' })
end)
