local muted = false

local function isNearWater(coords)
    local radius = Config.Radius
    local offsets = {
        vec2(0, 0),
        vec2(radius, 0),
        vec2(-radius, 0),
        vec2(0, radius),
        vec2(0, -radius),
        vec2(radius * 0.7, radius * 0.7),
        vec2(-radius * 0.7, radius * 0.7),
        vec2(radius * 0.7, -radius * 0.7),
        vec2(-radius * 0.7, -radius * 0.7),
    }

    for _, offset in ipairs(offsets) do
        local x, y = coords.x + offset.x, coords.y + offset.y
        if TestProbeAgainstWater(x, y, coords.z + 50.0, x, y, coords.z - 100.0) then
            return true
        end
    end

    return false
end

local function applyMute()
    for _, zone in ipairs(Config.AmbientZones) do
        SetAmbientZoneStatePersistent(zone, false, true)
    end
    for _, list in ipairs(Config.AmbientZoneLists) do
        SetAmbientZoneListStatePersistent(list, false, true)
    end
    for _, scene in ipairs(Config.AudioScenes) do
        if not IsAudioSceneActive(scene) then
            StartAudioScene(scene)
        end
    end
    muted = true
end

local function removeMute()
    for _, zone in ipairs(Config.AmbientZones) do
        ClearAmbientZoneState(zone, true)
    end
    for _, list in ipairs(Config.AmbientZoneLists) do
        ClearAmbientZoneListState(list, true)
    end
    for _, scene in ipairs(Config.AudioScenes) do
        if IsAudioSceneActive(scene) then
            StopAudioScene(scene)
        end
    end
    muted = false
end

CreateThread(function()
    if Config.AlwaysOn then
        applyMute()
        return
    end

    while true do
        local nearWater = isNearWater(GetEntityCoords(PlayerPedId()))
        if nearWater and not muted then
            applyMute()
        elseif not nearWater and muted then
            removeMute()
        end
        Wait(Config.CheckInterval)
    end
end)

AddEventHandler('onResourceStop', function(resourceName)
    if resourceName == GetCurrentResourceName() and muted then
        removeMute()
    end
end)

-- Commands --------------------------------------------------------------

RegisterCommand('watermute', function(_, args)
    local arg = args[1] and string.lower(args[1]) or nil

    if arg == 'on' then
        applyMute()
    elseif arg == 'off' then
        removeMute()
    else
        -- no arg = toggle
        if muted then removeMute() else applyMute() end
    end

    TriggerEvent('chat:addMessage', {
        color = { 0, 170, 255 },
        args = { 'qx-waterdata', muted and 'Water ambience muted' or 'Water ambience restored' }
    })
end, false)

RegisterCommand('watermutestatus', function()
    TriggerEvent('chat:addMessage', {
        color = { 0, 170, 255 },
        args = { 'qx-waterdata', ('Muted: %s | AlwaysOn: %s | Near water: %s'):format(
            tostring(muted),
            tostring(Config.AlwaysOn),
            tostring(isNearWater(GetEntityCoords(PlayerPedId())))
        ) }
    })
end, false)

-- Make the commands show up in chat autocomplete
CreateThread(function()
    TriggerEvent('chat:addSuggestion', '/watermute', 'Toggle water ambience mute', {
        { name = 'on/off', help = 'Optional: force on or off (leave empty to toggle)' }
    })
    TriggerEvent('chat:addSuggestion', '/watermutestatus', 'Show current water mute status')
end)

AddEventHandler('onResourceStop', function(resourceName)
    if resourceName == GetCurrentResourceName() then
        TriggerEvent('chat:removeSuggestion', '/watermute')
        TriggerEvent('chat:removeSuggestion', '/watermutestatus')
    end
end)
