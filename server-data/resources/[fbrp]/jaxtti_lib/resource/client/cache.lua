local values = {}

local function set(key, value)
    local old = values[key]
    if old == value then return end
    values[key] = value
    TriggerEvent(('jaxtti_lib:cache:%s'):format(key), value, old)
end

local function seatOf(ped, vehicle)
    for seat = -1, GetVehicleMaxNumberOfPassengers(vehicle) - 1 do
        if GetPedInVehicleSeat(vehicle, seat) == ped then return seat end
    end
    return false
end

CreateThread(function()
    while true do
        local ped = PlayerPedId()
        set('ped', ped)

        local vehicle = GetVehiclePedIsIn(ped, false)
        if vehicle > 0 then
            set('vehicle', vehicle)
            set('seat', seatOf(ped, vehicle))
        else
            set('vehicle', false)
            set('seat', false)
        end

        local hasWeapon, weapon = GetCurrentPedWeapon(ped, true)
        set('weapon', hasWeapon and weapon or false)

        local mount = GetMount and GetMount(ped) or 0
        set('mounted', mount ~= 0 and mount or false)

        Wait(100)
    end
end)

exports('getCache', function()
    local copy = {}
    for k, v in pairs(values) do copy[k] = v end
    return copy
end)
