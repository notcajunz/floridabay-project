local lastCrash = 0
local lastCrashInfo = nil

local function debug(...)
    if Config.Debug then print('[jaxtti_collision]', ...) end
end

local function tierFor(delta)
    for i = #Config.Tiers, 1, -1 do
        if delta >= Config.Tiers[i].minDelta then return Config.Tiers[i] end
    end
end

local function seatOf(ped, veh)
    for seat = -1, GetVehicleMaxNumberOfPassengers(veh) - 1 do
        if GetPedInVehicleSeat(veh, seat) == ped then return seat end
    end
end

local function injure(ped, amount)
    if amount <= 0 then return end
    local maxHp = GetEntityMaxHealth(ped)
    local scale = math.max(1, maxHp - 100) / 100
    local hp = GetEntityHealth(ped)
    SetEntityHealth(ped, math.max(0, math.floor(hp - amount * scale)))
end

local function vehicleDamage(veh, tier)
    if NetworkGetEntityOwner(veh) ~= cache.playerId then return end

    if tier.engine > 0 then
        SetVehicleEngineHealth(veh, math.max(-100.0, GetVehicleEngineHealth(veh) - tier.engine))
    end

    if tier.tires > 0 and math.random() < tier.tires then
        local wheels = { 0, 1, 4, 5 }
        SetVehicleTyreBurst(veh, wheels[math.random(#wheels)], false, 1000.0)
    end

    if tier.stall > 0 and math.random() < tier.stall and GetIsVehicleEngineRunning(veh) then
        SetVehicleEngineOn(veh, false, true, true)
        lib.notify({ title = 'FBRP', type = 'error', icon = 'car-burst', description = 'Your engine stalled.' })
        SetTimeout(tier.stallTime, function()
            if DoesEntityExist(veh) and GetVehicleEngineHealth(veh) > 0 then
                SetVehicleEngineOn(veh, false, true, false)
            end
        end)
    end
end

local function eject(ped, veh, vel)
    Wait(60)
    if not IsPedInAnyVehicle(ped, false) then return true end
    local pos = GetOffsetFromEntityInWorldCoords(veh, 0.0, 2.6, 0.9)
    SetEntityCoords(ped, pos.x, pos.y, pos.z, false, false, false, false)
    SetPedToRagdoll(ped, 6000, 6000, 0, false, false, false)
    SetEntityVelocity(ped, vel.x * 0.65, vel.y * 0.65, math.max(vel.z, 0.0) + 3.5)
    return true
end

local function onCrash(veh, delta, preVel)
    local tier = tierFor(delta)
    if not tier then return end

    local ped = cache.ped
    local belted = LocalPlayer.state.seatbelt == true
    local class = GetVehicleClass(veh)
    local bike = class == 8 or class == 13
    local seat = seatOf(ped, veh)

    local mult = bike and Config.MotorcycleInjuryMultiplier or (belted and Config.SeatbeltInjuryMultiplier or 1.0)
    local soften = belted and 0.6 or 1.0

    debug(('crash: %s, %.1f mph lost, belted=%s, seat=%s'):format(tier.name, delta, tostring(belted), tostring(seat)))

    Effects.impact(tier.shake)
    if tier.tinnitus then
        Effects.sound('tinnitus', { volume = belted and 0.6 or 1.0, fadeOut = math.max(3000, tier.dazed * soften) })
    end
    Effects.blur(math.floor(tier.blur * soften))
    Effects.dazed(math.floor(tier.dazed * soften), tier.heartbeat)

    local blackout = belted and math.floor(tier.blackout * 0.5) or tier.blackout
    if blackout >= 600 then Effects.blackout(blackout) end

    if seat == -1 then vehicleDamage(veh, tier) end

    local damage = math.random(tier.damage[1], tier.damage[2]) * mult

    local ej = Config.Ejection
    local ejected = false
    if ej.enabled and not belted and not bike and delta >= ej.minDelta and math.random() < ej.chance
        and (not ej.frontSeatsOnly or seat == -1 or seat == 0) then
        ejected = eject(ped, veh, preVel)
        if ejected then damage = damage + ej.extraDamage end
    end

    injure(ped, damage)

    if Config.Stress.event and tier.stress > 0 then
        if Config.Stress.event == 'core' then
            exports.jaxtti_core:GainStress(tier.stress)
        else
            TriggerServerEvent(Config.Stress.event, tier.stress)
        end
    end

    lastCrashInfo = { tier = tier.name, delta = delta, belted = belted, ejected = ejected, damage = damage, at = GetGameTimer() }
    TriggerEvent('jaxtti_collision:crash', lastCrashInfo)
    TriggerServerEvent('jaxtti_collision:crashed', tier.name, math.floor(delta), belted, ejected)
end

CreateThread(function()
    local hist, lastVeh = {}, 0
    local minDelta = Config.Tiers[1].minDelta
    while true do
        local ped = cache.ped
        local veh = GetVehiclePedIsIn(ped, false)

        if IsEntityDead(ped) and Effects.isDazed() then Effects.clear() end

        if veh ~= 0 and Config.Classes[GetVehicleClass(veh)] then
            if veh ~= lastVeh then hist, lastVeh = {}, veh end
            local now = GetGameTimer()
            local speed = GetEntitySpeed(veh)
            hist[#hist + 1] = { t = now, s = speed, v = GetEntityVelocity(veh) }
            while #hist > 1 and now - hist[1].t > Config.DetectWindow do table.remove(hist, 1) end

            local peak = hist[1]
            for i = 2, #hist do if hist[i].s > peak.s then peak = hist[i] end end
            local delta = (peak.s - speed) * 2.236936

            if delta >= minDelta and now - lastCrash > Config.Cooldown and HasEntityCollidedWithAnything(veh) then
                lastCrash = now
                hist = {}
                onCrash(veh, delta, peak.v)
            end
            Wait(0)
        else
            hist, lastVeh = {}, 0
            Wait(250)
        end
    end
end)

exports('IsDazed', function() return Effects.isDazed() end)
exports('GetLastCrash', function() return lastCrashInfo end)
exports('ClearEffects', function() Effects.clear() end)

RegisterNetEvent('jaxtti_core:client:revived', Effects.clear)

if Config.Debug then
    RegisterCommand('crashtest', function(_, args)
        local delta = tonumber(args[1]) or 50
        local veh = GetVehiclePedIsIn(cache.ped, false)
        if veh == 0 then return print('[jaxtti_collision] get in a vehicle first') end
        onCrash(veh, delta, GetEntityVelocity(veh))
    end, false)
end

AddEventHandler('onResourceStop', function(res)
    if res == cache.resource then Effects.clear() end
end)
