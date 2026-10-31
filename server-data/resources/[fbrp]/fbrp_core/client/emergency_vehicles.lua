-- Vehicle classification shared by the personal-vehicle system and Wraith ARS.
-- Emergency light and siren input is owned by Luxart Vehicle Control.

local emergencyPersonals = {} -- personal id -> leo/fire/ems
local emergencyModels = {}    -- model hash -> leo/fire/ems

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

-- A personal is LEO only when the portal says so. A base-game vehicle is LEO
-- when it is emergency class and is not a fire/medical/public-safety vehicle.
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

local function isEmergencyVehicle(vehicle)
    return emergencyKind(vehicle) ~= nil
end

exports('IsLeoVehicle', isLeoVehicle)
exports('IsEmergencyVehicle', isEmergencyVehicle)
