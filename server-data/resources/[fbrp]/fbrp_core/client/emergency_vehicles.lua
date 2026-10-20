-- Emergency vehicle controls shared by base-game emergency vehicles and personals that
-- the portal classifies as law enforcement, fire, or EMS.

local emergencyPersonals = {} -- personal id -> leo/fire/ems
local emergencyModels = {}    -- model hash -> leo/fire/ems
local playing = {}            -- vehicle handle -> { id, tone }

local TONES = {
    [1] = { name='VEHICLES_HORNS_SIREN_1', label='Siren 1' },
    [2] = { name='VEHICLES_HORNS_SIREN_2', label='Siren 2' },
    [3] = { name='VEHICLES_HORNS_POLICE_WARNING', label='Siren 3' },
}

RegisterNetEvent('fbrp:personals:sync', function(data)
    data = type(data) == 'table' and data or {}
    emergencyPersonals, emergencyModels = {}, {}
    for id, kind in pairs(data.emergency or {}) do emergencyPersonals[tonumber(id)] = tostring(kind) end
    for _, entry in ipairs(data.emergencyModels or {}) do
        if type(entry) == 'table' and type(entry.model) == 'string' then
            emergencyModels[joaat(entry.model)] = tostring(entry.kind or 'leo')
        end
    end
end)

local function stateValue(vehicle, key)
    local ok, value = pcall(function() return Entity(vehicle).state[key] end)
    -- Never write this as `ok and value or nil`: a stored `false` (lights off) would become
    -- nil, which applyState reads as "controller never used" and skips switching the siren off.
    if not ok then return nil end
    return value
end

local function personalId(vehicle)
    return tonumber(stateValue(vehicle, 'fbrpPersonal'))
end

local function emergencyKind(vehicle)
    if vehicle == 0 or not DoesEntityExist(vehicle) then return nil end
    local explicit = stateValue(vehicle, 'fbrpEmergencyClass')
    if explicit == 'leo' or explicit == 'fire' or explicit == 'ems' then return explicit end
    local personal = personalId(vehicle)
    if personal and emergencyPersonals[personal] then return emergencyPersonals[personal] end
    if emergencyModels[GetEntityModel(vehicle)] then return emergencyModels[GetEntityModel(vehicle)] end
    if GetVehicleClass(vehicle) == 18 then return 'emergency' end
    return nil
end

-- Law-enforcement test used by the Wraith ARS radar (wk_wars2x). A personal is LEO only when the
-- portal says so; a base-game vehicle is LEO when it is an emergency-class vehicle that is not an
-- ambulance, fire truck, or lifeguard vehicle.
local NON_LEO_BASE = {
    [joaat('ambulance')] = true, [joaat('firetruk')] = true, [joaat('lguard')] = true,
    [joaat('pbus')] = true, [joaat('pbus2')] = true,
}

local function isLeoVehicle(vehicle)
    local kind = emergencyKind(vehicle)
    if kind == 'leo' then return true end
    if kind ~= 'emergency' then return false end
    if personalId(vehicle) then return false end
    return not NON_LEO_BASE[GetEntityModel(vehicle)]
end
exports('IsLeoVehicle', isLeoVehicle)

local function stopTone(vehicle)
    local current = playing[vehicle]
    if not current then return end
    StopSound(current.id)
    ReleaseSoundId(current.id)
    playing[vehicle] = nil
end

local function applyTone(vehicle, tone)
    tone = tonumber(tone) or 0
    local current = playing[vehicle]
    if current and current.tone == tone then return end
    stopTone(vehicle)
    if tone < 1 or tone > 3 or not DoesEntityExist(vehicle) then return end
    local sound = GetSoundId()
    PlaySoundFromEntity(sound, TONES[tone].name, vehicle, 0, false, 0)
    playing[vehicle] = { id=sound, tone=tone }
end

local function applyState(vehicle)
    if vehicle == 0 or not DoesEntityExist(vehicle) then return end
    local lights = stateValue(vehicle, 'fbrpEmergencyLights')
    local tone = tonumber(stateValue(vehicle, 'fbrpSirenTone')) or 0
    -- nil means this vehicle has not used the Florida Bay controller yet. Leave other
    -- emergency resources alone until the driver presses one of our keys.
    if lights == nil and tone == 0 then stopTone(vehicle); return end
    SetVehicleSiren(vehicle, lights == true)
    SetVehicleHasMutedSirens(vehicle, true) -- custom tones below; Q remains lights-only
    applyTone(vehicle, lights == true and tone or 0)
end

local function vehicleFromBag(bagName)
    if type(GetEntityFromStateBagName) ~= 'function' then return 0 end
    local entity = GetEntityFromStateBagName(bagName)
    return entity and entity ~= 0 and entity or 0
end

AddStateBagChangeHandler('fbrpEmergencyLights', nil, function(bagName)
    local vehicle = vehicleFromBag(bagName)
    if vehicle ~= 0 then applyState(vehicle) end
end)

AddStateBagChangeHandler('fbrpSirenTone', nil, function(bagName)
    local vehicle = vehicleFromBag(bagName)
    if vehicle ~= 0 then applyState(vehicle) end
end)

local function driverVehicle()
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle == 0 or GetPedInVehicleSeat(vehicle, -1) ~= ped then return 0 end
    if not emergencyKind(vehicle) then return 0 end
    return vehicle
end

local function setState(vehicle, key, value)
    local ok = pcall(function() Entity(vehicle).state:set(key, value, true) end)
    if not ok then return false end
    applyState(vehicle)
    return true
end

RegisterCommand('fbrp_emergency_lights', function()
    local vehicle = driverVehicle()
    if vehicle == 0 then return end
    local on = stateValue(vehicle, 'fbrpEmergencyLights') == true
    if on then setState(vehicle, 'fbrpSirenTone', 0) end
    setState(vehicle, 'fbrpEmergencyLights', not on)
    TriggerEvent('fbrp:notify', on and 'Emergency lights off.' or 'Emergency lights on.', 'info')
end, false)
RegisterKeyMapping('fbrp_emergency_lights', 'Emergency vehicle: toggle lights', 'keyboard', 'Q')

local function sirenCommand(tone)
    return function()
        local vehicle = driverVehicle()
        if vehicle == 0 then return end
        local current = tonumber(stateValue(vehicle, 'fbrpSirenTone')) or 0
        local nextTone = current == tone and 0 or tone
        if nextTone > 0 then setState(vehicle, 'fbrpEmergencyLights', true) end
        setState(vehicle, 'fbrpSirenTone', nextTone)
        TriggerEvent('fbrp:notify', nextTone == 0 and 'Siren off.' or (TONES[nextTone].label .. ' on.'), 'info')
    end
end

for tone = 1, 3 do
    local command = ('fbrp_siren_%d'):format(tone)
    RegisterCommand(command, sirenCommand(tone), false)
    RegisterKeyMapping(command, ('Emergency vehicle: siren tone %d'):format(tone), 'keyboard', tostring(tone))
end

-- Reconcile streamed vehicles for players who enter scope after their state changed, and
-- suppress the normal radio/weapon shortcuts while the new emergency bindings are active.
CreateThread(function()
    local nextScan = 0
    while true do
        local vehicle = GetVehiclePedIsIn(PlayerPedId(), false)
        if vehicle ~= 0 and GetPedInVehicleSeat(vehicle, -1) == PlayerPedId() and emergencyKind(vehicle) then
            DisableControlAction(0, 85, true)  -- Q / radio wheel
            DisableControlAction(0, 157, true) -- 1
            DisableControlAction(0, 158, true) -- 2
            DisableControlAction(0, 160, true) -- 3
        end
        local now = GetGameTimer()
        if now >= nextScan then
            nextScan = now + 500
            local seen = {}
            for _, candidate in ipairs(GetGamePool('CVehicle')) do
                seen[candidate] = true
                if emergencyKind(candidate) then applyState(candidate) end
            end
            for candidate in pairs(playing) do
                if not seen[candidate] or not DoesEntityExist(candidate) then stopTone(candidate) end
            end
        end
        Wait(0)
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for vehicle in pairs(playing) do stopTone(vehicle) end
end)

