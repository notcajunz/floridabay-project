-- Skydiving challenges: the server sends you to the platform, you jump,
-- open your chute and land on the marker.

local PC = FBRP.PastimeClient
local notify = PC.notify

local run = nil   -- { id, label, target={x,y,z}, start, bullseye, radius, airborne, blip, token }
local PARACHUTE = joaat('GADGET_PARACHUTE')

local function clearRun()
    if run and run.blip and DoesBlipExist(run.blip) then RemoveBlip(run.blip) end
    run = nil
    PC.setBanner(nil)
end

local function monitor()
    local token = run.token
    CreateThread(function()
        while run and run.token == token do
            local ped = PlayerPedId()
            local coords = GetEntityCoords(ped)
            local target = run.target
            local distance = PC.flat(coords, target)
            local state = GetPedParachuteState(ped)
            local falling = IsPedFalling(ped) or IsPedInParachuteFreeFall(ped) or state >= 1

            if IsPedDeadOrDying(ped, true) then
                TriggerServerEvent('fbrp:pastimes:skydive:abort')
                clearRun()
                notify('Jump failed.', 'error')
                return
            end

            if not run.airborne and falling then run.airborne = true end

            local hint
            if state == 0 or state == -1 then
                hint = run.airborne and 'Hold SPACE to open your parachute.' or 'Step off the platform to start.'
            elseif state == 1 or state == 2 then
                hint = 'Steer towards the marker.'
            else
                hint = 'Open your parachute!'
            end
            PC.setBanner({
                title = run.label,
                rows = {
                    ('Target: %s away'):format(PC.formatDistance(distance)),
                    ('Altitude: %d m'):format(math.floor(coords.z - PC.groundZ(coords.x, coords.y, coords.z))),
                    hint,
                },
            })

            if distance < 1500.0 then
                local z = target.z
                DrawMarker(1, target.x, target.y, z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, run.bullseye * 2.0, run.bullseye * 2.0, 6.0, 255, 181, 71, 150, false, false, 2, false, nil, nil, false)
                DrawMarker(1, target.x, target.y, z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, run.radius * 2.0, run.radius * 2.0, 2.0, 63, 227, 210, 70, false, false, 2, false, nil, nil, false)
                DrawMarker(1, target.x, target.y, z, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.2, 1.2, 160.0, 255, 181, 71, 90, false, false, 2, false, nil, nil, false)
            end

            if run.airborne and not falling and state <= 0 and not IsEntityInAir(ped) then
                local id = run.id
                -- Let the ragdoll settle before the server samples your position.
                Wait(1200)
                if run and run.id == id then
                    TriggerServerEvent('fbrp:pastimes:skydive:landed')
                    if run then run.airborne = false end
                end
            end
            Wait(0)
        end
    end)
end

RegisterNetEvent('fbrp:pastimes:skydive:teleportStart', function(data)
    if run then clearRun() end
    FBRP.CloseMenu()
    local ped = PlayerPedId()
    local start = data.start
    DoScreenFadeOut(500)
    local untilAt = GetGameTimer() + 1500
    while not IsScreenFadedOut() and GetGameTimer() < untilAt do Wait(20) end
    FreezeEntityPosition(ped, true)
    RequestCollisionAtCoord(start.x, start.y, start.z)
    SetEntityCoordsNoOffset(ped, start.x, start.y, start.z, false, false, false)
    untilAt = GetGameTimer() + 4000
    while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer() < untilAt do
        RequestCollisionAtCoord(start.x, start.y, start.z)
        Wait(50)
    end
    GiveWeaponToPed(ped, PARACHUTE, 1, false, true)
    FreezeEntityPosition(ped, false)
    DoScreenFadeIn(600)

    run = {
        id = data.id, label = data.label, target = data.target, start = start,
        bullseye = tonumber(data.bullseye) or 5.0, radius = tonumber(data.radius) or 100.0, token = GetGameTimer(),
    }
    run.blip = AddBlipForCoord(data.target.x + 0.0, data.target.y + 0.0, data.target.z + 0.0)
    SetBlipSprite(run.blip, 38)
    SetBlipColour(run.blip, 5)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentString('Skydive target')
    EndTextCommandSetBlipName(run.blip)
    monitor()
end)

RegisterNetEvent('fbrp:pastimes:skydive:result', function(result)
    clearRun()
    PlaySoundFrontend(-1, 'Mission_Pass_Notify', 'DLC_HEISTS_GENERAL_FRONTEND_SOUNDS', true)
    local flags = {}
    if result.serverRecord then flags[#flags + 1] = 'NEW SERVER RECORD' elseif result.personalBest then flags[#flags + 1] = 'personal best' end
    notify(('%s: %s, %.1f m from the centre · +%d Bay Rep%s'):format(
        result.label, result.band, tonumber(result.meters) or 0, tonumber(result.rep) or 0,
        #flags > 0 and (' · ' .. table.concat(flags, ', ')) or ''), 'success')
end)

RegisterNetEvent('fbrp:pastimes:skydive:expired', function()
    clearRun()
    notify('That jump timed out.', 'info')
end)

PC.actions.skydive = function(data)
    local reason = PC.busy()
    if reason then return notify(reason, 'error') end
    if IsPedInAnyVehicle(PlayerPedId(), false) then return notify('Get out of the vehicle first.', 'error') end
    FBRP.CloseMenu()
    TriggerServerEvent('fbrp:pastimes:skydive:start', tostring(data.id or ''))
end

PC.actions.skydivecancel = function()
    FBRP.CloseMenu()
    if run then
        TriggerServerEvent('fbrp:pastimes:skydive:abort')
        clearRun()
        notify('Jump cancelled.', 'info')
    end
end

AddEventHandler('onResourceStop', function(name)
    if name ~= GetCurrentResourceName() then return end
    clearRun()
end)
