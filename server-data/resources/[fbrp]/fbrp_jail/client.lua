-- FBRP Jail - client
local cfg = JailConfig
local jail = nil          -- { remaining, total, reason, officer, callsign } while jailed
local endsAt = 0          -- GetGameTimer() when the time runs out (for the on-screen timer)
local OUTFIT_KVP = 'fbrp_jail_outfit'
local COMPONENTS = { 1, 3, 4, 5, 6, 7, 8, 9, 10, 11 }
local PROPS = { 0, 1, 2, 6, 7 }

local function notify(description, kind)
    lib.notify({ title = 'Jail', description = description, type = kind or 'inform', position = cfg.NotifyPosition, icon = 'fa-solid fa-handcuffs' })
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

---------------------------------------------------------------- the /jail dialog (ox_lib)

RegisterNetEvent('fbrp_jail:dialog', function(data)
    local options = {}
    for _, minutes in ipairs(data.presets or {}) do
        options[#options + 1] = { value = minutes, label = presetLabel(minutes) }
    end

    local input = lib.inputDialog('Jail a Player', {
        { type = 'number', label = 'Player ID', description = 'Server ID of the person going to jail', icon = 'id-card',
          required = true, min = 1, default = data.target },
        { type = 'select', label = 'Jail time', icon = 'clock', options = options, required = true, default = data.default },
        { type = 'number', label = 'Custom time (minutes)', description = 'Optional - overrides the dropdown', icon = 'stopwatch',
          min = 1, max = data.max },
        { type = 'input', label = 'Reason', description = 'Charges / why they are being jailed', icon = 'file-signature', required = true },
        { type = 'input', label = 'Jailed by (callsign)', icon = 'shield-halved', required = true, default = data.callsign,
          placeholder = '#123' },
    })
    if not input then return end

    TriggerServerEvent('fbrp_jail:submit', {
        target = input[1],
        minutes = (tonumber(input[3]) and tonumber(input[3]) > 0) and input[3] or input[2],
        reason = input[4],
        callsign = input[5],
    })
end)

---------------------------------------------------------------- outfit

-- saved to KVP so it survives a relog while in jail
local function saveOutfit(ped)
    if GetResourceKvpString(OUTFIT_KVP) then return end -- keep the original outfit, not the jumpsuit
    local saved = { model = GetEntityModel(ped), components = {}, props = {} }
    for _, c in ipairs(COMPONENTS) do
        saved.components[tostring(c)] = { GetPedDrawableVariation(ped, c), GetPedTextureVariation(ped, c), GetPedPaletteVariation(ped, c) }
    end
    for _, p in ipairs(PROPS) do
        saved.props[tostring(p)] = { GetPedPropIndex(ped, p), GetPedPropTextureIndex(ped, p) }
    end
    SetResourceKvp(OUTFIT_KVP, json.encode(saved))
end

local function wearJumpsuit(ped)
    local suit = cfg.Jumpsuit[GetEntityModel(ped)]
    if not suit then return end -- addon / non-freemode peds keep their look
    for component, value in pairs(suit) do SetPedComponentVariation(ped, component, value[1], value[2], 0) end
    ClearPedProp(ped, 0) -- hat
    ClearPedProp(ped, 1) -- glasses
    TriggerEvent('fbrp:appearanceChanged')
end

local function wearingJumpsuit(ped)
    local suit = cfg.Jumpsuit[GetEntityModel(ped)]
    return not suit or GetPedDrawableVariation(ped, 11) == suit[11][1]
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

---------------------------------------------------------------- while in jail

local function drawTimer()
    local left = math.max(0, (endsAt - GetGameTimer()) / 1000)
    SetTextFont(4)
    SetTextScale(0.0, 0.5)
    SetTextColour(255, 255, 255, 230)
    SetTextOutline()
    SetTextCentre(true)
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(('~o~JAIL~w~  %s remaining'):format(formatTime(left)))
    EndTextCommandDisplayText(0.5, 0.94)
end

local function jailLoop()
    CreateThread(function()
        local lastCheck = 0
        while jail do
            local ped = PlayerPedId()
            DisablePlayerFiring(PlayerId(), true)
            DisableControlAction(0, 37, true)  -- weapon wheel
            DisableControlAction(0, 140, true) -- melee
            DisableControlAction(0, 141, true)
            DisableControlAction(0, 142, true)
            drawTimer()

            if GetGameTimer() - lastCheck > 2000 then
                lastCheck = GetGameTimer()
                if GetSelectedPedWeapon(ped) ~= `WEAPON_UNARMED` then RemoveAllPedWeapons(ped, true) end
                if not wearingJumpsuit(ped) then wearJumpsuit(ped) end -- e.g. after respawning
                local spot = cfg.JailSpot
                if IsPedInAnyVehicle(ped, false) or #(GetEntityCoords(ped) - spot.xyz) > cfg.LeashRadius then
                    notify('You cannot leave the jail.', 'error')
                    teleport(spot, false)
                end
            end
            Wait(0)
        end
    end)
end

RegisterNetEvent('fbrp_jail:enter', function(data, fresh)
    local wasJailed = jail ~= nil
    jail = data or {}
    endsAt = GetGameTimer() + (tonumber(jail.remaining) or 0) * 1000
    if wasJailed then return end

    local ped = PlayerPedId()
    TriggerEvent('fbrp:cancelActivities')
    saveOutfit(ped)
    RemoveAllPedWeapons(ped, true)
    teleport(cfg.JailSpot, false)
    wearJumpsuit(PlayerPedId())
    if fresh then PlaySoundFrontend(-1, 'Bed', 'WastedSounds', true) end
    jailLoop()
end)

RegisterNetEvent('fbrp_jail:sync', function(data)
    if not jail or type(data) ~= 'table' then return end
    jail = data
    endsAt = GetGameTimer() + (tonumber(data.remaining) or 0) * 1000
end)

RegisterNetEvent('fbrp_jail:release', function(coords, label)
    jail = nil
    teleport(coords, true)
    restoreOutfit(PlayerPedId())
end)

-- not in jail any more but still have a saved outfit (e.g. released while offline / resource restarted)
local function cleanupOutfit()
    if not jail and GetResourceKvpString(OUTFIT_KVP) and not LocalPlayer.state['fbrp:jailed'] then
        restoreOutfit(PlayerPedId())
    end
end

---------------------------------------------------------------- tell the server we're loaded (puts you back in if you still have time)

local function ready()
    SetTimeout(2500, function()
        TriggerServerEvent('fbrp_jail:ready')
        SetTimeout(4000, cleanupOutfit)
    end)
end

AddEventHandler('playerSpawned', ready)
AddEventHandler('onClientResourceStart', function(resource)
    if resource == GetCurrentResourceName() and NetworkIsPlayerActive(PlayerId()) then ready() end
end)
AddStateBagChangeHandler('fbrp:characterId', ('player:%d'):format(GetPlayerServerId(PlayerId())), function(_, _, value)
    if value then ready() end
end)

---------------------------------------------------------------- chat suggestions

TriggerEvent('chat:addSuggestion', '/jail', 'Jail a player (opens the jail form)', { { name = 'id', help = 'Optional - fills in the player ID' } })
TriggerEvent('chat:addSuggestion', '/unjail', 'Release a player from jail', { { name = 'id', help = 'Player in jail' } })
TriggerEvent('chat:addSuggestion', '/checkjailtime', 'See how much jail time is left', { { name = 'id', help = 'Optional (officers) - check someone else' } })
