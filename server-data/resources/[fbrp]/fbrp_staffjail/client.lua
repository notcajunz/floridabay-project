-- FBRP Staff Jail - client
local cfg = StaffJailConfig
local jail = nil
local endsAt = 0
local OUTFIT_KVP = 'fbrp_staffjail_outfit'
local COMPONENTS = { 1, 3, 4, 5, 6, 7, 8, 9, 10, 11 }
local PROPS = { 0, 1, 2, 6, 7 }

local function notify(description, kind)
    lib.notify({ title = 'Staff Jail', description = description, type = kind or 'inform', position = cfg.NotifyPosition, icon = 'fa-solid fa-user-lock' })
end

local function formatTime(seconds)
    seconds = math.max(0, math.floor(seconds or 0))
    local h, m, s = seconds // 3600, (seconds % 3600) // 60, seconds % 60
    if h > 0 then return ('%d:%02d:%02d'):format(h, m, s) end
    return ('%d:%02d'):format(m, s)
end

local function presetLabel(minutes)
    if minutes < 60 then return ('%d minute%s'):format(minutes, minutes == 1 and '' or 's') end
    local h, m = minutes // 60, minutes % 60
    if m == 0 then return ('%d hour%s'):format(h, h == 1 and '' or 's') end
    return ('%dh %dm'):format(h, m)
end

---------------------------------------------------------------- the /staffjail dialog (ox_lib)

RegisterNetEvent('fbrp_staffjail:dialog', function(data)
    local options = {}
    for _, minutes in ipairs(data.presets or {}) do options[#options + 1] = { value = minutes, label = presetLabel(minutes) } end

    local input = lib.inputDialog('Staff Jail', {
        { type = 'number', label = 'Player ID', description = 'Server ID of the player', icon = 'id-card', required = true, min = 1, default = data.target },
        { type = 'select', label = 'Time', icon = 'clock', options = options, required = true, default = data.default },
        { type = 'number', label = 'Custom time (minutes)', description = 'Optional - overrides the dropdown', icon = 'stopwatch', min = 1, max = data.max },
        { type = 'input', label = 'Reason', description = 'Rule broken / why', icon = 'file-signature', required = true },
        { type = 'input', label = 'Staff member', icon = 'shield-halved', default = data.staff, disabled = true },
    })
    if not input then return end

    TriggerServerEvent('fbrp_staffjail:submit', {
        target = input[1],
        minutes = (tonumber(input[3]) and tonumber(input[3]) > 0) and input[3] or input[2],
        reason = input[4],
    })
end)

---------------------------------------------------------------- optional outfit

local function saveOutfit(ped)
    if GetResourceKvpString(OUTFIT_KVP) then return end
    local saved = { model = GetEntityModel(ped), components = {}, props = {} }
    for _, c in ipairs(COMPONENTS) do saved.components[tostring(c)] = { GetPedDrawableVariation(ped, c), GetPedTextureVariation(ped, c), GetPedPaletteVariation(ped, c) } end
    for _, p in ipairs(PROPS) do saved.props[tostring(p)] = { GetPedPropIndex(ped, p), GetPedPropTextureIndex(ped, p) } end
    SetResourceKvp(OUTFIT_KVP, json.encode(saved))
end

local function wearOutfit(ped)
    local suit = cfg.Outfit[GetEntityModel(ped)]
    if not suit then return end
    for component, value in pairs(suit) do SetPedComponentVariation(ped, component, value[1], value[2], 0) end
    ClearPedProp(ped, 0)
    TriggerEvent('fbrp:appearanceChanged')
end

local function restoreOutfit(ped)
    local raw = GetResourceKvpString(OUTFIT_KVP)
    DeleteResourceKvp(OUTFIT_KVP)
    if not raw then return end
    local saved = json.decode(raw)
    if not saved or saved.model ~= GetEntityModel(ped) then return end
    for c, v in pairs(saved.components or {}) do SetPedComponentVariation(ped, tonumber(c), v[1], v[2], v[3] or 0) end
    for p, v in pairs(saved.props or {}) do
        if v[1] and v[1] >= 0 then SetPedPropIndex(ped, tonumber(p), v[1], v[2], true) else ClearPedProp(ped, tonumber(p)) end
    end
    TriggerEvent('fbrp:appearanceChanged')
end

---------------------------------------------------------------- teleport

local function teleport(coords, snapToGround)
    local ped = PlayerPedId()
    DoScreenFadeOut(400)
    while not IsScreenFadedOut() do Wait(10) end
    if IsPedInAnyVehicle(ped, false) then TaskLeaveVehicle(ped, GetVehiclePedIsIn(ped, false), 16) Wait(100) end
    DetachEntity(ped, true, false)
    RequestCollisionAtCoord(coords.x, coords.y, coords.z)
    SetEntityCoordsNoOffset(ped, coords.x, coords.y, coords.z, false, false, false)
    SetEntityHeading(ped, coords.w or 0.0)
    local untilAt = GetGameTimer() + 3000
    while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer() < untilAt do Wait(25) end
    if snapToGround then
        local found, groundZ = GetGroundZFor_3dCoord(coords.x, coords.y, coords.z + 50.0, false)
        if found then SetEntityCoordsNoOffset(ped, coords.x, coords.y, groundZ + 0.05, false, false, false) end
    end
    Wait(200)
    DoScreenFadeIn(500)
end

---------------------------------------------------------------- while in staff jail

local function drawTimer()
    local left = math.max(0, (endsAt - GetGameTimer()) / 1000)
    SetTextFont(4)
    SetTextScale(0.0, 0.5)
    SetTextColour(255, 255, 255, 230)
    SetTextOutline()
    SetTextCentre(true)
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(('~r~STAFF JAIL~w~  %s remaining'):format(formatTime(left)))
    EndTextCommandDisplayText(0.5, 0.9)
    if jail and jail.reason then
        SetTextFont(4)
        SetTextScale(0.0, 0.38)
        SetTextColour(220, 220, 220, 200)
        SetTextOutline()
        SetTextCentre(true)
        BeginTextCommandDisplayText('STRING')
        AddTextComponentSubstringPlayerName(('Reason: %s'):format(jail.reason))
        EndTextCommandDisplayText(0.5, 0.935)
    end
end

local function jailLoop()
    CreateThread(function()
        local lastCheck = 0
        while jail do
            local ped = PlayerPedId()
            DisablePlayerFiring(PlayerId(), true)
            DisableControlAction(0, 37, true)  -- weapon wheel
            DisableControlAction(0, 140, true)
            DisableControlAction(0, 141, true)
            DisableControlAction(0, 142, true)
            drawTimer()
            if GetGameTimer() - lastCheck > 1500 then
                lastCheck = GetGameTimer()
                if GetSelectedPedWeapon(ped) ~= `WEAPON_UNARMED` then SetCurrentPedWeapon(ped, `WEAPON_UNARMED`, true) end
                if cfg.UseOutfit then
                    local suit = cfg.Outfit[GetEntityModel(ped)]
                    if suit and GetPedDrawableVariation(ped, 11) ~= suit[11][1] then wearOutfit(ped) end
                end
                if IsPedInAnyVehicle(ped, false) or #(GetEntityCoords(ped) - cfg.JailSpot.xyz) > cfg.LeashRadius then
                    notify('You cannot leave staff jail.', 'error')
                    teleport(cfg.JailSpot, false)
                end
            end
            Wait(0)
        end
    end)
end

RegisterNetEvent('fbrp_staffjail:enter', function(data, fresh)
    local wasJailed = jail ~= nil
    jail = data or {}
    endsAt = GetGameTimer() + (tonumber(jail.remaining) or 0) * 1000
    if wasJailed then return end
    TriggerEvent('fbrp:cancelActivities')
    if cfg.UseOutfit then saveOutfit(PlayerPedId()) end
    teleport(cfg.JailSpot, false)
    if cfg.UseOutfit then wearOutfit(PlayerPedId()) end
    if fresh then PlaySoundFrontend(-1, 'Bed', 'WastedSounds', true) end
    jailLoop()
end)

RegisterNetEvent('fbrp_staffjail:sync', function(data)
    if not jail or type(data) ~= 'table' then return end
    jail = data
    endsAt = GetGameTimer() + (tonumber(data.remaining) or 0) * 1000
end)

RegisterNetEvent('fbrp_staffjail:release', function(coords, snap)
    jail = nil
    teleport(coords, true)
    if cfg.UseOutfit then restoreOutfit(PlayerPedId()) end
end)

---------------------------------------------------------------- loaded: tell the server (puts you back in if you relogged)

local function ready()
    SetTimeout(3000, function()
        TriggerServerEvent('fbrp_staffjail:ready')
        SetTimeout(4000, function()
            if not jail and cfg.UseOutfit and GetResourceKvpString(OUTFIT_KVP) and not LocalPlayer.state['fbrp:staffJailed'] then
                restoreOutfit(PlayerPedId())
            end
        end)
    end)
end

AddEventHandler('playerSpawned', ready)
AddEventHandler('onClientResourceStart', function(resource)
    if resource == GetCurrentResourceName() and NetworkIsPlayerActive(PlayerId()) then ready() end
end)
AddStateBagChangeHandler('fbrp:characterId', ('player:%d'):format(GetPlayerServerId(PlayerId())), function(_, _, value)
    if value then ready() end
end)

TriggerEvent('chat:addSuggestion', '/staffjail', '[Staff] Staff-jail a player (opens the form)', { { name = 'id', help = 'Optional - fills in the player ID' } })
TriggerEvent('chat:addSuggestion', '/unstaffjail', '[Staff] Release someone from staff jail', { { name = 'id', help = 'Player in staff jail' } })
TriggerEvent('chat:addSuggestion', '/staffjailtime', 'See how much staff jail time is left', { { name = 'id', help = 'Optional (staff) - check someone else' } })
TriggerEvent('chat:addSuggestion', '/staffjailed', '[Staff] List everyone in staff jail')
