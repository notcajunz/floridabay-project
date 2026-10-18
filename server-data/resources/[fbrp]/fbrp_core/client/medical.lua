local M = FBRP.Medical

local spawned = false
local downed = nil        -- { since, cause, respawnRequested }
local holdStart = nil

local function ui(message) SendNUIMessage(message) end
local function notify(message, tone) TriggerEvent('fbrp:notify', message, tone or 'info') end

function FBRP.IsDowned() return downed ~= nil end

local function u32(value)
    value = tonumber(value) or 0
    if value < 0 then value = value + 4294967296 end
    return value
end

local CAUSE_BY_WEAPON = {
    [u32(joaat('WEAPON_FALL'))] = 'Fall injuries',
    [u32(joaat('WEAPON_RUN_OVER_BY_CAR'))] = 'Struck by a vehicle',
    [u32(joaat('WEAPON_RAMMED_BY_CAR'))] = 'Vehicle collision',
    [u32(joaat('WEAPON_DROWNING'))] = 'Drowning',
    [u32(joaat('WEAPON_DROWNING_IN_VEHICLE'))] = 'Drowning',
    [u32(joaat('WEAPON_EXPLOSION'))] = 'Blast injuries',
    [u32(joaat('WEAPON_FIRE'))] = 'Severe burns',
    [u32(joaat('WEAPON_BLEEDING'))] = 'Blood loss',
    [u32(joaat('WEAPON_UNARMED'))] = 'Blunt force trauma',
    [u32(joaat('WEAPON_ANIMAL'))] = 'Animal attack',
    [u32(joaat('WEAPON_COUGAR'))] = 'Animal attack',
    [u32(joaat('WEAPON_BARBED_WIRE'))] = 'Lacerations',
    [u32(joaat('WEAPON_ELECTRIC_FENCE'))] = 'Electrical injury',
}
local CAUSE_BY_GROUP = {
    [3566412244] = 'Blunt or sharp force trauma', -- melee
    [416676503] = 'Gunshot wounds',  -- pistol
    [3337201093] = 'Gunshot wounds', -- smg
    [970310034] = 'Gunshot wounds',  -- rifle
    [1159398588] = 'Gunshot wounds', -- machine gun
    [860033945] = 'Gunshot wounds',  -- shotgun
    [3082541095] = 'Gunshot wounds', -- sniper
    [2725924767] = 'Blast injuries', -- heavy
    [1548507267] = 'Blast injuries', -- thrown
}

local function causeOfDeath(ped)
    local hash = GetPedCauseOfDeath(ped)
    if not hash or hash == 0 then return 'Unknown injuries' end
    local key = u32(hash)
    if CAUSE_BY_WEAPON[key] then return CAUSE_BY_WEAPON[key] end
    local group = CAUSE_BY_GROUP[u32(GetWeapontypeGroup(hash))]
    if group then return group end
    if IsModelAVehicle(hash) then return 'Vehicle collision' end
    return 'Unknown injuries'
end

local function loadAnim(dict)
    RequestAnimDict(dict)
    local untilAt = GetGameTimer() + 3000
    while not HasAnimDictLoaded(dict) and GetGameTimer() < untilAt do Wait(10) end
    return HasAnimDictLoaded(dict)
end

local function downedAnim(ped)
    if IsPedInAnyVehicle(ped, false) then
        if not IsEntityPlayingAnim(ped, 'veh@low@front_ps@idle_duck', 'sit', 3) and loadAnim('veh@low@front_ps@idle_duck') then
            TaskPlayAnim(ped, 'veh@low@front_ps@idle_duck', 'sit', 8.0, -8.0, -1, 1, 0, false, false, false)
        end
    elseif not IsEntityPlayingAnim(ped, 'dead', 'dead_a', 3) and loadAnim('dead') then
        TaskPlayAnim(ped, 'dead', 'dead_a', 8.0, -8.0, -1, 1, 0, false, false, false)
    end
end

-- A GTA ped must be resurrected once so the player can remain in the custom downed state instead
-- of entering the stock death/respawn flow. Protect that low-health ped afterward: without this,
-- continued gunfire kills it again and the downed loop visibly resurrects it every few moments.
local function setDownedProtection(active)
    local ped = PlayerPedId()
    if not ped or ped == 0 then return end
    SetEntityInvincible(ped, active == true)
    SetEntityCanBeDamaged(ped, active ~= true)
end

-- Brings a dead ped back where it fell, keeping its vehicle seat.
local function resurrectInPlace(settleMs)
    local ped = PlayerPedId()
    local vehicle = GetVehiclePedIsIn(ped, false)
    local seat
    if vehicle ~= 0 then
        for index = -1, GetVehicleMaxNumberOfPassengers(vehicle) - 1 do
            if GetPedInVehicleSeat(vehicle, index) == ped then seat = index break end
        end
    end
    Wait(settleMs)
    local coords, heading = GetEntityCoords(ped), GetEntityHeading(ped)
    NetworkResurrectLocalPlayer(coords.x, coords.y, coords.z, heading, true, false)
    ped = PlayerPedId()
    setDownedProtection(true)
    SetEntityHealth(ped, M.downedHealth)
    ClearPedTasksImmediately(ped)
    if seat and DoesEntityExist(vehicle) then SetPedIntoVehicle(ped, vehicle, seat) end
    downedAnim(ped)
end

-- pma-voice stops sending proximity, call and radio audio while this state bag is set.
local function setVoiceMuted(muted)
    LocalPlayer.state:set('isDead', muted == true, true)
end

local function leaveDowned()
    downed = nil
    holdStart = nil
    setVoiceMuted(false)
    setDownedProtection(false)
    ui({ type='downed', active=false })
end

local KEEP = { 1, 2, 38, 47, 199, 200, 245, 249 } -- look, E, G, pause, chat, push-to-talk

local function downedLoop()
    CreateThread(function()
        local lastUi = 0
        while downed do
            local ped = PlayerPedId()
            setDownedProtection(true)
            DisableAllControlActions(0)
            for _, control in ipairs(KEEP) do EnableControlAction(0, control, true) end
            if IsEntityDead(ped) then
                resurrectInPlace(800)
                ped = PlayerPedId()
            elseif GetEntityHealth(ped) >= 190 then
                -- Healed by something else (vMenu, admin menu): get up.
                leaveDowned()
                ClearPedTasks(ped)
                TriggerServerEvent('fbrp:medical:recovered')
                break
            end
            downedAnim(ped)
            local elapsed = (GetGameTimer() - downed.since) / 1000
            local canRespawn = elapsed >= M.bleedoutSeconds
            if IsControlJustReleased(0, 47) then TriggerServerEvent('fbrp:medical:distress') end
            local hold = 0
            if canRespawn and not downed.respawnRequested then
                if IsControlPressed(0, 38) then
                    holdStart = holdStart or GetGameTimer()
                    hold = math.min(1, (GetGameTimer() - holdStart) / M.respawnHoldMs)
                    if hold >= 1 then
                        downed.respawnRequested = true
                        TriggerServerEvent('fbrp:medical:respawn')
                    end
                else
                    holdStart = nil
                end
            end
            if GetGameTimer() - lastUi > 200 then
                lastUi = GetGameTimer()
                ui({ type='downed', active=true, cause=downed.cause, remaining=math.max(0, math.ceil(M.bleedoutSeconds - elapsed)), canRespawn=canRespawn, hold=hold })
            end
            Wait(0)
        end
    end)
end

local function goDown()
    local ped = PlayerPedId()
    local cause = causeOfDeath(ped)
    downed = { since=GetGameTimer(), cause=cause }
    setVoiceMuted(true)
    TriggerEvent('fbrp:cancelActivities')
    TriggerServerEvent('fbrp:medical:downed', { cause=cause })
    resurrectInPlace(1500)
    downedLoop()
end

setVoiceMuted(false) -- clear a flag left behind by a restart of this resource

AddEventHandler('fbrp:characterSpawned', function() spawned = true end)

AddEventHandler('onClientResourceStop', function(resource)
    if resource == GetCurrentResourceName() then
        setDownedProtection(false)
        setVoiceMuted(false)
    end
end)

CreateThread(function()
    while true do
        if spawned and not downed and IsEntityDead(PlayerPedId()) then goDown() end
        Wait(250)
    end
end)

RegisterNetEvent('fbrp:medical:revive', function()
    local ped = PlayerPedId()
    local wasDowned = downed ~= nil
    leaveDowned()
    if IsEntityDead(ped) then
        local coords = GetEntityCoords(ped)
        NetworkResurrectLocalPlayer(coords.x, coords.y, coords.z, GetEntityHeading(ped), true, false)
        ped = PlayerPedId()
    end
    if wasDowned then
        StopAnimTask(ped, 'dead', 'dead_a', 2.0)
        StopAnimTask(ped, 'veh@low@front_ps@idle_duck', 'sit', 2.0)
        if not IsPedInAnyVehicle(ped, false) then ClearPedTasks(ped) end
    end
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
end)

RegisterNetEvent('fbrp:medical:heal', function()
    local ped = PlayerPedId()
    if downed then return end
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
    ClearPedBloodDamage(ped)
end)

RegisterNetEvent('fbrp:medical:selfHeal', function()
    if downed then return end
    local ped = PlayerPedId()
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
    ClearPedBloodDamage(ped)
    ResetPedVisibleDamage(ped)
end)

RegisterNetEvent('fbrp:medical:selfArmour', function()
    if downed then return end
    SetPedArmour(PlayerPedId(), 100)
end)

RegisterNetEvent('fbrp:medical:hospitalRespawn', function(coords, label)
    leaveDowned()
    DoScreenFadeOut(600)
    local untilAt = GetGameTimer() + 1500
    while not IsScreenFadedOut() and GetGameTimer() < untilAt do Wait(10) end
    local ped = PlayerPedId()
    ClearPedTasksImmediately(ped)
    RequestCollisionAtCoord(coords.x + 0.0, coords.y + 0.0, coords.z + 0.0)
    SetEntityCoords(ped, coords.x + 0.0, coords.y + 0.0, coords.z + 0.0, false, false, false, false)
    SetEntityHeading(ped, (coords.w or 0.0) + 0.0)
    untilAt = GetGameTimer() + 4000
    while not HasCollisionLoadedAroundEntity(ped) and GetGameTimer() < untilAt do Wait(25) end
    SetEntityHealth(ped, GetEntityMaxHealth(ped))
    ClearPedBloodDamage(ped)
    ResetPedVisibleDamage(ped)
    Wait(400)
    DoScreenFadeIn(900)
    notify(('You were treated at %s.'):format(label or 'the hospital'), 'success')
end)

-- The medic's side of a revive or treatment.
RegisterNetEvent('fbrp:medical:cpr', function(ms, short)
    local ped = PlayerPedId()
    ms = tonumber(ms) or 5000
    if short then
        TaskStartScenarioInPlace(ped, 'CODE_HUMAN_MEDIC_TEND_TO_DEAD', 0, true)
    elseif loadAnim('mini@cpr@char_a@cpr_str') then
        TaskPlayAnim(ped, 'mini@cpr@char_a@cpr_str', 'cpr_pumpchest', 8.0, -8.0, -1, 1, 0, false, false, false)
    end
    ui({ type='progress', label=short and 'Treating wounds' or 'Performing CPR', ms=ms })
    Wait(ms)
    ClearPedTasks(ped)
end)
