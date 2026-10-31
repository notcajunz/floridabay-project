local STATE_SOUND = 'vehdata:sound'
local STATE_LABEL = 'vehdata:soundLabel'

local function isAllowed(src)
    if not Config.Permission then return true end
    return IsPlayerAceAllowed(src, Config.Permission)
end

-- client asks to open the menu, we check permission and tell it to go ahead
RegisterNetEvent('FBRP:EngineSounds:RequestOpen', function()
    local src = source
    if not isAllowed(src) then
        -- 5th argument: show it as a normal notification, the menu isn't open
        TriggerClientEvent('FBRP:EngineSounds:Result', src, false, 'NOT ALLOWED', nil, true)
        return
    end
    TriggerClientEvent('FBRP:EngineSounds:OpenMenu', src)
end)

RegisterNetEvent('FBRP:EngineSounds:ChangeEngineSound', function(netId, label)
    local src = source

    if not isAllowed(src) then
        return TriggerClientEvent('FBRP:EngineSounds:Result', src, false, 'NOT ALLOWED')
    end

    if type(netId) ~= 'number' or type(label) ~= 'string' then return end

    local vehicle = NetworkGetEntityFromNetworkId(netId)
    if vehicle == 0 or not DoesEntityExist(vehicle) or GetEntityType(vehicle) ~= 2 then
        return TriggerClientEvent('FBRP:EngineSounds:Result', src, false, 'VEHICLE NOT FOUND')
    end

    -- only the driver can change it
    if GetPedInVehicleSeat(vehicle, -1) ~= GetPlayerPed(src) then
        return TriggerClientEvent('FBRP:EngineSounds:Result', src, false, 'NOT DRIVING')
    end

    local state = Entity(vehicle).state

    if label == '__default' then
        if not Config.AllowDefault then return end
        state:set(STATE_SOUND, nil, true)
        state:set(STATE_LABEL, nil, true)
        return TriggerClientEvent('FBRP:EngineSounds:Result', src, true, 'APPLIED', label)
    end

    -- the client only sends a label, the audio name always comes from the config
    local sound = Config.EngineSounds[label]
    if not sound then
        return TriggerClientEvent('FBRP:EngineSounds:Result', src, false, 'UNKNOWN SOUND')
    end

    state:set(STATE_SOUND, sound, true)
    state:set(STATE_LABEL, label, true)
    TriggerClientEvent('FBRP:EngineSounds:Result', src, true, 'APPLIED', label)
end)
