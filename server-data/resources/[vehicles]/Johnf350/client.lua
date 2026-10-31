-- Johnf350 | rolling coal for the 6.7 Powerstroke
local C = Config.Coal
local PTFX_DICT, PTFX_NAME = 'core', 'exp_grd_bzgas_smoke'

local models = {}
for _, m in ipairs(Config.Models) do models[joaat(m)] = true end

local KVP = 'johnf350:coal'
local coalOn = C.enabled and GetResourceKvpInt(KVP) ~= 2

local function notify(msg)
    if GetResourceState('jaxtti_notify') == 'started' then
        exports.jaxtti_notify:Notify({ type = 'vehicle', title = 'F-350', message = msg })
    else
        BeginTextCommandThefeedPost('STRING')
        AddTextComponentSubstringPlayerName(msg)
        EndTextCommandThefeedPostTicker(false, false)
    end
end

RegisterCommand(C.command, function()
    coalOn = not coalOn
    SetResourceKvpInt(KVP, coalOn and 1 or 2)
    notify(coalOn and 'Rolling coal ON. Floor it.' or 'Rolling coal OFF.')
end, false)

-- Exhaust tips on this model (falls back to the back of the truck)
local function exhaustPoints(veh)
    local pts = {}
    for i = 1, 16 do
        local name = i == 1 and 'exhaust' or ('exhaust_' .. i)
        local bone = GetEntityBoneIndexByName(veh, name)
        if bone ~= -1 then pts[#pts + 1] = { bone = bone } end
    end
    if #pts == 0 then
        local min, max = GetModelDimensions(GetEntityModel(veh))
        pts[1] = { offset = vector3(0.55, min.y + 0.1, min.z + 0.45) }
    end
    return pts
end

local function puff(veh, pts, scale)
    for _, p in ipairs(pts) do
        UseParticleFxAssetNextCall(PTFX_DICT)
        SetParticleFxNonLoopedColour(C.shade, C.shade, C.shade)
        SetParticleFxNonLoopedAlpha(C.opacity)
        if p.bone then
            StartNetworkedParticleFxNonLoopedOnEntityBone(PTFX_NAME, veh, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, p.bone, scale, false, false, false)
        else
            StartNetworkedParticleFxNonLoopedOnEntity(PTFX_NAME, veh, p.offset.x, p.offset.y, p.offset.z, 0.0, 0.0, 0.0, scale, false, false, false)
        end
    end
end

CreateThread(function()
    local lastVeh, pts, nextPuff, wasFloored = 0, nil, 0, false
    while true do
        local sleep = 500
        local ped = PlayerPedId()
        local veh = GetVehiclePedIsIn(ped, false)

        if veh ~= 0 and models[GetEntityModel(veh)] and GetPedInVehicleSeat(veh, -1) == ped then
            sleep = 0
            if veh ~= lastVeh then
                lastVeh = veh
                pts = exhaustPoints(veh)
                if Config.GovernorMph and Config.GovernorMph > 0 then
                    SetVehicleMaxSpeed(veh, Config.GovernorMph / 2.236936)
                end
                RequestNamedPtfxAsset(PTFX_DICT)
            end

            if coalOn and GetIsVehicleEngineRunning(veh) and GetVehicleEngineHealth(veh) > 100.0 and HasNamedPtfxAssetLoaded(PTFX_DICT) then
                local throttle = GetControlNormal(0, 71)
                local mph = GetEntitySpeed(veh) * 2.236936
                local rpm = GetVehicleCurrentRpm(veh)
                local floored = throttle >= C.minThrottle
                local now = GetGameTimer()

                if floored and not wasFloored then
                    -- the first stab of the pedal: one big cloud
                    puff(veh, pts, C.launchScale * 1.25)
                    nextPuff = now + C.launchInterval
                elseif floored and now >= nextPuff then
                    if mph < C.launchMph then
                        puff(veh, pts, C.launchScale)
                        nextPuff = now + C.launchInterval
                    elseif rpm > 0.55 then
                        puff(veh, pts, C.driveScale)
                        nextPuff = now + C.driveInterval
                    end
                end
                wasFloored = floored
            end
        else
            lastVeh, pts, wasFloored = 0, nil, false
        end
        Wait(sleep)
    end
end)

TriggerEvent('chat:addSuggestion', '/' .. C.command, 'Turn rolling coal on / off for the F-350')
