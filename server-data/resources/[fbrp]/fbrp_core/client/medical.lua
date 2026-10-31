-- Medical (client). The old downed / bleed-out / revive death system has been removed;
-- a new death system will replace it. What's left: /heal, /armour, EMS "Treat wounds", punch damage,
-- kill logging, and a TEMPORARY basic respawn so dead players don't stay dead.
local M = FBRP.Medical

local spawned = false
local function notify(message, tone) lib.notify({ description = message, type = tone or 'info' }) end

-- Other core scripts ask this. The new death system should set LocalPlayer.state['fbrp:downed'] while someone is down.
function FBRP.IsDowned()
    return LocalPlayer.state['fbrp:downed'] ~= nil and LocalPlayer.state['fbrp:downed'] ~= false
end

local function u32(value)
    value = tonumber(value) or 0
    if value < 0 then value = value + 4294967296 end
    return value
end

AddEventHandler('fbrp:characterSpawned', function() spawned = true end)

---------------------------------------------------------------- self care / EMS treat wounds

RegisterNetEvent('fbrp:medical:heal', function()
    local ped = PlayerPedId()
    if IsEntityDead(ped) then return end
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
    ClearPedBloodDamage(ped)
end)

RegisterNetEvent('fbrp:medical:selfHeal', function()
    local ped = PlayerPedId()
    if IsEntityDead(ped) then return end
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
    ClearPedBloodDamage(ped)
    ResetPedVisibleDamage(ped)
end)

RegisterNetEvent('fbrp:medical:selfArmour', function()
    if IsEntityDead(PlayerPedId()) then return end
    SetPedArmour(PlayerPedId(), 100)
end)

-- staff /revive: bring a dead player back where they are
RegisterNetEvent('fbrp:medical:revive', function()
    local ped = PlayerPedId()
    if IsEntityDead(ped) then
        local coords = GetEntityCoords(ped)
        NetworkResurrectLocalPlayer(coords.x, coords.y, coords.z, GetEntityHeading(ped), true, false)
        ped = PlayerPedId()
    end
    ClearPedTasks(ped)
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
end)

-- "Treat wounds" animation for the medic
RegisterNetEvent('fbrp:medical:cpr', function(ms)
    local ped = PlayerPedId()
    ms = tonumber(ms) or 2500
    TaskStartScenarioInPlace(ped, 'CODE_HUMAN_MEDIC_TEND_TO_DEAD', 0, true)
    SendNUIMessage({ type='progress', label='Treating wounds', ms=ms })
    Wait(ms)
    ClearPedTasks(ped)
end)

CreateThread(function()
    local unarmed = joaat('WEAPON_UNARMED')
    while true do
        SetWeaponDamageModifier(unarmed, M.punchDamageMultiplier or 0.4)
        Wait(5000)
    end
end)

---------------------------------------------------------------- TEMPORARY basic respawn
-- Set FBRP.Medical.basicRespawn = false in config_systems.lua (or delete this section)
-- once the new death system is installed.

RegisterNetEvent('fbrp:medical:hospitalRespawn', function(coords, label)
    DoScreenFadeOut(600)
    local untilAt = GetGameTimer() + 1500
    while not IsScreenFadedOut() and GetGameTimer() < untilAt do Wait(10) end
    NetworkResurrectLocalPlayer(coords.x + 0.0, coords.y + 0.0, coords.z + 0.0, (coords.w or 0.0) + 0.0, true, false)
    local ped = PlayerPedId()
    ClearPedTasksImmediately(ped)
    RequestCollisionAtCoord(coords.x + 0.0, coords.y + 0.0, coords.z + 0.0)
    untilAt = GetGameTimer() + 4000
    while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer() < untilAt do Wait(25) end
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
    ClearPedBloodDamage(ped)
    ResetPedVisibleDamage(ped)
    Wait(400)
    DoScreenFadeIn(900)
    notify(('You woke up at %s.'):format(label or 'the hospital'), 'success')
end)

-- Fistfights should wound, not kill: scale unarmed damage down. The modifier is
-- applied by the attacker's client, so every client sets it for its own punches.
CreateThread(function()
    local deadSince = nil
    while true do
        local ped = PlayerPedId()
        if spawned and IsEntityDead(ped) then
            if not deadSince then
                deadSince = GetGameTimer()
                -- kill log for staff (who killed who, with what) - kept from the old system
                local killer, weapon = nil, GetPedCauseOfDeath(ped)
                local source = GetPedSourceOfDeath(ped)
                if source and source ~= 0 and source ~= ped and IsEntityAPed(source) then
                    local index = NetworkGetPlayerIndexFromPed(source)
                    if index and index ~= -1 and index ~= PlayerId() then killer = GetPlayerServerId(index) end
                end
                TriggerServerEvent('fbrp:medical:died', { killer=killer, weapon=weapon and u32(weapon) or nil })
            end
            if M.basicRespawn ~= false and GetResourceState('DeathScript') ~= 'started'
                and GetGameTimer() - deadSince >= (M.basicRespawnSeconds or 10) * 1000 then
                deadSince = GetGameTimer() + 60000 -- don't ask again while the respawn happens
                TriggerServerEvent('fbrp:medical:respawn')
            end
        else
            deadSince = nil
        end
        Wait(500)
    end
end)
