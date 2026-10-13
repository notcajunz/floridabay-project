-- Personal vehicles: keeps people without access out of the driver seat. The server is
-- authoritative (it ejects after a second); this stops them before they get in.

local denied = {}       -- personal id -> true
local deniedModels = {} -- model hash -> true
local bypass = false
local lastNotice = 0
local shuffleBlocked = false

RegisterNetEvent('fbrp:personals:sync', function(data)
    data = type(data) == 'table' and data or {}
    denied, deniedModels = {}, {}
    for _, id in ipairs(data.denied or {}) do denied[tonumber(id)] = true end
    for _, model in ipairs(data.models or {}) do deniedModels[joaat(model)] = true end
    bypass = data.bypass == true
end)

local function blocked(vehicle)
    if bypass or vehicle == 0 or not DoesEntityExist(vehicle) then return false end
    local id
    if NetworkGetEntityIsNetworked(vehicle) then
        local ok, value = pcall(function() return Entity(vehicle).state.fbrpPersonal end)
        if ok then id = tonumber(value) end
    end
    if id then return denied[id] == true end
    return deniedModels[GetEntityModel(vehicle)] == true
end

local function warn()
    local stamp = GetGameTimer()
    if stamp - lastNotice < 4000 then return end
    lastNotice = stamp
    TriggerEvent('fbrp:notify', 'This is a personal vehicle. You are not trusted to drive it.', 'error')
end

local function leave(vehicle)
    local ped = PlayerPedId()
    TaskLeaveVehicle(ped, vehicle, 16)
    warn()
end

RegisterNetEvent('fbrp:personals:eject', function()
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    if vehicle ~= 0 and GetPedInVehicleSeat(vehicle, -1) == ped then leave(vehicle) end
end)

CreateThread(function()
    while true do
        local ped = PlayerPedId()
        local entering = GetVehiclePedIsTryingToEnter(ped)
        if entering ~= 0 and GetSeatPedIsTryingToEnter(ped) == -1 and blocked(entering) then
            ClearPedTasks(ped)
            warn()
        end
        local vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle ~= 0 then
            -- Passengers may ride along but never slide across into the driver seat.
            local noAccess = blocked(vehicle)
            if noAccess ~= shuffleBlocked then
                shuffleBlocked = noAccess
                SetPedConfigFlag(ped, 184, noAccess) -- PED_FLAG_PREVENT_AUTO_SHUFFLE_TO_DRIVER_SEAT
            end
            if noAccess and GetPedInVehicleSeat(vehicle, -1) == ped then leave(vehicle) end
            Wait(150)
        else
            if shuffleBlocked then
                shuffleBlocked = false
                SetPedConfigFlag(ped, 184, false)
            end
            Wait(entering ~= 0 and 100 or 300)
        end
    end
end)
