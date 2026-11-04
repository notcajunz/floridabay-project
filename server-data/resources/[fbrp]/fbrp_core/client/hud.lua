-- Player HUD: compass, status rings, speedometer, minimap frame, ID / time chips, job card and the
-- AOP & priority panel. Settings live in config_hud.lua.
--
-- The HUD page is web/hud/index.html. It runs in a full-screen iframe at the bottom of fbrp_core's NUI page, so its
-- styles never mix with the menus. Messages to it go out as { type = 'fbrpHud', action, data } and web/app.js
-- forwards them into the frame; its callbacks come back as hud_*.
--
-- Also in this file: fbrp_core's own overlay (jail timer, downed screen, progress, dispatch ...) is hidden in the
-- pause menu, during character select and while the screen is faded.
--
-- The old rounded minimap mask (it replaced GTA's radar mask texture and mis-clipped the map), the big-map refresh
-- on spawn, /hudmenu and /squaremap are gone. The GTA minimap is left as-is; the HUD draws its border around it.

FBRPHud = { visible = false, userHidden = false, settingsOpen = false, settings = {}, radar = nil }
local Hud = FBRPHud

local SETTINGS_KEY = 'fbrp_hud_settings'

local function send(action, data) SendNUIMessage({ type = 'fbrpHud', action = action, data = data }) end
Hud.send = send

-- the frame only takes the mouse while the settings panel is open
local function setInteractive(on)
    SendNUIMessage({ type = 'hudFrame', interactive = on == true })
end

function Hud.isDowned()
    return LocalPlayer.state['fbrp:downed'] and true or false
end

local function characterReady()
    return NetworkIsPlayerActive(PlayerId()) and FBRP.CharacterSelecting ~= true
end

local function shouldShow()
    if Hud.userHidden or not characterReady() then return false end
    if IsPauseMenuActive() or IsPlayerSwitchInProgress() or IsScreenFadedOut() then return false end
    if Hud.isDowned() then return false end
    return true
end
Hud.shouldShow = shouldShow

---------------------------------------------------------------- settings

local function loadSettings()
    local raw = GetResourceKvpString(SETTINGS_KEY)
    local ok, data = pcall(json.decode, raw or '{}')
    Hud.settings = (ok and type(data) == 'table') and data or {}
    Hud.settings.speedUnit = Hud.settings.speedUnit or HudConfig.SpeedUnit
    if Hud.settings.minimapOnFoot == nil then Hud.settings.minimapOnFoot = HudConfig.ShowMinimapOnFoot end
    send('settings', Hud.settings)
end

local function closeSettings()
    Hud.settingsOpen = false
    SetNuiFocus(false, false)
    setInteractive(false)
end

RegisterNUICallback('hud_saveSettings', function(data, cb)
    cb(1)
    if type(data) ~= 'table' then return end
    Hud.settings = data
    SetResourceKvp(SETTINGS_KEY, json.encode(data))
    TriggerEvent('fbrp:hudSettingsChanged', data)
end)

RegisterNUICallback('hud_closeSettings', function(_, cb)
    cb(1)
    closeSettings()
end)

RegisterNUICallback('hud_hideHud', function(_, cb)
    cb(1)
    closeSettings()
    Hud.userHidden = true
    send('hudToggled', { visible = false, notify = true })
end)

-- the settings page also talks to add-on HUD pieces; FBRP has none
RegisterNUICallback('hud_addonPreview', function(_, cb) cb(1) end)
RegisterNUICallback('hud_addonMove', function(_, cb) cb(1) end)

RegisterCommand(HudConfig.Command, function()
    if not characterReady() then return end
    Hud.settingsOpen = true
    setInteractive(true)
    send('openSettings', Hud.settings)
    SetNuiFocus(true, true)
end, false)

RegisterCommand(HudConfig.ToggleCommand, function()
    Hud.userHidden = not Hud.userHidden
    send('hudToggled', { visible = not Hud.userHidden, notify = true })
end, false)

TriggerEvent('chat:addSuggestion', '/' .. HudConfig.Command, 'HUD settings: themes, styles, colours, units, sounds and moving elements')
TriggerEvent('chat:addSuggestion', '/' .. HudConfig.ToggleCommand, 'Hide or show the HUD')

---------------------------------------------------------------- status

AddEventHandler('pma-voice:radioActive', function(active) Hud.radioTalking = active end)

-- the key bound to pma-voice's range cycle (players can rebind it), refreshed every few seconds
local voiceKey, voiceKeyAt = nil, 0
local function cycleKey()
    local now = GetGameTimer()
    if voiceKey and now - voiceKeyAt < 3000 then return voiceKey end
    voiceKeyAt = now
    local cfg = HudConfig.Voice or {}
    local ok, label = pcall(GetControlInstructionalButton, 0, joaat(cfg.cycleCommand or '+cycleproximity') | 0x80000000, true)
    if ok and type(label) == 'string' and label:sub(1, 2) == 't_' and #label > 2 then
        voiceKey = label:sub(3):upper()
    else
        voiceKey = cfg.fallbackKey or 'F9'
    end
    return voiceKey
end

local function statusData()
    local ped = PlayerPedId()
    local maxHp = math.max(1, GetEntityMaxHealth(ped) - 100)
    local hp = math.max(0, math.min(100, (GetEntityHealth(ped) - 100) / maxHp * 100))
    local underwater = IsPedSwimmingUnderWater(ped)
    local prox = LocalPlayer.state.proximity
    return {
        health = math.floor(hp + 0.5),
        armor = GetPedArmour(ped),
        stamina = math.floor(100 - GetPlayerSprintStaminaRemaining(PlayerId())),
        oxygen = underwater and math.floor(math.max(0, GetPlayerUnderwaterTimeRemaining(PlayerId())) * 10) or nil,
        talking = NetworkIsPlayerTalking(PlayerId()) or Hud.radioTalking == true,
        voice = (type(prox) == 'table' and prox.index) or 2,
        voiceKey = cycleKey(),
    }
end

---------------------------------------------------------------- compass

local function compassData()
    local ped = PlayerPedId()
    local pos = GetEntityCoords(ped)
    local out = { bearing = (360.0 - GetGameplayCamRot(2).z) % 360.0 }
    local s1, s2 = GetStreetNameAtCoord(pos.x, pos.y, pos.z)
    out.street = GetStreetNameFromHashKey(s1)
    out.cross = s2 ~= 0 and GetStreetNameFromHashKey(s2) or nil
    out.zone = GetLabelText(GetNameOfZone(pos.x, pos.y, pos.z))
    local code = Hud.postal and Hud.postal()
    if code then out.zone = ('%s · %s'):format(out.zone or '', code) end
    local blip = GetFirstBlipInfoId(8)
    if DoesBlipExist(blip) then
        local wp = GetBlipInfoIdCoord(blip)
        out.waypoint = #(vector2(pos.x, pos.y) - vector2(wp.x, wp.y))
    end
    return out
end

---------------------------------------------------------------- job / info / priority panel

local function tag(value)
    if type(value) ~= 'table' or not value.label or value.label == '' then return nil end
    return { label = tostring(value.label), color = value.color }
end

local function priorityData()
    local bag = LocalPlayer.state
    local all = GlobalState['fbrp:priority']
    local zones = {}
    for _, zone in ipairs(HudConfig.Priority.Zones) do
        local entry = type(all) == 'table' and type(all[zone.id]) == 'table' and all[zone.id] or {}
        zones[#zones + 1] = { id = zone.id, label = zone.label, status = entry.status or 'available', remaining = tonumber(entry.remaining) or 0 }
    end
    local org = bag['fbrp:organization']
    local job = nil
    if type(org) == 'table' then
        local labels = HudConfig.Priority.JobLabels or {}
        job = labels[string.lower(tostring(org.type or ''))] or org.name or org.slug
    elseif bag['fbrp:staffDuty'] == true then
        job = 'Staff'
    end
    return {
        aop = GlobalState['fbrp:aop'] or 'Statewide',
        peacetime = GlobalState['fbrp:peacetime'] == true,
        zones = zones,
        headtag = tag(bag['fbrp:headtag']),
        gangtag = tag(bag['fbrp:gangtag']),
        job = job ~= '' and job or nil,
    }
end

local function sendPrioConfig()
    local p = HudConfig.Priority
    send('voiceConfig', { color = HudConfig.Voice and HudConfig.Voice.color })
    if HudConfig.Minimap then send('defaults', { mmAdjust = HudConfig.Minimap.fit, bezel = HudConfig.Minimap.bezel, bezelColor = HudConfig.Minimap.bezelColor }) end
    send('prioConfig', {
        server = p.ServerName, lobby = p.Lobby, font = p.Font, size = p.FontSize, colour = p.PrimaryColour,
        colours = p.Colours, text = p.Text,
    })
end

local lastPrio = nil
local function pushSlow(force)
    local prio = json.encode(priorityData())
    if force or prio ~= lastPrio then lastPrio = prio send('prio', json.decode(prio)) end
    send('info', { show = true, id = GetPlayerServerId(PlayerId()), time = ('%02d:%02d'):format(GetClockHours(), GetClockMinutes()) })
end

RegisterNUICallback('hud_ready', function(_, cb)
    cb(1)
    loadSettings()
    sendPrioConfig()
    pushSlow(true)
    if Hud.minimapResend then Hud.minimapResend() end
end)

CreateThread(function()
    while true do
        if Hud.visible then pushSlow(false) end
        Wait(1000)
    end
end)

---------------------------------------------------------------- main loops

CreateThread(function()
    while true do
        local show = shouldShow()
        Hud.visible = show
        local vdata = Hud.vehicleData and Hud.vehicleData() or false
        if show or Hud.settingsOpen then
            local onFoot = not IsPedInAnyVehicle(PlayerPedId(), false)
            local mapUp = Hud.settingsOpen or not onFoot or Hud.settings.minimapOnFoot == true
            send('update', { visible = show, minimap = mapUp, onFoot = onFoot, mapOnFoot = Hud.settings.minimapOnFoot == true, status = statusData(), vehicle = vdata })
            send('compass', compassData())
        else
            send('update', { visible = false, minimap = false, status = {}, vehicle = false })
        end
        Wait(show and (vdata and 80 or 200) or 500)
    end
end)

-- smooth compass heading, ~30 updates a second
CreateThread(function()
    local last = -1
    while true do
        if Hud.visible then
            local bearing = (360.0 - GetGameplayCamRot(2).z) % 360.0
            if math.abs(bearing - last) > 0.05 then
                last = bearing
                send('heading', bearing)
            end
            Wait(33)
        else
            Wait(250)
        end
    end
end)

CreateThread(function()
    while true do
        if Hud.visible then
            for _, c in ipairs(HudConfig.HideGtaHud) do HideHudComponentThisFrame(c) end
            Wait(0)
        else
            Wait(250)
        end
    end
end)

---------------------------------------------------------------- fbrp_core's own overlay (jail, downed, progress ...)

CreateThread(function()
    local last, since = nil, 0
    while true do
        local visible = not FBRP.CharacterSelecting and not IsPauseMenuActive() and not IsScreenFadedOut() and not IsPlayerSwitchInProgress()
        since = since + 1
        if visible ~= last or since >= 8 then
            last, since = visible, 0
            SendNUIMessage({ type = 'hudVisible', visible = visible })
        end
        Wait(250)
    end
end)

---------------------------------------------------------------- exports

exports('IsCharacterSelecting', function() return FBRP.CharacterSelecting == true end)
exports('VehicleStatus', function() return FBRP.VehicleStatus() end)
exports('PriorityZoneAt', function(x, y, z) return FBRP.PriorityZoneAt(x, y, z) end)
exports('IsHudVisible', function() return Hud.visible end)
exports('SetHudHidden', function(hidden) Hud.userHidden = hidden == true end)
exports('PlayHudSound', function(name) send('sfx', { name = name }) end)
